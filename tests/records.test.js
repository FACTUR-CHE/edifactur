import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';
import '../src/format.js';
import '../src/records.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const {
  buildReferenceIndex,
  clampPage,
  countUndatedRecords,
  highlightTerms,
  createRecordFromEdifact,
  extractOptionValues,
  filterRecords,
  resolveRange,
  isPlainRecord,
  normalizeRecord,
  normalizeRecords,
  pageCount,
  parseQuery,
} = globalThis.EdifactExplorer;

/** @returns {object} Rohdatensatz wie in einer Exportdatei. */
function source(overrides = {}) {
  return {
    ID: 'demo-1',
    messageID: 'DEMO-1',
    communicationPartnerID: '9900000000001',
    direction: 'Inbound',
    messageFormat: 'UTILMD',
    processingStatus: 'Completed',
    messageCategory: '313',
    transferTimestamp: '2026-08-01T08:15:00Z',
    payload: { payload: "UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'" },
    ...overrides,
  };
}

describe('isPlainRecord', () => {
  it('erkennt einfache Objekte', () => {
    assert.equal(isPlainRecord({}), true);
  });

  it('lehnt null, Arrays und Primitive ab', () => {
    assert.equal(isPlainRecord(null), false);
    assert.equal(isPlainRecord([]), false);
    assert.equal(isPlainRecord('x'), false);
    assert.equal(isPlainRecord(7), false);
  });
});

describe('normalizeRecord', () => {
  it('trennt Quelldaten von Ableitungen', () => {
    const record = normalizeRecord(source(), 'fallback');

    assert.equal(record.id, 'demo-1');
    assert.equal(record.source.messageFormat, 'UTILMD');
    assert.equal(record.derived.messageCount, 1);
    assert.equal(record.derived.messages.length, 1);
    // Die Quelldaten bleiben unberuehrt.
    assert.deepEqual(
      Object.keys(record.source).filter((key) => key.startsWith('_')),
      [],
    );
  });

  it('verwendet die Ersatzkennung bei fehlender ID', () => {
    assert.equal(normalizeRecord(source({ ID: undefined }), 'fallback').id, 'fallback');
    assert.equal(normalizeRecord(source({ ID: '' }), 'fallback').id, 'fallback');
  });

  it('vertraegt eine fehlende Nutzlast', () => {
    const record = normalizeRecord(source({ payload: undefined }), 'fallback');

    assert.equal(record.derived.payload, '');
    assert.deepEqual(record.derived.messages, []);
    assert.equal(record.derived.messageCount, 0);
  });

  it('vertraegt eine Nutzlast, die kein String ist', () => {
    const record = normalizeRecord(source({ payload: { payload: 42 } }), 'fallback');
    assert.equal(record.derived.payload, '');
  });

  it('zaehlt nur Gruppen mit UNH-Kopf als Nachricht', () => {
    const payload =
      "UNB+UNOC:3+1+2+260801:0815+REF'" +
      "UNH+1+UTILMD:D:11A:UN'UNT+2+1'" +
      "UNH+2+UTILMD:D:11A:UN'UNT+2+2'" +
      "UNZ+2+REF'";
    const record = normalizeRecord(source({ payload: { payload } }), 'fallback');

    assert.equal(record.derived.messages.length, 4); // UNB, 2x Nachricht, UNZ
    assert.equal(record.derived.messageCount, 2);
  });

  it('nimmt Metadaten und Nutzlast in den Volltextindex auf', () => {
    const { searchIndex } = normalizeRecord(source(), 'fallback').derived;

    assert.ok(searchIndex.includes('9900000000001'));
    assert.ok(searchIndex.includes('utilmd'));
    assert.equal(searchIndex, searchIndex.toLowerCase());
  });
});

describe('normalizeRecords', () => {
  it('macht doppelte Kennungen eindeutig', () => {
    const records = normalizeRecords([source(), source(), source()]);
    const ids = records.map((record) => record.id);

    assert.equal(new Set(ids).size, 3);
    assert.equal(ids[0], 'demo-1');
  });

  it('vergibt Kennungen fuer Datensaetze ohne ID', () => {
    const records = normalizeRecords([source({ ID: undefined }), source({ ID: undefined })]);

    assert.deepEqual(
      records.map((record) => record.id),
      ['datensatz-1', 'datensatz-2'],
    );
  });
});

