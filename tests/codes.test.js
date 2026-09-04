import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/codes.js';
import '../src/segments.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const { CODE_LISTS, SEGMENT_DEFINITIONS, codeMeaning, hasCodeList } = globalThis.EdifactExplorer;

describe('hasCodeList', () => {
  it('erkennt hinterlegte Datenelemente', () => {
    assert.equal(hasCodeList('3035'), true);
    assert.equal(hasCodeList('6411'), true);
  });

  it('erkennt Datenelemente ohne Codeliste', () => {
    assert.equal(hasCodeList('3039'), false);
    assert.equal(hasCodeList('C186'), false);
  });

  it('faellt nicht auf geerbte Eigenschaften herein', () => {
    assert.equal(hasCodeList('constructor'), false);
    assert.equal(hasCodeList('toString'), false);
  });
});

describe('codeMeaning', () => {
  it('loest einen Code auf', () => {
    assert.deepEqual(codeMeaning('3035', 'MS'), { name: 'Absender der Nachricht' });
    assert.deepEqual(codeMeaning('6063', '220'), { name: 'Zählerstand' });
    assert.deepEqual(codeMeaning('6411', 'KWH'), { name: 'Kilowattstunde' });
    assert.deepEqual(codeMeaning('1225', '9'), { name: 'Original' });
    assert.deepEqual(codeMeaning('1001', '313'), { name: 'Anwendungsfehler-Nachricht' });
    assert.deepEqual(codeMeaning('1153', 'AVE'), { name: 'Zählpunkt' });
    assert.deepEqual(codeMeaning('3227', '172'), { name: 'Meldepunkt' });
  });

  it('kennzeichnet einen Code, der nicht in der Liste steht', () => {
    // E01 ist ein EDI@Energy-Code und damit hier nicht belegt. Wichtig ist,
    // dass das von "keine Codeliste vorhanden" unterscheidbar bleibt.
    assert.deepEqual(codeMeaning('1001', 'E01'), { name: null });
    assert.deepEqual(codeMeaning('3035', 'ZZ9'), { name: null });
  });

  it('trifft ohne Codeliste keine Aussage', () => {
    assert.equal(codeMeaning('3039', 'MS'), null);
    assert.equal(codeMeaning('C082', 'MS'), null);
    assert.equal(codeMeaning('0057', '5.1e'), null);
  });

  it('schlaegt ohne Ruecksicht auf Gross- und Kleinschreibung nach', () => {
    assert.deepEqual(codeMeaning('3035', 'ms'), { name: 'Absender der Nachricht' });
    assert.deepEqual(codeMeaning('3035', 'Ms'), { name: 'Absender der Nachricht' });
    assert.deepEqual(codeMeaning('6411', 'kwh'), { name: 'Kilowattstunde' });
  });

  it('ignoriert umgebende Leerzeichen', () => {
    assert.deepEqual(codeMeaning('3035', '  MS  '), { name: 'Absender der Nachricht' });
  });

  it('trifft ohne Codewert keine Aussage', () => {
    assert.equal(codeMeaning('3035', ''), null);
    assert.equal(codeMeaning('3035', '   '), null);
    assert.equal(codeMeaning('3035', null), null);
    assert.equal(codeMeaning('3035', undefined), null);
  });

  it('verarbeitet unbrauchbare Datenelement-Angaben', () => {
    assert.equal(codeMeaning(null, 'MS'), null);
    assert.equal(codeMeaning(3035, 'MS'), null);
    assert.equal(codeMeaning(undefined, 'MS'), null);
  });
});

describe('CODE_LISTS', () => {
  it('deckt die im Ticket genannten Datenelemente ab', () => {
    for (const element of ['3035', '1001', '1225', '1153', '3227', '6063', '6411', '5025']) {
      assert.ok(hasCodeList(element), `Codeliste fehlt fuer DE ${element}`);
    }
  });

  it('fuehrt zu jedem Code eine nicht leere Bezeichnung', () => {
    for (const [element, list] of Object.entries(CODE_LISTS)) {
      assert.ok(list.name, `Name der Codeliste fehlt fuer DE ${element}`);

      const entries = Object.entries(list.codes);
      assert.ok(entries.length > 0, `Codeliste DE ${element} ist leer`);

      for (const [code, name] of entries) {
        assert.ok(name, `Bezeichnung fehlt: DE ${element} Code ${code}`);
        assert.equal(code, code.trim(), `Code mit Leerzeichen: DE ${element} "${code}"`);
      }
    }
  });

  it('fuehrt Codes in Grossbuchstaben, damit der Nachschlagepfad trifft', () => {
    for (const [element, list] of Object.entries(CODE_LISTS)) {
      for (const code of Object.keys(list.codes)) {
        assert.equal(
          code,
          code.toUpperCase(),
          `Code nicht in Grossbuchstaben: DE ${element} ${code}`,
        );
      }
    }
  });

  it('benennt jede Codeliste wie das zugehoerige Datenelement', () => {
    // Die Bezeichnung stammt in beiden Dateien aus derselben Quelle. Weicht
    // sie ab, ist eine der beiden nachgepflegt worden und die andere nicht.
    const names = new Map();
    for (const definition of Object.values(SEGMENT_DEFINITIONS)) {
      for (const element of definition.elements) {
        if (element.components) {
          for (const component of element.components) names.set(component.code, component.name);
        } else {
          names.set(element.code, element.name);
        }
      }
    }

    for (const [element, list] of Object.entries(CODE_LISTS)) {
      const expected = names.get(element);
      if (expected === undefined) continue;
      assert.equal(list.name, expected, `Bezeichnung weicht ab fuer DE ${element}`);
    }
  });
});
