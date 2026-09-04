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

  /**
   * Feldaufbau der Formatkennzeichen aus DE 2379.
   *
   * `fields` ist die Folge der Felder mit ihrer Zeichenzahl, `offset` markiert
   * die Formate mit UTC-Versatz, `period` die Zeitraumformate.
   *
   * Der Formatqualifier entscheidet ueber die Lesart, und ihn falsch zu lesen
   * ist der haeufigste stille Fehler im Alltag: `202608010815` ist unter 203
   * Ortszeit ohne Versatz, unter 303 Ortszeit mit Versatz.
   */
  const DATE_FORMATS = Object.freeze({
    2: {
      fields: [
        ['day', 2],
        ['month', 2],
        ['year2', 2],
      ],
    },
    101: {
      fields: [
        ['year2', 2],
        ['month', 2],
        ['day', 2],
      ],
    },
    102: {
      fields: [
        ['year', 4],
        ['month', 2],
        ['day', 2],
      ],
    },
    106: {
      fields: [
        ['month', 2],
        ['day', 2],
      ],
    },
    201: {
      fields: [
        ['year2', 2],
        ['month', 2],
        ['day', 2],
        ['hour', 2],
        ['minute', 2],
      ],
    },
    203: {
      fields: [
        ['year', 4],
        ['month', 2],
        ['day', 2],
        ['hour', 2],
        ['minute', 2],
      ],
    },
    204: {
      fields: [
        ['year', 4],
        ['month', 2],
        ['day', 2],
        ['hour', 2],
        ['minute', 2],
        ['second', 2],
      ],
    },
    303: {
      fields: [
        ['year', 4],
        ['month', 2],
        ['day', 2],
        ['hour', 2],
        ['minute', 2],
      ],
      offset: true,
    },
    305: {
      fields: [
        ['month', 2],
        ['day', 2],
        ['hour', 2],
        ['minute', 2],
      ],
    },
    401: {
      fields: [
        ['hour', 2],
        ['minute', 2],
      ],
    },
    610: {
      fields: [
        ['year', 4],
        ['month', 2],
      ],
    },
    616: {
      fields: [
        ['year', 4],
        ['week', 2],
      ],
    },
    719: { period: '203' },
  });

  /** Zulaessige Wertebereiche der Felder. */
  const FIELD_RANGES = Object.freeze({
    month: [1, 12],
    day: [1, 31],
    hour: [0, 23],
    minute: [0, 59],
    second: [0, 59],
    week: [1, 53],
  });

  /** Bezeichnungen fuer die Fehlermeldungen. */
  const FIELD_LABELS = Object.freeze({
    month: 'Monat',
    day: 'Tag',
    hour: 'Stunde',
    minute: 'Minute',
    second: 'Sekunde',
    week: 'Kalenderwoche',
  });

  /**
   * Zerlegt einen Datumswert nach Feldliste und prueft die Wertebereiche.
   *
   * @param {string} value
   * @param {[string, number][]} fields
   * @returns {{parts: object}|{error: string}}
   */
  function readDateFields(value, fields) {
    const expected = fields.reduce((sum, [, length]) => sum + length, 0);

    if (value.length !== expected) {
      return {
        error: `Der Wert hat ${value.length} Zeichen, das Format erwartet ${expected}.`,
      };
    }

    if (!/^\d+$/.test(value)) {
      return { error: 'Der Wert enthält Zeichen, die in diesem Format nicht vorkommen.' };
    }

    const parts = {};
    let at = 0;

    for (const [name, length] of fields) {
      const text = value.slice(at, at + length);
      at += length;
      parts[name] = text;

      const range = FIELD_RANGES[name];
      if (!range) continue;

      const number = Number(text);
      if (number < range[0] || number > range[1]) {
        return {
          error: `${FIELD_LABELS[name]} ${text} liegt außerhalb von ${range[0]}–${range[1]}.`,
        };
      }
    }

    // Erst mit vierstelligem Jahr laesst sich ein Tag gegen seinen Monat
    // pruefen. Bei zweistelligem Jahr ist die Jahrhundertlage unbekannt und
    // damit auch die Schaltjahreslage -- dann bleibt es bei der Bereichspruefung.
    if (parts.year && parts.month && parts.day) {
      const year = Number(parts.year);
      const month = Number(parts.month);
      const day = Number(parts.day);
      const date = new Date(Date.UTC(year, month - 1, day));

      if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return { error: `Den ${parts.day}.${parts.month}.${parts.year} gibt es nicht.` };
      }
    }

    return { parts };
  }

  /**
   * Setzt die gelesenen Felder zu einer lesbaren Angabe zusammen.
   *
   * @param {object} parts
   * @returns {string}
   */
  function renderDateParts(parts) {
    const pieces = [];

    if (parts.week !== undefined) {
      pieces.push(`Woche ${parts.week}/${parts.year}`);
    } else if (parts.day !== undefined) {
      // Ein zweistelliges Jahr wird nicht zum vierstelligen ergaenzt: die
      // Jahrhundertlage steht nicht in der Nachricht.
      const year = parts.year ?? parts.year2;
      pieces.push(
        year === undefined ? `${parts.day}.${parts.month}.` : `${parts.day}.${parts.month}.${year}`,
      );
    } else if (parts.month !== undefined) {
      pieces.push(`${parts.month}.${parts.year}`);
    }

    if (parts.hour !== undefined) {
      pieces.push(
        parts.second === undefined
          ? `${parts.hour}:${parts.minute}`
          : `${parts.hour}:${parts.minute}:${parts.second}`,
      );
    }

    if (parts.offset !== undefined) pieces.push(`(UTC${parts.offset})`);
    if (parts.day !== undefined && parts.year === undefined && parts.year2 === undefined) {
      pieces.push('(ohne Jahresangabe)');
    }

    return pieces.join(' ');
  }

  /**
   * Uebersetzt einen DTM-Wert anhand seines Formatkennzeichens.
   *
   * Vier Ergebnisse, die auseinandergehalten werden muessen:
   *
   *   `null`                    Kein Wert oder kein Formatkennzeichen. Es
   *                             gibt nichts zu sagen.
   *   `{status: 'unknown'}`     Das Formatkennzeichen ist nicht hinterlegt.
   *                             Der Rohwert bleibt stehen; eine geratene
   *                             Lesart waere schlimmer als keine.
   *   `{status: 'invalid'}`     Der Wert passt nicht zum angegebenen Format.
   *   `{status: 'ok', text}`    Lesbare Angabe.
   *
   * Bei Format 303 wird der UTC-Versatz ausgewiesen, nicht verrechnet. Er ist
   * ein- oder zweistellig -- `?+00`, `?+1` und `?+2` kommen in der
   * Marktkommunikation alle vor -- und wird fuer die Anzeige auf zwei Stellen
   * gebracht.
   *
   * @param {unknown} value  Wert aus DE 2380.
   * @param {unknown} format Formatkennzeichen aus DE 2379.
   * @returns {{status: string, text?: string, error?: string}|null}
   */
  function decodeDateTime(value, format) {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    if (typeof format !== 'string' || format.trim().length === 0) return null;

    const key = format.trim();
    if (!Object.prototype.hasOwnProperty.call(DATE_FORMATS, key)) return { status: 'unknown' };

    const spec = DATE_FORMATS[key];
    const text = value.trim();

    if (spec.period) {
      const halves = text.split('-');
      if (halves.length !== 2) {
        return {
          status: 'invalid',
          error: 'Ein Zeitraum braucht Anfang und Ende, getrennt mit "-".',
        };
      }

      const decoded = halves.map((half) => decodeDateTime(half, spec.period));
      const broken = decoded.find((entry) => entry?.status !== 'ok');
      if (broken) return broken;

      return { status: 'ok', text: `${decoded[0].text} – ${decoded[1].text}` };
    }

    let body = text;
    let offset;

    if (spec.offset) {
      const match = /([+-]\d{1,2})$/.exec(text);
      if (!match) {
        return {
          status: 'invalid',
          error: 'Das Format verlangt einen UTC-Versatz am Ende, etwa "+00" oder "+2".',
        };
      }
      body = text.slice(0, match.index);
      const sign = match[1][0];
      const hours = match[1].slice(1);
      offset = `${sign}${hours.padStart(2, '0')}`;
    }

    const read = readDateFields(body, spec.fields);
    if (read.error) return { status: 'invalid', error: read.error };

    return { status: 'ok', text: renderDateParts({ ...read.parts, offset }) };
  }

  /**
   * Setzt Segmente wieder zu EDIFACT zusammen.
   *
   * Was im Viewer zu sehen ist, muss ins Ticket oder in die Mail an den
   * Marktpartner. Genau zwei Formen sind dafuer brauchbar: die einzeilige
   * Rohform, wie sie uebertragen wird, und die Form mit einem Segment je
   * Zeile, wie man sie liest.
   *
   * @param {object[]} segments Segmente mit `tag` und `raw`.
   * @param {string} segmentSeparator
   * @param {string} [between] Was zwischen die Segmente kommt. Leer ergibt die
   *   einzeilige Rohform, `"\n"` ein Segment je Zeile.
   * @returns {string}
   */
  function joinSegments(segments, segmentSeparator, between = '') {
    if (!Array.isArray(segments)) return '';

    return segments
      .map((segment) =>
        // Der UNA-Header traegt seinen Abschluss selbst. Ein weiterer
        // Segmenttrenner wuerde ihn verdoppeln.
        segment.tag === 'UNA' ? segment.raw : `${segment.raw}${segmentSeparator}`,
      )
      .join(between);
  }

  ns.PLACEHOLDER = PLACEHOLDER;
  ns.EMPTY_ELEMENT = EMPTY_ELEMENT;
  ns.formatDate = formatDate;
  ns.formatCount = formatCount;
  ns.splitByQuery = splitByQuery;
  ns.joinSegments = joinSegments;
  ns.DATE_FORMATS = DATE_FORMATS;
  ns.decodeDateTime = decodeDateTime;
})((globalThis.EdifactExplorer ??= {}));