describe('createRecordFromEdifact', () => {
  it('leitet zentrale Metadaten aus der Nachricht ab', () => {
    const record = createRecordFromEdifact(
      "UNH+ABC123+UTILMD:D:11A:UN'BGM+E01+4711'UNT+3+ABC123'",
      'manuell',
    );

    assert.equal(record.id, 'manuell');
    assert.equal(record.source.messageID, 'ABC123');
    assert.equal(record.source.messageFormat, 'UTILMD');
    assert.equal(record.source.messageCategory, 'E01');
    assert.equal(record.derived.messageCount, 1);
  });
});

describe('extractOptionValues', () => {
  it('sammelt sortierte Werte ohne Duplikate und Leerwerte', () => {
    const records = normalizeRecords([
      source({ messageFormat: 'UTILMD' }),
      source({ messageFormat: 'APERAK' }),
      source({ messageFormat: 'UTILMD' }),
      source({ messageFormat: '' }),
      source({ messageFormat: undefined }),
    ]);

    assert.deepEqual(extractOptionValues(records, 'messageFormat'), ['APERAK', 'UTILMD']);
  });
});

describe('filterRecords', () => {
  const records = normalizeRecords([
    source({ ID: 'a', messageFormat: 'UTILMD', direction: 'Inbound' }),
    source({ ID: 'b', messageFormat: 'APERAK', direction: 'Outbound' }),
    source({ ID: 'c', messageFormat: 'APERAK', direction: 'Inbound' }),
  ]);

  it('liefert ohne Kriterien alles', () => {
    assert.equal(filterRecords(records).length, 3);
    assert.equal(filterRecords(records, {}).length, 3);
  });

  it('filtert ueber den Volltext', () => {
    assert.deepEqual(
      filterRecords(records, { query: 'aperak' }).map((record) => record.id),
      ['b', 'c'],
    );
  });

  it('ignoriert umgebende Leerzeichen im Suchbegriff', () => {
    assert.equal(filterRecords(records, { query: '  aperak  ' }).length, 2);
  });

  it('verknuepft Kriterien mit Und', () => {
    assert.deepEqual(
      filterRecords(records, { messageFormat: 'APERAK', direction: 'Inbound' }).map(
        (record) => record.id,
      ),
      ['c'],
    );
  });

  it('liefert ein leeres Ergebnis, wenn nichts passt', () => {
    assert.deepEqual(filterRecords(records, { query: 'gibtesnicht' }), []);
  });
});

describe('resolveRange', () => {
  const now = Date.UTC(2026, 7, 15, 12, 0, 0);

  it('liefert ohne Auswahl keinen Zeitraum', () => {
    assert.equal(resolveRange(), null);
    assert.equal(resolveRange({}), null);
    assert.equal(resolveRange({ preset: '', from: '', to: '' }), null);
  });

  it('loest die Schnellauswahl als gleitendes Fenster auf', () => {
    assert.deepEqual(resolveRange({ preset: '24h' }, now), {
      start: now - 24 * 3600000,
      end: now,
    });
    assert.deepEqual(resolveRange({ preset: '7d' }, now), {
      start: now - 7 * 24 * 3600000,
      end: now,
    });
    assert.deepEqual(resolveRange({ preset: '30d' }, now), {
      start: now - 30 * 24 * 3600000,
      end: now,
    });
  });

  it('ignoriert eine unbekannte Schnellauswahl', () => {
    assert.equal(resolveRange({ preset: 'gestern' }, now), null);
  });

  it('legt die Tagesgrenzen in Ortszeit', () => {
    const range = resolveRange({ from: '2026-08-01', to: '2026-08-01' }, now);

    assert.deepEqual(new Date(range.start), new Date(2026, 7, 1, 0, 0, 0, 0));
    assert.deepEqual(new Date(range.end), new Date(2026, 7, 1, 23, 59, 59, 999));
  });

  it('laesst eine fehlende Grenze offen', () => {
    assert.equal(resolveRange({ from: '2026-08-01' }, now).end, Number.POSITIVE_INFINITY);
    assert.equal(resolveRange({ to: '2026-08-01' }, now).start, Number.NEGATIVE_INFINITY);
  });

  it('gibt der Schnellauswahl den Vorrang vor freien Daten', () => {
    assert.deepEqual(resolveRange({ preset: '24h', from: '2020-01-01' }, now), {
      start: now - 24 * 3600000,
      end: now,
    });
  });

  it('verwirft unbrauchbare Datumsangaben', () => {
    assert.equal(resolveRange({ from: '01.08.2026' }, now), null);
    assert.equal(resolveRange({ from: '2026-02-31' }, now), null);
    assert.equal(resolveRange({ from: '2026-8-1' }, now), null);
  });

  it('dreht ein verkehrtes Paar nicht stillschweigend um', () => {
    // Die Oberflaeche soll darauf hinweisen koennen; ein getauschtes Paar
    // saehe aus wie ein gueltiges Ergebnis.
    const range = resolveRange({ from: '2026-08-10', to: '2026-08-01' }, now);
    assert.ok(range.start > range.end);
  });
});

