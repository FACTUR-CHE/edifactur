import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import '../src/edifact.js';

// Die Quelldateien sind klassische Skripte ohne export; sie werden per
// Seiteneffekt geladen und legen ihre Namen im Namensraum ab.
const {
  DEFAULT_DELIMITERS,
  UNKNOWN_MESSAGE_TYPE,
  UNKNOWN_SEGMENT_LABEL,
  checkCharacterSet,
  checkCounters,
  collectFindings,
  hasUnaHeader,
  parseEdifact,
  readDelimiters,
  readAcknowledgement,
  readInterchangeHeader,
  readMessageHeader,
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

describe('checkCounters', () => {
  const messages = (payload) => checkCounters(parseEdifact(payload));

  it('meldet nichts bei stimmigen Zaehlern', () => {
    assert.deepEqual(
      messages("UNB+UNOC:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'UNZ+1+REF'"),
      [],
    );
  });

  it('meldet einen zu niedrigen Segmentzaehler mit Soll und Ist', () => {
    const [finding] = messages("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+2+1'");

    assert.equal(finding.level, 'error');
    assert.equal(finding.messageIndex, 0);
    assert.match(finding.message, /UNT nennt 2 Segmente, tatsächlich enthalten: 3\./);
  });

  it('meldet einen zu hohen Segmentzaehler', () => {
    const [finding] = messages("UNH+1+UTILMD:D:11A:UN'UNT+9+1'");

    assert.match(finding.message, /UNT nennt 9 Segmente, tatsächlich enthalten: 2\./);
  });

  it('zaehlt den UNA-Header nicht als Segment der Nachricht', () => {
    assert.deepEqual(messages("UNA:+.? 'UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'"), []);
  });

  it('meldet einen fehlenden Segmentzaehler eigens', () => {
    const [finding] = messages("UNH+1+UTILMD:D:11A:UN'UNT++1'");

    assert.match(finding.message, /UNT nennt keinen Zähler \(DE 0074\)\. Erwartet: 2 Segmente\./);
  });

  it('meldet einen nicht numerischen Segmentzaehler eigens', () => {
    const [finding] = messages("UNH+1+UTILMD:D:11A:UN'UNT+zwei+1'");

    assert.match(finding.message, /nicht numerisch: "zwei"\. Erwartet: 2 Segmente\./);
  });

  it('prueft den Nachrichtenzaehler in UNZ', () => {
    const [finding] = messages(
      "UNB+UNOC:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+2+1'UNZ+2+REF'",
    );

    assert.equal(finding.messageIndex, null);
    assert.match(finding.message, /UNZ nennt 2 Nachrichten, tatsächlich enthalten: 1\./);
  });

  it('zaehlt alle Nachrichten einer Sammelnachricht', () => {
    assert.deepEqual(
      messages(
        "UNB+UNOC:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+2+1'" +
          "UNH+2+UTILMD:D:11A:UN'UNT+2+2'UNZ+2+REF'",
      ),
      [],
    );
  });

  it('ordnet Befunde der jeweiligen Nachricht zu', () => {
    const findings = messages(
      "UNB+UNOC:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+2+1'" +
        "UNH+2+UTILMD:D:11A:UN'BGM+E01+1'UNT+2+2'UNZ+2+REF'",
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0].messageIndex, 2);
  });

  it('prueft ohne UNZ nur die Segmentzaehler', () => {
    assert.deepEqual(messages("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'"), []);
  });

  it('laesst eine Nachricht ohne UNT unbeanstandet -- das meldet die Syntaxpruefung', () => {
    assert.deepEqual(messages("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'"), []);
  });

  it('verarbeitet Eingaben ohne Segmentgruppen', () => {
    assert.deepEqual(checkCounters([]), []);
    assert.deepEqual(checkCounters(null), []);
  });
});

