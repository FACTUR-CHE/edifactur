/**
 * Segmentdefinitionen: Datenelement-Nummern und Bezeichnungen.
 *
 * Reine Daten, DOM-frei und ohne Abhaengigkeit auf andere Module. Die
 * Darstellung beschriftete Werte bisher mit "Element 1", "Element 2" -- fuer
 * die Arbeit mit dem MIG wertlos, denn dort heisst die Position "DE 3035
 * Beteiligter, Qualifier".
 *
 * Aufbau je Segment:
 *
 *     TAG: { name, elements: [ { code, name, components?: [ { code, name } ] } ] }
 *
 * `elements` ist nach Elementposition geordnet, das Segment-Tag selbst zaehlt
 * nicht mit. Ein Element ohne `components` ist ein einfaches Datenelement und
 * damit seine eigene einzige Komponente.
 *
 * Herkunft: UN/EDIFACT-Verzeichnis, Segmentbeschreibungen in der Fassung
 * D.21A. Die Bezeichnungen sind uebersetzt. Zwischen Releases aendert sich
 * gelegentlich die Benennung eines Datenelements, nicht aber seine Nummer --
 * die Nummer ist deshalb die verlaessliche Angabe, und sie steht in der
 * Oberflaeche neben dem Namen. Ein MIG kann fuer dieselbe Position eine
 * eigene, fachliche Bezeichnung fuehren.
 *
 * Zum Aufbau der Datei siehe den Kopfkommentar in edifact.js.
 */

