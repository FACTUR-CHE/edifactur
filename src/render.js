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

  function segmentRow(segment, query) {
    const label = ns.segmentLabel(segment.tag);

    const values = segment.elements.map((value, index) =>
      ns.el(
        'span',
        { class: 'value', title: `Element ${index + 1}` },
        ns.highlighted(value || ns.EMPTY_ELEMENT, query),
      ),
    );

    return ns.el('div', { class: 'segment' }, [
      ns.el('code', { title: label, text: segment.tag }),
      ns.el('div', {}, [
        ns.el('small', { text: label }),
        values.length > 0 ? ns.el('div', { class: 'segment-values' }, values) : null,
      ]),
    ]);
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

    const section = ns.el('div', { class: 'section' }, [
      ns.el('h3', {
        text: `${message.type} · ${ns.formatCount(message.segments.length)} Segmente`,
      }),
      findingList(findingsFor(record, index), 'Befunde dieser Nachricht'),
      ...message.segments.map((segment) => segmentRow(segment, query)),
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
   */
  function renderDetail(container, { record, query, activeTab, activeMessage }) {
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
      metaItem('Referenz', source.referenceMessageID, query),
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

    const body = isRaw
      ? [ns.el('pre', {}, ns.highlighted(derived.payload, query))]
      : renderStructured(record, { query, activeMessage });

    ns.append(container, [
      head,
      meta,
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
