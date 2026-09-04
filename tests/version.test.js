import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Die Version steht in package.json und -- fuer die Anzeige im Info-Dialog --
 * im Meta-Tag von index.html. Zwei Orte fuer denselben Wert laufen ohne
 * Absicherung auseinander, und eine veraltete Versionsnummer im Dialog ist
 * schlimmer als keine: sie wird geglaubt.
 *
 * `npm run version:sync` bringt sie in Deckung.
 */
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('Version', () => {
  it('folgt in package.json dem Schema major.minor.patch', () => {
    assert.match(version, /^\d+\.\d+\.\d+$/);
  });

  it('steht in index.html im Meta-Tag application-version', () => {
    const found = /<meta name="application-version" content="([^"]*)" \/>/.exec(html);

    assert.ok(found, 'Meta-Tag application-version fehlt in index.html');
    assert.equal(
      found[1],
      version,
      'index.html und package.json weichen ab — "npm run version:sync" ausführen',
    );
  });

  it('haelt im Info-Dialog einen Platzhalter statt einer festen Nummer', () => {
    assert.match(html, /<span id="appVersion"><\/span>/);
    // Eine hartcodierte Nummer im Dialogtext wuerde die gelesene ueberdecken.
    assert.doesNotMatch(html, /Version \d+\.\d+/);
  });
});
