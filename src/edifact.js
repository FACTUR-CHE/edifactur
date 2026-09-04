/**
 * EDIFACT-Parser.
 *
 * Alle Funktionen dieses Moduls sind rein und greifen nicht auf das DOM zu.
 * Sie sind damit ohne Browser testbar (siehe tests/edifact.test.js) und
 * unabhaengig von der Darstellung wiederverwendbar.
 *
 * Zum Aufbau: die Datei ist ein klassisches Skript in einer IIFE und haengt
 * ihre oeffentlichen Namen an den gemeinsamen Namensraum `EdifactExplorer`.
 * Weil sie kein `import`/`export` enthaelt, ist sie gleichzeitig ein gueltiges
 * ES-Modul -- die Tests laden sie per Seiteneffekt-Import. So laeuft die
 * Anwendung ohne Build-Schritt und ohne Webserver direkt aus dem Dateisystem.
 */

(function (ns) {
  'use strict';

  /** Laenge des UNA-Headers in Zeichen. Per Norm fest. */
  const UNA_LENGTH = 9;

  /** Trennzeichen nach UN/EDIFACT, falls kein UNA-Header vorhanden ist. */
  const DEFAULT_DELIMITERS = Object.freeze({
    component: ':',
    element: '+',
    release: '?',
    segment: "'",
  });

  /** Fachliche Bezeichnungen der unterstuetzten Segment-Tags. */
  const SEGMENT_LABELS = Object.freeze({
    UNA: 'Trennzeichenvorgabe',
    UNB: 'Austauschkopf',
    UNH: 'Nachrichtenkopf',
    BGM: 'Dokument / Vorgang',
    DTM: 'Datum und Zeit',
    NAD: 'Marktpartner',
    CTA: 'Ansprechpartner',
    COM: 'Kontakt',
    RFF: 'Referenz',
    LOC: 'Ort / Lokation',
    LIN: 'Position',
    PIA: 'Zusatz-ID',
    QTY: 'Menge',
    MOA: 'Betrag',
    FTX: 'Freitext',
    ERC: 'Fehlercode',
    UNT: 'Nachrichtenende',
    UNZ: 'Austauschende',
  });

  /** Bezeichnung fuer Segmente, die nicht in SEGMENT_LABELS stehen. */
  const UNKNOWN_SEGMENT_LABEL = 'EDIFACT-Segment';

  /** Nachrichtentyp, wenn eine Segmentgruppe keinen UNH-Kopf enthaelt. */
  const UNKNOWN_MESSAGE_TYPE = 'EDIFACT';

  /**
   * @param {string} tag Segment-Tag, z. B. "UNH".
   * @returns {string} Fachliche Bezeichnung oder UNKNOWN_SEGMENT_LABEL.
   */
  function segmentLabel(tag) {
    return SEGMENT_LABELS[tag] ?? UNKNOWN_SEGMENT_LABEL;
  }

  /**
   * Prueft, ob `source` mit einem vollstaendigen UNA-Header beginnt.
   *
   * @param {unknown} source
   * @returns {boolean}
   */
  function hasUnaHeader(source) {
    return typeof source === 'string' && source.startsWith('UNA') && source.length >= UNA_LENGTH;
  }

  /**
   * Liest die Trennzeichen aus dem UNA-Header von `source`.
   *
   * Der UNA-Header hat eine feste Laenge von neun Zeichen mit festen
   * Positionen. Das erklaert, warum die Indizes unten springen: Position 5 und
   * 7 werden fuer die Anzeige nicht gebraucht.
   *
   *     U  N  A  :  +  .  ?  ␠  '
   *     0  1  2  3  4  5  6  7  8
   *
   *     3  Komponententrenner
   *     4  Elementtrenner
   *     5  Dezimalzeichen  (hier nicht ausgewertet, rein numerische Darstellung)
   *     6  Release-Zeichen
   *     7  reserviert, per Norm ein Leerzeichen
   *     8  Segmenttrenner
   *
   * @param {unknown} source Rohe EDIFACT-Nutzlast.
   * @returns {object} Gelesene oder voreingestellte Trennzeichen.
   */
  function readDelimiters(source) {
    if (!hasUnaHeader(source)) return DEFAULT_DELIMITERS;
    return Object.freeze({
      component: source[3],
      element: source[4],
      release: source[6],
      segment: source[8],
    });
  }

  /**
   * Zerlegt `value` am `separator` und laesst die Release-Zeichen stehen.
   *
   * Das ist die Grundlage fuer eine mehrstufige Zerlegung: erst am
   * Elementtrenner, dann am Komponententrenner. Wuerde die erste Stufe die
   * Maskierung schon aufheben, waere `?:` danach ein gewoehnlicher
   * Doppelpunkt -- die zweite Stufe wuerde ihn faelschlich als Trenner lesen
   * und eine Komponente zerreissen.
   *
   * @param {string} value
   * @param {string} separator
   * @param {string} releaseChar
   * @returns {string[]} Immer mindestens ein Element, noch maskiert.
   */
  function splitKeepingRelease(value, separator, releaseChar) {
    const parts = [];
    let current = '';
    let released = false;

    for (const char of value) {
      if (released) {
        current += char;
        released = false;
      } else if (char === releaseChar) {
        current += char;
        released = true;
      } else if (char === separator) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    parts.push(current);
    return parts;
  }

  /**
   * Hebt die Maskierung in `value` auf.
   *
   * Steht das Release-Zeichen am Ende der Eingabe, gibt es kein Folgezeichen
   * mehr, das es schuetzen koennte -- dann wird es als Nutzdatenzeichen
   * uebernommen.
   *
   * @param {string} value
   * @param {string} releaseChar
   * @returns {string}
   */
  function unescapeEdifact(value, releaseChar) {
    let result = '';
    let released = false;

    for (const char of value) {
      if (released) {
        result += char;
        released = false;
      } else if (char === releaseChar) {
        released = true;
      } else {
        result += char;
      }
    }

    if (released) result += releaseChar;
    return result;
  }

  /**
   * Zerlegt `value` am `separator` und hebt die Maskierung auf.
   *
   * @param {string} value
   * @param {string} separator
   * @param {string} releaseChar
   * @returns {string[]} Immer mindestens ein Element.
   */
  function splitEdifact(value, separator, releaseChar) {
    return splitKeepingRelease(value, separator, releaseChar).map((part) =>
      unescapeEdifact(part, releaseChar),
    );
  }

  /**
   * Ermittelt den Nachrichtentyp einer Segmentgruppe aus ihrem UNH-Kopf.
   *
   * @param {object[]} segments
   * @param {string} componentSeparator
   * @returns {string}
   */
  function messageType(segments, componentSeparator) {
    const header = segments.find((segment) => segment.tag === 'UNH');
    const identifier = header?.elements[1];
    if (!identifier) return UNKNOWN_MESSAGE_TYPE;
    return identifier.split(componentSeparator)[0] || UNKNOWN_MESSAGE_TYPE;
  }

  /**
   * Zerlegt eine EDIFACT-Nutzlast in Nachrichten und deren Segmente.
   *
   * Segmente vor dem ersten UNH (Austauschkopf) und nach dem letzten UNT
   * (Austauschende) bilden jeweils eigene Gruppen, damit auch Huellsegmente
   * sichtbar bleiben. Nur Gruppen mit UNH-Kopf sind fachliche Nachrichten.
   *
   * @param {unknown} source Rohe EDIFACT-Nutzlast.
   * @returns {object[]} Gruppen mit `type` und `segments`.
   */
  function parseEdifact(source) {
    if (typeof source !== 'string' || source.length === 0) return [];

    const delimiters = readDelimiters(source);
    const messages = [];
    let current = [];

    // Der UNA-Header ist keine Nachricht, sondern eine Vorgabe. Er wird als
    // eigenes Segment ausgewiesen und vor dem Zerlegen abgeschnitten -- sonst
    // wuerde er am Elementtrenner zerfallen und ein Segment mit dem
    // unbrauchbaren Tag "UNA:" erzeugen.
    if (hasUnaHeader(source)) {
      // Die UNA-Zeichen sind Vorgaben, keine Nutzdaten. Sie werden einzeln
      // ausgewiesen und nicht am Komponententrenner zerlegt -- der
      // Komponententrenner steht dort selbst als Wert.
      const unaElements = [...source.slice(3, UNA_LENGTH)];
      current.push({
        tag: 'UNA',
        elements: unaElements,
        components: unaElements.map((value) => [value]),
        raw: source.slice(0, UNA_LENGTH),
      });
    }

    const body = hasUnaHeader(source) ? source.slice(UNA_LENGTH) : source;
    // Bis zur Element- und Komponentenstufe bleibt die Maskierung erhalten,
    // sonst gingen maskierte Trennzeichen auf der naechsten Stufe verloren.
    const rawSegments = splitKeepingRelease(body, delimiters.segment, delimiters.release)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const raw of rawSegments) {
      const rawElements = splitKeepingRelease(raw, delimiters.element, delimiters.release);
      const segment = {
        tag: unescapeEdifact(rawElements[0], delimiters.release),
        elements: rawElements
          .slice(1)
          .map((element) => unescapeEdifact(element, delimiters.release)),
        components: rawElements
          .slice(1)
          .map((element) => splitEdifact(element, delimiters.component, delimiters.release)),
        raw,
      };

      // Der UNA-Header allein bildet keine Gruppe -- folgt direkt ein UNH,
      // gehoert er zu dieser Nachricht.
      if (segment.tag === 'UNH' && current.some((entry) => entry.tag !== 'UNA')) {
        messages.push(current);
        current = [];
      }

      current.push(segment);

      if (segment.tag === 'UNT') {
        messages.push(current);
        current = [];
      }
    }

    if (current.length > 0) messages.push(current);

    return messages.map((segments) => ({
      segments,
      type: messageType(segments, delimiters.component),
    }));
  }

  /**
   * Fuehrt einen bewusst einfachen Syntax-Check fuer eingeklebte
   * EDIFACT-Nachrichten aus. Geprueft werden grundlegende Segmentstruktur,
   * Abschluss mit Segmenttrenner sowie paarige UNH/UNT-Abschnitte.
   *
   * @param {unknown} source
   * @returns {{ok: true, messages: object[], delimiters: object}|{ok: false, error: string}}
   */
  function validateEdifactSyntax(source) {
    if (typeof source !== 'string' || source.trim().length === 0) {
      return { ok: false, error: 'Bitte eine EDIFACT-Nachricht einfuegen.' };
    }

    const trimmed = source.trim();
    const delimiters = readDelimiters(trimmed);
    if (!trimmed.endsWith(delimiters.segment)) {
      return {
        ok: false,
        error: `Die Nachricht muss mit dem Segmenttrenner "${delimiters.segment}" enden.`,
      };
    }

    const messages = parseEdifact(trimmed);
    if (messages.length === 0) {
      return { ok: false, error: 'Es konnten keine EDIFACT-Segmente erkannt werden.' };
    }

    const segments = messages
      .flatMap((message) => message.segments)
      .filter((segment) => segment.tag !== 'UNA');
    if (segments.length === 0) {
      return { ok: false, error: 'Die Nachricht enthaelt keine verwertbaren EDIFACT-Segmente.' };
    }

    let openMessage = null;

    for (const segment of segments) {
      if (!/^[A-Z0-9]{3}$/.test(segment.tag)) {
        return { ok: false, error: `Ungueltiges Segment-Tag "${segment.tag}" erkannt.` };
      }

      if (segment.tag === 'UNH') {
        if (openMessage !== null) {
          return { ok: false, error: 'Vor dem naechsten UNH fehlt ein abschliessendes UNT.' };
        }
        openMessage = segment.elements[0] ?? '';
      }

      if (segment.tag === 'UNT') {
        if (openMessage === null) {
          return { ok: false, error: 'UNT ohne vorheriges UNH erkannt.' };
        }
        const reference = segment.elements[1] ?? '';
        if (reference && openMessage && reference !== openMessage) {
          return {
            ok: false,
            error: `UNH/UNT-Referenzen passen nicht zusammen (${openMessage} / ${reference}).`,
          };
        }
        openMessage = null;
      }
    }

    if (openMessage !== null) {
      return {
        ok: false,
        error: `Fuer UNH ${openMessage || ''} fehlt ein abschliessendes UNT.`.trim(),
      };
    }

    return { ok: true, messages, delimiters };
  }

  ns.DEFAULT_DELIMITERS = DEFAULT_DELIMITERS;
  ns.SEGMENT_LABELS = SEGMENT_LABELS;
  ns.UNKNOWN_SEGMENT_LABEL = UNKNOWN_SEGMENT_LABEL;
  ns.UNKNOWN_MESSAGE_TYPE = UNKNOWN_MESSAGE_TYPE;
  ns.segmentLabel = segmentLabel;
  ns.hasUnaHeader = hasUnaHeader;
  ns.readDelimiters = readDelimiters;
  ns.splitEdifact = splitEdifact;
  ns.splitKeepingRelease = splitKeepingRelease;
  ns.unescapeEdifact = unescapeEdifact;
  ns.parseEdifact = parseEdifact;
  ns.validateEdifactSyntax = validateEdifactSyntax;
})((globalThis.EdifactExplorer ??= {}));
