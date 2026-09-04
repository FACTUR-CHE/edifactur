import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';
import '../src/format.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const {
  DATE_FORMATS,
  PLACEHOLDER,
  decodeDateTime,
  formatCount,
  formatDate,
  joinSegments,
  parseEdifact,
  splitByQuery,
} = globalThis.EdifactExplorer;

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

describe('decodeDateTime', () => {
  const ok = (value, format) => {
    const result = decodeDateTime(value, format);
    assert.equal(result.status, 'ok', `Format ${format} sollte lesbar sein: ${result.error ?? ''}`);
    return result.text;
  };

  it('liest 102 als Kalenderdatum', () => {
    assert.equal(ok('20260801', '102'), '01.08.2026');
  });

  it('liest 203 als Datum mit Uhrzeit', () => {
    assert.equal(ok('202608010815', '203'), '01.08.2026 08:15');
  });

  it('liest 204 mit Sekunden', () => {
    assert.equal(ok('20260801081530', '204'), '01.08.2026 08:15:30');
  });

  it('weist bei 303 den UTC-Versatz aus, ohne ihn zu verrechnen', () => {
    assert.equal(ok('202608010815+02', '303'), '01.08.2026 08:15 (UTC+02)');
    assert.equal(ok('202608010815-05', '303'), '01.08.2026 08:15 (UTC-05)');
  });

  it('akzeptiert bei 303 einen einstelligen Versatz', () => {
    // In der Marktkommunikation kommen ?+00, ?+1 und ?+2 alle vor.
    assert.equal(ok('201002011100+1', '303'), '01.02.2010 11:00 (UTC+01)');
    assert.equal(ok('200710012200+00', '303'), '01.10.2007 22:00 (UTC+00)');
  });

  it('meldet einen fehlenden Versatz bei 303', () => {
    const result = decodeDateTime('202608010815', '303');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /UTC-Versatz/);
  });

  it('liest 106 ohne Jahresangabe und sagt das', () => {
    assert.equal(ok('0801', '106'), '01.08. (ohne Jahresangabe)');
  });

  it('liest 610 als Monat im Jahr', () => {
    assert.equal(ok('202608', '610'), '08.2026');
  });

  it('liest 616 als Kalenderwoche', () => {
    assert.equal(ok('202631', '616'), 'Woche 31/2026');
  });

  it('liest 401 als Uhrzeit', () => {
    assert.equal(ok('0815', '401'), '08:15');
  });

  it('liest 305 ohne Jahresangabe', () => {
    assert.equal(ok('08010815', '305'), '01.08. 08:15 (ohne Jahresangabe)');
  });

  it('ergaenzt bei zweistelligem Jahr keine Jahrhundertlage', () => {
    // 101 fuehrt YYMMDD. Das Jahrhundert stuende nicht in der Nachricht,
    // also wird es auch nicht angezeigt.
    assert.equal(ok('260801', '101'), '01.08.26');
    assert.equal(ok('010826', '2'), '01.08.26');
    assert.equal(ok('2608010815', '201'), '01.08.26 08:15');
  });

  it('liest 719 als Zeitraum', () => {
    assert.equal(ok('202608010815-202608020815', '719'), '01.08.2026 08:15 – 02.08.2026 08:15');
  });

  it('meldet einen unvollstaendigen Zeitraum', () => {
    const result = decodeDateTime('202608010815', '719');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /Anfang und Ende/);
  });

  it('raet bei unbekanntem Formatkennzeichen nicht', () => {
    assert.deepEqual(decodeDateTime('202608010815', '999'), { status: 'unknown' });
    assert.deepEqual(decodeDateTime('20260801', 'ZZ'), { status: 'unknown' });
  });

  it('meldet eine falsche Laenge', () => {
    const result = decodeDateTime('2026080', '102');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /7 Zeichen, das Format erwartet 8/);
  });

  it('meldet nicht numerische Zeichen', () => {
    const result = decodeDateTime('2026080X', '102');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /Zeichen, die in diesem Format nicht vorkommen/);
  });

  it('meldet einen Monat ausserhalb des Bereichs', () => {
    const result = decodeDateTime('20261301', '102');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /Monat 13 liegt außerhalb von 1–12/);
  });

  it('meldet eine Stunde ausserhalb des Bereichs', () => {
    const result = decodeDateTime('202608012500', '203');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /Stunde 25/);
  });

  it('meldet ein Datum, das es nicht gibt', () => {
    const result = decodeDateTime('20260230', '102');

    assert.equal(result.status, 'invalid');
    assert.match(result.error, /Den 30\.02\.2026 gibt es nicht/);
  });

  it('erkennt den 29. Februar in einem Schaltjahr an', () => {
    assert.equal(ok('20240229', '102'), '29.02.2024');
  });

  it('trifft ohne Wert oder Formatkennzeichen keine Aussage', () => {
    assert.equal(decodeDateTime('', '102'), null);
    assert.equal(decodeDateTime('20260801', ''), null);
    assert.equal(decodeDateTime('20260801', null), null);
    assert.equal(decodeDateTime(null, '102'), null);
  });

  it('ignoriert umgebende Leerzeichen', () => {
    assert.equal(ok(' 20260801 ', ' 102 '), '01.08.2026');
  });

  it('deckt jedes hinterlegte Formatkennzeichen ab', () => {
    for (const format of Object.keys(DATE_FORMATS)) {
      assert.notDeepEqual(
        decodeDateTime('202608010815+02', format),
        { status: 'unknown' },
        `Formatkennzeichen ${format} wird nicht erkannt`,
      );
    }
  });
});

describe('splitByQuery mit mehreren Begriffen', () => {
  const marked = (text, query) =>
    splitByQuery(text, query)
      .filter((part) => part.match)
      .map((part) => part.text);

  it('hebt mehrere Begriffe hervor', () => {
    assert.deepEqual(marked('Meier in DEMO-1', ['Meier', 'DEMO-1']), ['Meier', 'DEMO-1']);
  });

  it('verhaelt sich bei einem einzelnen Begriff wie bisher', () => {
    assert.deepEqual(splitByQuery('abcabc', ['b']), [
      { text: 'a', match: false },
      { text: 'b', match: true },
      { text: 'ca', match: false },
      { text: 'b', match: true },
      { text: 'c', match: false },
    ]);
  });

  it('gibt bei gleicher Position dem laengeren Begriff den Vorrang', () => {
    // Sonst haenge das Ergebnis von der Reihenfolge der Begriffe ab.
    assert.deepEqual(marked('DEMO-MALO-1', ['DEMO', 'DEMO-MALO']), ['DEMO-MALO']);
    assert.deepEqual(marked('DEMO-MALO-1', ['DEMO-MALO', 'DEMO']), ['DEMO-MALO']);
  });

  it('ignoriert leere Begriffe in der Liste', () => {
    assert.deepEqual(marked('abc', ['', '  ', 'b']), ['b']);
  });

  it('liefert bei leerer Liste einen unmarkierten Abschnitt', () => {
    assert.deepEqual(splitByQuery('abc', []), [{ text: 'abc', match: false }]);
  });

  it('ignoriert Gross- und Kleinschreibung', () => {
    assert.deepEqual(marked('Meier', ['meier']), ['Meier']);
  });
});
