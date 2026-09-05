/**
 * Datensatz-Modell.
 *
 * Trennt die eingelesenen Fremddaten (`source`) von allem, was daraus berechnet
 * wird (`derived`). Frueher lagen beide im selben Objekt, unterschieden nur
 * durch ein Unterstrich-Praefix.
 *
 * Rein und DOM-frei. Zum Aufbau siehe den Kopfkommentar in edifact.js.
 *
 * Benoetigt: edifact.js (`parseEdifact`), format.js (`parseTimestamp`). Der
 * Zugriff erfolgt erst zur Laufzeit ueber den Namensraum, die Ladereihenfolge
 * ist deshalb unerheblich.
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

  /** Millisekunden je Stunde. */
  const HOUR_MS = 3600000;

  /**
   * Schnellauswahl des Zeitraumfilters: eine Zeitspanne zurueck ab jetzt.
   *
   * Bewusst gleitende Fenster und keine Kalendertage: "letzte 24 Stunden"
   * heisst im Alltag die vergangenen 24 Stunden, nicht "seit gestern 0 Uhr".
   */
  const RANGE_PRESETS = Object.freeze({
    '24h': Object.freeze({ label: 'Letzte 24 Stunden', hours: 24 }),
    '7d': Object.freeze({ label: 'Letzte 7 Tage', hours: 24 * 7 }),
    '30d': Object.freeze({ label: 'Letzte 30 Tage', hours: 24 * 30 }),
  });

  /** Datum aus einem `<input type="date">`: immer YYYY-MM-DD. */
  const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

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
   * Kurzbezeichnungen fuer die Ortsangaben, die in der Trefferliste stehen.
   *
   * Bewusst knapp: die Liste hat wenig Platz, und "MaLo"/"MeLo" ist die
   * Sprache des Fachbereichs. Ein Qualifier, der hier fehlt, wird **nicht**
   * geraten -- sein Code steht dann selbst als Bezeichnung (`LOC Z18`). Diese
   * Zurueckhaltung ist dieselbe wie in codes.js: ein unbekannter Code ist
   * unbelegt, nicht ungueltig.
   */
  const LOCATION_LABELS = Object.freeze({
    172: 'Zählpunkt',
    Z16: 'MaLo',
    Z17: 'MeLo',
  });

  /** DE 1153: Referenz auf den Pruefidentifikator, in UTILMD. */
  const CHECK_ID_QUALIFIER = 'Z13';

  /**
   * Reihenfolge der Kennungen im Listeneintrag. Die Ortsangaben zuerst -- nach
   * ihnen wird gesucht, der Rest ordnet ein.
   */
  const IDENTIFIER_RANK = Object.freeze(['location', 'checkId', 'item', 'document', 'reference']);

  /**
   * Zieht die fachlichen Kennungen aus der Nutzlast.
   *
   * Sie stehen in den Segmenten, nicht im Umschlag: ohne sie muesste man
   * vierzig Datensaetze einzeln oeffnen, um den richtigen zu finden.
   *
   * Erfunden wird nichts. Gelesen werden nur Stellen, an denen die Norm eine
   * Kennung vorsieht: LOC (Ortsangabe), LIN (Positionsnummer im dritten
   * Datenelement -- `LIN+1` allein ist eine Zaehlung, keine Kennung), BGM
   * (Dokumentennummer) und RFF (Referenz). Fehlt eine Stelle, fehlt der
   * Eintrag.
   *
   * @param {object[]} messages Ergebnis von parseEdifact.
   * @param {string} messageId Kennung, die der Listeneintrag ohnehin zeigt.
   * @returns {{kind: string, label: string, values: string[]}[]} Sortiert,
   *   ohne Doppel, ohne Leerwerte.
   */
  function readIdentifiers(messages, messageId) {
    /** @type {Map<string, {kind: string, label: string, values: Set<string>}>} */
    const groups = new Map();

    const add = (kind, key, label, value) => {
      const text = typeof value === 'string' ? value.trim() : '';
      if (text.length === 0) return;

      const group = groups.get(key) ?? { kind, label, values: new Set() };
      group.values.add(text);
      groups.set(key, group);
    };

    for (const message of messages) {
      for (const segment of message.segments) {
        const [first, second, third] = segment.components;

        if (segment.tag === 'LOC') {
          const qualifier = first?.[0] ?? '';
          add(
            'location',
            `location:${qualifier}`,
            LOCATION_LABELS[qualifier] ?? `LOC ${qualifier}`.trim(),
            second?.[0],
          );
        } else if (segment.tag === 'LIN') {
          add('item', 'item', 'Position', third?.[0]);
        } else if (segment.tag === 'BGM') {
          // Meist die Nachrichtenkennung selbst -- die steht schon in der
          // Kopfzeile des Eintrags und muss nicht doppelt erscheinen.
          const document = second?.[0] ?? '';
          if (document !== messageId) add('document', 'document', 'Vorgang', document);
        } else if (segment.tag === 'RFF') {
          const [qualifier, value] = first ?? [];
          // Der Pruefidentifikator ist eine UTILMD-Eigenheit. Dieselbe
          // Referenz in einem anderen Format so zu benennen waere geraten.
          if (qualifier === CHECK_ID_QUALIFIER && message.type === 'UTILMD') {
            add('checkId', 'checkId', 'Prüf-ID', value);
          } else {
            add('reference', 'reference', 'Referenz', value);
          }
        }
      }
    }

    return [...groups.values()]
      .map((group) => ({ kind: group.kind, label: group.label, values: [...group.values] }))
      .sort(
        (a, b) =>
          IDENTIFIER_RANK.indexOf(a.kind) - IDENTIFIER_RANK.indexOf(b.kind) ||
          a.label.localeCompare(b.label, 'de-DE'),
      );
  }

  /**
   * Wandelt ein Eingabedatum in einen Zeitpunkt der Ortszeit.
   *
   * Ortszeit ist hier die richtige Wahl: die Anwenderin gibt den Tag ein, den
   * sie auf ihrer Uhr sieht, und die Liste zeigt die Zeitstempel ebenfalls in
   * Ortszeit. `new Date('2026-08-01')` waere dagegen UTC-Mitternacht und
   * wuerde die Grenze je nach Zeitzone um Stunden verschieben.
   *
   * @param {unknown} value Datum als YYYY-MM-DD.
   * @param {boolean} endOfDay `true` liefert das Ende des Tages (einschliessend).
   * @returns {number|null} `null`, wenn kein Datum angegeben ist.
   */
  function dayBoundary(value, endOfDay) {
    const found = DATE_INPUT.exec(String(value ?? '').trim());
    if (!found) return null;

    const [, year, month, day] = found.map(Number);
    const date = endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);

    // Ein Eingabefeld liefert nur gueltige Daten, eine geladene Einstellung
    // koennte den 31.02. enthalten.
    if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1) return null;
    return date.getTime();
  }

  /**
   * Loest die Zeitraum-Auswahl in eine Zeitspanne auf.
   *
   * Die Schnellauswahl hat Vorrang vor den freien Datumsfeldern; die
   * Oberflaeche haelt beides auseinander, indem sie das jeweils andere leert.
   * Beide Grenzen sind einschliessend.
   *
   * @param {{preset?: string, from?: string, to?: string}} [range]
   * @param {number} [now] Bezugspunkt der Schnellauswahl.
   * @returns {{start: number, end: number}|null} `null` = kein Zeitraum gesetzt.
   *   `start > end` ist moeglich (Bis vor Von) und bleibt hier stehen, damit
   *   die Oberflaeche darauf hinweisen kann, statt es stillschweigend zu
   *   vertauschen.
   */
  function resolveRange(range = {}, now = Date.now()) {
    const preset = RANGE_PRESETS[range.preset];
    if (preset) return { start: now - preset.hours * HOUR_MS, end: now };

    const start = dayBoundary(range.from, false);
    const end = dayBoundary(range.to, true);
    if (start === null && end === null) return null;

    return {
      start: start ?? Number.NEGATIVE_INFINITY,
      end: end ?? Number.POSITIVE_INFINITY,
    };
  }

  /**
   * Zaehlt die Datensaetze ohne lesbaren Zeitstempel.
   *
   * Sie koennen keinem Zeitraum zugeordnet werden und fallen deshalb aus jeder
   * Zeitraum-Auswahl heraus. Damit das nicht wie ein verschwundener Datensatz
   * aussieht, weist die Oberflaeche die Anzahl aus.
   *
   * @param {Record[]} records
   * @returns {number}
   */
  function countUndatedRecords(records) {
    return records.filter((record) => record.derived.timestamp === null).length;
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
    const messageId = typeof source.messageID === 'string' ? source.messageID.trim() : '';

    return {
      id: typeof source.ID === 'string' && source.ID.length > 0 ? source.ID : fallbackId,
      source,
      derived: {
        payload,
        messages,
        // Einmal gelesen: der Zeitraumfilter laeuft sonst je Tastendruck ueber
        // jeden Datensatz und parst denselben String erneut.
        timestamp: ns.parseTimestamp(source.transferTimestamp),
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
        // Einmal beim Aufbau, nicht bei jedem Zeichnen der Liste.
        identifiers: readIdentifiers(messages, messageId),
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
   * @property {{preset?: string, from?: string, to?: string}} [range]
   */

  /**
   * Filtert Datensaetze. Alle Kriterien sind Und-verknuepft, leere Kriterien
   * werden ignoriert.
   *
   * Ein gesetzter Zeitraum blendet Datensaetze ohne lesbaren Zeitstempel aus:
   * sie liegen weder innerhalb noch ausserhalb der Spanne, und sie mitzuzeigen
   * hiesse, einen Filter zu setzen und trotzdem Undatiertes zu bekommen. Wie
   * viele es sind, weist `countUndatedRecords` aus.
   *
   * @param {Record[]} records
   * @param {FilterCriteria} criteria
   * @returns {Record[]}
   */
  function filterRecords(records, criteria = {}) {
    // Einmal je Filtervorgang, nicht je Datensatz.
    const { text, terms } = parseQuery(criteria.query);
    const needle = text.toLowerCase();
    const range = resolveRange(criteria.range);
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
      if (range) {
        const { timestamp } = derived;
        if (timestamp === null || timestamp < range.start || timestamp > range.end) return false;
      }
      if (messageFormat && source.messageFormat !== messageFormat) return false;
      if (direction && source.direction !== direction) return false;
      if (processingStatus && source.processingStatus !== processingStatus) return false;
      if (messageCategory && source.messageCategory !== messageCategory) return false;
      return true;
    });
  }

  /**
   * Bestimmt den Ausschnitt der Liste, der gezeichnet werden muss.
   *
   * Gezeichnet wird nur das Sichtfenster: bei 50.000 Datensaetzen legte der
   * Browser sonst hunderttausende Knoten an und haelt sie im Layout. Die
   * Gesamthoehe bleibt trotzdem echt, damit der Rollbalken die wahre Laenge
   * der Liste zeigt.
   *
   * Ueber und unter dem Fenster wird ein Streifen mitgezeichnet: ohne ihn
   * waere beim Rollen der Rand fuer einen Moment leer.
   *
   * @param {object} options
   * @param {number} [options.scrollTop]
   * @param {number} [options.viewportHeight] Sichthoehe des Rollbereichs.
   * @param {number} options.rowHeight  Feste Hoehe einer Zeile.
   * @param {number} options.total      Anzahl gefilterter Datensaetze.
   * @param {number} [options.overscan] Zeilen ueber und unter dem Fenster.
   * @returns {{start: number, end: number, offsetTop: number, totalHeight: number}}
   *   `end` ist ausschliessend.
   */
  function visibleRange({ scrollTop = 0, viewportHeight = 0, rowHeight, total, overscan = 6 }) {
    if (!(rowHeight > 0) || !(total > 0)) {
      return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
    }

    const first = Math.min(Math.floor(Math.max(0, scrollTop) / rowHeight), total - 1);
    const visible = Math.ceil(Math.max(0, viewportHeight) / rowHeight);
    const start = Math.max(0, first - overscan);

    return {
      start,
      end: Math.min(total, first + visible + overscan + 1),
      offsetTop: start * rowHeight,
      totalHeight: total * rowHeight,
    };
  }

  /**
   * Bestimmt den Zielindex eines Tastenschritts in der Trefferliste.
   *
   * An den Enden wird nicht umgebrochen: aus "eine weiter" wuerde sonst
   * unversehens ein Sprung ans andere Ende der Liste. Ohne Auswahl beginnt
   * die Bewegung am Anfang.
   *
   * @param {number} current Aktueller Index, `-1` wenn nichts ausgewaehlt ist.
   * @param {number} step
   * @param {number} total
   * @returns {number} Zielindex, `-1` bei leerer Liste.
   */
  function stepIndex(current, step, total) {
    if (total <= 0) return -1;
    if (current < 0) return 0;
    return Math.min(Math.max(current + step, 0), total - 1);
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
  ns.RANGE_PRESETS = RANGE_PRESETS;
  ns.resolveRange = resolveRange;
  ns.countUndatedRecords = countUndatedRecords;
  ns.readIdentifiers = readIdentifiers;
  ns.filterRecords = filterRecords;
  ns.visibleRange = visibleRange;
  ns.stepIndex = stepIndex;
})((globalThis.EdifactExplorer ??= {}));
