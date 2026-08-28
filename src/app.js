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

  /** Datensaetze pro Seite. */
  const PAGE_SIZE = 250;

  /** Wartezeit, bevor eine Eingabe im Suchfeld einen Neuaufbau ausloest. */
  const SEARCH_DEBOUNCE_MS = 150;

  /** Zuordnung von Filter-Select zu gefiltertem Metadatenfeld. */
  const FILTERS = Object.freeze([
    { id: 'formatFilter', field: 'messageFormat' },
    { id: 'directionFilter', field: 'direction' },
    { id: 'statusFilter', field: 'processingStatus' },
    { id: 'categoryFilter', field: 'messageCategory' },
  ]);

  /** Tastenschritte innerhalb einer Tab-Leiste. */
  const ARROW_STEPS = Object.freeze({
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  });

  const ELEMENT_IDS = Object.freeze([
    'fileButton',
    'fileInput',
    'fileName',
    'notice',
    'upload',
    'app',
    'resultInfo',
    'clearFilters',
    'search',
    'recordList',
    'detail',
    'aboutButton',
    'aboutDialog',
    'aboutClose',
    ...FILTERS.map((filter) => filter.id),
  ]);

  /**
   * Einmalig aufgeloeste Knoten. Frueher wurde `getElementById` innerhalb der
   * Filterbedingung aufgerufen, also einmal je Datensatz und Tastendruck.
   */
  const dom = Object.fromEntries(ELEMENT_IDS.map((id) => [id, document.getElementById(id)]));

  const state = {
    records: [],
    filtered: [],
    /** @type {string|null} */
    selectedId: null,
    query: '',
    /** @type {'structured'|'raw'} */
    activeTab: 'structured',
    activeMessage: 0,
    page: 0,
  };

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
  function showNotice(message, variant) {
    dom.notice.textContent = message;
    dom.notice.dataset.variant = variant;
    dom.notice.hidden = false;
  }

  function hideNotice() {
    dom.notice.hidden = true;
    dom.notice.textContent = '';
  }

  /**
   * Liest die aktuellen Filterwerte -- einmal pro Filtervorgang, nicht pro
   * Datensatz.
   *
   * @returns {object}
   */
  function readCriteria() {
    const criteria = { query: state.query };
    for (const { id, field } of FILTERS) criteria[field] = dom[id].value;
    return criteria;
  }

  /** @returns {object|null} */
  function selectedRecord() {
    return state.filtered.find((record) => record.id === state.selectedId) ?? null;
  }

  function renderDetailPane() {
    ns.renderDetail(dom.detail, {
      record: selectedRecord(),
      query: state.query,
      activeTab: state.activeTab,
      activeMessage: state.activeMessage,
    });
  }

  function render() {
    ns.renderResultInfo(dom.resultInfo, {
      filtered: state.filtered.length,
      total: state.records.length,
      page: state.page,
      pageSize: PAGE_SIZE,
    });
    ns.renderList(dom.recordList, {
      records: state.filtered,
      selectedId: state.selectedId,
      query: state.query,
      page: state.page,
      pageSize: PAGE_SIZE,
    });
    renderDetailPane();
  }

  /**
   * Filtert neu und zeichnet die Oberflaeche.
   *
   * @param {{resetPage?: boolean}} [options]
   */
  function applyFilters({ resetPage = false } = {}) {
    if (resetPage) state.page = 0;

    state.filtered = ns.filterRecords(state.records, readCriteria());
    state.page = ns.clampPage(state.page, state.filtered.length, PAGE_SIZE);

    if (!state.filtered.some((record) => record.id === state.selectedId)) {
      state.selectedId = state.filtered[0]?.id ?? null;
      state.activeMessage = 0;
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
    state.query = '';
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

    state.records = ns.normalizeRecords(valid);
    state.selectedId = state.records[0].id;
    state.activeTab = 'structured';
    state.activeMessage = 0;
    state.page = 0;

    resetControls();
    fillFilterOptions();

    dom.fileName.textContent = fileName;
    dom.upload.hidden = true;
    dom.app.hidden = false;

    applyFilters();
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

  // --- Suche und Filter ----------------------------------------------------

  dom.search.addEventListener(
    'input',
    debounce(() => {
      state.query = dom.search.value;
      state.activeMessage = 0;
      applyFilters({ resetPage: true });
    }, SEARCH_DEBOUNCE_MS),
  );

  for (const { id } of FILTERS) {
    dom[id].addEventListener('change', () => {
      state.activeMessage = 0;
      applyFilters({ resetPage: true });
    });
  }

  dom.clearFilters.addEventListener('click', () => {
    resetControls();
    state.activeMessage = 0;
    applyFilters({ resetPage: true });
    dom.search.focus();
  });

  // --- Liste und Seitennavigation -----------------------------------------

  dom.recordList.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const pageButton = target.closest('[data-page]');
    if (pageButton) {
      state.page += pageButton.dataset.page === 'next' ? 1 : -1;
      applyFilters();
      return;
    }

    const record = target.closest('[data-id]');
    if (record) {
      state.selectedId = record.dataset.id;
      state.activeMessage = 0;
      render();
    }
  });

  // --- Detailbereich -------------------------------------------------------

  dom.detail.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const viewTab = target.closest('[data-tab]');
    if (viewTab) {
      state.activeTab = viewTab.dataset.tab === 'raw' ? 'raw' : 'structured';
      renderDetailPane();
      return;
    }

    const messageTab = target.closest('[data-message]');
    if (messageTab) {
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

  // --- Info-Dialog ---------------------------------------------------------

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
