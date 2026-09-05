/**
 * Anwendungseinstieg: Zustand, Datei-Import und Event-Verdrahtung.
 *
 * Dieses Modul kennt das DOM, aber keine EDIFACT-Regeln und keine
 * HTML-Erzeugung -- das liegt in edifact.js beziehungsweise render.js.
 *
 * Zum Aufbau siehe den Kopfkommentar in edifact.js. Diese Datei muss als
 * letzte geladen werden: sie loest die DOM-Knoten sofort auf und haengt die
 * Ereignisbehandlung an.
 *
 * Benoetigt: records.js, render.js, dom.js.
 */

(function (ns) {
  'use strict';

  /**
   * Hoehe einer Listenzeile in Pixeln.
   *
   * Die Virtualisierung rechnet mit einer festen Zeilenhoehe: nur so laesst
   * sich aus der Rollposition der sichtbare Ausschnitt bestimmen, ohne alle
   * Zeilen zu zeichnen und zu messen. Der Wert wird als `--record-height` an
   * die Liste gegeben, damit CSS und Rechnung nicht auseinanderlaufen.
   */
  const RECORD_HEIGHT = 112;

  /** Wartezeit, bevor eine Eingabe im Suchfeld einen Neuaufbau ausloest. */
  const SEARCH_DEBOUNCE_MS = 150;

  /** Zuordnung von Filter-Select zu gefiltertem Metadatenfeld. */
  const FILTERS = Object.freeze([
    { id: 'formatFilter', field: 'messageFormat' },
    { id: 'directionFilter', field: 'direction' },
    { id: 'statusFilter', field: 'processingStatus' },
    { id: 'categoryFilter', field: 'messageCategory' },
  ]);

  /** Tastenschritte in der Trefferliste. */
  const LIST_STEPS = Object.freeze({ j: 1, k: -1, ArrowDown: 1, ArrowUp: -1 });

  /**
   * Pfeiltasten gehoeren dem Detailbereich, sobald der Fokus dort steht --
   * eine lange Nachricht muss sich rollen lassen, und die Reiter folgen dem
   * ARIA-Muster. Ueberall sonst waehlen sie den naechsten Datensatz.
   *
   * Zuerst galten sie nur innerhalb der Trefferliste. Das war zu eng: nach
   * dem Zeichnen liegt der Fokus auf dem Seitenrumpf, und dort taten sie
   * nichts -- also fast immer.
   */
  const ARROW_KEYS = Object.freeze(['ArrowDown', 'ArrowUp']);

  /** Tastenschritte innerhalb einer Tab-Leiste. */
  const ARROW_STEPS = Object.freeze({
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  });

  /**
   * Registrierung der manuell unterstuetzten Eingabeformate. Neue Formate
   * benoetigen nur einen Eintrag mit Validierung und Record-Erzeugung.
   */
  const INPUT_FORMATS = Object.freeze({
    edifact: Object.freeze({
      label: 'EDIFACT',
      help: 'Fuegen Sie eine vollstaendige EDIFACT-Nachricht mit Segmentabschluss ein.',
      placeholder: "UNB+...\nUNH+1+UTILMD:D:11A:UN'\nBGM+E01+1'\nUNT+3+1'\nUNZ+1+...'",
      validate: ns.validateEdifactSyntax,
      create: ns.createRecordFromEdifact,
      fallbackId: 'manuell',
    }),
  });

  const ELEMENT_IDS = Object.freeze([
    'fileButton',
    'fileInput',
    'fileName',
    'entryModeButton',
    'notice',
    'upload',
    'entryMode',
    'entryCloseButton',
    'inputFormat',
    'inputFormatHelp',
    'messageInput',
    'messageAddButton',
    'app',
    'resultInfo',
    'clearFilters',
    'exportList',
    'search',
    'rangePanel',
    'rangeSummary',
    'rangePreset',
    'rangeFrom',
    'rangeTo',
    'rangeHint',
    'recordList',
    'detail',
    'aboutButton',
    'aboutDialog',
    'aboutClose',
    'appVersion',
    ...FILTERS.map((filter) => filter.id),
  ]);

  /**
   * Einmalig aufgeloeste Knoten. Frueher wurde `getElementById` innerhalb der
   * Filterbedingung aufgerufen, also einmal je Datensatz und Tastendruck.
   */
  const dom = Object.fromEntries(ELEMENT_IDS.map((id) => [id, document.getElementById(id)]));

  const state = {
    records: [],
    /** @type {Map<string, object>} Datensatzkennung -> Datensatz. */
    recordsById: new Map(),
    /** @type {{targets: Map<string, string>, sources: Map<string, string[]>}} */
    references: { targets: new Map(), sources: new Map() },
    filtered: [],
    /** @type {string|null} */
    selectedId: null,
    query: '',
    /** @type {string[]} Begriffe fuer die Hervorhebung, aus der Eingabe abgeleitet. */
    highlight: [],
    /** @type {'structured'|'raw'} */
    activeTab: 'structured',
    activeMessage: 0,
    /** @type {string[]} Segment-Tags der strukturierten Ansicht; leer = alle. */
    segmentFilter: [],
    /**
     * @type {{recordId: string, messageIndex: number}|null}
     * Die zum Vergleich gemerkte Nachricht. Sie ueberlebt den Wechsel des
     * Datensatzes -- genau dafuer ist sie da.
     */
    compare: null,
    /** Zeigt der Vergleich nur die Unterschiede? */
    onlyDifferences: false,
  };

  /** Zuletzt gezeichneter Ausschnitt, um beim Rollen nicht umsonst zu zeichnen. */
  let drawnWindow = { start: -1, end: -1 };

  /**
   * Setzt die Ansicht des Detailbereichs auf den Anfang zurueck.
   *
   * Ein Segmentfilter gehoert zu genau einer Nachricht: in der naechsten
   * blendete er entweder alles aus oder etwas anderes als gemeint. Er wird
   * deshalb ueberall dort zurueckgenommen, wo die gezeigte Nachricht wechselt.
   */
  function resetDetailView() {
    state.activeMessage = 0;
    state.segmentFilter = [];
  }

  /**
   * Verzoegert die Ausfuehrung, bis `delay` Millisekunden keine neue Eingabe
   * kam.
   *
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Zeigt eine Meldung an. Der Knoten ist `role="alert"`, wird also
   * angekuendigt.
   *
   * @param {string} message
   * @param {'info'|'warning'|'error'} variant
   */
  function showNotice(message, variant, source = 'app') {
    dom.notice.textContent = message;
    dom.notice.dataset.variant = variant;
    dom.notice.dataset.source = source;
    dom.notice.hidden = false;
  }

  function hideNotice() {
    dom.notice.hidden = true;
    dom.notice.textContent = '';
    delete dom.notice.dataset.source;
  }

  /**
   * Nimmt nur eine Meldung derselben Herkunft zurueck.
   *
   * Ohne diese Schranke wuerde jeder Tastendruck im Suchfeld die Warnung
   * ueber uebersprungene Datensaetze aus dem Datei-Import loeschen.
   *
   * @param {string} source
   */
  function hideNoticeFrom(source) {
    if (dom.notice.dataset.source === source) hideNotice();
  }

  function resetManualInput() {
    dom.messageInput.value = '';
  }

  function setView(view) {
    dom.upload.hidden = view !== 'start';
    dom.entryMode.hidden = view !== 'entry';
    dom.app.hidden = view !== 'viewer';

    const isEntryMode = view === 'entry';
    dom.entryModeButton.setAttribute('aria-expanded', String(isEntryMode));
    dom.entryModeButton.textContent = isEntryMode ? 'Eingabe schliessen' : 'Nachricht eingeben';

    if (isEntryMode) dom.messageInput.focus();
  }

  function openEntryMode() {
    hideNotice();
    setView('entry');
  }

  function closeEntryMode() {
    setView(state.records.length > 0 ? 'viewer' : 'start');
  }

  function currentInputFormat() {
    return INPUT_FORMATS[dom.inputFormat.value] ?? null;
  }

  function updateInputFormat() {
    const format = currentInputFormat();
    if (!format) return;

    dom.inputFormatHelp.textContent = format.help;
    dom.messageInput.placeholder = format.placeholder;
  }

  /**
   * Uebernimmt eine Sucheingabe.
   *
   * Ein unbekanntes Suchfeld wird gemeldet und die Bedingung fallen gelassen.
   * Sie stillschweigend als Volltext zu suchen waere schlimmer: ein
   * Tippfehler ergaebe dann ein Ergebnis, das wie eine Antwort aussieht.
   *
   * @param {string} value
   */
  function updateQuery(value) {
    state.query = value;
    state.highlight = ns.highlightTerms(value);

    const { unknown } = ns.parseQuery(value);
    if (unknown.length === 0) {
      hideNoticeFrom('search');
      return;
    }

    const available = Object.keys(ns.SEARCH_FIELDS)
      .map((key) => `${key}:`)
      .join(' ');
    showNotice(
      `Unbekanntes Suchfeld ${unknown.map((entry) => `${entry}:`).join(', ')} — die Bedingung wurde nicht angewendet. Verfügbar: ${available}`,
      'warning',
      'search',
    );
  }

  /**
   * Liest die aktuellen Filterwerte -- einmal pro Filtervorgang, nicht pro
   * Datensatz.
   *
   * @returns {object}
   */
  function readCriteria() {
    const criteria = { query: state.query, range: readRange() };
    for (const { id, field } of FILTERS) criteria[field] = dom[id].value;
    return criteria;
  }

  /** @returns {{preset: string, from: string, to: string}} */
  function readRange() {
    return {
      preset: dom.rangePreset.value,
      from: dom.rangeFrom.value,
      to: dom.rangeTo.value,
    };
  }

  /**
   * Benennt den gesetzten Zeitraum kurz, fuer die Kopfzeile des Panels.
   *
   * Der Zeitraum ist der einzige Filter, der sich einklappen laesst. Was
   * eingeklappt ist, wirkt trotzdem -- die Kopfzeile muss ihn deshalb tragen,
   * sonst suchte man die fehlenden Treffer hinter einer zugeklappten Zeile.
   *
   * @param {{start: number, end: number}|null} range
   * @returns {string} Leer, wenn kein Zeitraum gesetzt ist.
   */
  function describeRange(range) {
    if (!range) return '';

    const preset = ns.RANGE_PRESETS[dom.rangePreset.value];
    if (preset) return preset.label;

    if (range.start > range.end) return 'ungültige Spanne';
    if (!Number.isFinite(range.start)) return `bis ${ns.formatDay(range.end)}`;
    if (!Number.isFinite(range.end)) return `ab ${ns.formatDay(range.start)}`;
    return `${ns.formatDay(range.start)} bis ${ns.formatDay(range.end)}`;
  }

  /**
   * Beschreibt den gesetzten Zeitraum in der Kopfzeile und unter den Feldern.
   *
   * Zwei Dinge muessen sichtbar sein, damit die Trefferzahl nachvollziehbar
   * bleibt: dass nach Ortszeit gefiltert wird, und wie viele Datensaetze
   * mangels Zeitstempel gar nicht eingeordnet werden koennen.
   */
  function updateRangeHint() {
    const range = ns.resolveRange(readRange());
    const summary = describeRange(range);

    dom.rangeSummary.textContent = summary
      ? `Übertragungszeitraum: ${summary}`
      : 'Übertragungszeitraum';
    dom.rangePanel.dataset.active = String(Boolean(summary));

    if (!range) {
      dom.rangeHint.hidden = true;
      dom.rangeHint.textContent = '';
      return;
    }

    dom.rangeHint.hidden = false;

    if (range.start > range.end) {
      dom.rangeHint.dataset.variant = 'warning';
      dom.rangeHint.textContent =
        'Das Bis-Datum liegt vor dem Von-Datum — kein Zeitraum, also keine Treffer.';
      return;
    }

    const bounds = `${formatBound(range.start, 'ohne Anfang')} bis ${formatBound(range.end, 'ohne Ende')} (Ortszeit)`;
    const undated = ns.countUndatedRecords(state.records);
    const skipped =
      undated === 1
        ? ' Ein Datensatz ohne lesbaren Zeitstempel ist ausgeblendet.'
        : ` ${undated} Datensätze ohne lesbaren Zeitstempel sind ausgeblendet.`;

    delete dom.rangeHint.dataset.variant;
    dom.rangeHint.textContent = undated === 0 ? bounds : `${bounds}.${skipped}`;
  }

  /**
   * @param {number} value Zeitpunkt in Millisekunden, moeglicherweise unendlich.
   * @param {string} fallback Text fuer eine offene Grenze.
   * @returns {string}
   */
  function formatBound(value, fallback) {
    return Number.isFinite(value) ? ns.formatDate(value) : fallback;
  }

  /** @returns {object|null} */
  function selectedRecord() {
    return state.filtered.find((record) => record.id === state.selectedId) ?? null;
  }

  /**
   * Uebernimmt einen neuen Bestand und baut die abgeleiteten Indizes.
   *
   * Einziger Weg, `state.records` zu setzen -- sonst laufen Kennungsindex und
   * Referenzindex irgendwann aus dem Tritt.
   *
   * @param {object[]} records
   */
  function setRecords(records) {
    state.records = records;
    state.recordsById = new Map(records.map((record) => [record.id, record]));
    state.references = ns.buildReferenceIndex(records);
  }

  /**
   * Loest die Vorgangskette eines Datensatzes zu Datensaetzen auf.
   *
   * @param {object|null} record
   * @returns {{target: object|null, sources: object[]}}
   */
  function referenceChain(record) {
    if (!record) return { target: null, sources: [] };

    const targetId = state.references.targets.get(record.id);
    return {
      target: targetId ? (state.recordsById.get(targetId) ?? null) : null,
      sources: (state.references.sources.get(record.id) ?? [])
        .map((id) => state.recordsById.get(id))
        .filter(Boolean),
    };
  }

  function renderDetailPane() {
    const record = selectedRecord();
    ns.renderDetail(dom.detail, {
      record,
      query: state.highlight,
      activeTab: state.activeTab,
      activeMessage: state.activeMessage,
      segmentFilter: state.segmentFilter,
      compare: comparePartner(record),
      onlyDifferences: state.onlyDifferences,
      chain: referenceChain(record),
    });
  }

  /**
   * Loest die gemerkte Nachricht zum Vergleich auf.
   *
   * @param {object|null} record Der offene Datensatz.
   * @returns {{message: object|null, label: string, isCurrent: boolean}|null}
   */
  function comparePartner(record) {
    if (!state.compare) return null;

    const pinned = state.recordsById.get(state.compare.recordId);
    // Nach einem neuen Import gibt es den gemerkten Datensatz nicht mehr.
    if (!pinned) {
      state.compare = null;
      return null;
    }

    const { messageIndex } = state.compare;
    return {
      message: ns.currentMessage(pinned, messageIndex),
      label: ns.messageLabel(pinned, messageIndex),
      isCurrent: pinned.id === record?.id && messageIndex === state.activeMessage,
    };
  }

  /**
   * Merkt eine Nachricht zum Vergleich oder gibt sie wieder frei.
   *
   * @param {number} messageIndex
   */
  function toggleCompare(messageIndex) {
    const record = selectedRecord();
    if (!record) return;

    const isPinned =
      state.compare?.recordId === record.id && state.compare?.messageIndex === messageIndex;

    if (isPinned) {
      state.compare = null;
      if (state.activeTab === 'diff') state.activeTab = 'structured';
      renderDetailPane();
      return;
    }

    state.compare = { recordId: record.id, messageIndex };
    renderDetailPane();
    showNotice(
      `${ns.messageLabel(record, messageIndex)} gemerkt. Öffnen Sie eine andere Nachricht und wählen Sie den Reiter „Vergleich“.`,
      'info',
    );
  }

  /**
   * Nimmt einen Segmenttyp in die Anzeige auf oder wieder heraus.
   *
   * @param {string} tag
   */
  function toggleSegmentFilter(tag) {
    state.segmentFilter = state.segmentFilter.includes(tag)
      ? state.segmentFilter.filter((entry) => entry !== tag)
      : [...state.segmentFilter, tag];
  }

  /**
   * Legt `text` ueber ein verstecktes Textfeld in die Zwischenablage.
   *
   * `document.execCommand` ist veraltet, unter `file://` aber oft der einzige
   * Weg: die Clipboard-API verlangt einen sicheren Kontext, und der Viewer
   * soll sich per Doppelklick aus dem Dateisystem oeffnen lassen.
   *
   * @param {string} text
   * @returns {boolean}
   */
  function copyViaTextarea(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // Ausserhalb des Blickfelds, aber nicht `display: none` -- ein
    // unsichtbares Feld laesst sich nicht markieren.
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }

    area.remove();
    return copied;
  }

  /**
   * Kopiert `text` und meldet das Ergebnis.
   *
   * Scheitern bleibt nicht stumm: ohne Rueckmeldung haelt man den Wert fuer
   * kopiert und fuegt an anderer Stelle etwas Altes ein.
   *
   * @param {string} text
   * @param {string} label Bezeichnung fuer die Rueckmeldung.
   */
  async function copyToClipboard(text, label) {
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) copied = copyViaTextarea(text);

    if (copied) {
      showNotice(`${label} in die Zwischenablage kopiert.`, 'info');
      return;
    }

    showNotice(
      `${label} konnte nicht kopiert werden — der Browser hat den Zugriff auf die Zwischenablage abgelehnt. Der Wert lässt sich markieren und mit Strg+C übernehmen.`,
      'warning',
    );
  }

  /**
   * Gibt Text als Datei heraus.
   *
   * Ueber ein Blob und einen `download`-Link, weil der Viewer sich per
   * Doppelklick aus dem Dateisystem oeffnen lassen soll: unter `file://` gibt
   * es keinen Server, der eine Datei ausliefern koennte.
   *
   * @param {string} text
   * @param {string} fileName
   * @returns {boolean} Ob der Download ausgeloest werden konnte.
   */
  function downloadText(text, fileName) {
    if (typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') return false;

    try {
      // charset im Typ, damit ein direkt geoeffnetes Blob nicht als
      // Windows-1252 gelesen wird. Die BOM steht zusaetzlich im Text.
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      // Erst nach dem Klick, sonst ist die Quelle schon wieder weg.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gibt eine CSV heraus und meldet das Ergebnis.
   *
   * Der Hinweis auf `file://` steht auch im Erfolgsfall: manche Browser
   * verweigern den Download dort ohne Fehler, und ein stiller Fehlschlag
   * saehe aus wie ein leerer Ordner ohne Grund.
   *
   * @param {string} text
   * @param {string} subject Bezug fuer den Dateinamen.
   * @param {string} label   Bezeichnung fuer die Rueckmeldung.
   */
  function exportCsv(text, subject, label) {
    const fileName = ns.exportFileName(subject);

    if (!downloadText(text, fileName)) {
      showNotice(
        `${label} konnte nicht gespeichert werden — dieser Browser erlaubt den Download nicht. Öffnen Sie den Viewer über einen lokalen Webserver.`,
        'error',
      );
      return;
    }

    showNotice(
      `${label} als ${fileName} gespeichert. Erscheint kein Download, verhindert ihn der Browser beim Öffnen über file:// — dann hilft ein lokaler Webserver.`,
      'info',
    );
  }

  /** Gibt die gefilterte Trefferliste heraus, nicht nur die sichtbare Seite. */
  function exportRecordList() {
    if (state.filtered.length === 0) {
      showNotice('Die Trefferliste ist leer — es gibt nichts zu exportieren.', 'warning');
      return;
    }

    exportCsv(
      ns.recordListCsv(state.filtered),
      'trefferliste',
      `Trefferliste (${ns.formatCount(state.filtered.length)} Datensätze)`,
    );
  }

  /**
   * Gibt die Segmente einer Nachricht heraus.
   *
   * Immer die ganze Nachricht, auch bei gesetztem Segmentfilter -- wie die
   * Kopierziele daneben.
   *
   * @param {number} index Position der Nachricht im Datensatz.
   */
  function exportSegments(index) {
    const record = selectedRecord();
    const message = record?.derived.messages[index];
    if (!message) return;

    const subject = `segmente-${record.source.messageID || record.id}-${index + 1}`;
    exportCsv(ns.segmentCsv(message, index + 1), subject, `Segmente der Nachricht ${index + 1}`);
  }

  /**
   * Waehlt einen Datensatz anhand seiner Kennung aus und macht ihn sichtbar.
   *
   * @param {string} id
   */
  function gotoRecord(id) {
    const record = state.recordsById.get(id);
    if (!record) {
      showNotice('Der referenzierte Datensatz ist nicht geladen.', 'warning');
      return;
    }

    state.selectedId = id;
    state.activeTab = 'structured';
    resetDetailView();

    // Ein aktiver Filter darf den Sprung nicht verhindern. Liegt das Ziel
    // ausserhalb der Treffermenge, werden Suche und Filter zurueckgesetzt --
    // sonst waere der Klick wirkungslos.
    if (ns.filterRecords([record], readCriteria()).length === 0) {
      resetControls();
      showNotice(
        'Suche und Filter wurden zurückgesetzt, damit die referenzierte Nachricht sichtbar ist.',
        'warning',
      );
    } else {
      hideNotice();
    }

    applyFilters({ resetPage: true });

    // Der Zieldatensatz kann weit unten liegen. Ohne diesen Sprung stuende er
    // im Detailbereich, waere in der Liste aber nicht zu sehen.
    scrollIntoView(state.filtered.findIndex((entry) => entry.id === id));
    renderListPane();

    // Der Detailbereich wurde neu aufgebaut, der geklickte Knoten existiert
    // nicht mehr. Der Fokus wandert deshalb auf den Listeneintrag.
    dom.recordList.querySelector('[aria-current="true"]')?.focus();
  }

  /**
   * Bestimmt den sichtbaren Ausschnitt aus Rollposition und Sichthoehe.
   *
   * @returns {object} Ergebnis von `visibleRange`.
   */
  function listWindow() {
    return ns.visibleRange({
      scrollTop: dom.recordList.scrollTop,
      viewportHeight: dom.recordList.clientHeight,
      rowHeight: RECORD_HEIGHT,
      total: state.filtered.length,
    });
  }

  /** Zeichnet nur die Liste -- beim Rollen ist der Detailbereich unberuehrt. */
  function renderListPane() {
    const view = listWindow();
    drawnWindow = view;
    ns.renderList(dom.recordList, {
      records: state.filtered,
      selectedId: state.selectedId,
      query: state.highlight,
      window: view,
    });
  }

  /**
   * Rollt einen Datensatz in den sichtbaren Bereich.
   *
   * @param {number} index Platz in der gefilterten Liste.
   */
  function scrollIntoView(index) {
    if (index < 0) return;

    const top = index * RECORD_HEIGHT;
    const view = dom.recordList;
    if (top < view.scrollTop) view.scrollTop = top;
    else if (top + RECORD_HEIGHT > view.scrollTop + view.clientHeight) {
      view.scrollTop = top + RECORD_HEIGHT - view.clientHeight;
    }
  }

  function render() {
    ns.renderResultInfo(dom.resultInfo, {
      filtered: state.filtered.length,
      total: state.records.length,
    });
    renderListPane();
    renderDetailPane();
  }

  /**
   * Filtert neu und zeichnet die Oberflaeche.
   *
   * @param {{resetPage?: boolean}} [options]
   */
  function applyFilters({ resetPage = false } = {}) {
    // Eine neue Treffermenge beginnt oben. Die alte Rollposition zeigte sonst
    // mitten in eine Liste, die es so nicht mehr gibt.
    if (resetPage) dom.recordList.scrollTop = 0;

    updateRangeHint();

    state.filtered = ns.filterRecords(state.records, readCriteria());

    if (!state.filtered.some((record) => record.id === state.selectedId)) {
      state.selectedId = state.filtered[0]?.id ?? null;
      resetDetailView();
    }

    render();
  }

  /** Fuellt die Filterlisten neu und behaelt dabei die "Alle ..."-Option. */
  function fillFilterOptions() {
    for (const { id, field } of FILTERS) {
      const select = dom[id];
      const allOption = select.options[0];

      ns.clear(select);
      select.append(allOption);
      for (const value of ns.extractOptionValues(state.records, field)) {
        select.append(ns.el('option', { value, text: value }));
      }
    }
  }

  function resetControls() {
    dom.search.value = '';
    for (const { id } of FILTERS) dom[id].value = '';
    dom.rangePreset.value = '';
    dom.rangeFrom.value = '';
    dom.rangeTo.value = '';
    updateRangeHint();
    updateQuery('');
  }

  /**
   * Liest den Dateiinhalt ein und uebernimmt ihn in den Zustand.
   *
   * @param {string} text
   * @param {string} fileName
   */
  function loadRecords(text, fileName) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      showNotice(
        'Die Datei enthält kein gültiges JSON. Bitte prüfen Sie den Export und wählen Sie die Datei erneut.',
        'error',
      );
      return;
    }

    const list = Array.isArray(data?.value) ? data.value : Array.isArray(data) ? data : [];
    const valid = list.filter(ns.isPlainRecord);

    if (valid.length === 0) {
      showNotice(
        'Keine Datensätze gefunden. Erwartet wird eine Liste von Objekten unter "value".',
        'error',
      );
      return;
    }

    const skipped = list.length - valid.length;
    if (skipped > 0) {
      showNotice(
        `${skipped} Einträge waren keine Datensätze und wurden übersprungen. ${valid.length} Nachrichten geladen.`,
        'warning',
      );
    } else {
      hideNotice();
    }

    setRecords(ns.normalizeRecords(valid));
    state.selectedId = state.records[0].id;
    state.activeTab = 'structured';
    // Die gemerkte Nachricht stammt aus dem alten Bestand.
    state.compare = null;
    resetDetailView();
    dom.recordList.scrollTop = 0;

    resetControls();
    resetManualInput();
    fillFilterOptions();

    dom.fileName.textContent = fileName;
    setView('viewer');

    applyFilters();
  }

  /** Fuegt eine manuell eingegebene Nachricht zum Bestand hinzu. */
  function addManualRecord() {
    const format = currentInputFormat();
    if (!format) {
      showNotice('Das gewaehlte Eingabeformat wird nicht unterstuetzt.', 'error');
      return;
    }

    const text = dom.messageInput.value;
    const validation = format.validate(text);
    if (!validation.ok) {
      showNotice(validation.error, 'error');
      return;
    }

    const trimmed = text.trim();
    const record = format.create(trimmed, format.fallbackId);
    record.id = ns.uniqueRecordId(record.id, new Set(state.records.map((entry) => entry.id)));

    setRecords([record, ...state.records]);
    state.selectedId = record.id;
    state.activeTab = 'structured';
    resetDetailView();
    dom.recordList.scrollTop = 0;

    fillFilterOptions();
    dom.fileName.textContent =
      state.records.length === 1 ? 'Manuell eingefuegte Nachricht' : 'Gemischte Datenquelle';
    applyFilters({ resetPage: true });
    resetManualInput();
    setView('viewer');

    const messageCount = record.derived.messageCount || record.derived.messages.length;
    showNotice(
      `${format.label}-Nachricht hinzugefuegt. ${messageCount} Nachricht${
        messageCount === 1 ? '' : 'en'
      } erkannt.`,
      'info',
    );
  }

  // --- Datei-Auswahl -------------------------------------------------------

  dom.fileButton.addEventListener('click', () => dom.fileInput.click());

  dom.fileInput.addEventListener('change', (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => showNotice('Die Datei konnte nicht gelesen werden.', 'error');
    reader.onload = () => loadRecords(String(reader.result), file.name);
    reader.readAsText(file);

    // Zuruecksetzen, damit dieselbe Datei erneut ausgewaehlt werden kann.
    input.value = '';
  });

  dom.messageAddButton.addEventListener('click', addManualRecord);
  dom.entryModeButton.addEventListener('click', () => {
    if (dom.entryMode.hidden) openEntryMode();
    else closeEntryMode();
  });
  dom.entryCloseButton.addEventListener('click', closeEntryMode);
  dom.inputFormat.addEventListener('change', updateInputFormat);
  dom.messageInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      addManualRecord();
    }
  });

  // --- Suche und Filter ----------------------------------------------------

  dom.search.addEventListener(
    'input',
    debounce(() => {
      updateQuery(dom.search.value);
      resetDetailView();
      applyFilters({ resetPage: true });
    }, SEARCH_DEBOUNCE_MS),
  );

  for (const { id } of FILTERS) {
    dom[id].addEventListener('change', () => {
      resetDetailView();
      applyFilters({ resetPage: true });
    });
  }

  // Schnellauswahl und freie Datumsfelder schliessen einander aus. Sie
  // gleichzeitig gesetzt stehen zu lassen waere nicht zu erklaeren: eines von
  // beiden bliebe wirkungslos, ohne dass man saehe, welches.
  dom.rangePreset.addEventListener('change', () => {
    dom.rangeFrom.value = '';
    dom.rangeTo.value = '';
    resetDetailView();
    applyFilters({ resetPage: true });
  });

  for (const id of ['rangeFrom', 'rangeTo']) {
    dom[id].addEventListener('change', () => {
      dom.rangePreset.value = '';
      resetDetailView();
      applyFilters({ resetPage: true });
    });
  }

  dom.exportList.addEventListener('click', exportRecordList);

  dom.clearFilters.addEventListener('click', () => {
    resetControls();
    resetDetailView();
    applyFilters({ resetPage: true });
    dom.search.focus();
  });

  // --- Liste und Seitennavigation -----------------------------------------

  // Die Zeilenhoehe steht in app.js, damit Rechnung und Darstellung dieselbe
  // Zahl benutzen. Das Stylesheet nimmt sie von hier entgegen.
  dom.recordList.style.setProperty('--record-height', `${RECORD_HEIGHT}px`);

  /**
   * Zeichnet beim Rollen den neuen Ausschnitt.
   *
   * Nur wenn sich das Fenster tatsaechlich verschoben hat: sonst liefe bei
   * jedem Rollereignis ein Neuaufbau, obwohl dieselben Zeilen zu sehen sind.
   */
  dom.recordList.addEventListener('scroll', () => {
    const view = listWindow();
    if (view.start === drawnWindow.start && view.end === drawnWindow.end) return;
    renderListPane();
  });

  // Bei einer Groessenaenderung passt das Fenster nicht mehr zur Sichthoehe.
  window.addEventListener('resize', () => renderListPane());

  dom.recordList.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const record = target.closest('[data-id]');
    if (record) {
      state.selectedId = record.dataset.id;
      resetDetailView();
      render();
      // `render` baut die Liste neu auf, der angeklickte Knopf ist danach
      // fort und der Fokus faellt auf den Rumpf zurueck. Die Pfeiltasten
      // rollten dann nur noch den Listenbereich, statt weiterzuwaehlen --
      // wer eine Nachricht anklickt, arbeitet in der Liste weiter.
      focusSelectedRecord();
    }
  });

  // --- Detailbereich -------------------------------------------------------

  dom.detail.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const copy = target.closest('[data-copy]');
    if (copy) {
      copyToClipboard(copy.dataset.copy, copy.dataset.copyLabel || 'Wert');
      return;
    }

    const jump = target.closest('[data-goto]');
    if (jump) {
      gotoRecord(jump.dataset.goto);
      return;
    }

    if (target.closest('[data-compare-clear]')) {
      state.compare = null;
      state.activeTab = 'structured';
      renderDetailPane();
      return;
    }

    const compareButton = target.closest('[data-compare]');
    if (compareButton) {
      toggleCompare(Number(compareButton.dataset.compare));
      return;
    }

    if (target.closest('[data-diff-only]')) {
      state.onlyDifferences = !state.onlyDifferences;
      renderDetailPane();
      dom.detail.querySelector('[data-diff-only]')?.focus();
      return;
    }

    const exportButton = target.closest('[data-export-segments]');
    if (exportButton) {
      exportSegments(Number(exportButton.dataset.exportSegments));
      return;
    }

    const segmentChip = target.closest('[data-segment]');
    if (segmentChip) {
      const { segment } = segmentChip.dataset;
      toggleSegmentFilter(segment);
      renderDetailPane();
      // Der Detailbereich wurde neu aufgebaut; ohne diesen Nachzug landete
      // der Fokus nach jedem Tastendruck wieder am Anfang der Seite.
      dom.detail.querySelector(`[data-segment="${segment}"]`)?.focus();
      return;
    }

    if (target.closest('[data-segment-clear]')) {
      state.segmentFilter = [];
      renderDetailPane();
      dom.detail.querySelector('[data-segment]')?.focus();
      return;
    }

    const viewTab = target.closest('[data-tab]');
    if (viewTab) {
      state.activeTab = viewTab.dataset.tab;
      renderDetailPane();
      return;
    }

    const messageTab = target.closest('[data-message]');
    if (messageTab) {
      // Andere Nachricht, andere Segmenttypen -- der Filter gehoert nicht
      // dorthin.
      resetDetailView();
      state.activeMessage = Number(messageTab.dataset.message);
      renderDetailPane();
    }
  });

  /**
   * Pfeiltasten-Navigation innerhalb einer Tab-Leiste nach ARIA-Muster.
   * Der Klick baut den Detailbereich neu auf, deshalb muss der Fokus
   * anschliessend auf den ersetzten Knoten nachgezogen werden.
   */
  dom.detail.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest('[role="tab"]');
    if (!tab) return;

    const list = tab.closest('[data-tablist]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(tab);

    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key in ARROW_STEPS) {
      next = (current + ARROW_STEPS[event.key] + tabs.length) % tabs.length;
    } else return;

    event.preventDefault();
    const kind = list.dataset.tablist;
    tabs[next].click();
    dom.detail.querySelectorAll(`[data-tablist="${kind}"] [role="tab"]`)[next]?.focus();
  });

  // --- Tastenbedienung -----------------------------------------------------

  /**
   * Prueft, ob gerade Text eingegeben wird.
   *
   * Ohne diese Schranke wuerde ein `j` in der Suche als Sprungbefehl gelesen
   * und im Feld nie ankommen.
   *
   * @param {EventTarget|null} node
   * @returns {boolean}
   */
  function isTextEntry(node) {
    if (!(node instanceof Element)) return false;
    if (node.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);
  }

  /** Zieht den Fokus auf den ausgewaehlten Listeneintrag. */
  function focusSelectedRecord() {
    // Der Fokuswechsel rollt den Eintrag ins Bild und laesst ihn vorlesen --
    // beides waere sonst einzeln nachzubauen.
    dom.recordList.querySelector('[aria-current="true"]')?.focus();
  }

  /**
   * Waehlt den naechsten oder vorherigen Datensatz der Trefferliste.
   *
   * Ueber die Seitengrenze hinaus wird geblaettert: die Seiteneinteilung ist
   * eine Frage der Darstellung, und an ihrem Rand haengen zu bleiben waere
   * fuer die Anwenderin nicht zu erklaeren.
   *
   * @param {number} step
   */
  function moveSelection(step) {
    if (state.filtered.length === 0) return;

    const current = state.filtered.findIndex((record) => record.id === state.selectedId);
    const next = ns.stepIndex(current, step, state.filtered.length);
    if (next === current) {
      focusSelectedRecord();
      return;
    }

    state.selectedId = state.filtered[next].id;
    resetDetailView();
    // Erst rollen, dann zeichnen: der Eintrag muss im Fenster liegen, sonst
    // gibt es keinen Knopf, auf den der Fokus wandern koennte.
    scrollIntoView(next);
    render();
    focusSelectedRecord();
  }

  document.addEventListener('keydown', (event) => {
    // Der Info-Dialog ist modal und bringt seine eigene Bedienung mit.
    if (dom.aboutDialog.open) return;

    const target = event.target;
    const typing = isTextEntry(target);

    if (event.key === 'Escape') {
      // Die einzige Taste, die auch im Textfeld gilt: die Vollbild-Eingabe
      // liesse sich sonst nur mit der Maus wieder schliessen.
      if (!dom.entryMode.hidden) {
        event.preventDefault();
        closeEntryMode();
        return;
      }

      if (target === dom.search && dom.search.value.length > 0) {
        event.preventDefault();
        dom.search.value = '';
        updateQuery('');
        resetDetailView();
        applyFilters({ resetPage: true });
      }
      return;
    }

    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    // Vor dem ersten Import gibt es weder Suchfeld noch Liste zu bedienen.
    if (dom.app.hidden) return;

    if (event.key === '/') {
      // Ohne preventDefault stuende das Zeichen anschliessend im Feld.
      event.preventDefault();
      dom.search.focus();
      dom.search.select();
      return;
    }

    const step = LIST_STEPS[event.key];
    if (step === undefined) return;

    const inDetail = target instanceof Node && dom.detail.contains(target);
    if (ARROW_KEYS.includes(event.key) && inDetail) return;

    event.preventDefault();
    moveSelection(step);
  });

  // --- Info-Dialog ---------------------------------------------------------

  /**
   * Traegt die Programmversion in den Info-Dialog ein.
   *
   * Die Version steht im Meta-Tag `application-version`, geschrieben von
   * `npm run version:sync` aus `package.json`. Die Datei selbst zur Laufzeit
   * zu lesen ist keine Option: `fetch` verlangt einen HTTP-Ursprung, und der
   * Viewer soll sich per Doppelklick aus dem Dateisystem oeffnen lassen.
   *
   * Fehlt das Meta-Tag, bleibt die Zeile ohne Versionsangabe. Eine veraltete
   * oder erfundene Nummer waere schlechter als keine.
   */
  function showVersion() {
    const version = document
      .querySelector('meta[name="application-version"]')
      ?.getAttribute('content')
      ?.trim();

    dom.appVersion.textContent = version ? `Version ${version} · ` : '';
  }

  showVersion();

  dom.aboutButton.addEventListener('click', () => dom.aboutDialog.showModal());
  dom.aboutClose.addEventListener('click', () => dom.aboutDialog.close());

  dom.aboutDialog.addEventListener('click', (event) => {
    // Treffer auf dem Dialog selbst bedeutet: ausserhalb der Karte geklickt.
    if (event.target === dom.aboutDialog) dom.aboutDialog.close();
  });

  // Markierung fuer die Startpruefung in index.html. Sie steht am Ende der
  // Datei, damit sie nur gesetzt wird, wenn die Verdrahtung vollstaendig
  // durchlief.
  document.documentElement.dataset.appReady = 'true';
})((globalThis.EdifactExplorer ??= {}));