describe('readInterchangeHeader', () => {
  const header = (payload) => readInterchangeHeader(parseEdifact(payload));

  it('liest Zeichensatz, Partner und Austauschreferenz', () => {
    const result = header(
      "UNB+UNOC:3+9900000000001:500+9900000000999:500+260801:0815+DEMOREF001'UNH+1+UTILMD:D:11A:UN'UNT+2+1'UNZ+1+DEMOREF001'",
    );

    assert.equal(result.syntaxIdentifier, 'UNOC');
    assert.equal(result.syntaxVersion, '3');
    assert.equal(result.characterSet, 'Level C (ISO 8859-1, Latin-1)');
    assert.equal(result.umlauts, true);
    assert.deepEqual(result.sender, { id: '9900000000001', qualifier: '500' });
    assert.deepEqual(result.recipient, { id: '9900000000999', qualifier: '500' });
    assert.equal(result.reference, 'DEMOREF001');
    assert.equal(result.isTest, false);
  });

  it('liefert ohne UNB null', () => {
    assert.equal(header("UNH+1+UTILMD:D:11A:UN'BGM+E01+1'UNT+3+1'"), null);
    assert.equal(readInterchangeHeader([]), null);
    assert.equal(readInterchangeHeader(null), null);
  });

  it('erkennt das Testkennzeichen in DE 0035', () => {
    const result = header("UNB+UNOC:3+1:500+2:500+260801:0815+REF++++++1'");

    assert.equal(result.testIndicator, '1');
    assert.equal(result.isTest, true);
  });

  it('liest das Testkennzeichen nur an Position 10', () => {
    // Eine 1 an Position 9 ist DE 0032, die Austauschvereinbarung.
    assert.equal(header("UNB+UNOC:3+1:500+2:500+260801:0815+REF+++++1'").isTest, false);
  });

  it('deutet einen anderen Wert in DE 0035 nicht als Test', () => {
    assert.equal(header("UNB+UNOC:3+1:500+2:500+260801:0815+REF++++++0'").isTest, false);
  });

  it('verarbeitet ein UNB ohne die optionalen Elemente', () => {
    const result = header("UNB+UNOC:3+1+2+260801:0815+REF'");

    assert.deepEqual(result.sender, { id: '1', qualifier: '' });
    assert.deepEqual(result.recipient, { id: '2', qualifier: '' });
    assert.equal(result.testIndicator, '');
    assert.equal(result.isTest, false);
  });

  it('verarbeitet ein UNB ohne jeden Inhalt', () => {
    const result = header("UNB'");

    assert.equal(result.syntaxIdentifier, '');
    assert.equal(result.characterSet, null);
    assert.equal(result.umlauts, null);
    assert.deepEqual(result.sender, { id: '', qualifier: '' });
    assert.equal(result.reference, '');
    assert.equal(result.isTest, false);
  });

  it('trifft ueber eine unbekannte Syntax-Kennung keine Aussage', () => {
    const result = header("UNB+ZZZZ:3+1+2+260801:0815+REF'");

    assert.equal(result.syntaxIdentifier, 'ZZZZ');
    assert.equal(result.characterSet, null);
    assert.equal(result.umlauts, null);
  });
});

describe('checkCharacterSet', () => {
  const findings = (payload) => checkCharacterSet(parseEdifact(payload));

  it('weist auf UNOB ohne Umlaute hin', () => {
    const [finding] = findings("UNB+UNOB:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+2+1'");

    assert.equal(finding.level, 'warning');
    assert.equal(finding.messageIndex, null);
    assert.match(finding.message, /UNOB enthält keine deutschen Umlaute/);
    assert.match(finding.message, /UNOC:3 vorgeschrieben/);
  });

  it('weist auch auf UNOA hin', () => {
    assert.equal(findings("UNB+UNOA:2+1+2+260801:0815+REF'").length, 1);
  });

  it('meldet bei UNOC nichts', () => {
    assert.deepEqual(findings("UNB+UNOC:3+1+2+260801:0815+REF'"), []);
  });

  it('meldet bei unbekannter Kennung nichts statt zu raten', () => {
    assert.deepEqual(findings("UNB+ZZZZ:3+1+2+260801:0815+REF'"), []);
  });

  it('meldet ohne UNB nichts', () => {
    assert.deepEqual(findings("UNH+1+UTILMD:D:11A:UN'UNT+2+1'"), []);
  });
});

