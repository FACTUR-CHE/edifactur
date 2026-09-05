/**
 * Rauchtest der Darstellungsschicht.
 *
 * Geprueft wird, **dass** gezeichnet wird und **dass** die erwarteten Inhalte
 * im Baum landen. Layout, Farben und Fokusreihenfolge bleiben Sache des
 * Browsers -- dafuer waere eine Attrappe das falsche Werkzeug.
 *
 * Die Attrappe steht bewusst in dieser Datei: kein jsdom, keine
 * Laufzeitabhaengigkeit, kein Build-Schritt. Sie stellt genau die
 * DOM-Oberflaeche nach, die dom.js und render.js benutzen, und keine mehr.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// --- DOM-Attrappe ---------------------------------------------------------

/**
 * Ein Knoten. `dataset` ist ein einfaches Objekt, `children` haelt Knoten und
 * Zeichenketten in ihrer Reihenfolge.
 */
class StubNode {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.children = [];
  }

  /**
   * Streng mit Absicht: `null` und `undefined` werfen, statt uebergangen zu
   * werden. Genau diese Nachsicht wuerde einen Spread ueber ein
   * DocumentFragment verdecken -- den Fehler, der die Attrappe ueberhaupt
   * noetig gemacht hat.
   */
  append(...children) {
    for (const child of children) {
      if (child === null || child === undefined) {
        throw new TypeError(`append(${String(child)}) auf <${this.tag}>`);
      }

      if (child instanceof StubFragment) {
        // Wie im Browser: das Fragment gibt seine Kinder ab und bleibt leer.
        this.children.push(...child.children);
        child.children = [];
        continue;
      }

      if (child instanceof StubNode) {
        this.children.push(child);
        continue;
      }

      if (typeof child !== 'string' && typeof child !== 'number') {
        throw new TypeError(`append(${typeof child}) auf <${this.tag}>`);
      }

      this.children.push(String(child));
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  set textContent(value) {
    this.children = [String(value)];
  }

  /** Der gesamte Text unterhalb des Knotens, wie `Node#textContent`. */
  get textContent() {
    return this.children
      .map((child) => (typeof child === 'string' ? child : child.textContent))
      .join('');
  }
}

class StubFragment extends StubNode {
  constructor() {
    super('#fragment');
  }
}

globalThis.document = {
  createElement: (tag) => new StubNode(tag),
  createDocumentFragment: () => new StubFragment(),
};

// Erst nach der Attrappe laden: die Quelldateien sind klassische Skripte, die
// beim Laden ausgefuehrt werden und `document` erwarten.
await import('../src/edifact.js');
await import('../src/segments.js');
await import('../src/codes.js');
await import('../src/format.js');
await import('../src/records.js');
await import('../src/dom.js');
await import('../src/render.js');

const { el, normalizeRecord, normalizeRecords, renderDetail, renderList, renderResultInfo } =
  globalThis.EdifactExplorer;

// --- Helfer ---------------------------------------------------------------

/** @returns {StubNode} Ein leerer Zielknoten, wie ihn app.js uebergibt. */
const container = () => new StubNode('div');

/** @returns {StubNode[]} Alle Knoten des Baums, den Wurzelknoten eingeschlossen. */
function nodes(root) {
  const found = [root];
  for (const child of root.children) {
    if (typeof child !== 'string') found.push(...nodes(child));
  }
  return found;
}

/** @returns {StubNode|undefined} */
const findNode = (root, predicate) => nodes(root).find(predicate);

/** @returns {StubNode[]} Alle Knoten mit dieser Klasse. */
const byClass = (root, name) =>
  nodes(root).filter((node) => node.className.split(' ').includes(name));

/** @returns {string} Der Text, der im Browser zu lesen waere. */
const textOf = (root) => root.textContent;

/** @returns {object} Datensatz aus einer EDIFACT-Nutzlast. */
const recordOf = (payload, overrides = {}) =>
  normalizeRecord({ ID: 'demo', payload: { payload }, ...overrides }, 'demo');

/** @returns {StubNode} Gezeichneter Detailbereich. */
function detail(record, options = {}) {
  const node = container();
  renderDetail(node, { record, query: '', activeTab: 'structured', activeMessage: 0, ...options });
  return node;
}

// --- Die Attrappe selbst --------------------------------------------------

describe('DOM-Attrappe', () => {
  it('wirft bei append(null) und append(undefined)', () => {
    // Ohne diese Strenge waere der Rauchtest wertlos: er liesse genau die
    // Fehler durch, wegen derer es ihn gibt.
    assert.throws(() => container().append(null), TypeError);
    assert.throws(() => container().append(undefined), TypeError);
  });

  it('loest ein Fragment in seine Kinder auf', () => {
    const node = container();
    const fragment = globalThis.document.createDocumentFragment();
    fragment.append('a', el('b', { text: 'b' }));
    node.append(fragment);

    assert.equal(node.children.length, 2);
    assert.equal(fragment.children.length, 0);
    assert.equal(textOf(node), 'ab');
  });

  it('setzt Klassen, Attribute und data-Attribute ueber el', () => {
    const node = el('button', { class: 'x', title: 'T', dataset: { copy: 'W' }, disabled: true });

    assert.equal(node.className, 'x');
    assert.equal(node.attributes.title, 'T');
    assert.equal(node.attributes.disabled, '');
    assert.equal(node.dataset.copy, 'W');
  });
});

// --- Beispieldatei --------------------------------------------------------

describe('Rauchtest ueber die Beispieldatei', () => {
  const sample = JSON.parse(readFileSync(new URL('../data/sample-messages.json', import.meta.url)));
  const records = normalizeRecords(sample.value);

  it('zeichnet die Trefferliste', () => {
    const node = container();
    renderList(node, { records, selectedId: records[0].id, query: '', page: 0, pageSize: 250 });

    assert.equal(byClass(node, 'record').length, records.length);
    assert.equal(byClass(node, 'record')[0].attributes['aria-current'], 'true');
  });

  it('zeichnet jeden Datensatz in beiden Ansichten und fuer jede Nachricht', () => {
    for (const record of records) {
      for (const activeTab of ['structured', 'raw']) {
        for (let index = 0; index < Math.max(1, record.derived.messages.length); index += 1) {
          const node = detail(record, { activeTab, activeMessage: index });
          assert.ok(node.children.length > 0, `${record.id} (${activeTab}, ${index}) leer`);
        }
      }
    }
  });

  it('zeichnet die Trefferzahl und die Seitennavigation', () => {
    const info = container();
    renderResultInfo(info, { filtered: 300, total: 1000, page: 1, pageSize: 250 });
    assert.equal(textOf(info), '300 von 1.000 Nachrichten · Seite 2 von 2');

    const list = container();
    renderList(list, { records, selectedId: null, query: '', page: 0, pageSize: 5 });
    assert.equal(byClass(list, 'pager').length, 1);
  });

  it('meldet den leeren Zustand statt zu werfen', () => {
    assert.equal(textOf(detail(null)), 'Wählen Sie eine Nachricht aus der Liste.');

    const list = container();
    renderList(list, { records: [], selectedId: null, query: '', page: 0, pageSize: 250 });
    assert.equal(textOf(list), 'Keine passenden Nachrichten.');
  });
});

// --- Inhalte --------------------------------------------------------------

describe('Detailbereich zeichnet die aufbereiteten Inhalte', () => {
  it('benennt Datenelemente statt sie zu numerieren', () => {
    const node = detail(recordOf("UNH+1+UTILMD:D:11A:UN'BGM+E01+DOK-1+9'UNT+3+1'"));
    const text = textOf(node);

    assert.ok(text.includes('Dokumentennummer'), 'DE-Name fehlt');
    assert.ok(!text.includes('Element 1.1'), 'Positionsangabe trotz hinterlegter Bezeichnung');
  });

  it('faellt bei unbekanntem Segment auf die Positionsangabe zurueck', () => {
    const node = detail(recordOf("UNH+1+UTILMD:D:11A:UN'ZZZ+WERT-1'UNT+3+1'"));

    assert.ok(textOf(node).includes('Element 1'), 'Positionsangabe fehlt');
  });

  it('loest einen Code in Klartext auf', () => {
    const node = detail(recordOf("UNH+1+UTILMD:D:11A:UN'NAD+MS+9900000000001::293'UNT+3+1'"));

    assert.ok(textOf(node).includes('Absender der Nachricht'), 'Klartext zu NAD+MS fehlt');
  });

  it('weist einen unbelegten Code als nicht hinterlegt aus', () => {
    // Ein Code, der in den kuratierten Tabellen fehlt, ist unbelegt und nicht
    // ungueltig -- die Oberflaeche darf daraus keine Fehlermeldung machen.
    const node = detail(recordOf("UNH+1+UTILMD:D:11A:UN'NAD+ZZ+9900000000001::293'UNT+3+1'"));

    assert.ok(textOf(node).includes('nicht hinterlegt'));
  });

  it('dekodiert DTM in allen vier Zustaenden', () => {
    const node = detail(
      recordOf(
        "UNH+1+UTILMD:D:11A:UN'DTM+137:20260801:102'DTM+137:202608010815:203'" +
          "DTM+137:20260801:999'DTM+137:2026:102'UNT+6+1'",
      ),
    );
    const meanings = byClass(node, 'code-meaning').map(textOf);

    // Datum, Datum mit Uhrzeit, unbekanntes Formatkennzeichen, unpassender
    // Wert -- der Rohwert bleibt in allen vier Faellen stehen.
    assert.ok(meanings.includes('01.08.2026'), 'Datum nicht dekodiert');
    assert.ok(meanings.includes('01.08.2026 08:15'), 'Uhrzeit nicht dekodiert');
    assert.ok(meanings.includes('Format nicht hinterlegt'), 'unbekanntes Formatkennzeichen');
    assert.ok(meanings.includes('passt nicht zum Format'), 'unpassender Wert');
    assert.equal(byClass(node, 'code-invalid').length, 1);
    assert.ok(textOf(node).includes('20260801'), 'Rohwert nicht mehr sichtbar');
  });

  it('fasst eine anerkannte und eine abgelehnte Quittung zusammen', () => {
    const accepted = detail(recordOf("UNH+1+CONTRL:D:03B:UN'UCI+A+B+C+7'UNT+3+1'"));
    assert.ok(textOf(accepted).includes('Anerkannt, ohne Fehlermeldung'));
    assert.equal(byClass(accepted, 'ack-accepted').length, 1);

    const rejected = detail(recordOf("UNH+1+APERAK:D:07B:UN'ERC+Z29'UNT+3+1'"));
    assert.ok(textOf(rejected).includes('Abgelehnt'));
    assert.equal(byClass(rejected, 'ack-rejected').length, 1);
  });

  it('weist eine nicht geladene Referenz aus, statt sie zu verschweigen', () => {
    const record = recordOf("UNH+1+APERAK:D:07B:UN'UNT+2+1'", {
      referenceMessageID: 'DEMO-FEHLT-1',
    });
    const missing = byClass(detail(record), 'reference-missing');

    assert.equal(missing.length, 1);
    assert.ok(textOf(missing[0]).includes('DEMO-FEHLT-1'));
    assert.ok(textOf(missing[0]).includes('nicht geladen'));
  });

  it('springt zu einer geladenen Referenz', () => {
    const [target, source] = normalizeRecords([
      { ID: 'ziel', messageID: 'DEMO-1', payload: { payload: "UNH+1+UTILMD:D:11A:UN'UNT+2+1'" } },
      {
        ID: 'quelle',
        referenceMessageID: 'DEMO-1',
        payload: { payload: "UNH+1+APERAK:D:07B:UN'UNT+2+1'" },
      },
    ]);
    const node = detail(source, { chain: { target, sources: [] } });

    assert.ok(findNode(node, (entry) => entry.dataset.goto === target.id));
  });

  it('haengt an jeden Wert ein Kopierziel mit Text und Bezeichnung', () => {
    const node = detail(recordOf("UNH+1+UTILMD:D:11A:UN'BGM+E01+DOK-1+9'UNT+3+1'"));
    const value = findNode(node, (entry) => entry.dataset.copy === 'DOK-1');
    const segment = findNode(node, (entry) => entry.dataset.copyLabel === 'Segment BGM');

    assert.ok(value, 'kein Kopierziel fuer den Wert');
    assert.ok(value.dataset.copyLabel.length > 0, 'Kopierziel ohne Bezeichnung');
    assert.ok(segment, 'kein Kopierziel fuer die Segmentzeile');
    assert.ok(segment.dataset.copy.startsWith('BGM+'), 'Segmentzeile nicht vollstaendig');
  });

  it('zeigt die fachlichen Kennungen im Listeneintrag', () => {
    const record = recordOf("UNH+1+UTILMD:D:11A:UN'LOC+Z16+DEMO-MALO-0001'UNT+3+1'");
    const node = container();
    renderList(node, { records: [record], selectedId: null, query: '', page: 0, pageSize: 250 });

    const tags = byClass(node, 'record-tag').map(textOf);
    assert.ok(tags.some((entry) => entry.includes('DEMO-MALO-0001')));
  });

  it('bietet den CSV-Export der aktiven Nachricht an', () => {
    const payload = "UNH+1+UTILMD:D:11A:UN'UNT+2+1'UNH+2+APERAK:D:07B:UN'UNT+2+2'";
    const node = detail(recordOf(payload), { activeMessage: 1 });
    const button = findNode(node, (entry) => entry.dataset.exportSegments !== undefined);

    assert.ok(button, 'kein Export-Knopf');
    assert.equal(button.dataset.exportSegments, '1');
  });

  it('bietet die vorkommenden Segmenttypen mit Anzahl an', () => {
    const node = detail(recordOf("UNH+1+MSCONS:D:04B:UN'QTY+220:1'QTY+220:2'UNT+4+1'"));
    const chips = byClass(node, 'segment-chip');

    assert.deepEqual(
      chips.map((chip) => chip.dataset.segment),
      ['UNH', 'QTY', 'UNT'],
    );
    assert.equal(textOf(chips[1]), 'QTY2');
    assert.ok(chips.every((chip) => chip.attributes['aria-pressed'] === 'false'));
  });

  it('zeigt nur die gewaehlten Segmenttypen und sagt die Einschraenkung an', () => {
    const record = recordOf("UNH+1+MSCONS:D:04B:UN'QTY+220:1'QTY+220:2'LOC+172+ZP-1'UNT+5+1'");
    const node = detail(record, { segmentFilter: ['QTY'] });

    assert.equal(byClass(node, 'segment').length, 2);
    const status = byClass(node, 'segment-status')[0];
    assert.equal(status.attributes.role, 'status');
    assert.ok(textOf(status).includes('Gefiltert: 2 von 5 Segmenten'));
    assert.ok(textOf(status).includes('QTY'));
    assert.equal(byClass(node, 'segment-list-filtered').length, 1);
    assert.equal(
      byClass(node, 'segment-chip').find((chip) => chip.dataset.segment === 'QTY').attributes[
        'aria-pressed'
      ],
      'true',
    );
  });

  it('laesst mehrere Typen gleichzeitig zu', () => {
    const record = recordOf("UNH+1+MSCONS:D:04B:UN'QTY+220:1'LOC+172+ZP-1'UNT+4+1'");

    assert.equal(byClass(detail(record, { segmentFilter: ['QTY', 'LOC'] }), 'segment').length, 2);
  });

  it('ignoriert einen Typ, den die Nachricht nicht enthaelt', () => {
    // Sonst bliebe nach dem Wechsel der Nachricht eine leere Ansicht stehen.
    const record = recordOf("UNH+1+MSCONS:D:04B:UN'QTY+220:1'UNT+3+1'");
    const node = detail(record, { segmentFilter: ['ZZZ'] });

    assert.equal(byClass(node, 'segment').length, 3);
    assert.ok(textOf(byClass(node, 'segment-status')[0]).includes('Alle 3 Segmente'));
  });

  it('laesst die Rohdatenansicht vollstaendig', () => {
    const payload = "UNH+1+MSCONS:D:04B:UN'QTY+220:1'LOC+172+ZP-1'UNT+4+1'";
    const node = detail(recordOf(payload), { activeTab: 'raw', segmentFilter: ['QTY'] });

    assert.ok(textOf(node).includes('LOC+172+ZP-1'), 'Rohdaten wurden gefiltert');
    assert.equal(byClass(node, 'segment-filter').length, 0);
  });

  it('hebt Suchtreffer hervor', () => {
    const node = detail(recordOf("UNH+1+UTILMD:D:11A:UN'BGM+E01+DOK-1+9'UNT+3+1'"), {
      query: 'DOK-1',
    });
    const marks = nodes(node).filter((entry) => entry.tag === 'mark');

    assert.ok(marks.length > 0, 'keine Hervorhebung');
    assert.ok(marks.every((mark) => textOf(mark).toLowerCase() === 'dok-1'));
  });
});
