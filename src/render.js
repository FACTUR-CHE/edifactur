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
   * @param {number} counts.page
   * @param {number} counts.pageSize
   */
  function renderResultInfo(node, { filtered, total, page, pageSize }) {
    const pages = ns.pageCount(filtered, pageSize);
    const paged = filtered > pageSize;

    ns.clear(node);
    ns.append(node, [
      ns.el('strong', { text: ns.formatCount(filtered) }),
      ` von ${ns.formatCount(total)} Nachrichten`,
      paged ? ` · Seite ${ns.formatCount(page + 1)} von ${ns.formatCount(pages)}` : null,
    ]);
  }

  /**
   * @param {object} record
   * @param {string} query
   * @param {boolean} isSelected
   * @returns {HTMLElement}
   */
  function recordButton(record, query, isSelected) {
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
      derived.messageCount > 1 ? ns.el('br') : null,
      derived.messageCount > 1
        ? ns.el('span', {
            class: 'aggregate-badge',
            text: `Sammelnachricht · ${ns.formatCount(derived.messageCount)} EDIFACT-Nachrichten`,
          })
        : null,
    ]);

    return ns.el(
      'button',
      {
        class: 'record',
        type: 'button',
        dataset: { id: record.id },
        'aria-current': isSelected ? 'true' : false,
      },
      [top, meta],
    );
  }

  /**
   * @param {object} options
   * @param {number} options.start Index des ersten angezeigten Datensatzes.
   * @param {number} options.shown
   * @param {number} options.total
   * @param {number} options.page
   * @param {number} options.pages
   * @returns {HTMLElement}
   */
  function pager({ start, shown, total, page, pages }) {
    const range = `${ns.formatCount(start + 1)}–${ns.formatCount(start + shown)} von ${ns.formatCount(total)}`;

    return ns.el('nav', { class: 'pager', 'aria-label': 'Seitennavigation' }, [
      ns.el('button', {
        class: 'button button-compact',
        type: 'button',
        dataset: { page: 'previous' },
        disabled: page === 0,
        text: '← Zurück',
      }),
      ns.el('span', { text: range }),
      ns.el('button', {
        class: 'button button-compact',
        type: 'button',
        dataset: { page: 'next' },
        disabled: page >= pages - 1,
        text: 'Weiter →',
      }),
    ]);
  }

  /**
   * Zeichnet die Nachrichtenliste inklusive Seitennavigation.
   *
   * @param {HTMLElement} container
   * @param {object} options
   * @param {object[]} options.records Gefilterte Datensaetze.
   * @param {string|null} options.selectedId
   * @param {string} options.query
   * @param {number} options.page
   * @param {number} options.pageSize
   */
  function renderList(container, { records, selectedId, query, page, pageSize }) {
    ns.clear(container);

    if (records.length === 0) {
      container.append(ns.el('p', { class: 'empty', text: 'Keine passenden Nachrichten.' }));
      return;
    }

    const start = page * pageSize;
    const shown = records.slice(start, start + pageSize);
    const pages = ns.pageCount(records.length, pageSize);

    const list = ns.el(
      'ul',
      { class: 'record-list' },
      shown.map((record) => ns.el('li', {}, recordButton(record, query, record.id === selectedId))),
    );

    container.append(list);

    if (records.length > pageSize) {
      container.append(pager({ start, shown: shown.length, total: records.length, page, pages }));
    }
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
  /** Hinweis, wenn ein Code nicht in der hinterlegten Codeliste steht. */
  const UNLISTED_CODE_TITLE =
    'Der Code steht nicht in der hinterlegten Codeliste. Das heißt nicht, dass er ungültig ist — ' +
    'die Tabellen sind kuratierte Teilmengen, und die EDI@Energy-eigenen Codes sind noch nicht erfasst.';

  /**
   * Loest einen Codewert in Klartext auf.
   *
   * Der Rohwert bleibt daneben stehen und kopierbar -- der Klartext tritt
   * hinzu, er ersetzt nichts.
   *
   * @param {string|undefined} element Datenelement-Nummer.
   * @param {string} value
   * @returns {HTMLElement|null} Null, wenn keine Codeliste vorliegt: dann
   *   gibt es keine Aussage zu treffen.
   */
  function codeText(element, value) {
    const meaning = ns.codeMeaning(element, value);
    if (!meaning) return null;

    return meaning.name
      ? ns.el('span', { class: 'code-meaning', text: meaning.name })
      : ns.el('span', {
          class: 'code-meaning code-unlisted',
          title: UNLISTED_CODE_TITLE,
          text: 'nicht hinterlegt',
        });
  }

  /**
   * Uebersetzt einen DTM-Wert in eine lesbare Datumsangabe.
   *
   * @param {string} value    Wert aus DE 2380.
   * @param {string|undefined} format Formatkennzeichen aus DE 2379.
   * @returns {HTMLElement|null}
   */
  function dateText(value, format) {
    const decoded = ns.decodeDateTime(value, format);
    if (!decoded) return null;

    if (decoded.status === 'ok') {
      return ns.el('span', { class: 'code-meaning', text: decoded.text });
    }

    if (decoded.status === 'unknown') {
      return ns.el('span', {
        class: 'code-meaning code-unlisted',
        title:
          'Für dieses Formatkennzeichen ist keine Lesart hinterlegt. Der Rohwert bleibt unverändert stehen.',
        text: 'Format nicht hinterlegt',
      });
    }

    return ns.el('span', {
      class: 'code-meaning code-invalid',
      title: decoded.error,
      text: 'passt nicht zum Format',
    });
  }

  /**
   * Waehlt die Erlaeuterung zu einem Wert.
   *
   * DE 2380 traegt seine Lesart nicht in sich -- erst das Formatkennzeichen
   * in DE 2379 macht daraus ein Datum. In C507 steht es immer als naechste
   * Komponente.
   *
   * @param {{code: string}|null} definition
   * @param {string} value
   * @param {string[]} siblings  Komponenten desselben Datenelements.
   * @param {number} component
   * @returns {HTMLElement|null}
   */
  function valueAnnotation(definition, value, siblings, component) {
    if (definition?.code === '2380') return dateText(value, siblings[component + 1]);
    return codeText(definition?.code, value);
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
   * Baut die strukturierte Ansicht: bei mehreren Nachrichten eine eigene
   * Tab-Leiste, darunter die Segmente der aktiven Nachricht.
   *
   * @param {object} record
   * @param {object} options
   * @param {string} options.query
   * @param {number} options.activeMessage
   * @returns {Node[]}
   */
  function renderStructured(record, { query, activeMessage }) {
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
      message.type,
      message.header?.formatVersion ? `Formatversion ${message.header.formatVersion}` : null,
      `${ns.formatCount(message.segments.length)} Segmente`,
    ]
      .filter(Boolean)
      .join(' · ');

    const separator = record.derived.delimiters.segment;

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
        ]),
      ]),
      findingList(findingsFor(record, index), 'Befunde dieser Nachricht'),
      ns.el('p', {
        class: 'segment-hint',
        text: 'Klick auf ein Segment-Tag kopiert die Segmentzeile, Klick auf einen Wert den Einzelwert.',
      }),
      ...message.segments.map((segment) => segmentRow(segment, query, separator)),
    ]);

    if (messages.length === 1) return [section];

    const bar = tablist(
      messages.map((entry, position) => ({
        value: String(position),
        label: `Nachricht ${position + 1}: ${entry.type}`,
      })),
      {
        activeIndex: index,
        name: 'message',
        label: 'Enthaltene Nachrichten',
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
   * @param {{target: object|null, sources: object[]}} [options.chain]
   *   Aufgeloeste Vorgangskette. Die Aufloesung liegt in app.js, damit diese
   *   Schicht keine Datensatzsuche kennt.
   */
  function renderDetail(
    container,
    { record, query, activeTab, activeMessage, chain = { target: null, sources: [] } },
  ) {
    ns.clear(container);

    if (!record) {
      container.append(
        ns.el('p', { class: 'empty', text: 'Wählen Sie eine Nachricht aus der Liste.' }),
      );
      return;
    }

    const { source, derived } = record;
    const isRaw = activeTab === 'raw';
    const activeIndex = isRaw ? 1 : 0;

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

    const bar = tablist(VIEW_TABS, {
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
    const body = isRaw
      ? [
          ns.el('div', { class: 'section-actions section-actions-raw' }, [
            copyButton(derived.payload, 'Nutzlast', 'Nutzlast kopieren'),
          ]),
          ns.el('pre', {}, ns.highlighted(derived.payload, query)),
        ]
      : renderStructured(record, { query, activeMessage });

    ns.append(container, [
      head,
      meta,
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
})((globalThis.EdifactExplorer ??= {}));
