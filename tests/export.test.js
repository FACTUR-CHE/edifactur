import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';
import '../src/segments.js';
import '../src/codes.js';
import '../src/format.js';
import '../src/records.js';
import '../src/export.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const { csvCell, exportFileName, normalizeRecords, recordListCsv, segmentCsv, toCsv } =
  globalThis.EdifactExplorer;

const BOM = '﻿';

/** @returns {string[]} Zeilen ohne BOM und ohne Abschlusszeile. */
const lines = (csv) => csv.slice(BOM.length).trimEnd().split('\r\n');

/** @returns {object[]} Datensaetze aus Nutzlasten. */
const records = (entries) =>
  normalizeRecords(
    entries.map((entry, index) => ({
      ID: `demo-${index + 1}`,
      messageID: `DEMO-${index + 1}`,
      direction: 'Inbound',
      messageFormat: 'UTILMD',
      processingStatus: 'Completed',
      communicationPartnerID: '9900000000001',
      transferTimestamp: '2026-08-01T08:15:00Z',
      ...entry,
    })),
  );

describe('csvCell', () => {
  it('laesst einen harmlosen Wert unangetastet', () => {
    assert.equal(csvCell('DEMO-1'), 'DEMO-1');
    assert.equal(csvCell(42), '42');
  });

  it('setzt leere Werte als leere Zelle', () => {
    assert.equal(csvCell(''), '');
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
  });

  it('maskiert Trennzeichen, Anfuehrungszeichen und Zeilenumbrueche', () => {
    assert.equal(csvCell('a;b'), '"a;b"');
    assert.equal(csvCell('a"b'), '"a""b"');
    assert.equal(csvCell('a\nb'), '"a\nb"');
    assert.equal(csvCell('a\r\nb'), '"a\r\nb"');
  });

  it('laesst das Komma stehen, weil das Trennzeichen das Semikolon ist', () => {
    // Ein Wert mit Komma ist in einer Semikolon-Datei unkritisch; ihn zu
    // maskieren waere nicht falsch, aber Rauschen.
    assert.equal(csvCell('1,5'), '1,5');
  });

  it('maskiert einen Wert, der wie eine Formel aussieht, nicht anders', () => {
    // Bewusst: der Rohwert bleibt der Rohwert. Wer ihn veraendert, faelscht
    // den Export.
    assert.equal(csvCell('=1+1'), '=1+1');
  });
});

describe('toCsv', () => {
  it('schreibt BOM, Semikolon und CRLF', () => {
    const csv = toCsv([
      ['a', 'b'],
      [1, 2],
    ]);

    assert.ok(csv.startsWith(BOM), 'BOM fehlt — Excel liest sonst Windows-1252');
    assert.equal(csv.slice(BOM.length), 'a;b\r\n1;2\r\n');
  });

  it('schliesst die Datei mit einem Zeilenende ab', () => {
    assert.ok(toCsv([['a']]).endsWith('\r\n'));
  });
});

describe('recordListCsv', () => {
  const csv = recordListCsv(
    records([
      { payload: { payload: "UNH+1+UTILMD:D:11A:UN'LOC+Z16+MALO-1'UNT+3+1'" } },
      {
        messageFormat: 'APERAK',
        payload: { payload: "UNH+1+APERAK:D:07B:UN'RFF+ACE:DEMO-1'UNT+3+1'" },
      },
    ]),
  );

  it('fuehrt die Spalten des Listeneintrags', () => {
    const [header] = lines(csv);

    assert.ok(header.startsWith('Nachrichtenkennung;Format;Richtung;Verarbeitungsstatus'));
    assert.ok(header.includes('Übertragung (ISO 8601)'));
  });

  it('gibt den Zeitstempel im Rohformat aus', () => {
    // ISO 8601 ist eindeutig, sortierbar und wieder einlesbar -- die
    // formatierte Anzeige ist keines davon.
    assert.ok(lines(csv)[1].includes('2026-08-01T08:15:00Z'));
  });

  it('haengt je fachlicher Kennung eine Spalte an', () => {
    const [header, first, second] = lines(csv);

    assert.ok(header.endsWith('MaLo;Referenz'), header);
    assert.ok(first.endsWith('MALO-1;'), first);
    assert.ok(second.endsWith(';DEMO-1'), second);
  });

  it('schreibt eine Zeile je Datensatz', () => {
    assert.equal(lines(csv).length, 3);
  });

  it('vertraegt einen leeren Bestand', () => {
    assert.equal(lines(recordListCsv([])).length, 1);
  });

  it('maskiert einen Wert mit Semikolon', () => {
    const csvWithSemicolon = recordListCsv(
      records([
        {
          messageID: 'A;B',
          payload: { payload: "UNH+1+UTILMD:D:11A:UN'UNT+2+1'" },
        },
      ]),
    );

    assert.ok(lines(csvWithSemicolon)[1].startsWith('"A;B";'));
  });
});

describe('segmentCsv', () => {
  const [record] = records([
    {
      payload: {
        payload: "UNH+1+UTILMD:D:11A:UN'BGM+E01+DOK-1+9'DTM+137:20260801:102'UNT+4+1'",
      },
    },
  ]);
  const csv = segmentCsv(record.derived.messages[0], 1);
  const rows = lines(csv).map((line) => line.split(';'));

  it('fuehrt Tag, Position, Datenelement, Bezeichnung, Wert und Klartext', () => {
    assert.deepEqual(rows[0], [
      'Nachricht',
      'Segment',
      'Segmentname',
      'Position',
      'Datenelement',
      'Bezeichnung',
      'Wert',
      'Klartext',
    ]);
  });

  it('schreibt eine Zeile je Komponente', () => {
    const bgm = rows.filter((row) => row[1] === 'BGM');

    assert.deepEqual(bgm[0].slice(3), ['1', '1001', 'Dokumentenart', 'E01', 'nicht hinterlegt']);
    assert.deepEqual(bgm[1].slice(3), ['2', '1004', 'Dokumentennummer', 'DOK-1', '']);
    assert.deepEqual(bgm[2].slice(3), ['3', '1225', 'Nachrichtenfunktion', '9', 'Original']);
  });

  it('numeriert geteilte Datenelemente mit Element und Komponente', () => {
    const unh = rows.filter((row) => row[1] === 'UNH');

    assert.equal(unh[1][3], '2.1');
  });

  it('dekodiert DTM ueber das Formatkennzeichen', () => {
    const dtm = rows.filter((row) => row[1] === 'DTM');

    assert.equal(dtm.find((row) => row[4] === '2380')[7], '01.08.2026');
  });

  it('nennt die Nachrichtennummer in jeder Zeile', () => {
    const second = segmentCsv(record.derived.messages[0], 2);

    assert.ok(
      lines(second)
        .slice(1)
        .every((line) => line.startsWith('2;')),
    );
  });
});

describe('exportFileName', () => {
  const now = new Date(2026, 8, 5, 10, 15);

  it('enthaelt Bezug und Zeitpunkt', () => {
    assert.equal(exportFileName('trefferliste', now), 'edifact-trefferliste-20260905-1015.csv');
  });

  it('ersetzt Zeichen, die in einem Dateinamen stoeren', () => {
    assert.equal(
      exportFileName('segmente/DEMO 1', now),
      'edifact-segmente-DEMO-1-20260905-1015.csv',
    );
  });

  it('kommt ohne Bezug aus', () => {
    assert.equal(exportFileName('', now), 'edifact-20260905-1015.csv');
    assert.equal(exportFileName('///', now), 'edifact-20260905-1015.csv');
  });
});
