/**
 * CSV-Ausgabe.
 *
 * Rein und DOM-frei: hier entsteht Text, kein Download. Das Herausgeben
 * uebernimmt app.js -- so bleibt die Erzeugung pruefbar, und der Unterschied
 * zwischen "die Datei ist falsch" und "der Browser laesst sie nicht heraus"
 * bleibt sichtbar.
 *
 * Zum Aufbau siehe den Kopfkommentar in edifact.js.
 *
 * Benoetigt: format.js (`valueMeaning`), segments.js (`dataElement`).
 */

(function (ns) {
  'use strict';

  /**
   * Trennzeichen der Ausgabe.
   *
   * Semikolon und nicht Komma: Excel liest im deutschen Gebietsschema die
   * Listentrennung als Semikolon, und eine Datei mit Komma landet dort
   * vollstaendig in der ersten Spalte.
   */
  const DELIMITER = ';';

  /**
   * Byte Order Mark.
   *
   * Ohne sie liest Excel eine UTF-8-Datei als Windows-1252, und aus
   * "Zählpunkt" wird "ZÃ¤hlpunkt". Der Rest der Welt uebergeht die Marke.
   */
  const BOM = '﻿';

  /** Zeilenende nach RFC 4180. Excel kommt mit beidem zurecht, Ordnung mit CRLF. */
  const NEWLINE = '\r\n';

  /** Zeichen, die eine Zelle in Anfuehrungszeichen zwingen. */
  const NEEDS_QUOTES = new RegExp(`["\\r\\n${DELIMITER}]`);

  /** Spalten der Trefferliste, in der Reihenfolge des Listeneintrags. */
  const RECORD_COLUMNS = Object.freeze([
    { title: 'Nachrichtenkennung', read: (record) => record.source.messageID || record.id },
    { title: 'Format', read: (record) => record.source.messageFormat },
    { title: 'Richtung', read: (record) => record.source.direction },
    { title: 'Verarbeitungsstatus', read: (record) => record.source.processingStatus },
    { title: 'Kommunikationspartner', read: (record) => record.source.communicationPartnerID },
    // Der Rohwert und nicht die formatierte Anzeige: ISO 8601 ist eindeutig,
    // sortierbar und wieder einlesbar. "05.09.2026, 10:15" ist keines davon.
    { title: 'Übertragung (ISO 8601)', read: (record) => record.source.transferTimestamp },
    { title: 'Enthaltene Nachrichten', read: (record) => record.derived.messageCount },
  ]);

  /** Spalten vor den Werten eines Segments. */
  const SEGMENT_COLUMNS = Object.freeze([
    'Nachricht',
    'Segment',
    'Segmentname',
    'Position',
    'Datenelement',
    'Bezeichnung',
    'Wert',
    'Klartext',
  ]);

  /** Mehrere Werte einer Kennung in einer Zelle. */
  const VALUE_SEPARATOR = ', ';

  /**
   * Maskiert eine Zelle nach RFC 4180.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    if (!NEEDS_QUOTES.test(text)) return text;

    // Innerhalb der Anfuehrungszeichen wird das Anfuehrungszeichen selbst
    // verdoppelt -- die einzige Maskierung, die das Format kennt.
    return `"${text.replaceAll('"', '""')}"`;
  }

  /**
   * Setzt Zeilen zu einer CSV-Datei zusammen.
   *
   * @param {unknown[][]} rows Erste Zeile ist die Kopfzeile.
   * @returns {string} Mit BOM, damit Excel UTF-8 erkennt.
   */
  function toCsv(rows) {
    return BOM + rows.map((row) => row.map(csvCell).join(DELIMITER)).join(NEWLINE) + NEWLINE;
  }

  /**
   * Sammelt die Bezeichnungen der fachlichen Kennungen als Spalten.
   *
   * Welche es gibt, haengt vom Bestand ab: eine Ladung ohne UTILMD hat keine
   * Spalte "Prüf-ID". Feste Spalten waeren entweder unvollstaendig oder
   * ueberwiegend leer.
   *
   * @param {object[]} records
   * @returns {string[]} In der Reihenfolge des ersten Auftretens.
   */
  function identifierColumns(records) {
    const labels = [];
    for (const record of records) {
      for (const identifier of record.derived.identifiers) {
        if (!labels.includes(identifier.label)) labels.push(identifier.label);
      }
    }
    return labels;
  }

  /**
   * Baut die CSV der Trefferliste.
   *
   * Ausgegeben wird, was die Liste zeigt -- also die gefilterte Menge und
   * nicht nur die sichtbare Seite. Eine Ausgabe, die still bei 250 Zeilen
   * endet, waere schlimmer als keine.
   *
   * @param {object[]} records Gefilterte Datensaetze.
   * @returns {string}
   */
  function recordListCsv(records) {
    const labels = identifierColumns(records);
    const header = [...RECORD_COLUMNS.map((column) => column.title), ...labels];

    const rows = records.map((record) => {
      const byLabel = new Map(
        record.derived.identifiers.map((identifier) => [
          identifier.label,
          identifier.values.join(VALUE_SEPARATOR),
        ]),
      );

      return [
        ...RECORD_COLUMNS.map((column) => column.read(record) ?? ''),
        ...labels.map((label) => byLabel.get(label) ?? ''),
      ];
    });

    return toCsv([header, ...rows]);
  }

  /**
   * Baut die Zeilen zu einem Segment: eine Zeile je Komponente.
   *
   * @param {object} segment
   * @param {number} messageNumber Nummer der Nachricht, ab 1.
   * @returns {unknown[][]}
   */
  function segmentRows(segment, messageNumber) {
    const label = ns.segmentLabel(segment.tag);

    return segment.components.flatMap((components, element) =>
      components.map((value, component) => {
        const definition = ns.dataElement(segment.tag, element, component);
        const position =
          components.length > 1 ? `${element + 1}.${component + 1}` : `${element + 1}`;
        const meaning = ns.valueMeaning(definition, value, components, component);

        return [
          messageNumber,
          segment.tag,
          label,
          position,
          definition?.code ?? '',
          definition?.name ?? '',
          value,
          meaning?.text ?? '',
        ];
      }),
    );
  }

  /**
   * Baut die CSV der Segmente einer Nachricht.
   *
   * Immer die ganze Nachricht, auch wenn die Anzeige gerade nach Segmenttyp
   * gefiltert ist -- wie bei den Kopierzielen daneben. Eine Ausgabe, die
   * stillschweigend weglaesst, was gerade ausgeblendet ist, faellt erst in
   * Excel auf, wenn niemand mehr weiss, warum.
   *
   * @param {object} message Eine Nachricht aus `derived.messages`.
   * @param {number} messageNumber Nummer der Nachricht, ab 1.
   * @returns {string}
   */
  function segmentCsv(message, messageNumber = 1) {
    const rows = message.segments.flatMap((segment) => segmentRows(segment, messageNumber));
    return toCsv([[...SEGMENT_COLUMNS], ...rows]);
  }

  /**
   * Ersetzt alles, was in einem Dateinamen Aerger macht.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function fileNamePart(value) {
    return String(value ?? '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /**
   * Baut den Dateinamen aus Bezug und Zeitpunkt.
   *
   * Der Zeitpunkt in Ortszeit und ohne Trennzeichen, damit die Dateien im
   * Ordner in ihrer Entstehungsreihenfolge stehen.
   *
   * @param {string} subject Woraus die Datei stammt.
   * @param {Date} [now]
   * @returns {string}
   */
  function exportFileName(subject, now = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const part = fileNamePart(subject);

    return `edifact-${part ? `${part}-` : ''}${stamp}.csv`;
  }

  ns.CSV_DELIMITER = DELIMITER;
  ns.csvCell = csvCell;
  ns.toCsv = toCsv;
  ns.recordListCsv = recordListCsv;
  ns.segmentCsv = segmentCsv;
  ns.exportFileName = exportFileName;
})((globalThis.EdifactExplorer ??= {}));
