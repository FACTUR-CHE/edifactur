/**
 * Schreibt die Version aus package.json in das Meta-Tag von index.html.
 *
 * package.json ist die einzige Quelle der Wahrheit. index.html braucht die
 * Nummer aber im Dokument: `fetch` verlangt einen HTTP-Ursprung, und der
 * Viewer soll sich per Doppelklick aus dem Dateisystem oeffnen lassen -- die
 * Datei zur Laufzeit zu lesen ist damit ausgeschlossen.
 *
 * Aufruf: npm run version:sync
 *
 * Laeuft die Synchronisation nicht, schlaegt tests/version.test.js an. Die
 * Nummer im Dialog kann dadurch nicht unbemerkt veralten.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const html = readFileSync(htmlPath, 'utf8');

const pattern = /(<meta name="application-version" content=")([^"]*)(" \/>)/;
const found = pattern.exec(html);

if (!found) {
  console.error('In index.html fehlt das Meta-Tag application-version.');
  process.exit(1);
}

if (found[2] === version) {
  console.log(`index.html steht bereits auf ${version}.`);
  process.exit(0);
}

writeFileSync(htmlPath, html.replace(pattern, `$1${version}$3`), 'utf8');
console.log(`index.html von ${found[2] || '(leer)'} auf ${version} gesetzt.`);
