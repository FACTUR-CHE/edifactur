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

import { createDocument } from './dom-stub.js';

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
await import('../src/dom.js');
await import('../src/render.js');
await import('../src/app.js');

const element = (id) => document.getElementById(id);
const list = element('recordList');
const detail = element('detail');
const search = element('search');

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
