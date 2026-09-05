/**
 * Pruefungen am Stylesheet.
 *
 * Farben lassen sich nicht im Browser nachrechnen, wohl aber hier: die Token
 * stehen als Text in styles.css, und Kontrast ist eine Formel. Geprueft wird
 * deshalb, was sonst nur Augenmass waere -- die Schwellen der WCAG in beiden
 * Farbschemata.
 *
 * Ausserdem: das dunkle Schema steht zweimal in der Datei, einmal fuer die
 * Systemeinstellung und einmal fuer die ausdrueckliche Wahl. CSS kennt keinen
 * Weg, beides in einer Regel zu fuehren. Hier wird festgehalten, dass die
 * beiden Faelle deckungsgleich bleiben.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/**
 * Liest den Inhalt eines Regelblocks ab der geoeffneten Klammer.
 *
 * @param {string} text
 * @param {string} selector Text, hinter dem der Block beginnt.
 * @returns {string}
 */
function blockAfter(text, selector) {
  const start = text.indexOf(selector);
  assert.notEqual(start, -1, `Selektor nicht gefunden: ${selector}`);

  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(text.indexOf('{', start) + 1, i);
    }
  }

  throw new Error(`Block nicht geschlossen: ${selector}`);
}

/** @returns {Map<string, string>} Token-Name -> roher Wert. */
function declarations(block) {
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const root = declarations(blockAfter(css, ':root {'));
const darkBySystem = declarations(blockAfter(css, ":root:not([data-theme='light'])"));
const darkByChoice = declarations(blockAfter(css, ":root[data-theme='dark']"));

/** Token-Werte des dunklen Schemas ueber der hellen Grundlage. */
const dark = new Map([...root, ...darkByChoice]);

/**
 * Loest ein Token bis zum Farbwert auf.
 *
 * @param {Map<string, string>} scheme
 * @param {string} name
 * @returns {string} Hex-Wert.
 */
function resolve(scheme, name) {
  let value = scheme.get(name);
  assert.ok(value !== undefined, `Token nicht definiert: --${name}`);

  for (let step = 0; step < 10 && value.startsWith('var('); step += 1) {
    const referenced = /^var\(--([\w-]+)\)$/.exec(value);
    assert.ok(referenced, `Verweis nicht aufloesbar: ${value}`);
    value = scheme.get(referenced[1]);
    assert.ok(value !== undefined, `Token nicht definiert: --${referenced[1]}`);
  }

  assert.match(value, /^#[0-9a-f]{3,8}$/i, `Kein Farbwert: --${name} = ${value}`);
  return value;
}

// --- Kontrast nach WCAG 2.1 -----------------------------------------------

/** @returns {number[]} Rot, Gruen, Blau als 0..255. */
function channels(color) {
  const text = color.slice(1);
  const full = text.length === 3 ? [...text].map((c) => c + c).join('') : text;
  return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
}

/** @returns {number} Relative Leuchtdichte. */
function luminance(color) {
  const [r, g, b] = channels(color)
    .map((value) => value / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @returns {number} Kontrastverhaeltnis, 1 bis 21. */
function contrast(a, b) {
  const [bright, dim] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dim + 0.05);
}

/**
 * Die Paare, die WCAG AA erfuellen muessen.
 *
 * 4.5 fuer Text, 3 fuer die Umrandung und den Fokusring eines
 * Bedienelements. Rein dekorative Linien stehen nicht in dieser Liste --
 * fuer sie fordert die Richtlinie keinen Wert.
 */
const PAIRS = Object.freeze([
  ['Text auf Flaeche', 'ink', 'surface', 4.5],
  ['Text auf vertiefter Flaeche', 'ink', 'surface-sunken', 4.5],
  ['Text auf hervorgehobener Flaeche', 'ink', 'surface-highlight', 4.5],
  ['Gedaempfter Text auf Flaeche', 'ink-soft', 'surface', 4.5],
  ['Stiller Text auf Flaeche', 'muted', 'surface', 4.5],
  ['Stiller Text auf vertiefter Flaeche', 'muted', 'surface-sunken', 4.5],
  ['Stiller Text auf hervorgehobener Flaeche', 'muted', 'surface-highlight', 4.5],
  ['Marke auf Flaeche', 'brand', 'surface', 4.5],
  ['Marke auf vertiefter Flaeche', 'brand', 'surface-sunken', 4.5],
  ['Schriftzug auf Flaeche', 'wordmark', 'surface', 4.5],
  ['Schriftzug, zweite Zeile', 'wordmark-soft', 'surface', 4.5],
  ['Text auf der Marke', 'on-brand', 'brand', 4.5],
  ['Knopfbeschriftung', 'control-ink', 'control', 4.5],
  ['Knopfbeschriftung im Ueberfahren', 'control-hover-ink', 'control-hover', 4.5],
  ['Suchtreffer', 'ink', 'mark-surface', 4.5],
  ['Code', 'code-ink', 'code-surface', 4.5],
  ['Wert in der Segmentansicht', 'ink', 'value-surface', 4.5],
  ['Fehlermeldung', 'danger-ink', 'danger-surface', 4.5],
  ['Warnmeldung', 'warning-ink', 'warning-surface', 4.5],
  ['Fehlertext auf Flaeche', 'danger-ink', 'surface', 4.5],
  ['Warntext auf Flaeche', 'warning-ink', 'surface', 4.5],
  ['Fokusring auf Flaeche', 'focus', 'surface', 3],
  ['Fokusring auf vertiefter Flaeche', 'focus', 'surface-sunken', 3],
  ['Feldrahmen auf Flaeche', 'line-field', 'surface', 3],
]);

describe('Farbschemata', () => {
  it('definiert jeden Farbwert auf :root', () => {
    // Sonst stuende eine Farbe nur im Media-Query und waere fuer das helle
    // Schema unerreichbar -- und beim Lesen der Palette unsichtbar.
    for (const [name, value] of [...darkBySystem, ...darkByChoice]) {
      if (name === 'color-scheme') continue;
      assert.match(value, /^var\(--[\w-]+\)$/, `--${name} ist im dunklen Block ein roher Wert`);
    }
  });

  it('haelt beide dunklen Bloecke deckungsgleich', () => {
    // Der Media-Query und die ausdrueckliche Wahl muessen dasselbe belegen.
    assert.deepEqual([...darkBySystem.entries()], [...darkByChoice.entries()]);
  });

  it('schaltet color-scheme mit um', () => {
    // Ohne diese Angabe blieben Rollbalken und Formularfelder hell.
    assert.ok(blockAfter(css, ":root[data-theme='dark']").includes('color-scheme: dark'));
    assert.ok(blockAfter(css, ":root:not([data-theme='light'])").includes('color-scheme: dark'));
  });

  it('belegt im dunklen Schema nur vorhandene Token um', () => {
    for (const name of darkByChoice.keys()) {
      if (name === 'color-scheme') continue;
      assert.ok(root.has(name), `--${name} gibt es im hellen Schema nicht`);
    }
  });

  for (const [scheme, tokens] of [
    ['hell', root],
    ['dunkel', dark],
  ]) {
    it(`erfuellt WCAG AA im ${scheme}en Schema`, () => {
      const failed = [];

      for (const [label, foreground, background, needed] of PAIRS) {
        const value = contrast(resolve(tokens, foreground), resolve(tokens, background));
        if (value < needed) {
          failed.push(`${label}: ${value.toFixed(2)}:1, gefordert ${needed}:1`);
        }
      }

      assert.deepEqual(failed, []);
    });
  }
});