describe('collectFindings', () => {
  it('fuehrt Zaehler- und Zeichensatzpruefung zusammen', () => {
    const findings = collectFindings(
      parseEdifact("UNB+UNOB:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+9+1'UNZ+1+REF'"),
    );

    assert.deepEqual(
      findings.map((finding) => finding.level),
      ['error', 'warning'],
    );
  });

  it('liefert bei einwandfreier Nutzlast eine leere Liste', () => {
    assert.deepEqual(
      collectFindings(
        parseEdifact("UNB+UNOC:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+2+1'UNZ+1+REF'"),
      ),
      [],
    );
  });
});

describe('readMessageHeader', () => {
  const header = (payload) => readMessageHeader(parseEdifact(payload)[0].segments);

  it('zerlegt einen vollstaendigen Nachrichtenbezeichner', () => {
    assert.deepEqual(header("UNH+DEMO001+UTILMD:D:11A:UN:5.1e'UNT+2+DEMO001'"), {
      reference: 'DEMO001',
      type: 'UTILMD',
      version: 'D',
      release: '11A',
      agency: 'UN',
      formatVersion: '5.1e',
    });
  });

  it('laesst die Formatversion leer, wenn DE 0057 fehlt', () => {
    const result = header("UNH+1+UTILMD:D:11A:UN'");

    assert.equal(result.type, 'UTILMD');
    assert.equal(result.agency, 'UN');
    assert.equal(result.formatVersion, '');
  });

  it('verarbeitet einen verkuerzten Bezeichner', () => {
    assert.deepEqual(header("UNH+1+UTILMD'"), {
      reference: '1',
      type: 'UTILMD',
      version: '',
      release: '',
      agency: '',
      formatVersion: '',
    });
  });

  it('verarbeitet ein UNH ohne Bezeichner', () => {
    const result = header("UNH+1'");

    assert.equal(result.reference, '1');
    assert.equal(result.type, '');
    assert.equal(result.formatVersion, '');
  });

  it('liefert ohne UNH null', () => {
    assert.equal(readMessageHeader(parseEdifact("UNZ+1+REF'")[0].segments), null);
  });
});

describe('parseEdifact: Nachrichtenkopf je Gruppe', () => {
  it('haengt den ausgewerteten Kopf an die Gruppe', () => {
    const [group] = parseEdifact("UNH+1+UTILMD:D:11A:UN:5.1e'UNT+2+1'");

    assert.equal(group.type, 'UTILMD');
    assert.equal(group.header.formatVersion, '5.1e');
  });

  it('fuehrt je Nachricht einer Sammelnachricht einen eigenen Kopf', () => {
    const groups = parseEdifact(
      "UNB+UNOC:3+1+2+260801:0815+REF'" +
        "UNH+1+UTILMD:D:11A:UN:5.1e'UNT+2+1'" +
        "UNH+2+UTILMD:D:11A:UN:4.4'UNT+2+2'" +
        "UNZ+2+REF'",
    );

    assert.deepEqual(
      groups.map((group) => group.header?.formatVersion ?? null),
      [null, '5.1e', '4.4', null],
    );
  });

  it('laesst Huellsegmentgruppen ohne Kopf und behaelt den Rueckfalltyp', () => {
    const [group] = parseEdifact("UNB+UNOC:3+1+2+260801:0815+REF'UNH+1+UTILMD:D:11A:UN'UNT+2+1'");

    assert.equal(group.header, null);
    assert.equal(group.type, UNKNOWN_MESSAGE_TYPE);
  });
});

