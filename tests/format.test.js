import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';
import '../src/format.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const { PLACEHOLDER, formatCount, formatDate, joinSegments, parseEdifact, splitByQuery } =
  globalThis.EdifactExplorer;

describe('formatDate', () => {
  it('formatiert einen gueltigen Zeitstempel', () => {
    const formatted = formatDate('2026-08-01T08:15:00Z');
    assert.notEqual(formatted, PLACEHOLDER);
    assert.ok(formatted.includes('2026'));
  });

  it('liefert den Platzhalter fuer leere Werte', () => {
    assert.equal(formatDate(''), PLACEHOLDER);
    assert.equal(formatDate(null), PLACEHOLDER);
    assert.equal(formatDate(undefined), PLACEHOLDER);
  });

  it('formatiert ein Datum ohne Zeitanteil', () => {
    assert.ok(formatDate('2026-08-01').includes('2026'));
  });

  it('akzeptiert einen Zeitstempel in Millisekunden', () => {
    assert.ok(formatDate(Date.UTC(2026, 7, 1)).includes('2026'));
  });

  it('gibt einen unlesbaren Wert unveraendert zurueck', () => {
    // Regression: die Pruefung lautete Number.isNaN(date) und war damit
    // immer false -- ungueltige Werte erschienen als "Invalid Date".
    assert.equal(formatDate('kein-datum'), 'kein-datum');
    assert.equal(formatDate('2026-13-45'), '2026-13-45');
  });

  it('erfindet aus Nicht-ISO-Eingaben kein Datum', () => {
    // Regression: new Date(string) ist fuer Nicht-ISO-Eingaben sehr
    // nachsichtig -- V8 las aus dem folgenden Wert den 1.1.2001.
    assert.equal(formatDate('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
    assert.equal(formatDate('1'), '1');
    assert.equal(formatDate('Dezember'), 'Dezember');
    assert.equal(formatDate('01.08.2026'), '01.08.2026');
  });
});

describe('formatCount', () => {
  it('setzt Tausendertrenner', () => {
    assert.equal(formatCount(1234), '1.234');
  });
});

describe('splitByQuery', () => {
  it('liefert bei leerem Text ein leeres Array', () => {
    assert.deepEqual(splitByQuery('', 'a'), []);
    assert.deepEqual(splitByQuery(null, 'a'), []);
  });

  it('liefert ohne Suchbegriff einen einzigen Abschnitt', () => {
    assert.deepEqual(splitByQuery('abc', ''), [{ text: 'abc', match: false }]);
    assert.deepEqual(splitByQuery('abc', '   '), [{ text: 'abc', match: false }]);
  });

  it('markiert einen Treffer', () => {
    assert.deepEqual(splitByQuery('abcde', 'cd'), [
      { text: 'ab', match: false },
      { text: 'cd', match: true },
      { text: 'e', match: false },
    ]);
  });

  it('ignoriert Gross- und Kleinschreibung, behaelt aber die Originalform', () => {
    assert.deepEqual(splitByQuery('UTILMD', 'util'), [
      { text: 'UTIL', match: true },
      { text: 'MD', match: false },
    ]);
    assert.deepEqual(splitByQuery('Utilmd-1', 'UTIL'), [
      { text: 'Util', match: true },
      { text: 'md-1', match: false },
    ]);
  });

  it('markiert alle Treffer', () => {
    assert.deepEqual(splitByQuery('a-a-a', 'a'), [
      { text: 'a', match: true },
      { text: '-', match: false },
      { text: 'a', match: true },
      { text: '-', match: false },
      { text: 'a', match: true },
    ]);
  });

  it('behandelt Regex-Metazeichen als normalen Text', () => {
    assert.deepEqual(splitByQuery('a.b', '.'), [
      { text: 'a', match: false },
      { text: '.', match: true },
      { text: 'b', match: false },
    ]);
    assert.deepEqual(splitByQuery('a+b', '+'), [
      { text: 'a', match: false },
      { text: '+', match: true },
      { text: 'b', match: false },
    ]);
  });

  it('sucht im Rohtext, nicht in maskiertem HTML', () => {
    // Regression: die Suche lief ueber den HTML-maskierten String. Ein
    // Suchbegriff wie "amp" traf dort das Innere von "&amp;" und zerstoerte
    // die Entity.
    assert.deepEqual(splitByQuery('A & B', 'amp'), [{ text: 'A & B', match: false }]);
    assert.deepEqual(splitByQuery('a<b', 'lt'), [{ text: 'a<b', match: false }]);

    assert.deepEqual(splitByQuery('A & B', '&'), [
      { text: 'A ', match: false },
      { text: '&', match: true },
      { text: ' B', match: false },
    ]);
  });

  it('liefert einen Abschnitt, wenn nichts trifft', () => {
    assert.deepEqual(splitByQuery('abc', 'z'), [{ text: 'abc', match: false }]);
  });

  it('markiert einen Treffer am Textende', () => {
    assert.deepEqual(splitByQuery('abc', 'c'), [
      { text: 'ab', match: false },
      { text: 'c', match: true },
    ]);
  });
});

describe('joinSegments', () => {
  const segmentsOf = (payload) => parseEdifact(payload).flatMap((group) => group.segments);

  it('setzt Segmente einzeilig wieder zusammen', () => {
    const payload = "UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'";

    assert.equal(joinSegments(segmentsOf(payload), "'"), payload);
  });

  it('setzt mit Zeilenumbruch ein Segment je Zeile', () => {
    const lines = joinSegments(segmentsOf("UNH+1+UTILMD'BGM+E01+1'UNT+3+1'"), "'", '\n');

    assert.deepEqual(lines.split('\n'), ["UNH+1+UTILMD'", "BGM+E01+1'", "UNT+3+1'"]);
  });

  it('verdoppelt den Abschluss des UNA-Headers nicht', () => {
    const payload = "UNA:+.? 'UNH+1+UTILMD'UNT+2+1'";

    assert.equal(joinSegments(segmentsOf(payload), "'"), payload);
  });

  it('behaelt die Maskierung eines Trennzeichens', () => {
    const payload = "FTX+ACB+++Betrag ?+ Zuschlag'";

    assert.equal(joinSegments(segmentsOf(payload), "'"), payload);
  });

  it('arbeitet mit abweichenden Trennzeichen', () => {
    const payload = 'UNA|;,* ~UNH;1;UTILMD~UNT;2;1~';

    assert.equal(joinSegments(segmentsOf(payload), '~'), payload);
  });

  it('liefert fuer eine leere Segmentliste eine leere Zeichenkette', () => {
    assert.equal(joinSegments([], "'"), '');
  });

  it('liefert fuer eine unbrauchbare Eingabe eine leere Zeichenkette', () => {
    assert.equal(joinSegments(null, "'"), '');
    assert.equal(joinSegments(undefined, "'"), '');
  });
});
