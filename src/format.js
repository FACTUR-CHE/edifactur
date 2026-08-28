/**
 * Formatierung und Trefferzerlegung.
 *
 * Rein und DOM-frei. Insbesondere die Suche arbeitet hier auf dem Rohtext und
 * gibt Abschnitte zurueck -- die Umsetzung in Textknoten und <mark> passiert
 * erst in dom.js. Damit kann ein Treffer nicht in eine HTML-Entity hineinlaufen.
 *
 * Zum Aufbau siehe den Kopfkommentar in edifact.js.
 */

(function (ns) {
  'use strict';

  /** Ersatzzeichen fuer leere Werte in der Oberflaeche. */
  const PLACEHOLDER = '–';

  /** Ersatzzeichen fuer ein leeres EDIFACT-Element. */
  const EMPTY_ELEMENT = '∅';

  const LOCALE = 'de-DE';

  /**
   * ISO-8601-Form, wie das erwartete Datenformat sie vorgibt:
   * `2026-08-01`, optional mit Zeit und Zonenangabe.
   *
   * Die Pruefung ist noetig, weil `new Date(string)` fuer Nicht-ISO-Eingaben
   * implementierungsabhaengig und ausgesprochen nachsichtig ist: V8 liest aus
   * `"<img src=x onerror=...>"` ein Datum im Jahr 2001. Ohne diese Schranke
   * wuerde die Anzeige aus einem unbrauchbaren Feldwert einen plausibel
   * aussehenden Zeitstempel erfinden -- schlimmer als ihn roh zu zeigen.
   */
  const ISO_TIMESTAMP =
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

  /**
   * Formatiert einen Zeitstempel. Ist der Wert nicht als Datum lesbar, wird er
   * unveraendert zurueckgegeben -- die Rohform ist fuer die Fehlersuche
   * nuetzlicher als "Invalid Date" und ehrlicher als ein geratenes Datum.
   *
   * @param {unknown} value ISO-8601-String oder Zeitstempel in Millisekunden.
   * @param {string} [locale]
   * @returns {string}
   */
  function formatDate(value, locale = LOCALE) {
    if (!value) return PLACEHOLDER;

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return String(value);
      return new Date(value).toLocaleString(locale);
    }

    const text = String(value);
    if (!ISO_TIMESTAMP.test(text)) return text;

    const date = new Date(text);
    // Number.isNaN(date) waere immer false -- geprueft werden muss die Zahl.
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleString(locale);
  }

  /**
   * Formatiert eine Anzahl mit Tausendertrennern.
   *
   * @param {number} value
   * @param {string} [locale]
   * @returns {string}
   */
  function formatCount(value, locale = LOCALE) {
    return Number(value).toLocaleString(locale);
  }

  /**
   * Zerlegt `text` in Treffer- und Nicht-Treffer-Abschnitte.
   *
   * Die Suche laeuft ueber String#indexOf, nicht ueber einen aus der Eingabe
   * zusammengesetzten regulaeren Ausdruck. Damit entfaellt sowohl das Maskieren
   * von Metazeichen als auch jede Wechselwirkung mit HTML-Maskierung.
   *
   * @param {unknown} text Zu durchsuchender Rohtext.
   * @param {unknown} query Suchbegriff, Gross-/Kleinschreibung wird ignoriert.
   * @returns {{text: string, match: boolean}[]} Leeres Array bei leerem Text.
   */
  function splitByQuery(text, query) {
    const value = String(text ?? '');
    if (value.length === 0) return [];

    const needle = String(query ?? '').trim();
    if (needle.length === 0) return [{ text: value, match: false }];

    const haystack = value.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const parts = [];
    let index = 0;

    for (;;) {
      const found = haystack.indexOf(lowerNeedle, index);
      if (found === -1) break;
      if (found > index) parts.push({ text: value.slice(index, found), match: false });
      parts.push({ text: value.slice(found, found + needle.length), match: true });
      index = found + needle.length;
    }

    if (index < value.length) parts.push({ text: value.slice(index), match: false });
    return parts;
  }

  ns.PLACEHOLDER = PLACEHOLDER;
  ns.EMPTY_ELEMENT = EMPTY_ELEMENT;
  ns.formatDate = formatDate;
  ns.formatCount = formatCount;
  ns.splitByQuery = splitByQuery;
})((globalThis.EdifactExplorer ??= {}));
