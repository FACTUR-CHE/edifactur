/**
 * Darstellung.
 *
 * Baut ausschliesslich DOM-Knoten -- kein innerHTML, keine
 * String-Konkatenation, keine manuelle HTML-Maskierung.
 *
 * Zustaende (aktiver Tab, ausgewaehlter Datensatz) werden ueber die
 * ARIA-Attribute `aria-selected` und `aria-current` gefuehrt; das Stylesheet
 * greift dieselben Attribute ab. Damit koennen sichtbarer und angekuendigter
 * Zustand nicht auseinanderlaufen.
 *
 * Zum Aufbau siehe den Kopfkommentar in edifact.js.
 *
 * Benoetigt: edifact.js, format.js, dom.js, records.js.
 */

(function (ns) {
  'use strict';

  /** Kennungen der Tab-Panels. Auch in app.js referenziert. */
  const VIEW_PANEL_ID = 'viewPanel';
  const MESSAGE_PANEL_ID = 'messagePanel';

  const VIEW_TABS = Object.freeze([
    { value: 'structured', label: 'Strukturierte Ansicht' },
    { value: 'raw', label: 'EDIFACT-Rohdaten' },
  ]);

  /** Dritter Reiter, nur wenn eine Nachricht zum Vergleich gemerkt ist. */
  const COMPARE_TAB = Object.freeze({ value: 'diff', label: 'Vergleich' });

  /**
   * Baut eine Tab-Leiste nach dem ARIA-Tabs-Muster: rollende
   * Tabulator-Reihenfolge (nur der aktive Tab ist per Tab erreichbar), Rest
   * ueber die Pfeiltasten, verdrahtet in app.js.
   *
   * @param {{value: string, label: string}[]} items
   * @param {object} options
   * @param {number} options.activeIndex
   * @param {string} options.name       Wert fuer data-tablist, adressiert die Leiste.
   * @param {string} options.label      Barrierefreier Name der Leiste.
   * @param {string} options.panelId    Vom Tab gesteuertes Panel.
   * @param {string} options.datasetKey data-Attribut, das den Wert traegt.
   * @param {string} options.tabClass
   * @returns {HTMLElement}
   */
  function tablist(items, { activeIndex, name, label, panelId, datasetKey, tabClass }) {
    const tabs = items.map((item, index) => {
      const isActive = index === activeIndex;
      return ns.el('button', {
        class: tabClass,
        type: 'button',
        role: 'tab',
        id: `${name}-tab-${index}`,
        'aria-selected': isActive ? 'true' : 'false',
        'aria-controls': panelId,
        tabindex: isActive ? '0' : '-1',
        dataset: { [datasetKey]: item.value },
        text: item.label,
      });
    });

    return ns.el(
      'div',
      {
        class: name === 'view' ? 'tabs' : 'message-tabs',
        role: 'tablist',
        'aria-label': label,
        dataset: { tablist: name },
      },
      tabs,
    );
  }

  /**
   * @param {string} panelId
   * @param {string} labelledBy
   * @param {boolean} focusable Panels ohne fokussierbaren Inhalt brauchen einen
   *   eigenen Tabstop, damit sie mit der Tastatur gescrollt werden koennen.
   * @param {Node|Node[]} children
   * @returns {HTMLElement}
   */
  function tabpanel(panelId, labelledBy, focusable, children) {
    return ns.el(
      'div',
      {
        id: panelId,
        role: 'tabpanel',
        'aria-labelledby': labelledBy,
        tabindex: focusable ? '0' : false,
      },
      children,
    );
  }

  /**
   * Schreibt die Trefferzeile. Der Knoten ist in index.html als
   * `role="status"` markiert, die Aenderung wird also angekuendigt.
   *
   * @param {HTMLElement} node
   * @param {object} counts
   * @param {number} counts.filtered
   * @param {number} counts.total
   */
  function renderResultInfo(node, { filtered, total }) {
    ns.clear(node);
    ns.append(node, [
      ns.el('strong', { text: ns.formatCount(filtered) }),
      ` von ${ns.formatCount(total)} Nachrichten`,
    ]);
  }

  /** Werte je Kennung im Listeneintrag, bevor gezaehlt statt gezeigt wird. */
  const SHOWN_IDENTIFIER_VALUES = 2;

  /**
   * Zeichnet eine fachliche Kennung als Marke im Listeneintrag.
   *
   * Mehrere Werte werden nicht auf den ersten verkuerzt -- in einer
   * Sammelnachricht waere das eine willkuerliche Auswahl, die aussieht wie
   * die ganze Wahrheit. Gezeigt werden die ersten beiden, der Rest wird
   * gezaehlt.
   *
   * @param {{label: string, values: string[]}} identifier
   * @param {string} query
   * @returns {HTMLElement}
   */
  function identifierTag(identifier, query) {
    const shown = identifier.values.slice(0, SHOWN_IDENTIFIER_VALUES);
    const rest = identifier.values.length - shown.length;

    const values = [];
    for (const [index, value] of shown.entries()) {
      if (index > 0) values.push(', ');
      values.push(ns.highlighted(value, query));
    }

    return ns.el('span', { class: 'record-tag' }, [
      ns.el('span', { class: 'record-tag-key', text: identifier.label }),
      ' ',
      ...values,
      rest > 0
        ? ns.el('span', { class: 'record-tag-more', text: `+${ns.formatCount(rest)}` })
        : null,
    ]);
  }

  /**
   * Beschriftet die Ablehnungen eines Datensatzes.
   *
   * Eine einzelne Quittung ist die Ablehnung; eine Sammelnachricht enthaelt
   * sie. Die Zahl daneben sagt, ob alles oder nur ein Teil abgelehnt wurde --
   * ohne sie muesste man die Karte oeffnen, um das zu erfahren.
   *
   * @param {number} rejected Abgelehnte Quittungen.
   * @param {number} total    Quittungen insgesamt.
   * @returns {string}
   */
  function rejectionLabel(rejected, total) {
    return total === 1
      ? 'Abgelehnt'
      : `${ns.formatCount(rejected)} von ${ns.formatCount(total)} abgelehnt`;
  }

  /**
   * Marken, die einen Eintrag einordnen, ohne ihn zu oeffnen.
   *
   * Sie stehen vor den Kennungen auf derselben Zeile: die Zeilenhoehe der
   * Liste ist fest, und eine eigene Zeile je Marke wuerde unten abgeschnitten.
   * Reicht der Platz nicht, weichen die Kennungen -- eine Ablehnung ist der
   * Grund, eine Karte zu oeffnen, eine Kennung nur der Weg dorthin.
   *
   * @param {object} record
   * @returns {HTMLElement[]}
   */
  function recordFlags(record) {
    const { acknowledgements = [], rejectedCount = 0, messageCount } = record.derived;
    const flags = [];

    if (rejectedCount > 0) {
      flags.push(
        ns.el('span', {
          class: 'record-flag record-flag-rejected',
          title:
            acknowledgements.length === 1
              ? 'Die Quittung meldet eine Ablehnung.'
              : `${ns.formatCount(rejectedCount)} von ${ns.formatCount(acknowledgements.length)} Quittungen melden eine Ablehnung.`,
          text: rejectionLabel(rejectedCount, acknowledgements.length),
        }),
      );
    }

    if (messageCount > 1) {
      flags.push(
        ns.el('span', {
          class: 'record-flag record-flag-aggregate',
          title: `Sammelnachricht mit ${ns.formatCount(messageCount)} EDIFACT-Nachrichten.`,
          text: `Sammelnachricht · ${ns.formatCount(messageCount)}`,
        }),
      );
    }

    return flags;
  }

  /**
   * @param {object} record
   * @param {string} query
   * @param {boolean} isSelected
   * @param {{index: number, total: number}} position Platz in der **ganzen**
   *   Trefferliste. Gezeichnet wird nur ein Ausschnitt; ohne diese Angabe
   *   meldete eine Vorlesesoftware "1 von 20" statt "4711 von 50.000".
   * @returns {HTMLElement}
   */
  function recordButton(record, query, isSelected, position) {
    const { source, derived } = record;

    const top = ns.el('span', { class: 'record-top' }, [
      ns.el('span', { class: 'record-id' }, ns.highlighted(source.messageID || record.id, query)),
      ns.el(
        'span',
        { class: 'badge' },
        ns.highlighted(source.messageFormat || ns.PLACEHOLDER, query),
      ),
    ]);

    const meta = ns.el('span', { class: 'record-meta' }, [
      ns.highlighted(source.direction || ns.PLACEHOLDER, query),
      ' · ',
      ns.highlighted(source.processingStatus || ns.PLACEHOLDER, query),
      ns.el('br'),
      ns.highlighted(source.communicationPartnerID || 'Kein Partner', query),
      ' · ',
      ns.formatDate(source.transferTimestamp),
    ]);

    const flags = recordFlags(record);
    const marks =
      flags.length > 0 || derived.identifiers.length > 0
        ? ns.el('span', { class: 'record-tags' }, [
            ...flags,
            ...derived.identifiers.map((identifier) => identifierTag(identifier, query)),
          ])
        : null;

    return ns.el(
      'button',
      {
        class: 'record',
        type: 'button',
        dataset: { id: record.id },
        'aria-current': isSelected ? 'true' : false,
        'aria-setsize': String(position.total),
        'aria-posinset': String(position.index + 1),
      },
      [top, meta, marks],
    );
  }

  /**
   * Zeichnet den sichtbaren Ausschnitt der Nachrichtenliste.
   *
   * Gezeichnet wird nur das Fenster aus `visibleRange`. Ein Platzhalter in
   * voller Hoehe haelt den Rollbalken ehrlich, die Zeilen selbst werden um den
   * Fensteranfang verschoben. Deshalb muessen alle Zeilen gleich hoch sein --
   * `--record-height` in app.js und styles.css halten dieselbe Zahl.
   *
   * @param {HTMLElement} container
   * @param {object} options
   * @param {object[]} options.records Gefilterte Datensaetze, vollstaendig.
   * @param {string|null} options.selectedId
   * @param {string} options.query
   * @param {{start: number, end: number, offsetTop: number, totalHeight: number}}
   *   options.window Ausschnitt aus `visibleRange`.
   */
  function renderList(container, { records, selectedId, query, window: view }) {
    ns.clear(container);

    if (records.length === 0) {
      container.append(ns.el('p', { class: 'empty', text: 'Keine passenden Nachrichten.' }));
      return;
    }

    const rows = records.slice(view.start, view.end).map((record, offset) =>
      ns.el(
        'li',
        {},
        recordButton(record, query, record.id === selectedId, {
          index: view.start + offset,
          total: records.length,
        }),
      ),
    );

    container.append(
      ns.el('div', { class: 'record-viewport', style: `block-size: ${view.totalHeight}px` }, [
        ns.el(
          'ul',
          {
            class: 'record-list',
            style: `transform: translateY(${view.offsetTop}px)`,
          },
          rows,
        ),
      ]),
    );
  }

  /**
   * @param {string} term
   * @param {unknown} value
   * @param {string} query
   * @returns {HTMLElement}
   */
  function metaItem(term, value, query) {
    return ns.el('div', {}, [
      ns.el('dt', { text: term }),
      ns.el('dd', {}, ns.highlighted(value || ns.PLACEHOLDER, query)),
    ]);
  }

  /**
   * @param {object} segment
   * @param {string} query
   * @returns {HTMLElement}
   */
  /**
   * Listet Pruefbefunde auf.
   *
   * @param {object[]} findings
   * @param {string} label Barrierefreier Name der Liste.
   * @returns {HTMLElement|null} Null, wenn es nichts zu melden gibt.
   */
  function findingList(findings, label) {
    if (findings.length === 0) return null;

    return ns.el(
      'ul',
      { class: 'findings', 'aria-label': label },
      findings.map((finding) =>
        ns.el('li', { class: `finding finding-${finding.level}`, text: finding.message }),
      ),
    );
  }

  /**
   * @param {object} record
   * @param {number|null} messageIndex `null` fuer den Austausch als Ganzes.
   * @returns {object[]}
   */
  function findingsFor(record, messageIndex) {
    return (record.derived.findings ?? []).filter(
      (finding) => finding.messageIndex === messageIndex,
    );
  }

  /**
   * Zeichnet eine Fehlerzeile einer Quittungsnachricht.
   *
   * @param {object} error
   * @returns {HTMLElement}
   */
  function acknowledgementError(error) {
    const meaning = ns.codeMeaning(error.element, error.code);

    return ns.el('li', { class: 'ack-error' }, [
      ns.el('div', { class: 'ack-error-head' }, [
        ns.el('code', { class: 'de', text: error.code }),
        error.tag ? ns.el('small', { text: error.tag }) : null,
        ns.el('span', {
          class: meaning?.name ? 'ack-error-name' : 'ack-error-name code-unlisted',
          title: meaning?.name ? false : ns.UNLISTED_CODE,
          text: meaning?.name ?? 'nicht hinterlegt',
        }),
      ]),
      error.texts.length > 0
        ? ns.el(
            'ul',
            { class: 'ack-texts' },
            error.texts.map((entry) => {
              const subject = ns.codeMeaning('4451', entry.qualifier);
              const label = subject?.name ?? entry.qualifier;
              return ns.el('li', {}, [
                label ? ns.el('span', { class: 'ack-text-label', text: `${label}: ` }) : null,
                entry.text,
              ]);
            }),
          )
        : null,
    ]);
  }

  /**
   * Benennt die Nachrichten einer Quittungsgruppe als Sprungmarken.
   *
   * Ein Lauf wird ein Knopf, der auf seine erste Nachricht fuehrt --
   * `data-message` ist dasselbe Attribut, das die Reiterleiste darunter
   * benutzt, die Verdrahtung im Anwendungsmodul gilt also mit.
   *
   * @param {number[]} indexes
   * @returns {HTMLElement}
   */
  function acknowledgementMessages(indexes) {
    return ns.el('p', { class: 'ack-messages' }, [
      ns.el('span', { class: 'ack-messages-label', text: 'Nachricht' }),
      ...ns.messageRuns(indexes).map((run) =>
        ns.el('button', {
          class: 'ack-message',
          type: 'button',
          dataset: { message: String(run.index) },
          title: `Zu Nachricht ${run.index + 1} springen`,
          text: run.label,
        }),
      ),
    ]);
  }

  /** Zeichnet eine Quittungsgruppe als Karte. */
  function acknowledgementCard(group, { withMessages }) {
    return ns.el('div', { class: group.rejected ? 'ack ack-rejected' : 'ack ack-accepted' }, [
      ns.el('p', { class: 'ack-head' }, [
        ns.el('strong', { text: group.type }),
        ' · ',
        group.rejected ? 'Abgelehnt' : 'Anerkannt, ohne Fehlermeldung',
      ]),
      withMessages ? acknowledgementMessages(group.messageIndexes) : null,
      group.errors.length > 0
        ? ns.el(
            'ul',
            { class: 'ack-errors', 'aria-label': 'Gemeldete Fehler' },
            group.errors.map(acknowledgementError),
          )
        : null,
    ]);
  }

  /**
   * Zeichnet eine Gruppe, die nichts zu melden hat, als eine Zeile.
   *
   * Eine Anerkennung ohne Fehlermeldung traegt keine Angabe ausser der, dass
   * es sie gibt. Vierzig davon nebeneinander sind vierzig Karten mit
   * demselben Satz. Die Zahl steht in der Zeile, die Nummern stehen darunter,
   * sobald man sie sehen will -- weggenommen ist nichts.
   */
  function acknowledgementRollup(group) {
    return ns.el('details', { class: 'ack ack-accepted ack-rollup' }, [
      ns.el('summary', { class: 'ack-rollup-summary' }, [
        ns.el('strong', { text: ns.formatCount(group.messageIndexes.length) }),
        ` ${group.type} anerkannt, ohne Fehlermeldung`,
      ]),
      acknowledgementMessages(group.messageIndexes),
    ]);
  }

  /**
   * Fasst die Quittungsnachrichten eines Datensatzes oben zusammen.
   *
   * Der Ablehnungsgrund ist der einzige Grund, ein APERAK zu oeffnen. Er darf
   * nicht erst nach dem Durchscrollen der Segmente sichtbar werden.
   *
   * Annahme und Ablehnung sind nicht allein an der Farbe zu unterscheiden --
   * der Zustand steht als Wort daneben.
   *
   * Eine Sammelnachricht quittiert jede enthaltene Nachricht einzeln. Gleich
   * aussehende Quittungen werden deshalb zu einer Karte zusammengefasst, und
   * die Ablehnungen stehen vor den Anerkennungen: sie sind der Grund, den
   * Datensatz zu oeffnen. Bilanziert wird nur, wenn es mehr als eine Quittung
   * gibt -- bei einer einzelnen Nachricht bleibt die Ansicht, wie sie war.
   *
   * @param {object} record
   * @returns {HTMLElement|null} Null, wenn keine Quittungsnachricht vorliegt.
   */
  function acknowledgementSection(record) {
    const summaries = record.derived.acknowledgements ?? [];
    if (summaries.length === 0) return null;

    const groups = ns.groupAcknowledgements(summaries);
    const single = summaries.length === 1;
    const rejected = groups.filter((group) => group.rejected);
    const accepted = groups.filter((group) => !group.rejected);

    return ns.el('div', { class: 'section' }, [
      single ? null : acknowledgementBalance(summaries, rejected),
      ...rejected.map((group) => acknowledgementCard(group, { withMessages: !single })),
      ...accepted.map((group) =>
        // Zusammengeklappt nur, wo es etwas zusammenzuklappen gibt. Eine
        // einzelne Anerkennung hinter einem Aufklapper zu verstecken waere
        // ein Klick fuer nichts.
        group.messageIndexes.length > 1 && group.errors.length === 0
          ? acknowledgementRollup(group)
          : acknowledgementCard(group, { withMessages: !single }),
      ),
    ]);
  }

  /**
   * Nennt oben, ueber wie viele Quittungen in welchem Zustand man blickt.
   *
   * Die Aufteilung nach Zustand steht nur da, wo beide vorkommen. Kommt nur
   * einer vor, nennt ihn die Karte darunter ohnehin, und "43 Quittungen · 43
   * anerkannt" waere dieselbe Zahl zweimal.
   *
   * @param {object[]} summaries
   * @param {object[]} rejectedGroups
   * @returns {HTMLElement}
   */
  function acknowledgementBalance(summaries, rejectedGroups) {
    const rejected = rejectedGroups.reduce((sum, group) => sum + group.messageIndexes.length, 0);
    const accepted = summaries.length - rejected;
    const mixed = rejected > 0 && accepted > 0;

    return ns.el('p', { class: 'ack-balance' }, [
      ns.el('strong', { text: ns.formatCount(summaries.length) }),
      ' Quittungen',
      mixed
        ? ` · ${ns.formatCount(accepted)} anerkannt · ${ns.formatCount(rejected)} abgelehnt`
        : null,
    ]);
  }

  /**
   * Beschriftet einen Datensatz kurz fuer eine Sprungmarke.
   *
   * @param {object} record
   * @returns {string}
   */
  function recordLabel(record) {
    return [record.source.messageFormat || 'EDIFACT', record.source.messageID || record.id].join(
      ' · ',
    );
  }

  /**
   * Zeichnet die Referenz auf die Ursprungsnachricht.
   *
   * Ist der referenzierte Datensatz geladen, wird die Referenz ein
   * Bedienelement. Ist er es nicht, wird das gesagt -- ein Bedienelement, das
   * ins Leere fuehrt, waere schlechter als gar keines.
   *
   * @param {object} record
   * @param {object|null} target Referenzierter Datensatz oder null.
   * @param {string} query
   * @returns {HTMLElement}
   */
  function referenceItem(record, target, query) {
    const reference = record.source.referenceMessageID;
    if (!reference) return metaItem('Referenz', '', query);

    const value = target
      ? ns.el(
          'button',
          {
            class: 'link-button',
            type: 'button',
            dataset: { goto: target.id },
            title: `Zu ${recordLabel(target)} springen`,
          },
          ns.highlighted(reference, query),
        )
      : ns.el('span', { class: 'reference-missing' }, [
          ns.highlighted(reference, query),
          ns.el('small', { text: 'nicht geladen' }),
        ]);

    return ns.el('div', {}, [ns.el('dt', { text: 'Referenz' }), ns.el('dd', {}, [value])]);
  }

  /**
   * Listet die Nachrichten auf, die auf den gezeigten Datensatz verweisen.
   *
   * @param {object[]} sources
   * @returns {HTMLElement|null} Null, wenn niemand verweist.
   */
  function chainSection(sources) {
    if (sources.length === 0) return null;

    return ns.el('div', { class: 'section' }, [
      ns.el('h3', { text: 'Nimmt Bezug auf diese Nachricht' }),
      ns.el(
        'ul',
        { class: 'chain' },
        sources.map((entry) =>
          ns.el('li', {}, [
            ns.el('button', {
              class: 'link-button',
              type: 'button',
              dataset: { goto: entry.id },
              text: recordLabel(entry),
            }),
          ]),
        ),
      ),
    ]);
  }

  /**
   * Setzt Kennung und Kennungsqualifier eines Marktpartners zusammen.
   *
   * @param {{id: string, qualifier: string}} partner
   * @returns {string} Leer, wenn keine Kennung vorliegt.
   */
  function partnerText({ id, qualifier }) {
    if (!id) return '';
    return qualifier ? `${id} · Qualifier ${qualifier}` : id;
  }

  /**
   * Beschreibt den Zeichensatz aus S001.
   *
   * @param {object} header
   * @returns {string}
   */
  function characterSetText(header) {
    const declared = [header.syntaxIdentifier, header.syntaxVersion].filter(Boolean).join(':');
    if (!declared) return '';
    return header.characterSet ? `${declared} · ${header.characterSet}` : declared;
  }

  /**
   * Zeichnet die Angaben aus dem Austauschkopf.
   *
   * @param {object|null} header Ergebnis von readInterchangeHeader.
   * @param {string} query
   * @returns {HTMLElement|null} Null ohne UNB -- dann gibt es nichts zu zeigen.
   */
  function interchangeSection(header, query) {
    if (!header) return null;

    return ns.el('div', { class: 'section' }, [
      ns.el('h3', { text: 'Austauschkopf (UNB)' }),
      ns.el('dl', { class: 'meta meta-tight' }, [
        metaItem('Zeichensatz', characterSetText(header), query),
        metaItem('Absender', partnerText(header.sender), query),
        metaItem('Empfänger', partnerText(header.recipient), query),
        metaItem('Austauschreferenz', header.reference, query),
      ]),
    ]);
  }

  /**
   * Zeichnet eine Segmentzeile.
   *
   * Kopieren haengt an den Elementen, die ohnehin da sind: das Segment-Tag
   * kopiert die ganze Segmentzeile, ein Wert kopiert diesen Wert. Ein eigener
   * Knopf je Zeile waere bei einer MSCONS mit hunderten Segmenten unlesbar.
   *
   * Leere Elemente bleiben Text -- an einem Platzhalter gibt es nichts zu
   * kopieren.
   *
   * @param {object} segment
   * @param {string} query
   * @param {string} segmentSeparator
   * @returns {HTMLElement}
   */
  /**
   * Zeichnet eine Komponente als Zeile aus Nummer, Bezeichnung und Wert.
   *
   * Ist die Position nicht hinterlegt, tritt die Positionsangabe an die Stelle
   * der Bezeichnung. Eine erfundene Bezeichnung waere schlechter als eine
   * ehrliche Positionsnummer.
   *
   * @param {string} tag
   * @param {number} element   Elementposition, nullbasiert.
   * @param {number} component Komponentenposition, nullbasiert.
   * @param {string} value
   * @param {boolean} split    Ob das Element mehrere Komponenten hat.
   * @param {string} query
   * @returns {HTMLElement}
   */
  /** Klasse je Zustand aus `ns.valueMeaning`. */
  const MEANING_CLASSES = Object.freeze({
    date: 'code-meaning',
    'date-unlisted': 'code-meaning code-unlisted',
    'date-invalid': 'code-meaning code-invalid',
    code: 'code-meaning',
    unlisted: 'code-meaning code-unlisted',
  });

  /**
   * Zeichnet die Erlaeuterung zu einem Wert.
   *
   * Was dort steht, entscheidet `ns.valueMeaning` -- dieselbe Funktion, die
   * der CSV-Export benutzt. Hier bleibt nur die Frage, wie es aussieht.
   *
   * @param {{code: string}|null} definition
   * @param {string} value
   * @param {string[]} siblings  Komponenten desselben Datenelements.
   * @param {number} component
   * @returns {HTMLElement|null}
   */
  function valueAnnotation(definition, value, siblings, component) {
    const meaning = ns.valueMeaning(definition, value, siblings, component);
    if (!meaning) return null;

    return ns.el('span', {
      class: MEANING_CLASSES[meaning.status] ?? 'code-meaning',
      title: meaning.detail ?? false,
      text: meaning.text,
    });
  }

  function componentRow(tag, element, component, value, split, query, siblings) {
    const definition = ns.dataElement(tag, element, component);
    const position = split ? `${element + 1}.${component + 1}` : `${element + 1}`;
    const name = definition ? definition.name : `Element ${position}`;
    const reference = definition?.code || position;

    return ns.el('div', { class: 'component' }, [
      ns.el('dt', {}, [
        ns.el('code', { class: 'de', text: reference }),
        ns.el('span', { text: name }),
      ]),
      ns.el(
        'dd',
        {},
        value
          ? [
              ns.el(
                'button',
                {
                  class: 'value value-copy',
                  type: 'button',
                  dataset: { copy: value, copyLabel: `${reference} ${name}` },
                  title: 'Wert kopieren',
                },
                ns.highlighted(value, query),
              ),
              valueAnnotation(definition, value, siblings, component),
            ]
          : [ns.el('span', { class: 'value value-empty', text: ns.EMPTY_ELEMENT })],
      ),
    ]);
  }

  function segmentRow(segment, query, segmentSeparator) {
    const label = ns.segmentLabel(segment.tag);

    const rows = segment.components.flatMap((components, element) => {
      const split = components.length > 1;
      return components.map((value, component) =>
        componentRow(segment.tag, element, component, value, split, query, components),
      );
    });

    return ns.el('div', { class: 'segment' }, [
      ns.el('button', {
        class: 'segment-tag',
        type: 'button',
        dataset: {
          copy: ns.joinSegments([segment], segmentSeparator),
          copyLabel: `Segment ${segment.tag}`,
        },
        title: `${label} · Segmentzeile kopieren`,
        text: segment.tag,
      }),
      ns.el('div', {}, [
        ns.el('small', { text: label }),
        rows.length > 0 ? ns.el('dl', { class: 'segment-components' }, rows) : null,
      ]),
    ]);
  }

  /**
   * Zeichnet eine Kopieraktion.
   *
   * @param {string} text  Was kopiert wird.
   * @param {string} label Wie es in der Rueckmeldung heisst.
   * @param {string} caption Beschriftung des Knopfs.
   * @returns {HTMLElement}
   */
  function copyButton(text, label, caption) {
    return ns.el('button', {
      class: 'button button-quiet button-small',
      type: 'button',
      dataset: { copy: text, copyLabel: label },
      text: caption,
    });
  }

  /**
   * Zaehlt die vorkommenden Segmenttypen.
   *
   * Reihenfolge des ersten Auftretens, nicht alphabetisch: so steht die
   * Auswahl in derselben Ordnung wie die Nachricht darunter.
   *
   * @param {object[]} segments
   * @returns {{tag: string, count: number}[]}
   */
  function segmentCounts(segments) {
    const counts = new Map();
    for (const segment of segments) counts.set(segment.tag, (counts.get(segment.tag) ?? 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count }));
  }

  /**
   * Baut die Auswahl der Segmenttypen.
   *
   * Schaltflaechen und kein Mehrfach-Select: `aria-pressed` sagt den Zustand
   * an, und ein Tag ist mit einem Tastendruck an- und wieder abgewaehlt.
   *
   * @param {{tag: string, count: number}[]} counts
   * @param {string[]} active
   * @returns {HTMLElement}
   */
  function segmentFilterBar(counts, active) {
    return ns.el(
      'div',
      { class: 'segment-filter', role: 'group', 'aria-label': 'Segmente nach Typ filtern' },
      counts.map(({ tag, count }) =>
        ns.el(
          'button',
          {
            class: 'segment-chip',
            type: 'button',
            dataset: { segment: tag },
            'aria-pressed': String(active.includes(tag)),
          },
          [tag, ns.el('span', { class: 'segment-chip-count', text: ns.formatCount(count) })],
        ),
      ),
    );
  }

  /**
   * Sagt an, wie viele Segmente zu sehen sind.
   *
   * Eine gefilterte Ansicht darf nicht fuer die vollstaendige Nachricht
   * gehalten werden -- deshalb steht die Einschraenkung im Text und nicht nur
   * in der Farbe, und `role="status"` traegt sie auch vor.
   *
   * @param {number} shown
   * @param {number} total
   * @param {string[]} active
   * @returns {HTMLElement}
   */
  function segmentFilterStatus(shown, total, active) {
    const filtered = active.length > 0;
    const text = filtered
      ? `Gefiltert: ${ns.formatCount(shown)} von ${ns.formatCount(total)} Segmenten · ${active.join(', ')}`
      : `Alle ${ns.formatCount(total)} Segmente`;

    return ns.el(
      'p',
      {
        class: filtered ? 'segment-status segment-status-active' : 'segment-status',
        role: 'status',
      },
      [
        text,
        filtered
          ? ns.el('button', {
              class: 'link-button',
              type: 'button',
              dataset: { segmentClear: 'true' },
              text: 'Filter aufheben',
            })
          : null,
      ],
    );
  }

  /**
   * Liest die gerade gezeigte Nachricht eines Datensatzes.
   *
   * @param {object} record
   * @param {number} activeMessage
   * @returns {object|null}
   */
  function currentMessage(record, activeMessage) {
    const { messages } = record.derived;
    if (messages.length === 0) return null;
    return messages[Math.min(Math.max(0, activeMessage), messages.length - 1)] ?? null;
  }

  /** Name der Huellgruppen, die keine Nachricht sind, nach ihrem Segment. */
  const ENVELOPE_NAMES = Object.freeze({ UNB: 'Austauschkopf', UNZ: 'Austauschende' });

  /**
   * Prueft, ob eine Gruppe eine fachliche Nachricht ist.
   *
   * Nur ein UNH-Kopf macht eine Nachricht aus. UNA und UNB umschliessen den
   * Austausch, UNZ schliesst ihn ab -- sie stehen als eigene Gruppen in der
   * Ansicht, zaehlen aber nicht als Nachricht.
   *
   * @param {object} group
   * @returns {boolean}
   */
  function isMessageGroup(group) {
    return group.segments.some((segment) => segment.tag === 'UNH');
  }

  /**
   * Benennt die Gruppen eines Datensatzes in Anzeigereihenfolge.
   *
   * Gezaehlt werden nur die Nachrichten, damit die Nummer der Leiste zu der
   * Anzahl passt, die der Datensatz nennt. Huellgruppen tragen den Namen
   * ihres Segments.
   *
   * @param {object[]} groups
   * @returns {string[]}
   */
  function groupCaptions(groups) {
    let counted = 0;
    return groups.map((group) => {
      if (isMessageGroup(group)) {
        counted += 1;
        return `Nachricht ${counted}: ${group.type}`;
      }

      const envelope = group.segments.find((segment) => ENVELOPE_NAMES[segment.tag]);
      return envelope ? ENVELOPE_NAMES[envelope.tag] : group.type;
    });
  }

  /**
   * Benennt eine Gruppe fuer die Ueberschrift ueber ihren Segmenten.
   *
   * @param {object} group
   * @returns {string}
   */
  function groupName(group) {
    if (isMessageGroup(group)) return group.type;
    const envelope = group.segments.find((segment) => ENVELOPE_NAMES[segment.tag]);
    return envelope ? ENVELOPE_NAMES[envelope.tag] : group.type;
  }

  /**
   * Benennt eine Nachricht so, dass man sie in der Liste wiederfindet.
   *
   * @param {object} record
   * @param {number} index
   * @returns {string}
   */
  function messageLabel(record, index) {
    const name = record.source.messageID || record.id;
    const { messages } = record.derived;
    if (messages.length <= 1) return name;
    return `${name}, ${groupCaptions(messages)[index] ?? `Nachricht ${index + 1}`}`;
  }

  /** Zeichen und Wort je Zustand einer Vergleichszeile. */
  const DIFF_STATES = Object.freeze({
    equal: { mark: '=', label: 'gleich' },
    changed: { mark: '≠', label: 'geändert' },
    added: { mark: '+', label: 'neu' },
    removed: { mark: '−', label: 'entfernt' },
    moved: { mark: '↕', label: 'verschoben' },
  });

  /**
   * Zeichnet eine Zeile des Vergleichs.
   *
   * Zeichen **und** Wort, nicht nur Farbe: der Unterschied muss auch dann
   * ablesbar sein, wenn Farben nicht unterschieden werden koennen oder die
   * Seite ausgedruckt wird.
   *
   * @param {object} row Zeile aus `diffMessages`.
   * @returns {HTMLElement}
   */
  function diffRow(row) {
    const state = DIFF_STATES[row.status];
    const segment = row.right ?? row.left;

    return ns.el('div', { class: `diff-row diff-row-${row.status}` }, [
      ns.el('span', { class: 'diff-mark', 'aria-hidden': 'true', text: state.mark }),
      ns.el('span', { class: 'diff-state', text: state.label }),
      ns.el('code', { class: 'diff-tag', text: segment.tag }),
      ns.el(
        'div',
        { class: 'diff-values' },
        row.changes.length > 0
          ? row.changes.map((change) =>
              ns.el('p', { class: 'diff-change' }, [
                ns.el('code', { class: 'de', text: change.position }),
                ns.el('span', { class: 'diff-before', text: change.left || ns.EMPTY_ELEMENT }),
                ns.el('span', { class: 'diff-arrow', 'aria-hidden': 'true', text: '→' }),
                ns.el('span', { class: 'diff-after', text: change.right || ns.EMPTY_ELEMENT }),
              ]),
            )
          : [ns.el('p', { class: 'diff-line', text: segment.raw })],
      ),
    ]);
  }

  /**
   * Zeichnet den Vergleich zweier Nachrichten.
   *
   * @param {object} options
   * @param {object} options.result Ergebnis von `diffMessages`.
   * @param {string} options.leftLabel  Bezeichnung der gemerkten Nachricht.
   * @param {string} options.rightLabel Bezeichnung der offenen Nachricht.
   * @param {boolean} options.onlyDifferences
   * @returns {Node[]}
   */
  function renderDiff({ result, leftLabel, rightLabel, onlyDifferences }) {
    const { rows, summary } = result;
    const shown = onlyDifferences ? rows.filter((row) => row.status !== 'equal') : rows;
    const differences = rows.length - summary.equal;

    const counts = Object.entries(DIFF_STATES)
      .filter(([status]) => summary[status] > 0)
      .map(([status, state]) => `${state.label}: ${ns.formatCount(summary[status])}`)
      .join(' · ');

    return [
      ns.el('div', { class: 'section' }, [
        ns.el('div', { class: 'section-head' }, [
          ns.el('h3', { text: 'Vergleich' }),
          ns.el('div', { class: 'section-actions' }, [
            ns.el('button', {
              class: 'button button-quiet button-small',
              type: 'button',
              dataset: { diffOnly: String(!onlyDifferences) },
              'aria-pressed': String(onlyDifferences),
              text: 'Nur Unterschiede',
            }),
            // Der Merk-Knopf steht in der strukturierten Ansicht. Ohne diesen
            // hier muesste man erst den Reiter wechseln, um den Vergleich
            // wieder loszuwerden.
            ns.el('button', {
              class: 'button button-quiet button-small',
              type: 'button',
              dataset: { compareClear: 'true' },
              text: 'Vergleich aufheben',
            }),
          ]),
        ]),
        // Welche Nachricht welche Seite ist, muss dastehen: sonst liest man
        // "entfernt" und weiss nicht, wo etwas fehlt.
        ns.el('p', { class: 'diff-sides' }, [
          ns.el('span', { class: 'diff-side-label', text: 'Gemerkt' }),
          ` ${leftLabel} `,
          ns.el('span', { class: 'diff-arrow', 'aria-hidden': 'true', text: '→' }),
          ns.el('span', { class: 'diff-side-label', text: 'Offen' }),
          ` ${rightLabel}`,
        ]),
        ns.el('p', { class: 'diff-summary', role: 'status' }, [
          differences === 0
            ? 'Kein Unterschied: beide Nachrichten sind segmentweise gleich.'
            : `${ns.formatCount(differences)} von ${ns.formatCount(rows.length)} Segmenten unterscheiden sich. ${counts}`,
        ]),
        result.truncated
          ? ns.el('p', {
              class: 'notice notice-inline',
              dataset: { variant: 'warning' },
              text: 'Die Nachrichten sind zu lang für den genauen Vergleich; verglichen wurde Segment für Segment der Reihe nach.',
            })
          : null,
        ...shown.map(diffRow),
        shown.length === 0
          ? ns.el('p', { class: 'empty', text: 'Keine Unterschiede zu zeigen.' })
          : null,
      ]),
    ];
  }

  /**
   * Baut die strukturierte Ansicht: bei mehreren Nachrichten eine eigene
   * Tab-Leiste, darunter die Segmente der aktiven Nachricht.
   *
   * @param {object} record
   * @param {object} options
   * @param {string} options.query
   * @param {number} options.activeMessage
   * @param {string[]} options.segmentFilter Ausgewaehlte Segment-Tags; leer
   *   bedeutet alle. Gilt nur fuer diese Ansicht -- die Rohdaten bleiben
   *   vollstaendig.
   * @returns {Node[]}
   */
  function renderStructured(record, { query, activeMessage, segmentFilter, compare }) {
    const { messages } = record.derived;

    if (messages.length === 0) {
      return [
        ns.el('p', { class: 'notice', text: 'Keine EDIFACT-Segmente in der Nutzlast erkannt.' }),
      ];
    }

    const index = Math.min(Math.max(0, activeMessage), messages.length - 1);
    const message = messages[index];

    // Die Formatversion steht nur da, wenn UNH DE 0057 sie nennt. Fehlt sie,
    // entfaellt der Abschnitt -- ein Platzhalter wuerde eine Version suggerieren.
    const heading = [
      groupName(message),
      message.header?.formatVersion ? `Formatversion ${message.header.formatVersion}` : null,
      `${ns.formatCount(message.segments.length)} Segmente`,
    ]
      .filter(Boolean)
      .join(' · ');

    const separator = record.derived.delimiters.segment;
    const counts = segmentCounts(message.segments);
    // Ein Tag aus einer vorher betrachteten Nachricht wuerde hier alles
    // ausblenden. Er zaehlt deshalb nicht als Auswahl.
    const active = segmentFilter.filter((tag) => counts.some((entry) => entry.tag === tag));
    const shown =
      active.length > 0
        ? message.segments.filter((segment) => active.includes(segment.tag))
        : message.segments;

    // Die Kopierziele bleiben bei der ganzen Nachricht: gefiltert wird die
    // Anzeige, nicht der Inhalt.
    const section = ns.el('div', { class: 'section' }, [
      ns.el('div', { class: 'section-head' }, [
        ns.el('h3', { text: heading }),
        ns.el('div', { class: 'section-actions' }, [
          copyButton(
            ns.joinSegments(message.segments, separator),
            'Nachricht',
            'Nachricht kopieren',
          ),
          copyButton(
            ns.joinSegments(message.segments, separator, '\n'),
            'Nachricht (formatiert)',
            'Formatiert kopieren',
          ),
          ns.el('button', {
            class: 'button button-quiet button-small',
            type: 'button',
            dataset: { exportSegments: String(index) },
            title: 'Alle Segmente dieser Nachricht als CSV-Datei speichern',
            text: 'Segmente als CSV',
          }),
          ns.el('button', {
            class: 'button button-quiet button-small',
            type: 'button',
            dataset: { compare: String(index) },
            'aria-pressed': String(Boolean(compare?.isCurrent)),
            title: compare?.isCurrent
              ? 'Diese Nachricht nicht mehr zum Vergleich merken'
              : 'Diese Nachricht merken und mit einer anderen vergleichen',
            text: compare?.isCurrent ? 'Vergleich aufheben' : 'Für Vergleich merken',
          }),
        ]),
      ]),
      findingList(findingsFor(record, index), 'Befunde dieser Nachricht'),
      segmentFilterBar(counts, active),
      segmentFilterStatus(shown.length, message.segments.length, active),
      ns.el('p', {
        class: 'segment-hint',
        text: 'Klick auf ein Segment-Tag kopiert die Segmentzeile, Klick auf einen Wert den Einzelwert.',
      }),
      ns.el(
        'div',
        { class: active.length > 0 ? 'segment-list segment-list-filtered' : 'segment-list' },
        shown.map((segment) => segmentRow(segment, query, separator)),
      ),
    ]);

    if (messages.length === 1) return [section];

    const captions = groupCaptions(messages);
    const bar = tablist(
      messages.map((entry, position) => ({
        value: String(position),
        label: captions[position],
      })),
      {
        activeIndex: index,
        name: 'message',
        label: 'Nachrichten und Huellsegmente',
        panelId: MESSAGE_PANEL_ID,
        datasetKey: 'message',
        tabClass: 'message-tab',
      },
    );

    return [bar, tabpanel(MESSAGE_PANEL_ID, `message-tab-${index}`, false, section)];
  }

  /**
   * Zeichnet den Detailbereich.
   *
   * @param {HTMLElement} container
   * @param {object} options
   * @param {object|null} options.record
   * @param {string} options.query
   * @param {'structured'|'raw'} options.activeTab
   * @param {number} options.activeMessage
   * @param {string[]} [options.segmentFilter] Segment-Tags der Anzeige.
   * @param {{message: object|null, label: string, isCurrent: boolean}|null}
   *   [options.compare] Die zum Vergleich gemerkte Nachricht.
   * @param {boolean} [options.onlyDifferences] Gleiche Segmente ausblenden.
   * @param {{target: object|null, sources: object[]}} [options.chain]
   *   Aufgeloeste Vorgangskette. Die Aufloesung liegt in app.js, damit diese
   *   Schicht keine Datensatzsuche kennt.
   */
  function renderDetail(
    container,
    {
      record,
      query,
      activeTab,
      activeMessage,
      segmentFilter = [],
      compare = null,
      onlyDifferences = false,
      chain = { target: null, sources: [] },
    },
  ) {
    ns.clear(container);

    if (!record) {
      container.append(
        ns.el('p', { class: 'empty', text: 'Wählen Sie eine Nachricht aus der Liste.' }),
      );
      return;
    }

    const { source, derived } = record;
    // Der Vergleichsreiter erscheint nur, wenn eine andere Nachricht gemerkt
    // ist. Ein leerer Reiter waere eine Ansicht ohne Inhalt.
    const canCompare = Boolean(compare?.message) && !compare.isCurrent;
    const tabs = canCompare ? [...VIEW_TABS, COMPARE_TAB] : VIEW_TABS;
    const view = activeTab === 'diff' && !canCompare ? 'structured' : activeTab;
    const activeIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.value === view),
    );
    const isRaw = view === 'raw';

    const head = ns.el('div', { class: 'detail-head' }, [
      ns.el('div', {}, [
        ns.el('p', {
          class: 'eyebrow',
          text: `${source.direction || 'Nachricht'} · ${source.processingStatus || 'ohne Status'}`,
        }),
        ns.el('h2', {}, [
          ns.highlighted(source.messageFormat || 'EDIFACT', query),
          ' ',
          ns.el('span', { class: 'chip' }, ns.highlighted(source.messageID || record.id, query)),
        ]),
        derived.interchange?.isTest
          ? ns.el('span', {
              class: 'test-badge',
              text: 'Testnachricht · UNB Testkennzeichen 1',
            })
          : null,
        derived.messageCount > 1
          ? ns.el('span', {
              class: 'aggregate-badge',
              text: `Sammelnachricht · ${ns.formatCount(derived.messageCount)} EDIFACT-Nachrichten enthalten`,
            })
          : null,
      ]),
    ]);

    const meta = ns.el('dl', { class: 'meta' }, [
      metaItem('Übertragung', ns.formatDate(source.transferTimestamp), query),
      metaItem('Kommunikationspartner', source.communicationPartnerID, query),
      metaItem('Eigene Partner-ID', source.ownPartnerID, query),
      metaItem('Kategorie', source.messageCategory, query),
      referenceItem(record, chain.target, query),
      metaItem('Austauschweg', source.exchangeMethod, query),
    ]);

    const bar = tablist(tabs, {
      activeIndex,
      name: 'view',
      label: 'Ansicht der Nutzlast',
      panelId: VIEW_PANEL_ID,
      datasetKey: 'tab',
      tabClass: 'tab',
    });

    // In der Rohdatenansicht wird die Nutzlast unveraendert kopiert. Die
    // Kopie einer einzelnen Nachricht wird aus ihren Segmenten
    // zusammengesetzt, kann also nicht zeichengleich sein -- deshalb steht
    // beides zur Verfuegung, an der Stelle, an der es jeweils passt.
    let body;
    if (view === 'diff') {
      body = renderDiff({
        result: ns.diffMessages(compare.message, currentMessage(record, activeMessage)),
        leftLabel: compare.label,
        rightLabel: messageLabel(record, activeMessage),
        onlyDifferences,
      });
    } else if (isRaw) {
      body = [
        ns.el('div', { class: 'section-actions section-actions-raw' }, [
          copyButton(derived.payload, 'Nutzlast', 'Nutzlast kopieren'),
        ]),
        ns.el('pre', {}, ns.highlighted(derived.payload, query)),
      ];
    } else {
      body = renderStructured(record, { query, activeMessage, segmentFilter, compare });
    }

    ns.append(container, [
      head,
      meta,
      acknowledgementSection(record),
      chainSection(chain.sources),
      interchangeSection(derived.interchange, query),
      // Befunde zum Austausch als Ganzes stehen ueber der Ansichtsumschaltung,
      // damit sie auch in der Rohdatenansicht sichtbar bleiben.
      findingList(findingsFor(record, null), 'Befunde des Austauschs'),
      bar,
      tabpanel(VIEW_PANEL_ID, `view-tab-${activeIndex}`, isRaw, body),
    ]);
  }

  ns.renderResultInfo = renderResultInfo;
  ns.renderList = renderList;
  ns.renderDetail = renderDetail;
  ns.messageLabel = messageLabel;
  ns.groupCaptions = groupCaptions;
  ns.currentMessage = currentMessage;
})((globalThis.EdifactExplorer ??= {}));
