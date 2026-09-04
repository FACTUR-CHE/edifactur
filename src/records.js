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
   * Felder der feldbezogenen Suche.
   *
   * Der Volltextindex findet eine 33-stellige Zaehlpunktbezeichnung, laesst
   * sich aber nicht sagen, **wo** sie stehen soll: `9900000000001` trifft
   * Absender, Empfaenger und jedes NAD gleichermassen.
   *
   * `meta` sucht in Metadatenfeldern, `segment` in den Werten eines
   * Segmenttyps, `tags` in der Liste der vorkommenden Segment-Tags. Ein neues
   * Feld braucht genau einen Eintrag hier.
   */
  const SEARCH_FIELDS = Object.freeze({
    format: { label: 'Nachrichtenformat', meta: ['messageFormat'] },
    partner: { label: 'Marktpartner', meta: ['communicationPartnerID', 'ownPartnerID'] },
    msgid: { label: 'Nachrichtenkennung', meta: ['messageID', 'ID'] },
    seg: { label: 'Segment', tags: true },
    loc: { label: 'LOC-Segment', segment: 'LOC' },
    nad: { label: 'NAD-Segment', segment: 'NAD' },
    rff: { label: 'RFF-Segment', segment: 'RFF' },
    dtm: { label: 'DTM-Segment', segment: 'DTM' },
  });

  /** Segmenttypen, fuer die ein eigener Index gebaut wird. */
  const INDEXED_SEGMENTS = Object.freeze(
    Object.values(SEARCH_FIELDS)
      .map((field) => field.segment)
      .filter(Boolean),
  );

  /**
   * Ein Praefix-Versuch: zwei bis zehn Buchstaben, dann ein Doppelpunkt.
   *
   * Die Buchstabenschranke ist wesentlich. Ohne sie waere in
   * `2026-08-01T08:15` das `08` ein Praefix, und jede Uhrzeit und jedes
   * EDIFACT-Element mit Komponententrenner wuerde als Feldsuche gelesen.
   */
  const PREFIX = /^([a-zA-Z]{2,10}):(.*)$/;

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
   * Baut die Indizes fuer die feldbezogene Suche.
   *
   * Nur die in SEARCH_FIELDS genannten Segmenttypen bekommen einen eigenen
   * Wertindex. Alles zu indizieren wuerde die Nutzlast ein zweites Mal im
   * Speicher halten; die Tag-Liste dagegen ist klein und deckt `seg:` ab.
   *
   * @param {object[]} messages Ergebnis von parseEdifact.
   * @returns {{tags: string, values: object}} Alles kleingeschrieben.
   */
  function buildSegmentIndex(messages) {
    const tags = new Set();
    const values = {};
    for (const tag of INDEXED_SEGMENTS) values[tag] = [];

    for (const message of messages) {
      for (const segment of message.segments) {
        tags.add(segment.tag);
        if (values[segment.tag]) values[segment.tag].push(segment.elements.join(' '));
      }
    }

    return {
      tags: [...tags].join(' ').toLowerCase(),
      values: Object.fromEntries(
        Object.entries(values).map(([tag, parts]) => [tag, parts.join(' ').toLowerCase()]),
      ),
    };
  }

  /**
   * Zerlegt eine Sucheingabe in Feldbedingungen und freien Text.
   *
   * @param {unknown} query
   * @returns {{text: string, terms: object[], unknown: string[]}}
   *   `terms` sind die erkannten Bedingungen, `unknown` die versuchten
   *   Praefixe, die es nicht gibt. Sie werden **nicht** stillschweigend als
   *   Volltext gesucht -- ein Tippfehler wuerde sonst zu einem Ergebnis
   *   fuehren, das wie eine Antwort aussieht.
   */
  function parseQuery(query) {
    const text = [];
    const terms = [];
    const unknown = [];

    // Anfuehrungszeichen halten einen Wert mit Leerzeichen zusammen:
    // nad:"Demolieferant GmbH".
    const tokens = String(query ?? '').match(/[^\s"]*"[^"]*"?[^\s"]*|[^\s]+/g) ?? [];

    for (const token of tokens) {
      const found = PREFIX.exec(token);
      if (!found) {
        text.push(token.replaceAll('"', ''));
        continue;
      }

      const [, prefix, rest] = found;
      const key = prefix.toLowerCase();
      const value = rest.replaceAll('"', '').trim();

      if (!Object.prototype.hasOwnProperty.call(SEARCH_FIELDS, key)) {
        unknown.push(prefix);
        continue;
      }

      // `loc:` ohne Wert ist keine Bedingung, sondern eine halbe Eingabe.
      if (value.length > 0) terms.push({ field: key, value });
    }

    return { text: text.join(' ').trim(), terms, unknown };
  }

  /**
   * Sammelt die Begriffe, die hervorgehoben werden sollen.
   *
   * @param {unknown} query
   * @returns {string[]}
   */
  function highlightTerms(query) {
    const parsed = parseQuery(query);
    return [parsed.text, ...parsed.terms.map((term) => term.value)].filter(Boolean);
  }

  /**
   * Prueft eine einzelne Feldbedingung gegen einen Datensatz.
   *
   * @param {Record} record
   * @param {{field: string, value: string}} term
   * @returns {boolean}
   */
  function matchesTerm(record, term) {
    const field = SEARCH_FIELDS[term.field];
    const needle = term.value.toLowerCase();

    if (field.meta) {
      return field.meta.some((name) => {
        const value = record.source[name] ?? (name === 'ID' ? record.id : '');
        return String(value).toLowerCase().includes(needle);
      });
    }

    if (field.tags) return record.derived.segmentIndex.tags.includes(needle);

    return (record.derived.segmentIndex.values[field.segment] ?? '').includes(needle);
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
        // Zum Wiederzusammensetzen einzelner Nachrichten gebraucht: der
        // Segmenttrenner steht nur im UNA-Header der Nutzlast.
        delimiters: ns.readDelimiters(payload),
        // Nur Gruppen mit UNH-Kopf sind fachliche Nachrichten. Huellsegmente
        // (UNB, UNZ) bilden eigene Gruppen und werden hier nicht mitgezaehlt.
        messageCount: messages.filter((message) =>
          message.segments.some((segment) => segment.tag === 'UNH'),
        ).length,
        // Einmalig beim Aufbau des Datensatzes, nicht bei jedem Zeichnen.
        // Gilt fuer geladene und fuer eingeklebte Nachrichten gleichermassen,
        // weil createRecordFromEdifact ueber diese Funktion laeuft.
        interchange: ns.readInterchangeHeader(messages),
        acknowledgements: messages.map(ns.readAcknowledgement).filter(Boolean),
        findings: ns.collectFindings(messages),
        segmentIndex: buildSegmentIndex(messages),
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
      record.id = uniqueRecordId(record.id, used);
      return record;
    });
  }

  /**
   * Macht eine Kennung gegen bereits verwendete IDs eindeutig.
   *
   * @param {string} candidate
   * @param {Set<string>} used
   * @returns {string}
   */
  function uniqueRecordId(candidate, used) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }

    let suffix = 2;
    let next = `${candidate} (${suffix})`;
    while (used.has(next)) {
      suffix += 1;
      next = `${candidate} (${suffix})`;
    }
    used.add(next);
    return next;
  }

  /**
   * Baut aus einer rohen EDIFACT-Nachricht einen Datensatz im Viewer-Format.
   *
   * @param {string} payload
   * @param {string} fallbackId
   * @returns {Record}
   */
  function createRecordFromEdifact(payload, fallbackId) {
    const messages = ns.parseEdifact(payload);
    const businessMessage = messages.find((message) =>
      message.segments.some((segment) => segment.tag === 'UNH'),
    );
    const segments = businessMessage?.segments ?? messages[0]?.segments ?? [];
    const unh = segments.find((segment) => segment.tag === 'UNH');
    const bgm = segments.find((segment) => segment.tag === 'BGM');
    const messageType = businessMessage?.type;
    const messageId = unh?.elements[0] || fallbackId;
    const messageCategory = bgm?.elements[0]?.split(':')[0] ?? '';

    return normalizeRecord(
      {
        ID: fallbackId,
        messageID: messageId,
        messageFormat:
          typeof messageType === 'string' && messageType !== ns.UNKNOWN_MESSAGE_TYPE
            ? messageType
            : '',
        messageCategory,
        payload: { payload },
      },
      fallbackId,
    );
  }

  /**
   * Liest ein Metadatenfeld als nicht leere Zeichenkette.
   *
   * @param {Record} record
   * @param {string} field
   * @returns {string} Leer, wenn das Feld fehlt oder kein String ist.
   */
  function metaField(record, field) {
    const value = record.source[field];
    return typeof value === 'string' ? value.trim() : '';
  }

  /**
   * Verknuepft Datensaetze ueber `referenceMessageID` mit `messageID`.
   *
   * Ein APERAK oder CONTRL wird fast immer nur geoeffnet, um die abgelehnte
   * Ursprungsnachricht zu finden. Der Index macht daraus einen Klick, in
   * beide Richtungen.
   *
   * Ist eine `messageID` doppelt vergeben, gewinnt der erste Datensatz. Eine
   * Referenz kann nicht mehrdeutig aufgeloest werden, und eine willkuerliche
   * Auswahl waere schlechter als eine feste.
   *
   * @param {Record[]} records
   * @returns {{targets: Map<string, string>, sources: Map<string, string[]>}}
   *   `targets`: Datensatz -> referenzierter Datensatz.
   *   `sources`: Datensatz -> Datensaetze, die auf ihn verweisen.
   */
  function buildReferenceIndex(records) {
    const byMessageId = new Map();
    for (const record of records) {
      const messageId = metaField(record, 'messageID');
      if (messageId && !byMessageId.has(messageId)) byMessageId.set(messageId, record.id);
    }

    const targets = new Map();
    const sources = new Map();

    for (const record of records) {
      const reference = metaField(record, 'referenceMessageID');
      if (!reference) continue;

      const targetId = byMessageId.get(reference);
      // Ein Selbstverweis ergibt keinen Sprung und keine Rueckrichtung.
      if (!targetId || targetId === record.id) continue;

      targets.set(record.id, targetId);
      sources.set(targetId, [...(sources.get(targetId) ?? []), record.id]);
    }

    return { targets, sources };
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
    // Einmal je Filtervorgang, nicht je Datensatz.
    const { text, terms } = parseQuery(criteria.query);
    const needle = text.toLowerCase();
    const {
      messageFormat = '',
      direction = '',
      processingStatus = '',
      messageCategory = '',
    } = criteria;

    return records.filter((record) => {
      const { source, derived } = record;
      if (needle.length > 0 && !derived.searchIndex.includes(needle)) return false;
      // Bedingungen werden mit Und verknuepft.
      for (const term of terms) if (!matchesTerm(record, term)) return false;
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
  ns.uniqueRecordId = uniqueRecordId;
  ns.createRecordFromEdifact = createRecordFromEdifact;
  ns.SEARCH_FIELDS = SEARCH_FIELDS;
  ns.parseQuery = parseQuery;
  ns.highlightTerms = highlightTerms;
  ns.buildReferenceIndex = buildReferenceIndex;
  ns.extractOptionValues = extractOptionValues;
  ns.filterRecords = filterRecords;
  ns.clampPage = clampPage;
  ns.pageCount = pageCount;
})((globalThis.EdifactExplorer ??= {}));