describe('filterRecords mit Zeitraum', () => {
  const records = normalizeRecords([
    source({ ID: 'frueh', transferTimestamp: '2026-08-01T00:00:00Z' }),
    source({ ID: 'mitte', transferTimestamp: '2026-08-05T12:00:00Z' }),
    source({ ID: 'spaet', transferTimestamp: '2026-08-10T23:30:00Z' }),
    source({ ID: 'ohne', transferTimestamp: undefined }),
    source({ ID: 'kaputt', transferTimestamp: 'irgendwann' }),
  ]);

  const ids = (range) => filterRecords(records, { range }).map((record) => record.id);

  it('laesst ohne Zeitraum alles durch', () => {
    assert.equal(ids({}).length, 5);
  });

  it('filtert zwischen zwei Daten', () => {
    assert.deepEqual(ids({ from: '2026-08-05', to: '2026-08-05' }), ['mitte']);
  });

  it('schliesst beide Tagesgrenzen ein', () => {
    // Grenzwert: 00:00 des Von-Tages und 23:59:59.999 des Bis-Tages zaehlen
    // noch dazu. Die Zeitstempel liegen in UTC, der Filter in Ortszeit --
    // deshalb ein Tag Luft an beiden Enden.
    assert.deepEqual(ids({ from: '2026-07-31', to: '2026-08-11' }), ['frueh', 'mitte', 'spaet']);
  });

  it('blendet Datensaetze ohne lesbaren Zeitstempel aus', () => {
    const found = ids({ from: '2000-01-01' });
    assert.ok(!found.includes('ohne'));
    assert.ok(!found.includes('kaputt'));
  });

  it('liefert bei verkehrtem Paar nichts', () => {
    assert.deepEqual(ids({ from: '2026-08-10', to: '2026-08-01' }), []);
  });

  it('greift zusammen mit Suche und Filtern', () => {
    const found = filterRecords(records, {
      query: 'mitte',
      messageFormat: 'UTILMD',
      range: { from: '2026-08-01', to: '2026-08-31' },
    });

    assert.deepEqual(
      found.map((record) => record.id),
      ['mitte'],
    );
    // Derselbe Zeitraum, aber ein Filter, der nicht passt.
    assert.deepEqual(
      filterRecords(records, {
        messageFormat: 'APERAK',
        range: { from: '2026-08-01', to: '2026-08-31' },
      }),
      [],
    );
  });

  it('zaehlt die Datensaetze ohne Zeitstempel', () => {
    assert.equal(countUndatedRecords(records), 2);
    assert.equal(countUndatedRecords([]), 0);
  });
});

describe('clampPage', () => {
  it('begrenzt nach oben', () => {
    assert.equal(clampPage(9, 300, 250), 1);
  });

  it('begrenzt nach unten', () => {
    // Regression: es gab nur eine obere Grenze (Math.min).
    assert.equal(clampPage(-1, 300, 250), 0);
    assert.equal(clampPage(-99, 0, 250), 0);
  });

  it('laesst gueltige Seiten unveraendert', () => {
    assert.equal(clampPage(1, 600, 250), 1);
  });
});

describe('pageCount', () => {
  it('liefert mindestens eine Seite', () => {
    assert.equal(pageCount(0, 250), 1);
  });

  it('rundet auf', () => {
    assert.equal(pageCount(251, 250), 2);
    assert.equal(pageCount(500, 250), 2);
  });
});

