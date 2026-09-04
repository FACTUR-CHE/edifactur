import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/segments.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const { SEGMENT_DEFINITIONS, dataElement, hasSegmentDefinition } = globalThis.EdifactExplorer;

describe('hasSegmentDefinition', () => {
  it('erkennt hinterlegte Segmente', () => {
    assert.equal(hasSegmentDefinition('NAD'), true);
    assert.equal(hasSegmentDefinition('QTY'), true);
  });

  it('erkennt unbekannte Segmente', () => {
    assert.equal(hasSegmentDefinition('XYZ'), false);
  });

  it('faellt nicht auf geerbte Eigenschaften herein', () => {
    assert.equal(hasSegmentDefinition('constructor'), false);
    assert.equal(hasSegmentDefinition('toString'), false);
  });
});

describe('dataElement', () => {
  it('liefert ohne Komponentenangabe das Datenelement selbst', () => {
    assert.deepEqual(dataElement('QTY', 0), { code: 'C186', name: 'Mengenangaben' });
  });

  it('liefert die Komponente eines zusammengesetzten Elements', () => {
    assert.deepEqual(dataElement('QTY', 0, 0), { code: '6063', name: 'Mengenart, Qualifier' });
    assert.deepEqual(dataElement('QTY', 0, 1), { code: '6060', name: 'Menge' });
    assert.deepEqual(dataElement('QTY', 0, 2), { code: '6411', name: 'Maßeinheit' });
  });

  it('behandelt ein einfaches Element als seine eigene einzige Komponente', () => {
    assert.deepEqual(dataElement('NAD', 0, 0), { code: '3035', name: 'Beteiligter, Qualifier' });
    assert.equal(dataElement('NAD', 0, 1), null);
  });

  it('liefert null fuer ein unbekanntes Segment', () => {
    assert.equal(dataElement('XYZ', 0), null);
    assert.equal(dataElement('XYZ', 0, 0), null);
  });

  it('liefert null fuer eine Position ausserhalb der Definition', () => {
    assert.equal(dataElement('QTY', 5), null);
    assert.equal(dataElement('QTY', 0, 9), null);
    assert.equal(dataElement('NAD', 99, 0), null);
  });

  it('loest die Formatversion in UNH auf', () => {
    assert.deepEqual(dataElement('UNH', 1, 4), {
      code: '0057',
      name: 'Anwendungsspezifische Kennung (Formatversion)',
    });
  });

  it('loest die Zaehler in UNT und UNZ auf', () => {
    assert.deepEqual(dataElement('UNT', 0, 0), {
      code: '0074',
      name: 'Anzahl der Segmente in der Nachricht',
    });
    assert.deepEqual(dataElement('UNZ', 0, 0), {
      code: '0036',
      name: 'Anzahl der Nachrichten im Austausch',
    });
  });

  it('loest das Testkennzeichen in UNB auf', () => {
    assert.deepEqual(dataElement('UNB', 10, 0), { code: '0035', name: 'Testkennzeichen' });
  });

  it('numeriert wiederholte Komponenten durch', () => {
    assert.deepEqual(dataElement('NAD', 2, 0), { code: '3124', name: 'Name und Adresse, Zeile 1' });
    assert.deepEqual(dataElement('NAD', 2, 4), { code: '3124', name: 'Name und Adresse, Zeile 5' });
    assert.equal(dataElement('NAD', 2, 5), null);
  });

  it('fuehrt das Formatkennzeichen von DTM als eigene Komponente', () => {
    assert.deepEqual(dataElement('DTM', 0, 2), {
      code: '2379',
      name: 'Format von Datum, Uhrzeit oder Zeitraum',
    });
  });

  it('weist die UNA-Positionen ohne Datenelement-Nummer aus', () => {
    assert.deepEqual(dataElement('UNA', 0), { code: '', name: 'Komponententrenner' });
    assert.deepEqual(dataElement('UNA', 5), { code: '', name: 'Segmenttrenner' });
  });
});

describe('SEGMENT_DEFINITIONS', () => {
  const tags = [
    'UNA',
    'UNB',
    'UNH',
    'BGM',
    'DTM',
    'NAD',
    'CTA',
    'COM',
    'RFF',
    'LOC',
    'LIN',
    'PIA',
    'QTY',
    'MOA',
    'FTX',
    'ERC',
    'UNT',
    'UNZ',
  ];

  it('deckt alle Segmente ab, die die Oberflaeche benennt', () => {
    for (const tag of tags) {
      assert.ok(hasSegmentDefinition(tag), `Definition fehlt fuer ${tag}`);
    }
  });

  it('fuehrt zu jeder Position eine Bezeichnung', () => {
    for (const [tag, definition] of Object.entries(SEGMENT_DEFINITIONS)) {
      assert.ok(definition.name, `Segmentname fehlt fuer ${tag}`);
      assert.ok(definition.elements.length > 0, `Keine Elemente fuer ${tag}`);

      for (const [index, element] of definition.elements.entries()) {
        assert.ok(element.name, `Bezeichnung fehlt: ${tag} Element ${index + 1}`);
        assert.equal(typeof element.code, 'string', `Code fehlt: ${tag} Element ${index + 1}`);

        for (const [part, component] of (element.components ?? []).entries()) {
          assert.ok(component.name, `Bezeichnung fehlt: ${tag} ${index + 1}.${part + 1}`);
          assert.ok(component.code, `Nummer fehlt: ${tag} ${index + 1}.${part + 1}`);
        }
      }
    }
  });

  it('gibt einfachen Datenelementen keine Komponentenliste', () => {
    assert.equal(SEGMENT_DEFINITIONS.NAD.elements[0].components, undefined);
    assert.ok(SEGMENT_DEFINITIONS.NAD.elements[1].components);
  });
});
