/**
 * Rauchtest der Verdrahtung.
 *
 * app.js hatte bis hierher keinen Testhaken: die Tastenwege aus #17 waren
 * durch 319 gruene Tests gelaufen und funktionierten trotzdem nicht, weil der
 * Fokus nach dem Zeichnen auf dem Seitenrumpf liegt und die Pfeiltasten nur
 * innerhalb der Trefferliste galten. Ein Fehler in der Verdrahtung zeigt sich
 * sonst erst beim Benutzen.
 *
 * Geprueft wird der Weg vom Ereignis bis in den Zustand -- nicht das Aussehen.
 *
 * app.js laesst sich nur einmal je Prozess laden: es liest die DOM-Knoten beim
 * Laden auf und haengt die Ereignisbehandlung an. Alle Faelle teilen sich
 * deshalb ein Dokument und bauen aufeinander auf.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { byClass, createDocument } from './dom-stub.js';

const document = createDocument({ tags: { search: 'input', messageInput: 'textarea' } });

// Der Datei-Import laeuft ueber einen FileReader; die Attrappe liefert die
// Beispieldatei sofort aus.
const sample = readFileSync(new URL('../data/sample-messages.json', import.meta.url), 'utf8');
globalThis.FileReader = class {
  readAsText() {
    this.result = sample;
    this.onload();
  }
};

await import('../src/edifact.js');
await import('../src/segments.js');
await import('../src/codes.js');
await import('../src/format.js');
await import('../src/records.js');
await import('../src/export.js');
await import('../src/diff.js');
await import('../src/dom.js');
await import('../src/render.js');
await import('../src/app.js');

const element = (id) => document.getElementById(id);
const list = element('recordList');
const detail = element('detail');
const search = element('search');

// Die Liste ist virtualisiert: ohne Sichthoehe zeichnete sie nur den
// Ueberhang. 2000 Pixel fassen die 15 Datensaetze der Beispieldatei.
list.clientHeight = 2000;

// Wie in index.html: jedes Filterfeld traegt eine "Alle ..."-Option, die das
// Neufuellen ueberlebt.
for (const id of ['formatFilter', 'directionFilter', 'statusFilter', 'categoryFilter']) {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = 'Alle';
  element(id).append(option);
}

/** @returns {StubNode[]} Die gezeichneten Listeneintraege. */
const records = () => list.querySelectorAll('[data-id]');

/** @returns {string|undefined} Kennung des ausgewaehlten Datensatzes. */
const selectedId = () => list.querySelector('[aria-current="true"]')?.dataset.id;

/**
 * Drueckt eine Taste. Ziel ist standardmaessig der fokussierte Knoten -- der
 * Punkt, an dem der gemeldete Fehler haftete.
 *
 * @returns {boolean} Ob die Anwendung die Taste an sich genommen hat.
 */
function press(key, target = document.activeElement) {
  let prevented = false;
  document.dispatch('keydown', { key, target, preventDefault: () => (prevented = true) });
  return prevented;
}

describe('Start und Datei-Import', () => {
  it('meldet den vollstaendigen Start', () => {
    assert.equal(document.documentElement.dataset.appReady, 'true');
  });

  it('zeichnet die Beispieldatei und waehlt den ersten Datensatz', () => {
    element('fileInput').dispatch('change', {
      currentTarget: { files: [{ name: 'sample-messages.json' }], value: '' },
    });

    assert.equal(records().length, 15);
    assert.equal(selectedId(), 'demo-aperak-001');
    assert.equal(element('app').hidden, false);
  });
});

describe('Auswahl mit der Maus', () => {
  it('uebernimmt den angeklickten Datensatz', () => {
    list.dispatch('click', { target: records()[2] });

    assert.equal(selectedId(), 'demo-contrl-001');
  });

  it('laesst den Fokus auf dem ausgewaehlten Eintrag', () => {
    // Regression: `render` baut die Liste neu auf, der angeklickte Knopf ist
    // danach fort. Ohne Nachzug fiel der Fokus auf den Rumpf zurueck.
    assert.ok(list.contains(document.activeElement));
    assert.equal(document.activeElement.dataset.id, 'demo-contrl-001');
  });
});