describe('readAcknowledgement', () => {
  const ack = (payload) => readAcknowledgement(parseEdifact(payload)[0]);

  it('liefert fuer eine Fachnachricht null', () => {
    assert.equal(ack("UNH+1+UTILMD:D:11A:UN:S2.1'BGM+E01+1+9'UNT+3+1'"), null);
    assert.equal(ack("UNZ+1+REF'"), null);
    assert.equal(readAcknowledgement(null), null);
  });

  it('liest die Fehlercodes einer negativen APERAK', () => {
    const result = ack("UNH+1+APERAK:D:07B:UN:2.1i'BGM+313+A1+9'ERC+Z29'ERC+Z35'UNT+5+1'");

    assert.equal(result.type, 'APERAK');
    assert.equal(result.rejected, true);
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ['Z29', 'Z35'],
    );
    assert.equal(result.errors[0].element, '9321');
  });

  it('behandelt eine APERAK ohne ERC als Anerkennungsmeldung', () => {
    const result = ack("UNH+1+APERAK:D:07B:UN:2.1i'BGM+313+A2+9'UNT+3+1'");

    assert.equal(result.type, 'APERAK');
    assert.equal(result.rejected, false);
    assert.deepEqual(result.errors, []);
  });

  it('ordnet Freitext dem vorangehenden Fehlercode zu', () => {
    const result = ack(
      "UNH+1+APERAK:D:07B:UN:2.1i'" +
        "ERC+Z29'FTX+ABO+++Marktlokation 1'FTX+Z02+++SG4 DTM'" +
        "ERC+Z35'FTX+AAO+++Datum unplausibel'" +
        "UNT+7+1'",
    );

    assert.deepEqual(
      result.errors[0].texts.map((entry) => [entry.qualifier, entry.text]),
      [
        ['ABO', 'Marktlokation 1'],
        ['Z02', 'SG4 DTM'],
      ],
    );
    assert.deepEqual(
      result.errors[1].texts.map((entry) => entry.text),
      ['Datum unplausibel'],
    );
  });

  it('fuegt die Textkomponenten eines FTX zusammen', () => {
    const result = ack(
      "UNH+1+APERAK:D:07B:UN:2.1i'ERC+Z29'FTX+ABO+++Erste Zeile:zweite Zeile'UNT+4+1'",
    );

    assert.equal(result.errors[0].texts[0].text, 'Erste Zeile zweite Zeile');
  });

  it('ignoriert Freitext vor dem ersten Fehlercode', () => {
    const result = ack("UNH+1+APERAK:D:07B:UN:2.1i'FTX+ABO+++Ohne Bezug'ERC+Z29'UNT+4+1'");

    assert.deepEqual(result.errors[0].texts, []);
  });

  it('liest den Syntaxfehler und die Handlung einer negativen CONTRL', () => {
    const result = ack("UNH+1+CONTRL:D:3:UN:2.0b'UCI+REF1+1:500+2:500+4+13+UNB+2:1'UNT+3+1'");

    assert.equal(result.type, 'CONTRL');
    assert.equal(result.rejected, true);
    assert.deepEqual(result.actions, ['4']);
    assert.equal(result.errors[0].element, '0085');
    assert.equal(result.errors[0].code, '13');
    assert.equal(result.errors[0].tag, 'UCI');
  });

  it('behandelt eine CONTRL ohne Syntaxfehler als anerkannt', () => {
    const result = ack("UNH+1+CONTRL:D:3:UN:2.0b'UCI+REF1+1:500+2:500+8'UNT+3+1'");

    assert.equal(result.rejected, false);
    assert.deepEqual(result.actions, ['8']);
    assert.deepEqual(result.errors, []);
  });

  it('erkennt eine Ablehnung auch ohne Fehlercode an der Handlung', () => {
    const result = ack("UNH+1+CONTRL:D:3:UN:2.0b'UCI+REF1+1:500+2:500+4'UNT+3+1'");

    assert.equal(result.rejected, true);
    assert.deepEqual(result.errors, []);
  });

  it('liest die Fehlercodes aus UCM, UCS und UCD an ihren Positionen', () => {
    const result = ack(
      "UNH+1+CONTRL:D:3:UN:2.0b'" +
        "UCI+REF1+1:500+2:500+7'" +
        "UCM+1+UTILMD:D:11A:UN+4+12+UNH'" +
        "UCS+5+13'" +
        "UCD+39+2:1'" +
        "UNT+6+1'",
    );

    assert.deepEqual(
      result.errors.map((error) => [error.tag, error.code]),
      [
        ['UCM', '12'],
        ['UCS', '13'],
        ['UCD', '39'],
      ],
    );
    assert.deepEqual(result.actions, ['7', '4']);
  });

  it('behaelt einen nicht hinterlegten Code unveraendert', () => {
    // Die Uebersetzung macht die Darstellungsschicht; dieses Modul liefert
    // den Rohcode weiter, auch wenn keine Codeliste ihn kennt.
    const result = ack("UNH+1+APERAK:D:07B:UN:2.1i'ERC+Z01'UNT+3+1'");

    assert.equal(result.errors[0].code, 'Z01');
  });
});
