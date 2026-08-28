/**
 * Datensatz-Modell.
 *
 * Trennt die eingelesenen Fremddaten (`source`) von allem, was daraus berechnet
 * wird (`derived`). Frueher lagen beide im selben Objekt, unterschieden nur
 * durch ein Unterstrich-Praefix.
 *
 * Rein und DOM-frei. Zum Aufbau siehe den Kopfkommentar in edifact.js.
 *
 * Benoetigt: edifact.js (`parseEdifact`). Der Zugriff erfolgt erst zur
 * Laufzeit ueber den Namensraum, die Ladereihenfolge ist deshalb unerheblich.
 */

(function (ns) {
  'use strict';

  /** Felder, die in den Volltextindex eines Datensatzes eingehen. */
  const INDEXED_FIELDS = Object.freeze([
    'ID',
    'messageID',
    'referenceMessageID',
    'communicationPartnerID',
    'ownPartnerID',
    'businessStatus',
    'direction',
    'messageCategory',
    'messageFormat',
    'processingStatus',
    'transferTimestamp',
  ]);

  /**
   * @typedef {object} Record
   * @property {string} id      Stabile, eindeutige Kennung innerhalb der Ladung.
   * @property {object} source  Unveraenderter Datensatz aus der Datei.
   * @property {object} derived Berechnete Daten (Nutzlast, Nachrichten, Index).
   */

  /**
   * Prueft, ob `value` ein einfaches Objekt ist -- also ein Kandidat fuer einen
   * Datensatz und nicht null oder ein Array.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  function isPlainRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * @param {object} source
   * @param {string} payload
   * @returns {string} Kleingeschriebener Volltextindex.
   */
  function buildSearchIndex(source, payload) {
    const metadata = INDEXED_FIELDS.map((field) => source[field])
      .filter((value) => typeof value === 'string' || typeof value === 'number')
      .join(' ');
    return `${metadata} ${payload}`.toLowerCase();
  }

  /**
   * Baut einen Datensatz aus einem Rohobjekt.
   *
   * @param {object} source
   * @param {string} fallbackId Kennung, falls `source.ID` fehlt oder leer ist.
   * @returns {Record}
   */
  function normalizeRecord(source, fallbackId) {
    const raw = source.payload?.payload;
    const payload = typeof raw === 'string' ? raw : '';
    const messages = ns.parseEdifact(payload);

    return {
      id: typeof source.ID === 'string' && source.ID.length > 0 ? source.ID : fallbackId,
      source,
      derived: {
        payload,
        messages,
        // Nur Gruppen mit UNH-Kopf sind fachliche Nachrichten. Huellsegmente
        // (UNB, UNZ) bilden eigene Gruppen und werden hier nicht mitgezaehlt.
        messageCount: messages.filter((message) =>
          message.segments.some((segment) => segment.tag === 'UNH'),
        ).length,
        searchIndex: buildSearchIndex(source, payload),
      },
    };
  }

  /**
   * Baut alle Datensaetze und stellt eindeutige Kennungen sicher. Doppelte oder
   * fehlende `ID`-Werte wuerden sonst dazu fuehren, dass die Auswahl in der
   * Liste auf den falschen Datensatz zeigt.
   *
   * @param {object[]} list
   * @returns {Record[]}
   */
  function normalizeRecords(list) {
    const used = new Set();

    return list.map((source, index) => {
      const record = normalizeRecord(source, `datensatz-${index + 1}`);
      if (used.has(record.id)) record.id = `${record.id} (${index + 1})`;
      used.add(record.id);
      return record;
    });
  }

  /**
   * Sammelt die vorkommenden Werte eines Metadatenfeldes fuer die Filterlisten.
   *
   * @param {Record[]} records
   * @param {string} field
   * @returns {string[]} Sortiert, ohne Duplikate und ohne Leerwerte.
   */
  function extractOptionValues(records, field) {
    const values = new Set();
    for (const record of records) {
      const value = record.source[field];
      if (typeof value === 'string' && value.length > 0) values.add(value);
    }
    return [...values].sort((a, b) => a.localeCompare(b, 'de-DE'));
  }

  /**
   * @typedef {object} FilterCriteria
   * @property {string} [query]
   * @property {string} [messageFormat]
   * @property {string} [direction]
   * @property {string} [processingStatus]
   * @property {string} [messageCategory]
   */

  /**
   * Filtert Datensaetze. Alle Kriterien sind Und-verknuepft, leere Kriterien
   * werden ignoriert.
   *
   * @param {Record[]} records
   * @param {FilterCriteria} criteria
   * @returns {Record[]}
   */
  function filterRecords(records, criteria = {}) {
    const needle = String(criteria.query ?? '')
      .trim()
      .toLowerCase();
    const {
      messageFormat = '',
      direction = '',
      processingStatus = '',
      messageCategory = '',
    } = criteria;

    return records.filter(({ source, derived }) => {
      if (needle.length > 0 && !derived.searchIndex.includes(needle)) return false;
      if (messageFormat && source.messageFormat !== messageFormat) return false;
      if (direction && source.direction !== direction) return false;
      if (processingStatus && source.processingStatus !== processingStatus) return false;
      if (messageCategory && source.messageCategory !== messageCategory) return false;
      return true;
    });
  }

  /**
   * Begrenzt eine Seitenzahl auf den gueltigen Bereich. Haelt die Invariante
   * "0 <= page < pageCount" an einer Stelle fest, statt sie auf Aufrufer und
   * disabled-Attribute zu verteilen.
   *
   * @param {number} page
   * @param {number} total Anzahl gefilterter Datensaetze.
   * @param {number} pageSize
   * @returns {number}
   */
  function clampPage(page, total, pageSize) {
    const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    return Math.min(Math.max(0, page), lastPage);
  }

  /**
   * @param {number} total
   * @param {number} pageSize
   * @returns {number} Immer mindestens 1.
   */
  function pageCount(total, pageSize) {
    return Math.max(1, Math.ceil(total / pageSize));
  }

  ns.isPlainRecord = isPlainRecord;
  ns.normalizeRecord = normalizeRecord;
  ns.normalizeRecords = normalizeRecords;
  ns.extractOptionValues = extractOptionValues;
  ns.filterRecords = filterRecords;
  ns.clampPage = clampPage;
  ns.pageCount = pageCount;
})((globalThis.EdifactExplorer ??= {}));
