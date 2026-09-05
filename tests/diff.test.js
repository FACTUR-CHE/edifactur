import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';
import '../src/diff.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const { diffMessages, elementChanges, parseEdifact, segmentKey } = globalThis.EdifactExplorer;

/** @returns {object} Erste Nachricht einer Nutzlast. */
const message = (payload) => parseEdifact(payload)[0];

/** @returns {string[]} Zustand und Tag je Zeile, knapp lesbar. */
const shape = (result) => result.rows.map((row) => `${row.status} ${(row.left ?? row.right).tag}`);

describe('segmentKey', () => {
  it('unterscheidet Segmente mit gleichem Text an anderer Stelle', () => {
    // Ohne Trenner im Schluessel waeren "AB"+"C" und "A"+"BC" dasselbe.
    const [a, b] = message("UNH+1+X'RFF+AB:C'RFF+A:BC'UNT+4+1'").segments.slice(1, 3);

    assert.notEqual(segmentKey(a), segmentKey(b));
  });

  it('haelt wertgleiche Segmente zusammen', () => {
    const left = message("UNH+1+X'QTY+220:42'UNT+3+1'").segments[1];
    const right = message("UNH+1+X'QTY+220:42'UNT+3+1'").segments[1];

    assert.equal(segmentKey(left), segmentKey(right));
  });
});

describe('elementChanges', () => {
  const changes = (before, after) =>
    elementChanges(message(before).segments[1], message(after).segments[1]);

  it('nennt Position, alten und neuen Wert', () => {
    assert.deepEqual(changes("UNH+1+X'QTY+220:42'UNT+3+1'", "UNH+1+X'QTY+220:43'UNT+3+1'"), [
      { position: '1.2', left: '42', right: '43' },
    ]);
  });

  it('meldet ein hinzugekommenes Datenelement mit leerer Gegenseite', () => {
    assert.deepEqual(changes("UNH+1+X'RFF+ACE'UNT+3+1'", "UNH+1+X'RFF+ACE:REF-1'UNT+3+1'"), [
      { position: '1.2', left: '', right: 'REF-1' },
    ]);
  });

  it('schweigt bei gleichen Werten', () => {
    assert.deepEqual(changes("UNH+1+X'QTY+220:42'UNT+3+1'", "UNH+1+X'QTY+220:42'UNT+3+1'"), []);
  });

  it('numeriert ein einfaches Datenelement ohne Komponente', () => {
    assert.deepEqual(changes("UNH+1+X'FTX+ABO+++alt'UNT+3+1'", "UNH+1+X'FTX+ABO+++neu'UNT+3+1'"), [
      { position: '4', left: 'alt', right: 'neu' },
    ]);
  });
});

describe('diffMessages', () => {
  it('meldet zwei gleiche Nachrichten als durchgehend gleich', () => {
    const payload = "UNH+1+UTILMD:D:11A:UN'BGM+E01+DOK-1+9'QTY+220:42'UNT+4+1'";
    const result = diffMessages(message(payload), message(payload));

    assert.deepEqual(result.summary, { equal: 4, added: 0, removed: 0, changed: 0, moved: 0 });
    assert.equal(result.truncated, false);
  });

  it('erkennt einen geaenderten Wert als Aenderung, nicht als Austausch', () => {
    const result = diffMessages(
      message("UNH+1+X'QTY+220:42'UNT+3+1'"),
      message("UNH+1+X'QTY+220:43'UNT+3+1'"),
    );

    assert.deepEqual(shape(result), ['equal UNH', 'changed QTY', 'equal UNT']);
    assert.deepEqual(result.rows[1].changes, [{ position: '1.2', left: '42', right: '43' }]);
  });

  it('erkennt ein hinzugefuegtes und ein entferntes Segment', () => {
    const added = diffMessages(message("UNH+1+X'UNT+2+1'"), message("UNH+1+X'QTY+220:42'UNT+3+1'"));
    assert.deepEqual(shape(added), ['equal UNH', 'added QTY', 'changed UNT']);

    const removed = diffMessages(
      message("UNH+1+X'QTY+220:42'UNT+3+1'"),
      message("UNH+1+X'UNT+2+1'"),
    );
    assert.deepEqual(shape(removed), ['equal UNH', 'removed QTY', 'changed UNT']);
  });

  it('gibt einen Reihenfolgeunterschied nicht als Wertaenderung aus', () => {
    // Beide Segmente stehen wortgleich auf beiden Seiten -- inhaltlich hat
    // sich nichts geaendert, nur die Stelle.
    const result = diffMessages(
      message("UNH+1+X'QTY+220:42'LOC+172:ZP-1'UNT+4+1'"),
      message("UNH+1+X'LOC+172:ZP-1'QTY+220:42'UNT+4+1'"),
    );

    assert.equal(result.summary.changed, 0);
    assert.equal(result.summary.moved, 2);
    assert.equal(result.summary.added, 0);
    assert.equal(result.summary.removed, 0);
  });

  it('haelt verschiedene Segmenttypen auseinander', () => {
    // Zwei verschiedene Tags an derselben Stelle sind zwei Segmente und nicht
    // eines mit geaenderten Werten.
    const result = diffMessages(
      message("UNH+1+X'QTY+220:42'UNT+3+1'"),
      message("UNH+1+X'MOA+9:42'UNT+3+1'"),
    );

    assert.deepEqual(shape(result), ['equal UNH', 'removed QTY', 'added MOA', 'equal UNT']);
  });

  it('vertraegt unterschiedliche Segmentzahlen', () => {
    const result = diffMessages(
      message("UNH+1+X'QTY+220:1'QTY+220:2'QTY+220:3'UNT+5+1'"),
      message("UNH+1+X'QTY+220:1'UNT+3+1'"),
    );

    assert.equal(result.summary.removed, 2);
    assert.equal(result.summary.equal, 2);
  });

  it('vertraegt eine leere und eine fehlende Nachricht', () => {
    const only = message("UNH+1+X'UNT+2+1'");

    assert.deepEqual(diffMessages(null, null), {
      rows: [],
      summary: { equal: 0, added: 0, removed: 0, changed: 0, moved: 0 },
      truncated: false,
    });
    assert.equal(diffMessages(null, only).summary.added, 2);
    assert.equal(diffMessages(only, null).summary.removed, 2);
    assert.equal(diffMessages({ segments: [] }, { segments: [] }).rows.length, 0);
  });

  it('haelt jede Zeile auf genau einer Seite oder auf beiden', () => {
    const result = diffMessages(
      message("UNH+1+X'QTY+220:42'RFF+ACE:A'UNT+4+1'"),
      message("UNH+1+X'QTY+220:43'UNT+3+1'"),
    );

    for (const row of result.rows) {
      if (row.status === 'added') assert.equal(row.left, null);
      if (row.status === 'removed') assert.equal(row.right, null);
      if (row.status === 'equal' || row.status === 'changed') {
        assert.ok(row.left && row.right, `${row.status} ohne beide Seiten`);
      }
    }
  });

  it('zaehlt jede Zeile genau einmal', () => {
    const result = diffMessages(
      message("UNH+1+X'QTY+220:1'LOC+172:A'UNT+4+1'"),
      message("UNH+1+X'QTY+220:2'MOA+9:5'UNT+4+1'"),
    );
    const counted = Object.values(result.summary).reduce((sum, value) => sum + value, 0);

    assert.equal(counted, result.rows.length);
  });
});