(function (ns) {
  'use strict';

  /**
   * Erzeugt wiederholte Komponenten, wie sie EDIFACT bei Namens- und
   * Textfeldern verwendet (C058 fuehrt DE 3124 fuenfmal).
   *
   * @param {number} count
   * @param {string} code
   * @param {string} name
   * @returns {{code: string, name: string}[]}
   */
  function repeated(count, code, name) {
    return Array.from({ length: count }, (unused, index) => ({
      code,
      name: `${name} ${index + 1}`,
    }));
  }

  /** C212 Warennummer-Identifikation, in PIA und LIN mehrfach verwendet. */
  const ITEM_NUMBER = Object.freeze([
    { code: '7140', name: 'Warennummer' },
    { code: '7143', name: 'Art der Warennummer' },
    { code: '1131', name: 'Codeliste' },
    { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
  ]);

  const SEGMENT_DEFINITIONS = Object.freeze({
    // UNA fuehrt keine Datenelement-Nummern, sondern sechs feste Positionen.
    UNA: {
      name: 'Trennzeichenvorgabe',
      elements: [
        { code: '', name: 'Komponententrenner' },
        { code: '', name: 'Elementtrenner' },
        { code: '', name: 'Dezimalzeichen' },
        { code: '', name: 'Release-Zeichen' },
        { code: '', name: 'Reserviert, per Norm ein Leerzeichen' },
        { code: '', name: 'Segmenttrenner' },
      ],
    },

    UNB: {
      name: 'Austauschkopf',
      elements: [
        {
          code: 'S001',
          name: 'Syntax-Kennung',
          components: [
            { code: '0001', name: 'Syntax-Kennung' },
            { code: '0002', name: 'Syntax-Versionsnummer' },
            { code: '0080', name: 'Verzeichnisversion der Dienstcodeliste' },
            { code: '0133', name: 'Zeichenkodierung, codiert' },
          ],
        },
        {
          code: 'S002',
          name: 'Absender des Austauschs',
          components: [
            { code: '0004', name: 'Absenderkennung' },
            { code: '0007', name: 'Kennungsqualifier' },
            { code: '0008', name: 'Interne Absenderkennung' },
            { code: '0042', name: 'Interne Absender-Unterkennung' },
          ],
        },
        {
          code: 'S003',
          name: 'Empfänger des Austauschs',
          components: [
            { code: '0010', name: 'Empfängerkennung' },
            { code: '0007', name: 'Kennungsqualifier' },
            { code: '0014', name: 'Interne Empfängerkennung' },
            { code: '0046', name: 'Interne Empfänger-Unterkennung' },
          ],
        },
        {
          code: 'S004',
          name: 'Datum und Uhrzeit der Erstellung',
          components: [
            { code: '0017', name: 'Datum' },
            { code: '0019', name: 'Uhrzeit' },
          ],
        },
        { code: '0020', name: 'Austauschreferenz' },
        {
          code: 'S005',
          name: 'Referenz oder Passwort des Empfängers',
          components: [
            { code: '0022', name: 'Referenz oder Passwort' },
            { code: '0025', name: 'Qualifier für Referenz oder Passwort' },
          ],
        },
        { code: '0026', name: 'Anwendungsreferenz' },
        { code: '0029', name: 'Verarbeitungspriorität' },
        { code: '0031', name: 'Empfangsbestätigung erbeten' },
        { code: '0032', name: 'Kennung der Austauschvereinbarung' },
        { code: '0035', name: 'Testkennzeichen' },
      ],
    },

    UNH: {
      name: 'Nachrichtenkopf',
      elements: [
        { code: '0062', name: 'Nachrichten-Referenznummer' },
        {
          code: 'S009',
          name: 'Nachrichtenbezeichner',
          components: [
            { code: '0065', name: 'Nachrichtentyp' },
            { code: '0052', name: 'Versionsnummer' },
            { code: '0054', name: 'Releasenummer' },
            { code: '0051', name: 'Verwaltende Organisation' },
            { code: '0057', name: 'Anwendungsspezifische Kennung (Formatversion)' },
            { code: '0110', name: 'Verzeichnisversion der Codeliste' },
            { code: '0113', name: 'Unterfunktion des Nachrichtentyps' },
          ],
        },
        { code: '0068', name: 'Allgemeine Zugriffsreferenz' },
        {
          code: 'S010',
          name: 'Status der Übertragung',
          components: [
            { code: '0070', name: 'Übertragungsfolgenummer' },
            { code: '0073', name: 'Erste und letzte Übertragung' },
          ],
        },
      ],
    },

    UNT: {
      name: 'Nachrichtenende',
      elements: [
        { code: '0074', name: 'Anzahl der Segmente in der Nachricht' },
        { code: '0062', name: 'Nachrichten-Referenznummer' },
      ],
    },

    UNZ: {
      name: 'Austauschende',
      elements: [
        { code: '0036', name: 'Anzahl der Nachrichten im Austausch' },
        { code: '0020', name: 'Austauschreferenz' },
      ],
    },

    BGM: {
      name: 'Dokument / Vorgang',
      elements: [
        {
          code: 'C002',
          name: 'Dokumenten- oder Nachrichtenname',
          components: [
            { code: '1001', name: 'Dokumentenart' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
            { code: '1000', name: 'Dokumentenname' },
          ],
        },
        {
          code: 'C106',
          name: 'Dokumenten- oder Nachrichtenidentifikation',
          components: [
            { code: '1004', name: 'Dokumentennummer' },
            { code: '1056', name: 'Version' },
            { code: '1060', name: 'Revision' },
          ],
        },
        { code: '1225', name: 'Nachrichtenfunktion' },
        { code: '4343', name: 'Antwortart' },
        { code: '1373', name: 'Dokumentenstatus' },
        { code: '3453', name: 'Sprache' },
      ],
    },

    DTM: {
      name: 'Datum und Zeit',
      elements: [
        {
          code: 'C507',
          name: 'Datum, Uhrzeit oder Zeitraum',
          components: [
            { code: '2005', name: 'Funktion von Datum, Uhrzeit oder Zeitraum, Qualifier' },
            { code: '2380', name: 'Wert von Datum, Uhrzeit oder Zeitraum' },
            { code: '2379', name: 'Format von Datum, Uhrzeit oder Zeitraum' },
          ],
        },
      ],
    },

    NAD: {
      name: 'Marktpartner',
      elements: [
        { code: '3035', name: 'Beteiligter, Qualifier' },
        {
          code: 'C082',
          name: 'Identifikation des Beteiligten',
          components: [
            { code: '3039', name: 'Identifikation des Beteiligten' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
          ],
        },
        {
          code: 'C058',
          name: 'Name und Adresse',
          components: repeated(5, '3124', 'Name und Adresse, Zeile'),
        },
        {
          code: 'C080',
          name: 'Name des Beteiligten',
          components: [
            ...repeated(5, '3036', 'Name des Beteiligten, Zeile'),
            { code: '3045', name: 'Format des Namens' },
          ],
        },
        {
          code: 'C059',
          name: 'Straße',
          components: repeated(4, '3042', 'Straße und Hausnummer oder Postfach, Zeile'),
        },
        { code: '3164', name: 'Ort' },
        {
          code: 'C819',
          name: 'Verwaltungseinheit des Landes',
          components: [
            { code: '3229', name: 'Verwaltungseinheit des Landes' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
            { code: '3228', name: 'Name der Verwaltungseinheit' },
          ],
        },
        { code: '3251', name: 'Postleitzahl' },
        { code: '3207', name: 'Land' },
      ],
    },

    CTA: {
      name: 'Ansprechpartner',
      elements: [
        { code: '3139', name: 'Funktion des Ansprechpartners' },
        {
          code: 'C056',
          name: 'Angaben zum Ansprechpartner',
          components: [
            { code: '3413', name: 'Kennung des Ansprechpartners' },
            { code: '3412', name: 'Name des Ansprechpartners' },
          ],
        },
      ],
    },

    COM: {
      name: 'Kontakt',
      elements: [
        {
          code: 'C076',
          name: 'Kommunikationsverbindung',
          components: [
            { code: '3148', name: 'Kommunikationsadresse' },
            { code: '3155', name: 'Art der Kommunikationsadresse' },
          ],
        },
      ],
    },

    RFF: {
      name: 'Referenz',
      elements: [
        {
          code: 'C506',
          name: 'Referenz',
          components: [
            { code: '1153', name: 'Referenz, Qualifier' },
            { code: '1154', name: 'Referenznummer' },
            { code: '1156', name: 'Positionsnummer im Dokument' },
            { code: '1056', name: 'Version' },
            { code: '1060', name: 'Revision' },
          ],
        },
      ],
    },

    LOC: {
      name: 'Ort / Lokation',
      elements: [
        { code: '3227', name: 'Ortsangabe, Qualifier' },
        {
          code: 'C517',
          name: 'Ortsidentifikation',
          components: [
            { code: '3225', name: 'Identifikation des Ortes' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
            { code: '3224', name: 'Name des Ortes' },
          ],
        },
        {
          code: 'C519',
          name: 'Erster zugehöriger Ort',
          components: [
            { code: '3223', name: 'Identifikation des ersten zugehörigen Ortes' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
            { code: '3222', name: 'Name des ersten zugehörigen Ortes' },
          ],
        },
        {
          code: 'C553',
          name: 'Zweiter zugehöriger Ort',
          components: [
            { code: '3233', name: 'Identifikation des zweiten zugehörigen Ortes' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
            { code: '3232', name: 'Name des zweiten zugehörigen Ortes' },
          ],
        },
        { code: '5479', name: 'Art der Beziehung' },
      ],
    },

    LIN: {
      name: 'Position',
      elements: [
        { code: '1082', name: 'Positionsnummer' },
        { code: '1229', name: 'Handlungsart' },
        { code: 'C212', name: 'Warennummer-Identifikation', components: [...ITEM_NUMBER] },
        {
          code: 'C829',
          name: 'Unterpositionsangabe',
          components: [
            { code: '5495', name: 'Kennzeichen der Unterposition' },
            { code: '1082', name: 'Positionsnummer' },
          ],
        },
        { code: '1222', name: 'Konfigurationsebene' },
        { code: '7083', name: 'Konfigurationsvorgang' },
      ],
    },

    PIA: {
      name: 'Zusatz-ID',
      elements: [
        { code: '4347', name: 'Produktidentifikation, Qualifier' },
        ...Array.from({ length: 5 }, () => ({
          code: 'C212',
          name: 'Warennummer-Identifikation',
          components: [...ITEM_NUMBER],
        })),
      ],
    },

    QTY: {
      name: 'Menge',
      elements: [
        {
          code: 'C186',
          name: 'Mengenangaben',
          components: [
            { code: '6063', name: 'Mengenart, Qualifier' },
            { code: '6060', name: 'Menge' },
            { code: '6411', name: 'Maßeinheit' },
          ],
        },
      ],
    },

    MOA: {
      name: 'Betrag',
      elements: [
        {
          code: 'C516',
          name: 'Betragsangaben',
          components: [
            { code: '5025', name: 'Betragsart, Qualifier' },
            { code: '5004', name: 'Betrag' },
            { code: '6345', name: 'Währung' },
            { code: '6343', name: 'Währungsart, Qualifier' },
            { code: '4405', name: 'Status' },
          ],
        },
      ],
    },

    FTX: {
      name: 'Freitext',
      elements: [
        { code: '4451', name: 'Textgegenstand, Qualifier' },
        { code: '4453', name: 'Funktion des Freitexts' },
        {
          code: 'C107',
          name: 'Textreferenz',
          components: [
            { code: '4441', name: 'Codierter Freitext' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
          ],
        },
        {
          code: 'C108',
          name: 'Freier Text',
          components: repeated(5, '4440', 'Freitext, Zeile'),
        },
        { code: '3453', name: 'Sprache' },
        { code: '4447', name: 'Format des Freitexts' },
      ],
    },

    // -- Dienstsegmente der CONTRL -----------------------------------------
    //
    // Sie tragen die Ablehnungsgruende einer Syntaxfehlermeldung. S011
    // benennt die Fundstelle innerhalb des beanstandeten Segments.

    UCI: {
      name: 'Antwort zum Austausch',
      elements: [
        { code: '0020', name: 'Austauschreferenz' },
        {
          code: 'S002',
          name: 'Absender des Austauschs',
          components: [
            { code: '0004', name: 'Absenderkennung' },
            { code: '0007', name: 'Kennungsqualifier' },
            { code: '0008', name: 'Interne Absenderkennung' },
            { code: '0042', name: 'Interne Absender-Unterkennung' },
          ],
        },
        {
          code: 'S003',
          name: 'Empfänger des Austauschs',
          components: [
            { code: '0010', name: 'Empfängerkennung' },
            { code: '0007', name: 'Kennungsqualifier' },
            { code: '0014', name: 'Interne Empfängerkennung' },
            { code: '0046', name: 'Interne Empfänger-Unterkennung' },
          ],
        },
        { code: '0083', name: 'Handlung, Code' },
        { code: '0085', name: 'Syntaxfehler, Code' },
        { code: '0135', name: 'Dienstsegment, Code' },
        {
          code: 'S011',
          name: 'Fundstelle des Fehlers',
          components: [
            { code: '0098', name: 'Position des fehlerhaften Datenelements im Segment' },
            { code: '0104', name: 'Position der fehlerhaften Komponente' },
            { code: '0136', name: 'Wiederholung des fehlerhaften Datenelements' },
          ],
        },
        { code: '0534', name: 'Sicherheitsreferenznummer' },
        { code: '0138', name: 'Position des Sicherheitssegments' },
      ],
    },

    UCM: {
      name: 'Antwort zur Nachricht',
      elements: [
        { code: '0062', name: 'Nachrichten-Referenznummer' },
        {
          code: 'S009',
          name: 'Nachrichtenbezeichner',
          components: [
            { code: '0065', name: 'Nachrichtentyp' },
            { code: '0052', name: 'Versionsnummer' },
            { code: '0054', name: 'Releasenummer' },
            { code: '0051', name: 'Verwaltende Organisation' },
            { code: '0057', name: 'Anwendungsspezifische Kennung (Formatversion)' },
          ],
        },
        { code: '0083', name: 'Handlung, Code' },
        { code: '0085', name: 'Syntaxfehler, Code' },
        { code: '0135', name: 'Dienstsegment, Code' },
        {
          code: 'S011',
          name: 'Fundstelle des Fehlers',
          components: [
            { code: '0098', name: 'Position des fehlerhaften Datenelements im Segment' },
            { code: '0104', name: 'Position der fehlerhaften Komponente' },
            { code: '0136', name: 'Wiederholung des fehlerhaften Datenelements' },
          ],
        },
      ],
    },

    UCS: {
      name: 'Segmentfehler',
      elements: [
        { code: '0096', name: 'Position des Segments in der Nachricht' },
        { code: '0085', name: 'Syntaxfehler, Code' },
      ],
    },

    UCD: {
      name: 'Datenelementfehler',
      elements: [
        { code: '0085', name: 'Syntaxfehler, Code' },
        {
          code: 'S011',
          name: 'Fundstelle des Fehlers',
          components: [
            { code: '0098', name: 'Position des fehlerhaften Datenelements im Segment' },
            { code: '0104', name: 'Position der fehlerhaften Komponente' },
            { code: '0136', name: 'Wiederholung des fehlerhaften Datenelements' },
          ],
        },
      ],
    },

    ERC: {
      name: 'Fehlercode',
      elements: [
        {
          code: 'C901',
          name: 'Anwendungsfehler',
          components: [
            { code: '9321', name: 'Anwendungsfehler, Code' },
            { code: '1131', name: 'Codeliste' },
            { code: '3055', name: 'Verantwortliche Stelle für die Codeliste' },
          ],
        },
      ],
    },
  });

  /**
   * @param {string} tag
   * @returns {boolean} Ob fuer `tag` eine Definition hinterlegt ist.
   */
  function hasSegmentDefinition(tag) {
    return Object.prototype.hasOwnProperty.call(SEGMENT_DEFINITIONS, tag);
  }

  /**
   * Schlaegt Nummer und Bezeichnung einer Position nach.
   *
   * Ohne `component` wird das Datenelement selbst geliefert, also bei einem
   * zusammengesetzten Element dessen Composite-Code. Mit `component` die
   * Komponente. Ein einfaches Datenelement ist seine eigene einzige
   * Komponente -- `component === 0` liefert dort das Element.
   *
   * Alles, was nicht hinterlegt ist, ergibt `null`. Die Darstellung faellt
   * dann auf die Positionsangabe zurueck; eine erfundene Bezeichnung waere
   * schlechter als eine ehrliche Positionsnummer.
   *
   * @param {string} tag Segment-Tag.
   * @param {number} element Elementposition, nullbasiert, ohne das Tag.
   * @param {number} [component] Komponentenposition, nullbasiert.
   * @returns {{code: string, name: string}|null}
   */
  function dataElement(tag, element, component) {
    const definition = hasSegmentDefinition(tag) ? SEGMENT_DEFINITIONS[tag] : null;
    const entry = definition?.elements[element];
    if (!entry) return null;

    if (component === undefined) return { code: entry.code, name: entry.name };

    if (!entry.components) {
      // Einfaches Datenelement: nur die erste Komponente ist es selbst.
      return component === 0 ? { code: entry.code, name: entry.name } : null;
    }

    const part = entry.components[component];
    return part ? { code: part.code, name: part.name } : null;
  }

  ns.SEGMENT_DEFINITIONS = SEGMENT_DEFINITIONS;
  ns.hasSegmentDefinition = hasSegmentDefinition;
  ns.dataElement = dataElement;
})((globalThis.EdifactExplorer ??= {}));
