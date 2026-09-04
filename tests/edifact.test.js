import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const {
  DEFAULT_DELIMITERS,
  UNKNOWN_MESSAGE_TYPE,
  UNKNOWN_SEGMENT_LABEL,
  hasUnaHeader,
  parseEdifact,
  readDelimiters,
  segmentLabel,
  splitEdifact,
  splitKeepingRelease,
  unescapeEdifact,
  validateEdifactSyntax,
} = globalThis.EdifactExplorer;

describe('splitEdifact', () => {
  it('zerlegt am Trennzeichen', () => {
    assert.deepEqual(splitEdifact('a+b+c', '+', '?'), ['a', 'b', 'c']);
  });

  it('gibt bei fehlendem Trennzeichen ein einelementiges Array zurueck', () => {
    assert.deepEqual(splitEdifact('abc', '+', '?'), ['abc']);
  });

  it('behaelt leere Abschnitte', () => {
    assert.deepEqual(splitEdifact('a++c', '+', '?'), ['a', '', 'c']);
  });

  it('hebt die Sonderbedeutung nach dem Release-Zeichen auf', () => {
    assert.deepEqual(splitEdifact('a?+b+c', '+', '?'), ['a+b', 'c']);
  });

  it('erlaubt ein maskiertes Release-Zeichen', () => {
    assert.deepEqual(splitEdifact('a??b', '+', '?'), ['a?b']);
  });

  it('uebernimmt ein Release-Zeichen am Ende als Nutzdatenzeichen', () => {
    assert.deepEqual(splitEdifact('ab?', '+', '?'), ['ab?']);
  });

  it('verarbeitet die leere Eingabe', () => {
    assert.deepEqual(splitEdifact('', '+', '?'), ['']);
  });
});

describe('splitKeepingRelease', () => {
  it('zerlegt am Trennzeichen', () => {
    assert.deepEqual(splitKeepingRelease('a+b+c', '+', '?'), ['a', 'b', 'c']);
  });

  it('laesst die Maskierung stehen', () => {
    assert.deepEqual(splitKeepingRelease('a?+b+c', '+', '?'), ['a?+b', 'c']);
  });

  it('laesst ein maskiertes Release-Zeichen stehen', () => {
    assert.deepEqual(splitKeepingRelease('a??+b', '+', '?'), ['a??', 'b']);
  });

  it('behaelt ein Release-Zeichen am Ende', () => {
    assert.deepEqual(splitKeepingRelease('ab?', '+', '?'), ['ab?']);
  });

  it('verarbeitet die leere Eingabe', () => {
    assert.deepEqual(splitKeepingRelease('', '+', '?'), ['']);
  });
});

describe('unescapeEdifact', () => {
  it('hebt die Maskierung auf', () => {
    assert.equal(unescapeEdifact('a?+b', '?'), 'a+b');
  });

  it('gibt ein maskiertes Release-Zeichen einmal aus', () => {
    assert.equal(unescapeEdifact('a??b', '?'), 'a?b');
  });

  it('uebernimmt ein Release-Zeichen am Ende als Nutzdatenzeichen', () => {
    assert.equal(unescapeEdifact('ab?', '?'), 'ab?');
  });

  it('laesst unmaskierten Text unveraendert', () => {
    assert.equal(unescapeEdifact('abc', '?'), 'abc');
  });
});

describe('readDelimiters', () => {
  it('liefert die Voreinstellung ohne UNA-Header', () => {
    assert.equal(readDelimiters("UNB+UNOC:3+1+2+260801:0815+REF'"), DEFAULT_DELIMITERS);
  });

  it('liest die Trennzeichen aus dem UNA-Header', () => {
    assert.deepEqual(readDelimiters("UNA:+.? 'UNB+"), {
      component: ':',
      element: '+',
      release: '?',
      segment: "'",
    });
  });

  it('liest auch abweichende Trennzeichen', () => {
    // UNA | ; , * ␠ ~   ->  Komponente |, Element ;, Release *, Segment ~
    assert.deepEqual(readDelimiters('UNA|;,* ~UNB;'), {
      component: '|',
      element: ';',
      release: '*',
      segment: '~',
    });
  });

  it('ignoriert einen abgeschnittenen UNA-Header', () => {
    assert.equal(readDelimiters('UNA:+.'), DEFAULT_DELIMITERS);
  });
});

