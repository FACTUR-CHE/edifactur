/**
 * Codetabellen: Qualifier im Klartext.
 *
 * Reine Daten, DOM-frei und ohne Abhaengigkeit auf andere Module. Die
 * haeufigste Frage im Alltag lautet: was bedeutet dieser Code? `NAD+MS` ist
 * der Absender, `BGM+7` ein Prozessdatenbericht, `QTY+220` ein Zaehlerstand.
 *
 * Aufbau: Datenelement-Nummer -> Code -> Bezeichnung. Nachgeschlagen wird
 * ueber die Nummer, die `segments.js` zur Position liefert.
 *
 *     '3035': { name: 'Beteiligter, Qualifier', codes: { MS: 'Absender ...' } }
 *
 * ## Herkunft und Stand
 *
 * UN/EDIFACT-Verzeichnis. Die Codewerte fuer DE 6411 sind gegen die
 * Codeliste zu UN D.97B geprueft, die uebrigen gegen die Datenelement-
 * beschreibungen der Fassung D.21A. Stand der Pruefung: 2026-09.
 *
 * ## Bewusste Grenzen
 *
 * Die Tabellen sind **kuratierte Teilmengen**, keine vollstaendigen
 * Codelisten -- DE 1153 allein fuehrt ueber achthundert Werte. Aufgenommen
 * ist, was in der Marktkommunikation vorkommt, und nur, was gegen die Quelle
 * geprueft wurde.
 *
 * Daraus folgt eine Regel fuer die Anzeige: ein Code, der hier fehlt, ist
 * **nicht ungueltig**. Er ist unbelegt. Insbesondere sind die
 * EDI@Energy-eigenen Codes (`E01`, `Z01` und weitere aus den
 * BDEW-Codelisten) noch nicht erfasst -- die Oberflaeche muss das als
 * "nicht hinterlegt" ausweisen und darf daraus keine Fehlermeldung machen.
 *
 * Zum Aufbau der Datei siehe den Kopfkommentar in edifact.js.
 */