describe('buildReferenceIndex', () => {
  /** @returns {object} Datensatz mit Kennung und Referenz. */
  const record = (id, messageID, referenceMessageID) =>
    normalizeRecord({ ID: id, messageID, referenceMessageID, payload: { payload: '' } }, id);

  it('verknuepft Referenz und Nachrichtenkennung in beide Richtungen', () => {
    const utilmd = record('r1', 'MSG-1');
    const aperak = record('r2', 'MSG-2', 'MSG-1');
    const { targets, sources } = buildReferenceIndex([utilmd, aperak]);

    assert.equal(targets.get('r2'), 'r1');
    assert.deepEqual(sources.get('r1'), ['r2']);
    assert.equal(targets.has('r1'), false);
  });

  it('sammelt mehrere Verweise auf dieselbe Nachricht', () => {
    const index = buildReferenceIndex([
      record('r1', 'MSG-1'),
      record('r2', 'MSG-2', 'MSG-1'),
      record('r3', 'MSG-3', 'MSG-1'),
    ]);

    assert.deepEqual(index.sources.get('r1'), ['r2', 'r3']);
  });

  it('laesst eine Referenz auf eine nicht geladene Nachricht offen', () => {
    const index = buildReferenceIndex([record('r1', 'MSG-1', 'MSG-UNBEKANNT')]);

    assert.equal(index.targets.size, 0);
    assert.equal(index.sources.size, 0);
  });

  it('ignoriert einen Selbstverweis', () => {
    const index = buildReferenceIndex([record('r1', 'MSG-1', 'MSG-1')]);

    assert.equal(index.targets.size, 0);
    assert.equal(index.sources.size, 0);
  });

  it('loest bei doppelter Nachrichtenkennung auf den ersten Datensatz auf', () => {
    const index = buildReferenceIndex([
      record('r1', 'MSG-1'),
      record('r2', 'MSG-1'),
      record('r3', 'MSG-3', 'MSG-1'),
    ]);

    assert.equal(index.targets.get('r3'), 'r1');
  });

  it('ignoriert leere und fehlende Kennungen', () => {
    const index = buildReferenceIndex([
      record('r1', '', ''),
      record('r2', undefined, undefined),
      record('r3', '   ', '   '),
    ]);

    assert.equal(index.targets.size, 0);
    assert.equal(index.sources.size, 0);
  });

  it('verarbeitet einen leeren Bestand', () => {
    const index = buildReferenceIndex([]);

    assert.equal(index.targets.size, 0);
    assert.equal(index.sources.size, 0);
  });
});

describe('parseQuery', () => {
  it('liest freien Text ohne Praefix als Volltext', () => {
    assert.deepEqual(parseQuery('Meier GmbH'), {
      text: 'Meier GmbH',
      terms: [],
      unknown: [],
    });
  });

  it('erkennt eine Feldbedingung', () => {
    assert.deepEqual(parseQuery('loc:DEMO-MALO-0001'), {
      text: '',
      terms: [{ field: 'loc', value: 'DEMO-MALO-0001' }],
      unknown: [],
    });
  });

  it('verknuepft mehrere Bedingungen und behaelt freien Text', () => {
    const parsed = parseQuery('seg:QTY format:MSCONS Zaehlerstand');

    assert.equal(parsed.text, 'Zaehlerstand');
    assert.deepEqual(parsed.terms, [
      { field: 'seg', value: 'QTY' },
      { field: 'format', value: 'MSCONS' },
    ]);
  });

  it('ignoriert Gross- und Kleinschreibung im Praefix', () => {
    assert.deepEqual(parseQuery('LOC:x').terms, [{ field: 'loc', value: 'x' }]);
    assert.deepEqual(parseQuery('Seg:QTY').terms, [{ field: 'seg', value: 'QTY' }]);
  });

  it('meldet ein unbekanntes Praefix statt es als Volltext zu suchen', () => {
    const parsed = parseQuery('xyz:1');

    assert.deepEqual(parsed.unknown, ['xyz']);
    assert.deepEqual(parsed.terms, []);
    assert.equal(parsed.text, '');
  });

  it('liest einen Zeitstempel nicht als Feldbedingung', () => {
    // Ohne die Buchstabenschranke waere "08" hier ein Praefix.
    const parsed = parseQuery('2026-08-01T08:15');

    assert.equal(parsed.text, '2026-08-01T08:15');
    assert.deepEqual(parsed.terms, []);
    assert.deepEqual(parsed.unknown, []);
  });

  it('liest einen EDIFACT-Wert mit Komponententrenner nicht als Feldbedingung', () => {
    const parsed = parseQuery('1-1:1.8.0');

    assert.equal(parsed.text, '1-1:1.8.0');
    assert.deepEqual(parsed.terms, []);
  });

  it('behaelt einen Doppelpunkt im Wert einer Bedingung', () => {
    assert.deepEqual(parseQuery('rff:ACE:DEMO-001').terms, [
      { field: 'rff', value: 'ACE:DEMO-001' },
    ]);
  });

  it('verwirft ein Praefix ohne Wert', () => {
    const parsed = parseQuery('loc:');

    assert.deepEqual(parsed.terms, []);
    assert.deepEqual(parsed.unknown, []);
  });

  it('haelt einen Wert mit Leerzeichen in Anfuehrungszeichen zusammen', () => {
    assert.deepEqual(parseQuery('nad:"Demolieferant GmbH"').terms, [
      { field: 'nad', value: 'Demolieferant GmbH' },
    ]);
  });

  it('verarbeitet leere und unbrauchbare Eingaben', () => {
    for (const input of ['', '   ', null, undefined]) {
      assert.deepEqual(parseQuery(input), { text: '', terms: [], unknown: [] });
    }
  });
});