describe('hasUnaHeader', () => {
  it('erkennt einen vollstaendigen Header', () => {
    assert.equal(hasUnaHeader("UNA:+.? 'UNB"), true);
  });

  it('lehnt Nicht-Strings ab', () => {
    assert.equal(hasUnaHeader(null), false);
    assert.equal(hasUnaHeader(42), false);
  });
});

describe('segmentLabel', () => {
  it('liefert die fachliche Bezeichnung', () => {
    assert.equal(segmentLabel('UNH'), 'Nachrichtenkopf');
  });

  it('faellt bei unbekannten Tags zurueck', () => {
    assert.equal(segmentLabel('XYZ'), UNKNOWN_SEGMENT_LABEL);
  });
});

describe('parseEdifact', () => {
  it('liefert bei ungueltiger Eingabe ein leeres Array', () => {
    assert.deepEqual(parseEdifact(''), []);
    assert.deepEqual(parseEdifact(null), []);
    assert.deepEqual(parseEdifact(undefined), []);
    assert.deepEqual(parseEdifact(123), []);
  });

  it('weist den UNA-Header als eigenes Segment aus statt ihn zu zerlegen', () => {
    const [group] = parseEdifact("UNA:+.? 'UNB+UNOC:3+1+2+260801:0815+REF'");
    const una = group.segments[0];

    assert.equal(una.tag, 'UNA');
    assert.deepEqual(una.elements, [':', '+', '.', '?', ' ', "'"]);
    assert.equal(una.raw, "UNA:+.? '");
    // Frueher entstand hier ein Segment mit dem Tag "UNA:".
    assert.ok(group.segments.every((segment) => !segment.tag.includes(':')));
  });

  it('trennt Huellsegmente und Nachricht in eigene Gruppen', () => {
    const payload =
      "UNB+UNOC:3+1+2+260801:0815+REF'" +
      "UNH+1+APERAK:D:07B:UN:2.1'BGM+313+1+9'UNT+3+1'" +
      "UNZ+1+REF'";
    const groups = parseEdifact(payload);

    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.map((group) => group.type),
      [UNKNOWN_MESSAGE_TYPE, 'APERAK', UNKNOWN_MESSAGE_TYPE],
    );
    assert.deepEqual(
      groups[1].segments.map((segment) => segment.tag),
      ['UNH', 'BGM', 'UNT'],
    );
  });

  it('erkennt mehrere Nachrichten in einer Nutzlast', () => {
    const payload =
      "UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'" + "UNH+2+MSCONS:D:04B:UN'BGM+7+2'UNT+3+2'";
    const groups = parseEdifact(payload);

    assert.deepEqual(
      groups.map((group) => group.type),
      ['UTILMD', 'MSCONS'],
    );
  });

  it('gruppiert eine Nachricht ohne UNT korrekt ab', () => {
    const groups = parseEdifact("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'");

    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'UTILMD');
    assert.equal(groups[0].segments.length, 2);
  });

  it('zerlegt Elemente und behaelt die Rohform', () => {
    const [group] = parseEdifact("UNH+1+UTILMD:D:11A:UN'");
    const [segment] = group.segments;

    assert.equal(segment.tag, 'UNH');
    assert.deepEqual(segment.elements, ['1', 'UTILMD:D:11A:UN']);
    assert.equal(segment.raw, 'UNH+1+UTILMD:D:11A:UN');
  });

  it('zerlegt Elemente zusaetzlich in Komponenten', () => {
    const [group] = parseEdifact("UNH+1+UTILMD:D:11A:UN:5.1e'");
    const [segment] = group.segments;

    assert.deepEqual(segment.components, [['1'], ['UTILMD', 'D', '11A', 'UN', '5.1e']]);
  });

  it('behaelt leere Komponenten', () => {
    const [group] = parseEdifact("NAD+MS+9900000000001::293'");
    const [segment] = group.segments;

    assert.deepEqual(segment.components, [['MS'], ['9900000000001', '', '293']]);
  });

  it('ergibt ohne Komponententrenner genau eine Komponente', () => {
    const [group] = parseEdifact("BGM+E01+1'");
    const [segment] = group.segments;

    assert.deepEqual(segment.components, [['E01'], ['1']]);
  });

  it('zerreisst einen maskierten Komponententrenner nicht', () => {
    const [group] = parseEdifact("FTX+ACB+++Beispiel?:Hinweis'");
    const [segment] = group.segments;

    assert.deepEqual(segment.elements, ['ACB', '', '', 'Beispiel:Hinweis']);
    assert.deepEqual(segment.components[3], ['Beispiel:Hinweis']);
  });

  it('verliert einen maskierten Elementtrenner nicht beim Zerlegen der Segmente', () => {
    const [group] = parseEdifact("FTX+ACB+++Betrag ?+ Zuschlag'");
    const [segment] = group.segments;

    assert.deepEqual(segment.elements, ['ACB', '', '', 'Betrag + Zuschlag']);
  });

  it('weist die UNA-Zeichen einzeln aus, ohne sie zu zerlegen', () => {
    const [group] = parseEdifact("UNA:+.? 'UNH+1+UTILMD:D:11A:UN'");
    const [una] = group.segments;

    assert.deepEqual(una.elements, [':', '+', '.', '?', ' ', "'"]);
    assert.deepEqual(una.components, [[':'], ['+'], ['.'], ['?'], [' '], ["'"]]);
  });

  it('zerlegt Komponenten auch bei abweichenden Trennzeichen', () => {
    const groups = parseEdifact('UNA|;,* ~UNH;1;UTILMD|D|11A|UN~UNT;2;1~');
    const header = groups[0].segments.find((segment) => segment.tag === 'UNH');

    assert.deepEqual(header.components, [['1'], ['UTILMD', 'D', '11A', 'UN']]);
  });

  it('respektiert abweichende Trennzeichen aus dem UNA-Header', () => {
    const groups = parseEdifact('UNA|;,* ~UNH;1;UTILMD|D|11A|UN~BGM;E01~UNT;3;1~');

    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'UTILMD');
    assert.deepEqual(
      groups[0].segments.map((segment) => segment.tag),
      ['UNA', 'UNH', 'BGM', 'UNT'],
    );
  });

  it('faellt auf UNKNOWN_MESSAGE_TYPE zurueck, wenn UNH keinen Typ nennt', () => {
    const [group] = parseEdifact("UNH+1'");
    assert.equal(group.type, UNKNOWN_MESSAGE_TYPE);
  });
});

describe('validateEdifactSyntax', () => {
  it('akzeptiert eine vollstaendige Nachricht', () => {
    const result = validateEdifactSyntax("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'");

    assert.equal(result.ok, true);
    assert.equal(result.messages.length, 1);
  });

  it('verlangt einen Segmentabschluss', () => {
    assert.deepEqual(validateEdifactSyntax("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1"), {
      ok: false,
      error: 'Die Nachricht muss mit dem Segmenttrenner "\'" enden.',
    });
  });

  it('lehnt offene UNH-Nachrichten ab', () => {
    assert.deepEqual(validateEdifactSyntax("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'"), {
      ok: false,
      error: 'Fuer UNH 1 fehlt ein abschliessendes UNT.',
    });
  });

  it('lehnt unpassende UNH- und UNT-Referenzen ab', () => {
    assert.deepEqual(validateEdifactSyntax("UNH+1+UTILMD:D:11A:UN'UNT+2+9'"), {
      ok: false,
      error: 'UNH/UNT-Referenzen passen nicht zusammen (1 / 9).',
    });
  });
});