(function (ns) {
  'use strict';

  /** DE 3035 Beteiligter, Qualifier. */
  const PARTY_FUNCTION = Object.freeze({
    BY: 'Käufer',
    CA: 'Frachtführer',
    CN: 'Empfänger der Sendung',
    CZ: 'Absender der Sendung',
    DP: 'Lieferanschrift',
    EX: 'Exporteur',
    II: 'Rechnungsaussteller',
    IM: 'Importeur',
    IV: 'Rechnungsempfänger',
    MR: 'Empfänger der Nachricht',
    MS: 'Absender der Nachricht',
    PE: 'Zahlungsempfänger',
    PR: 'Zahlungspflichtiger',
    SE: 'Verkäufer',
    SU: 'Lieferant',
    UD: 'Endkunde',
    ZZZ: 'Gegenseitig vereinbart',
  });

  /** DE 1001 Dokumentenart. */
  const DOCUMENT_NAME = Object.freeze({
    1: 'Analysezertifikat',
    4: 'Prüfbericht',
    7: 'Prozessdatenbericht',
    9: 'Preis- oder Verkaufskatalog',
    10: 'Angaben zum Beteiligten',
    76: 'Abrufbestellung',
    105: 'Bestellung',
    220: 'Auftrag',
    231: 'Antwort auf einen Auftrag',
    240: 'Lieferanweisung',
    270: 'Lieferschein',
    310: 'Angebot',
    313: 'Anwendungsfehler-Nachricht',
    315: 'Vertrag',
    351: 'Liefermeldung',
    380: 'Handelsrechnung',
    381: 'Gutschrift',
    392: 'Mitteilung über einen Lieferantenwechsel',
    700: 'Frachtbrief',
    705: 'Konnossement',
    740: 'Luftfrachtbrief',
    785: 'Ladungsmanifest',
  });

  /** DE 1225 Nachrichtenfunktion. */
  const MESSAGE_FUNCTION = Object.freeze({
    1: 'Storno',
    2: 'Hinzufügung',
    3: 'Löschung',
    4: 'Änderung',
    5: 'Ersatz',
    6: 'Bestätigung',
    7: 'Duplikat',
    8: 'Status',
    9: 'Original',
    10: 'Nicht gefunden',
    11: 'Antwort',
    12: 'Nicht verarbeitet',
    13: 'Anfrage',
    14: 'Vorabinformation',
    15: 'Erinnerung',
    16: 'Vorschlag',
    17: 'Storniert, wird neu ausgestellt',
    18: 'Neuausstellung',
    19: 'Vom Verkäufer veranlasste Änderung',
    20: 'Nur Kopfteil ersetzen',
    21: 'Nur Positions- und Summenteil ersetzen',
    22: 'Letzte Übertragung',
    23: 'Vorgang zurückgestellt',
    24: 'Lieferanweisung',
    25: 'Prognose',
    26: 'Lieferanweisung und Prognose',
    27: 'Nicht angenommen',
    28: 'Angenommen, mit Änderung im Kopfteil',
    29: 'Angenommen ohne Änderung',
    30: 'Angenommen, mit Änderung im Positionsteil',
    31: 'Kopie',
    32: 'Genehmigung',
    33: 'Änderung im Kopfteil',
    34: 'Angenommen mit Änderung',
    35: 'Wiederholte Übertragung',
    36: 'Änderung im Positionsteil',
    37: 'Rückbuchung einer Belastung',
    38: 'Rückbuchung einer Gutschrift',
    39: 'Rückbuchung wegen Storno',
    40: 'Antrag auf Löschung',
    41: 'Abschließender Auftrag',
    42: 'Bestätigung auf besonderem Weg',
    43: 'Zusätzliche Übertragung',
    44: 'Angenommen ohne Vorbehalt',
    45: 'Angenommen mit Vorbehalt',
    46: 'Vorläufig',
    47: 'Endgültig',
    48: 'Angenommen, Inhalt zurückgewiesen',
    49: 'Beigelegter Streitfall',
    50: 'Rücknahme',
    51: 'Autorisierung',
    52: 'Vorgeschlagene Änderung',
    53: 'Test',
    54: 'Auszug',
    55: 'Nur zur Information',
    56: 'Avis über gebuchte Posten',
    57: 'Avis über zu buchende Posten',
    58: 'Voravis über Posten mit Klärungsbedarf',
    59: 'Vorangezeigte Posten',
    60: 'Keine Änderung seit der letzten Nachricht',
    61: 'Vollständiger Zeitplan',
    62: 'Fortschreibung des Zeitplans',
    63: 'Nicht angenommen, vorläufig',
    64: 'Überprüfung',
    65: 'Ungeklärter Streitfall',
    66: 'Entlastung einer Betriebsgarantie',
    67: 'Beendigung einer Betriebsgarantie',
    68: 'Beginn einer Betriebsgarantie',
    69: 'Vorab-Frachtinformation',
  });

  /** DE 1153 Referenz, Qualifier. */
  const REFERENCE_QUALIFIER = Object.freeze({
    ACE: 'Nummer eines zugehörigen Dokuments',
    ACW: 'Referenznummer der vorhergehenden Nachricht',
    AGI: 'Anfragenummer',
    AGK: 'Anwendungsreferenznummer',
    AVE: 'Zählpunkt',
    CT: 'Vertragsnummer',
    DM: 'Dokumentenkennung',
    IV: 'Rechnungsnummer',
    MG: 'Zählernummer',
    ON: 'Bestellnummer des Käufers',
    PK: 'Packlistennummer',
    PL: 'Preislistennummer',
    PR: 'Preisangebotsnummer',
    RA: 'Nummer des Zahlungsavis',
    SE: 'Seriennummer',
    TN: 'Transaktionsreferenznummer',
    VA: 'Umsatzsteuer-Identifikationsnummer',
  });

  /** DE 3227 Ortsangabe, Qualifier. */
  const LOCATION_QUALIFIER = Object.freeze({
    1: 'Ort der Lieferbedingungen',
    2: 'Zahlungsort',
    5: 'Abgangsort',
    7: 'Lieferort',
    9: 'Ladeort',
    10: 'Übernahmeort',
    11: 'Entladeort',
    14: 'Lagerort der Warenposition',
    16: 'Ort des Eigentumsübergangs',
    18: 'Lager',
    20: 'Endgültiger Bestimmungsort der Ware',
    22: 'Ort der Zollabwicklung',
    80: 'Versandort',
    107: 'Ort der Zusammenführung',
    117: 'Abholort',
    172: 'Meldepunkt',
    202: 'Terminal',
    237: 'Bilanzierungsgebiet',
  });

  /** DE 6063 Mengenart, Qualifier. */
  const QUANTITY_QUALIFIER = Object.freeze({
    1: 'Einzelmenge',
    2: 'Gebühr',
    3: 'Kumulierte Menge',
    11: 'Teilmenge',
    12: 'Versandmenge',
    17: 'Vorratsmenge',
    21: 'Bestellmenge',
    31: 'Geschätzte Jahresmenge',
    46: 'Gelieferte Stückzahl',
    47: 'Abgerechnete Menge',
    48: 'Empfangene Menge',
    69: 'Anfangsmenge',
    79: 'Vorherige kumulierte Menge',
    136: 'Erreichte Periodenmenge',
    145: 'Tatsächlicher Bestand',
    220: 'Zählerstand',
    265: 'Faktor',
    269: 'Zurückgewiesene Rückgabemenge',
  });

  /**
   * DE 6411 Maßeinheit, nach UN/ECE-Empfehlung 20.
   *
   * Aufgenommen sind die energiewirtschaftlich relevanten Einheiten und
   * einige allgemeine. Die Empfehlung fuehrt mehrere hundert Codes.
   */
  const MEASUREMENT_UNIT = Object.freeze({
    A90: 'Gigawatt',
    AMH: 'Amperestunde',
    ANN: 'Jahr',
    C62: 'Eins',
    D30: 'Terajoule',
    D31: 'Terawatt',
    D32: 'Terawattstunde',
    DAY: 'Tag',
    GV: 'Gigajoule',
    GWH: 'Gigawattstunde',
    HTZ: 'Hertz',
    HUR: 'Stunde',
    KVR: 'Kilovar',
    KVT: 'Kilovolt',
    KWH: 'Kilowattstunde',
    KWT: 'Kilowatt',
    MAW: 'Megawatt',
    MON: 'Monat',
    MTK: 'Quadratmeter',
    MTQ: 'Kubikmeter',
    MTR: 'Meter',
    MVA: 'Megavoltampere',
    MWH: 'Megawattstunde',
    P1: 'Prozent',
    PCE: 'Stück',
    WHR: 'Wattstunde',
  });

  /** DE 5025 Betragsart, Qualifier. */
  const AMOUNT_QUALIFIER = Object.freeze({
    1: 'Umsatzsteuer, erster Wert',
    5: 'Angepasster Betrag',
    8: 'Nachlass- oder Zuschlagsbetrag',
    9: 'Fälliger Betrag',
    23: 'Gebührenbetrag',
    39: 'Rechnungsgesamtbetrag',
    52: 'Rabattbetrag',
    55: 'Zollbetrag',
    64: 'Frachtkosten',
    66: 'Positionsgesamtbetrag',
    77: 'Rechnungspositionsbetrag',
    79: 'Summe der Positionsbeträge',
    124: 'Steuerbetrag',
    125: 'Steuerpflichtiger Betrag',
    128: 'Gesamtbetrag',
    139: 'Gesamtzahlungsbetrag',
    150: 'Mehrwertsteuerbetrag',
    176: 'Gesamtbetrag Zoll, Steuern und Abgaben der Nachricht',
    203: 'Positionsbetrag',
    259: 'Summe der Gebühren',
    260: 'Summe der Nachlässe',
  });

  /**
   * DE 2379 Format von Datum, Uhrzeit oder Zeitraum.
   *
   * Die Bezeichnung nennt das Muster, weil das die Angabe ist, die man beim
   * Lesen einer Nachricht braucht. Die Umsetzung in ein lesbares Datum macht
   * `decodeDateTime` in format.js -- die Feldlisten dort und die Muster hier
   * muessen zusammenpassen, ein Test prueft das.
   */
  const DATE_FORMAT = Object.freeze({
    2: 'DDMMYY',
    101: 'YYMMDD',
    102: 'CCYYMMDD',
    106: 'MMDD',
    201: 'YYMMDDHHMM',
    203: 'CCYYMMDDHHMM',
    204: 'CCYYMMDDHHMMSS',
    303: 'CCYYMMDDHHMMZZZ (mit UTC-Versatz)',
    305: 'MMDDHHMM',
    401: 'HHMM',
    610: 'CCYYMM',
    616: 'CCYYWW (Kalenderwoche)',
    719: 'CCYYMMDDHHMM-CCYYMMDDHHMM (Zeitraum)',
  });

  const CODE_LISTS = Object.freeze({
    1001: Object.freeze({ name: 'Dokumentenart', codes: DOCUMENT_NAME }),
    2379: Object.freeze({ name: 'Format von Datum, Uhrzeit oder Zeitraum', codes: DATE_FORMAT }),
    1153: Object.freeze({ name: 'Referenz, Qualifier', codes: REFERENCE_QUALIFIER }),
    1225: Object.freeze({ name: 'Nachrichtenfunktion', codes: MESSAGE_FUNCTION }),
    3035: Object.freeze({ name: 'Beteiligter, Qualifier', codes: PARTY_FUNCTION }),
    3227: Object.freeze({ name: 'Ortsangabe, Qualifier', codes: LOCATION_QUALIFIER }),
    5025: Object.freeze({ name: 'Betragsart, Qualifier', codes: AMOUNT_QUALIFIER }),
    6063: Object.freeze({ name: 'Mengenart, Qualifier', codes: QUANTITY_QUALIFIER }),
    6411: Object.freeze({ name: 'Maßeinheit', codes: MEASUREMENT_UNIT }),
  });

  /**
   * @param {string} element Datenelement-Nummer, z. B. "3035".
   * @returns {boolean} Ob fuer dieses Datenelement eine Codeliste vorliegt.
   */
  function hasCodeList(element) {
    return Object.prototype.hasOwnProperty.call(CODE_LISTS, element);
  }

  /**
   * Loest einen Code auf.
   *
   * Drei Ergebnisse, die auseinandergehalten werden muessen:
   *
   *   `null`          Fuer dieses Datenelement liegt keine Codeliste vor.
   *                   Es kann keine Aussage getroffen werden, also wird
   *                   keine getroffen.
   *   `{name: null}`  Codeliste vorhanden, der Code steht nicht darin. Das
   *                   heisst *nicht*, dass der Code ungueltig ist -- die
   *                   Tabellen sind kuratierte Teilmengen. Die Oberflaeche
   *                   weist es als unbelegt aus.
   *   `{name}`        Aufgeloest.
   *
   * Codes werden ohne Ruecksicht auf Gross- und Kleinschreibung
   * nachgeschlagen. In echten Nachrichten stehen sie in Grossbuchstaben,
   * in handgetippten Testnachrichten nicht immer -- und der Rohwert bleibt
   * ohnehin sichtbar.
   *
   * @param {unknown} element Datenelement-Nummer.
   * @param {unknown} code Codewert aus der Nachricht.
   * @returns {{name: string|null}|null}
   */
  function codeMeaning(element, code) {
    if (typeof element !== 'string' || !hasCodeList(element)) return null;
    if (typeof code !== 'string' || code.trim().length === 0) return null;

    const { codes } = CODE_LISTS[element];
    const key = code.trim().toUpperCase();

    return { name: Object.prototype.hasOwnProperty.call(codes, key) ? codes[key] : null };
  }

  ns.CODE_LISTS = CODE_LISTS;
  ns.hasCodeList = hasCodeList;
  ns.codeMeaning = codeMeaning;
})((globalThis.EdifactExplorer ??= {}));
