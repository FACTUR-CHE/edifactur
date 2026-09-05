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

  /** Erlaeuterung zu einem Code, der nicht in den Tabellen steht. */
  const UNLISTED_CODE =
    'Der Code steht nicht in der hinterlegten Codeliste. Das heißt nicht, dass er ungültig ist — ' +
    'die Tabellen sind kuratierte Teilmengen, und die EDI@Energy-eigenen Codes sind noch nicht erfasst.';

  /** Erlaeuterung zu einem Formatkennzeichen ohne hinterlegte Lesart. */
  const UNLISTED_FORMAT =
    'Für dieses Formatkennzeichen ist keine Lesart hinterlegt. Der Rohwert bleibt unverändert stehen.';

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
   * Liest einen Zeitstempel als Millisekunden seit Epoche.
   *
   * Einzige Stelle, an der aus einem Feldwert ein Zeitpunkt wird -- die
   * Anzeige und der Zeitraumfilter muessen sich darueber einig sein, welche
   * Werte als Datum gelten. Unlesbare Werte ergeben `null` und keinen
   * geratenen Zeitpunkt.
   *
   * @param {unknown} value ISO-8601-String oder Zeitstempel in Millisekunden.
   * @returns {number|null}
   */
  function parseTimestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) return null;

    const ms = new Date(value).getTime();
    // Number.isNaN(date) waere immer false -- geprueft werden muss die Zahl.
    return Number.isNaN(ms) ? null : ms;
  }

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

    const ms = parseTimestamp(value);
    if (ms === null) return String(value);
    return new Date(ms).toLocaleString(locale);
  }

  /**
   * Formatiert einen Zeitpunkt als reines Datum, ohne Uhrzeit.
   *
   * Fuer Stellen, an denen die Spanne knapp benannt werden muss -- eine
   * eingeklappte Zeile traegt kein "00:00:00 bis 23:59:59".
   *
   * @param {number} value Zeitpunkt in Millisekunden.
   * @param {string} [locale]
   * @returns {string}
   */
  function formatDay(value, locale = LOCALE) {
    return new Date(value).toLocaleDateString(locale);
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

    // Mehrere Begriffe, weil eine feldbezogene Suche mehrere Bedingungen
    // enthaelt: `loc:DE0005 Meier` soll beide Werte hervorheben.
    const needles = (Array.isArray(query) ? query : [query])
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean);
    if (needles.length === 0) return [{ text: value, match: false }];

    const haystack = value.toLowerCase();
    const lowered = needles.map((needle) => needle.toLowerCase());
    const parts = [];
    let index = 0;

    for (;;) {
      // Der frueheste Treffer gewinnt, bei gleicher Position der laengere.
      // Sonst koennte ein kurzer Begriff einen ueberlappenden langen
      // zerschneiden und die Hervorhebung waere von der Reihenfolge der
      // Begriffe abhaengig.
      let found = -1;
      let length = 0;

      for (const needle of lowered) {
        const at = haystack.indexOf(needle, index);
        if (at === -1) continue;
        if (found === -1 || at < found || (at === found && needle.length > length)) {
          found = at;
          length = needle.length;
        }
      }

      if (found === -1) break;
      if (found > index) parts.push({ text: value.slice(index, found), match: false });
      parts.push({ text: value.slice(found, found + length), match: true });
      index = found + length;
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

  /**
   * Waehlt die Erlaeuterung zu einem Wert.
   *
   * Eine Stelle fuer eine Entscheidung, die an zwei Orten gebraucht wird: die
   * Anzeige macht daraus einen Knoten mit Klasse und Titel, der CSV-Export
   * eine Spalte. Liefe die Entscheidung zweimal, wuerde die Datei
   * frueher oder spaeter etwas anderes behaupten als der Bildschirm.
   *
   * DE 2380 traegt seine Lesart nicht in sich -- erst das Formatkennzeichen
   * in DE 2379 macht daraus ein Datum. In C507 steht es immer als naechste
   * Komponente.
   *
   * @param {{code: string}|null} definition Datenelement laut segments.js.
   * @param {string} value
   * @param {string[]} siblings Komponenten desselben Datenelements.
   * @param {number} component
   * @returns {{status: string, text: string, detail?: string}|null}
   *   `null`, wenn es nichts zu sagen gibt.
   */
  function valueMeaning(definition, value, siblings, component) {
    if (definition?.code === '2380') {
      const decoded = decodeDateTime(value, siblings[component + 1]);
      if (!decoded) return null;
      if (decoded.status === 'ok') return { status: 'date', text: decoded.text };
      if (decoded.status === 'unknown') {
        return {
          status: 'date-unlisted',
          text: 'Format nicht hinterlegt',
          detail: UNLISTED_FORMAT,
        };
      }
      return { status: 'date-invalid', text: 'passt nicht zum Format', detail: decoded.error };
    }

    const meaning = ns.codeMeaning(definition?.code, value);
    if (!meaning) return null;

    return meaning.name
      ? { status: 'code', text: meaning.name }
      : { status: 'unlisted', text: 'nicht hinterlegt', detail: UNLISTED_CODE };
  }

  ns.PLACEHOLDER = PLACEHOLDER;
  ns.EMPTY_ELEMENT = EMPTY_ELEMENT;
  ns.parseTimestamp = parseTimestamp;
  ns.formatDate = formatDate;
  ns.formatDay = formatDay;
  ns.formatCount = formatCount;
  ns.splitByQuery = splitByQuery;
  ns.joinSegments = joinSegments;
  ns.DATE_FORMATS = DATE_FORMATS;
  ns.decodeDateTime = decodeDateTime;
  ns.valueMeaning = valueMeaning;
  ns.UNLISTED_CODE = UNLISTED_CODE;
})((globalThis.EdifactExplorer ??= {}));