describe('Tastenwege', () => {
  it('waehlt mit den Pfeiltasten weiter, auch ohne Fokus in der Liste', () => {
    // Der gemeldete Fehler: nach dem Zeichnen liegt der Fokus auf dem Rumpf,
    // und dort taten die Pfeiltasten nichts -- also fast immer.
    document.activeElement = document.body;

    assert.equal(press('ArrowDown', document.body), true);
    assert.equal(selectedId(), 'demo-invoic-001');
  });

  it('waehlt mit j und k vor und zurueck', () => {
    assert.equal(press('j', document.body), true);
    assert.equal(selectedId(), 'demo-mscons-001');

    assert.equal(press('k', document.body), true);
    assert.equal(selectedId(), 'demo-invoic-001');
  });

  it('ueberlaesst die Pfeiltasten dem Detailbereich', () => {
    // Dort rollen sie eine lange Nachricht und bedienen die Reiter.
    const inDetail = detail.querySelector('[data-tab]');

    assert.equal(press('ArrowDown', inDetail), false);
    assert.equal(selectedId(), 'demo-invoic-001');
  });

  it('setzt den Fokus mit / in die Suche', () => {
    assert.equal(press('/', document.body), true);
    assert.equal(document.activeElement, search);
  });

  it('greift nicht, waehrend in einem Feld getippt wird', () => {
    assert.equal(press('j', search), false);
    assert.equal(press('/', search), false);
    assert.equal(selectedId(), 'demo-invoic-001');
  });

  it('laesst die Kuerzel bei gedrueckter Steuerungstaste durch', () => {
    let prevented = false;
    document.dispatch('keydown', {
      key: 'j',
      target: document.body,
      ctrlKey: true,
      preventDefault: () => (prevented = true),
    });

    assert.equal(prevented, false);
  });

  it('haelt an den Enden der Liste an', () => {
    while (selectedId() !== records()[0].dataset.id) press('k', document.body);

    assert.equal(press('k', document.body), true);
    assert.equal(selectedId(), 'demo-aperak-001');
  });
});

describe('Farbschema', () => {
  const root = document.documentElement;
  const themeSelect = element('themeSelect');

  it('folgt beim Start der Systemeinstellung', () => {
    // Ohne gespeicherte Wahl bleibt das Attribut weg, damit
    // `prefers-color-scheme` im Stylesheet entscheidet.
    assert.equal(root.dataset.theme, undefined);
    assert.equal(themeSelect.value, 'system');
  });

  it('uebernimmt eine ausdrueckliche Wahl', () => {
    themeSelect.value = 'dark';
    themeSelect.dispatch('change');

    assert.equal(root.dataset.theme, 'dark');
  });

  it('nimmt das Attribut fuer die Systemeinstellung wieder weg', () => {
    themeSelect.value = 'system';
    themeSelect.dispatch('change');

    assert.equal(root.dataset.theme, undefined);
  });

  it('vertraegt eine gesperrte Ablage', () => {
    // Im privaten Fenster und unter file:// wirft schon der Zugriff. Die Wahl
    // gilt dann fuer die Sitzung -- sie nicht speichern zu koennen ist kein
    // Grund, sie nicht anzuwenden.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Zugriff verweigert');
      },
    });

    try {
      themeSelect.value = 'light';
      themeSelect.dispatch('change');
      assert.equal(root.dataset.theme, 'light');
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    }

    themeSelect.value = 'system';
    themeSelect.dispatch('change');
  });
});

describe('Virtualisierte Liste', () => {
  /** Rollt die Liste und loest das Ereignis aus, wie der Browser es tut. */
  const scrollTo = (top) => {
    list.scrollTop = top;
    list.dispatch('scroll');
  };

  it('zeichnet nur den sichtbaren Ausschnitt', () => {
    // Sichthoehe auf zwei Zeilen: mehr als der Ausschnitt darf nicht im Baum
    // stehen, sonst legte der Browser bei 50.000 Treffern alles an.
    list.clientHeight = 224;
    scrollTo(0);

    assert.ok(records().length < 15, `${records().length} statt weniger als 15`);
    assert.equal(records()[0].dataset.id, 'demo-aperak-001');
  });

  it('zeigt beim Rollen die Eintraege weiter unten', () => {
    scrollTo(112 * 10);

    const shown = records().map((entry) => entry.dataset.id);
    assert.ok(shown.includes('demo-utilmd-001'), shown.join(', '));
    assert.ok(!shown.includes('demo-aperak-001'), 'der Anfang steht noch im Baum');
  });

  it('bewegt die Auswahl auch ausserhalb des Fensters weiter', () => {
    // Die Tastatur arbeitet auf der ganzen Trefferliste, nicht auf dem
    // gezeichneten Ausschnitt: ein Schritt geht von der Auswahl aus, nicht
    // vom Anfang des Fensters.
    while (selectedId() !== 'demo-utilmd-batch-001') press('j', document.body);
    scrollTo(0);

    press('k', document.body);
    assert.equal(selectedId(), 'demo-malo-negative-001');
  });

  it('rollt den gewaehlten Eintrag in den Blick', () => {
    scrollTo(0);
    assert.equal(list.scrollTop, 0);

    while (selectedId() !== 'demo-utilmd-batch-001') press('j', document.body);

    assert.ok(list.scrollTop > 0, 'die Liste ist nicht mitgerollt');
    assert.ok(list.contains(document.activeElement), 'Fokus ausserhalb der Liste');
  });

  it('stellt die volle Sichthoehe wieder her', () => {
    list.clientHeight = 2000;
    scrollTo(0);

    assert.equal(records().length, 15);
  });
});