describe('highlightTerms', () => {
  it('liefert freien Text und Bedingungswerte', () => {
    assert.deepEqual(highlightTerms('loc:DEMO-1 Meier'), ['Meier', 'DEMO-1']);
  });

  it('liefert fuer eine leere Eingabe eine leere Liste', () => {
    assert.deepEqual(highlightTerms(''), []);
  });

  it('nimmt ein unbekanntes Praefix nicht in die Hervorhebung auf', () => {
    assert.deepEqual(highlightTerms('xyz:1'), []);
  });
});

describe('filterRecords mit Feldbedingungen', () => {
  const build = (id, payload, source = {}) =>
    normalizeRecord({ ID: id, payload: { payload }, ...source }, id);

  const records = [
    build('a', "UNH+1+MSCONS:D:04B:UN'LOC+172+MALO-1'QTY+220:42'UNT+4+1'", {
      messageFormat: 'MSCONS',
      communicationPartnerID: '9900000000005',
    }),
    build('b', "UNH+1+UTILMD:D:11A:UN'LOC+172+MALO-2'NAD+MS+9900000000009::293'UNT+4+1'", {
      messageFormat: 'UTILMD',
      messageID: 'MSG-B',
    }),
    build('c', "UNH+1+APERAK:D:07B:UN'RFF+ACE:MSG-B'ERC+Z29'UNT+4+1'", {
      messageFormat: 'APERAK',
    }),
  ];

  const ids = (query) => filterRecords(records, { query }).map((record) => record.id);

  it('findet ueber den Segmenttyp', () => {
    assert.deepEqual(ids('seg:QTY'), ['a']);
    assert.deepEqual(ids('seg:LOC'), ['a', 'b']);
    assert.deepEqual(ids('seg:ERC'), ['c']);
  });

  it('findet einen Wert nur im genannten Segment', () => {
    // 9900000000009 steht im NAD von b. Ueber loc: darf es nicht treffen.
    assert.deepEqual(ids('nad:9900000000009'), ['b']);
    assert.deepEqual(ids('loc:9900000000009'), []);
  });

  it('findet ueber Metadatenfelder', () => {
    assert.deepEqual(ids('format:UTILMD'), ['b']);
    assert.deepEqual(ids('partner:9900000000005'), ['a']);
    assert.deepEqual(ids('msgid:MSG-B'), ['b']);
  });

  it('verknuepft Bedingungen mit Und', () => {
    assert.deepEqual(ids('seg:LOC format:UTILMD'), ['b']);
    assert.deepEqual(ids('seg:LOC format:APERAK'), []);
  });

  it('verknuepft Bedingung und Volltext mit Und', () => {
    assert.deepEqual(ids('seg:LOC MALO-2'), ['b']);
    assert.deepEqual(ids('seg:ERC MALO-2'), []);
  });

  it('laesst eine unbekannte Bedingung wirkungslos', () => {
    // Gemeldet wird sie in der Oberflaeche; gefiltert wird nicht danach.
    assert.deepEqual(ids('xyz:1'), ['a', 'b', 'c']);
  });

  it('ignoriert Gross- und Kleinschreibung im Wert', () => {
    assert.deepEqual(ids('seg:qty'), ['a']);
    assert.deepEqual(ids('loc:malo-1'), ['a']);
  });

  it('bleibt bei 20.000 Datensaetzen praxistauglich', () => {
    const many = Array.from({ length: 20000 }, (unused, index) =>
      build(`r${index}`, `UNH+1+MSCONS:D:04B:UN'LOC+172+MALO-${index}'QTY+220:42'UNT+4+1'`, {
        messageFormat: 'MSCONS',
      }),
    );

    const started = performance.now();
    const hits = filterRecords(many, { query: 'seg:QTY loc:MALO-19999' });
    const elapsed = performance.now() - started;

    assert.equal(hits.length, 1);
    assert.ok(elapsed < 1000, `Filtern dauerte ${Math.round(elapsed)} ms`);
  });
});
