import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';
import '../src/records.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const {
  clampPage,
  createRecordFromEdifact,
  extractOptionValues,
  filterRecords,
  isPlainRecord,
  normalizeRecord,
  normalizeRecords,
  pageCount,
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