describe('Vergleich', () => {
  /** @returns {StubNode|undefined} Der Merk-Knopf der offenen Nachricht. */
  const pinButton = () => detail.querySelector('[data-compare]');

  /**
   * Waehlt einen Datensatz und darin die fachliche Nachricht.
   *
   * `derived.messages` fuehrt auch die Huellgruppen: Gruppe 0 ist der UNB-Kopf,
   * die Nachricht mit UNH steht dahinter. Der Vergleich soll auf ihr laufen.
   */
  const select = (id) => {
    list.dispatch('click', { target: records().find((entry) => entry.dataset.id === id) });
    const tab = detail.querySelector('[data-message="1"]');
    if (tab) detail.dispatch('click', { target: tab });
  };

  it('merkt die offene Nachricht', () => {
    select('demo-utilmd-001');
    // Der Klick laeuft ueber den Detailbereich: dort haengt die Delegation.
    detail.dispatch('click', { target: pinButton() });

    assert.equal(pinButton().attributes['aria-pressed'], 'true');
    // Solange dieselbe Nachricht offen ist, gibt es nichts zu vergleichen.
    assert.equal(Boolean(detail.querySelector('[data-tab="diff"]')), false);
  });

  it('bietet den Vergleich an, sobald eine andere Nachricht offen ist', () => {
    select('demo-malo-positive-001');

    assert.ok(detail.querySelector('[data-tab="diff"]'), 'kein Vergleichsreiter');
  });

  it('zeichnet den Vergleich und benennt beide Seiten', () => {
    detail.dispatch('click', { target: detail.querySelector('[data-tab="diff"]') });

    assert.ok(byClass(detail, 'diff-row').length > 0, 'keine Vergleichszeilen');
    assert.ok(detail.textContent.includes('Gemerkt'), 'die Seiten sind nicht benannt');
    // Beide Nachrichten tragen dasselbe LOC-Segment.
    assert.ok(byClass(detail, 'diff-row-equal').length > 0, 'kein gleiches Segment erkannt');
  });

  it('blendet die gleichen Segmente auf Wunsch aus', () => {
    const before = byClass(detail, 'diff-row').length;
    detail.dispatch('click', { target: detail.querySelector('[data-diff-only]') });

    assert.equal(detail.querySelector('[data-diff-only]').attributes['aria-pressed'], 'true');
    assert.equal(byClass(detail, 'diff-row-equal').length, 0);
    assert.ok(byClass(detail, 'diff-row').length < before, 'nichts ausgeblendet');
  });

  it('laesst sich aus der Vergleichsansicht heraus aufheben', () => {
    // Der Merk-Knopf steht in der strukturierten Ansicht; von hier aus
    // muesste man sonst erst den Reiter wechseln.
    detail.dispatch('click', { target: detail.querySelector('[data-compare-clear]') });

    assert.equal(Boolean(detail.querySelector('[data-tab="diff"]')), false);
    assert.ok(byClass(detail, 'segment').length > 0, 'keine Segmente');
    assert.equal(pinButton().attributes['aria-pressed'], 'false');
  });
});

describe('Suche und Zuruecksetzen', () => {
  it('filtert ueber das Suchfeld', () => {
    search.value = 'aperak';
    search.dispatch('input');

    // Die Eingabe ist entprellt; der Aufbau folgt erst nach der Wartezeit.
    return new Promise((resolve) =>
      setTimeout(() => {
        assert.equal(records().length, 2);
        resolve();
      }, 200),
    );
  });

  it('leert die Suche mit Escape und zeigt wieder alles', () => {
    assert.equal(press('Escape', search), true);
    assert.equal(search.value, '');

    return new Promise((resolve) =>
      setTimeout(() => {
        assert.equal(records().length, 15);
        resolve();
      }, 200),
    );
  });
});
