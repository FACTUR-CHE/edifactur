/**
 * Segmentweiser Vergleich zweier Nachrichten.
 *
 * Rein und DOM-frei. Verglichen wird auf Segment- und Elementebene, nicht
 * zeichenweise auf dem Rohtext: ein Zeichen-Diff wuerde bei EDIFACT an den
 * Trennzeichen entlanglaufen und Unterschiede melden, die fachlich keine sind.
 *
 * Zum Aufbau siehe den Kopfkommentar in edifact.js.
 */

(function (ns) {
  'use strict';

  /**
   * Obergrenze fuer die Tabelle des laengsten gemeinsamen Teilstuecks.
   *
   * Der Vergleich ist quadratisch. Zwei Lastgaenge mit je 3000 Segmenten
   * ergaeben neun Millionen Felder und wuerden den Browser sichtbar anhalten.
   * Darueber wird stellenweise verglichen -- groeber, aber ehrlich gemeldet.
   */
  const MAX_MATRIX = 4000000;

  /**
   * Trenner im Vergleichsschluessel.
   *
   * Steuerzeichen, weil sie in EDIFACT-Nutzdaten nicht vorkommen. Ohne
   * Trenner waeren `AB` + `C` und `A` + `BC` derselbe Schluessel, und zwei
   * verschiedene Segmente gaelten als gleich.
   */
  const KEY_SEPARATOR = '\u0001';
  const PART_SEPARATOR = '\u0002';

  /**
   * Baut den Vergleichsschluessel eines Segments aus Tag und Werten.
   *
   * Nicht `raw`: dort steckt die urspruengliche Maskierung, und zwei
   * wertgleiche Segmente wuerden sich unterscheiden, nur weil eines ein
   * Zeichen freigestellt hat.
   *
   * @param {object} segment
   * @returns {string}
   */
  function segmentKey(segment) {
    const values = segment.components
      .map((components) => components.join(PART_SEPARATOR))
      .join(KEY_SEPARATOR);
    return `${segment.tag}${KEY_SEPARATOR}${values}`;
  }

  /**
   * Vergleicht die Datenelemente zweier Segmente.
   *
   * @param {object} left
   * @param {object} right
   * @returns {{position: string, left: string, right: string}[]} Nur die
   *   Stellen, die sich unterscheiden. Fehlt eine Komponente auf einer Seite,
   *   steht dort die leere Zeichenkette.
   */
  function elementChanges(left, right) {
    const changes = [];
    const elements = Math.max(left.components.length, right.components.length);

    for (let element = 0; element < elements; element += 1) {
      const leftParts = left.components[element] ?? [];
      const rightParts = right.components[element] ?? [];
      const parts = Math.max(leftParts.length, rightParts.length);
      const split = parts > 1;

      for (let component = 0; component < parts; component += 1) {
        const leftValue = leftParts[component] ?? '';
        const rightValue = rightParts[component] ?? '';
        if (leftValue === rightValue) continue;

        changes.push({
          position: split ? `${element + 1}.${component + 1}` : `${element + 1}`,
          left: leftValue,
          right: rightValue,
        });
      }
    }

    return changes;
  }

  /**
   * Bestimmt das laengste gemeinsame Teilstueck beider Segmentfolgen.
   *
   * @param {string[]} left  Schluessel der linken Seite.
   * @param {string[]} right Schluessel der rechten Seite.
   * @returns {[number, number][]} Paare gleicher Positionen, aufsteigend.
   */
  function commonPositions(left, right) {
    if (left.length * right.length > MAX_MATRIX) return [];

    // Klassische Tabelle: lengths[i][j] ist die Laenge des laengsten
    // gemeinsamen Teilstuecks von left[i..] und right[j..].
    const lengths = Array.from(
      { length: left.length + 1 },
      () => new Uint32Array(right.length + 1),
    );

    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        lengths[i][j] =
          left[i] === right[j]
            ? lengths[i + 1][j + 1] + 1
            : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
      }
    }

    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) {
        pairs.push([i, j]);
        i += 1;
        j += 1;
      } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }

    return pairs;
  }

  /**
   * Paart die Segmente einer Luecke ueber ihren Tag.
   *
   * Nicht ueber die Position: steht links nur `UNT` und rechts `QTY UNT`,
   * waere `UNT` gegen `QTY` gestellt und beide als ausgetauscht gemeldet.
   * Gesucht ist aber die Aenderung an `UNT`.
   *
   * Unterschiedliche Tags werden nie gepaart -- sie als ein geaendertes
   * Segment auszugeben wuerde einen Zusammenhang behaupten, den es nicht gibt.
   *
   * @param {object[]} left
   * @param {object[]} right
   * @returns {{toRight: (number|null)[], toLeft: (number|null)[]}}
   */
  function pairByTag(left, right) {
    const toRight = left.map(() => null);
    const toLeft = right.map(() => null);

    for (const [index, segment] of left.entries()) {
      const match = right.findIndex(
        (candidate, position) => toLeft[position] === null && candidate.tag === segment.tag,
      );
      if (match === -1) continue;

      toRight[index] = match;
      toLeft[match] = index;
    }

    return { toRight, toLeft };
  }

  /**
   * Stellt die Segmente einer Luecke gegenueber.
   *
   * @param {object[]} left
   * @param {object[]} right
   * @returns {object[]} Zeilen des Vergleichs, in Lesereihenfolge.
   */
  function gapRows(left, right) {
    const { toRight } = pairByTag(left, right);
    const rows = [];
    let i = 0;
    let j = 0;

    const removed = () => {
      rows.push({ status: 'removed', left: left[i], right: null, changes: [] });
      i += 1;
    };
    const added = () => {
      rows.push({ status: 'added', left: null, right: right[j], changes: [] });
      j += 1;
    };

    while (i < left.length && j < right.length) {
      if (toRight[i] === j) {
        rows.push({
          status: 'changed',
          left: left[i],
          right: right[j],
          changes: elementChanges(left[i], right[j]),
        });
        i += 1;
        j += 1;
      } else if (toRight[i] === null) {
        removed();
      } else {
        // Der Partner von links steht weiter rechts: alles davor ist neu.
        added();
      }
    }

    while (i < left.length) removed();
    while (j < right.length) added();

    return rows;
  }

  /**
   * Erkennt verschobene Segmente.
   *
   * Ein Segment, das auf beiden Seiten wortgleich vorkommt, nur an anderer
   * Stelle, ist keine Aenderung. Es als entfernt **und** hinzugefuegt zu
   * melden waere formal richtig und im Alltag irrefuehrend: gesucht wird, was
   * sich inhaltlich unterscheidet.
   *
   * @param {object[]} rows
   * @returns {object[]} Dieselben Zeilen, verschobene als `moved` markiert.
   */
  function markMoved(rows) {
    const removed = new Map();
    for (const row of rows) {
      if (row.status !== 'removed') continue;
      const key = segmentKey(row.left);
      if (!removed.has(key)) removed.set(key, []);
      removed.get(key).push(row);
    }

    for (const row of rows) {
      if (row.status !== 'added') continue;
      const partner = removed.get(segmentKey(row.right))?.shift();
      if (!partner) continue;

      partner.status = 'moved';
      row.status = 'moved';
    }

    return rows;
  }

  /**
   * Vergleicht zwei Nachrichten segmentweise.
   *
   * @param {object|null} left  Nachricht aus `derived.messages`.
   * @param {object|null} right
   * @returns {{rows: object[], summary: object, truncated: boolean}}
   *   `rows` in der Reihenfolge der Anzeige, `summary` zaehlt die Zustaende,
   *   `truncated` meldet den groben Vergleich sehr langer Nachrichten.
   */
  function diffMessages(left, right) {
    const before = left?.segments ?? [];
    const after = right?.segments ?? [];
    const leftKeys = before.map(segmentKey);
    const rightKeys = after.map(segmentKey);

    const pairs = commonPositions(leftKeys, rightKeys);
    const truncated = pairs.length === 0 && before.length * after.length > MAX_MATRIX;

    const rows = [];
    let i = 0;
    let j = 0;

    for (const [leftIndex, rightIndex] of [...pairs, [before.length, after.length]]) {
      rows.push(...gapRows(before.slice(i, leftIndex), after.slice(j, rightIndex)));

      if (leftIndex < before.length && rightIndex < after.length) {
        rows.push({
          status: 'equal',
          left: before[leftIndex],
          right: after[rightIndex],
          changes: [],
        });
      }

      i = leftIndex + 1;
      j = rightIndex + 1;
    }

    markMoved(rows);

    const summary = { equal: 0, added: 0, removed: 0, changed: 0, moved: 0 };
    for (const row of rows) summary[row.status] += 1;

    return { rows, summary, truncated };
  }

  ns.diffMessages = diffMessages;
  ns.segmentKey = segmentKey;
  ns.elementChanges = elementChanges;
})((globalThis.EdifactExplorer ??= {}));
