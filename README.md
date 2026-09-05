# EDIFACT Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-00558f.svg)](LICENSE)
![Static HTML](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JavaScript-0072bc)
![Local processing](https://img.shields.io/badge/data-local%20processing-2d7d46)
![EDIFACT](https://img.shields.io/badge/format-EDIFACT-004b80)

> Ein schlanker, browserbasierter Viewer für JSON-Exporte mit EDIFACT-Nutzlasten.

Der EDIFACT Explorer macht Fachnachrichten durchsuchbar und lesbar. Er zeigt Metadaten, erkannte
EDIFACT-Segmente und die originale Nutzlast in einer fokussierten Arbeitsansicht an. Die
Verarbeitung findet ausschließlich im Browser statt.

## Funktionen

| Karte                 | Beschreibung                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Suche und Filter      | Volltextsuche, Filter nach Format, Richtung, Status und Kategorie sowie nach Übertragungszeitraum (Ortszeit). |
| Fachliche Kennungen   | Marktlokation, Zählpunkt, Prüfidentifikator und Referenzen stehen im Listeneintrag.                           |
| CSV-Export            | Trefferliste und Segmentwerte als CSV mit Semikolon und UTF-8-BOM für Excel.                                  |
| Strukturierte Ansicht | EDIFACT-Segmente werden mit Bezeichnung und Elementen dargestellt.                                            |
| Mehrfachnachrichten   | Sammelnachrichten werden erkannt und einzeln navigierbar gemacht.                                             |
| Rohdaten              | Die unveränderte EDIFACT-Nutzlast ist pro Nachricht einsehbar.                                                |
| Lokale Verarbeitung   | Hochgeladene Daten bleiben im Browser und werden nicht an einen Server übertragen.                            |

## Starten

Keine Laufzeitabhängigkeiten, kein Build-Schritt, kein Webserver.

1. [index.html](index.html) im Browser öffnen — ein Doppelklick genügt.
2. Eine JSON-Datei über **JSON-Datei öffnen** auswählen.
3. Nachrichten durchsuchen, filtern und im Detailbereich untersuchen.

Für die Weitergabe reicht es, das Projektverzeichnis vollständig zu kopieren. Fehlen Dateien aus
`src`, weist die Anwendung beim Start darauf hin statt ohne Funktion dazustehen.

Als sicheren Einstieg enthält [data/sample-messages.json](data/sample-messages.json) vollständig
fiktive Beispiele für alle unterstützten Nachrichtenformate.

## Entwicklung

```bash
npm test           # Unit-Tests, läuft ohne npm install
npm install        # nur für Lint und Formatierung nötig
npm run lint       # ESLint
npm run lint:css   # Stylelint für CSS
npm run format     # Prettier schreibt
npm run format:check
npm run version:sync # schreibt die Version aus package.json nach index.html
```

`npm test` braucht kein `npm install`, weil der Testrunner Teil von Node ist. Getestet wird die
reine Logik — Parser, Datensatzmodell und Formatierung — und dazu die Darstellungsschicht als
Rauchtest: [tests/render.test.js](tests/render.test.js) stellt in der Testdatei selbst so viel DOM
nach, wie [src/dom.js](src/dom.js) und [src/render.js](src/render.js) benutzen, und prüft, **dass**
gezeichnet wird und **dass** die erwarteten Inhalte im Baum landen. Kein jsdom, keine
Laufzeitabhängigkeit, kein Build-Schritt.

Die Abgrenzung: Struktur und Inhalt ja, Darstellung nein. Layout, Farben, Fokusreihenfolge und
Tastaturbedienung bleiben Sache des Browsers und werden dort geprüft. Die Attrappe ist bewusst
streng — `append(null)` wirft, statt den Wert stillschweigend zu übergehen: genau diese Nachsicht
würde die Laufzeitfehler verdecken, wegen derer es den Test gibt.

Die Programmversion steht in `package.json` und wird von dort in das Meta-Tag
`application-version` in [index.html](index.html) geschrieben. Der Info-Dialog liest sie beim Start
aus dem Dokument. `package.json` zur Laufzeit zu lesen ist ausgeschlossen: `fetch` verlangt einen
HTTP-Ursprung, und der Viewer soll per Doppelklick startbar bleiben. Laufen die beiden Werte
auseinander, schlägt [tests/version.test.js](tests/version.test.js) an.

## Aufbau des JavaScript

Die Dateien in `src` sind **klassische Skripte**, keine ES-Module. Das ist eine bewusste
Entscheidung: Browser laden ES-Module aus Sicherheitsgründen nicht über `file://`, der Viewer
ließe sich dann nicht mehr per Doppelklick öffnen.

Jede Datei kapselt sich stattdessen in einer IIFE mit `'use strict'` und hängt ihre öffentlichen
Namen an einen einzigen globalen Namensraum:

```js
(function (ns) {
  'use strict';
  function parseEdifact(source) {
    /* ... */
  }
  ns.parseEdifact = parseEdifact;
})((globalThis.EdifactExplorer ??= {}));
```

Das ergibt Strict Mode, mehrere Dateien mit je einer Verantwortung und genau **einen** globalen
Namen statt der rund 25, die eine flache Datei hinterlässt — ohne Build-Schritt.

Weil die Dateien kein `import`/`export` enthalten, sind sie gleichzeitig gültige ES-Module. Die
Tests laden sie deshalb per Seiteneffekt-Import und lesen den Namensraum aus:

```js
import '../src/edifact.js';
const { parseEdifact } = globalThis.EdifactExplorer;
```

Querverweise zwischen den Dateien laufen zur Laufzeit über `ns.` — die Ladereihenfolge ist damit
nur für `src/app.js` relevant, das zuletzt kommt und das DOM verdrahtet. Die Reihenfolge steht in
[index.html](index.html).

## Erwartetes Datenformat

Die Anwendung erwartet ein JSON-Objekt mit einer `value`-Liste (eine Liste auf oberster Ebene wird
ebenfalls akzeptiert). Jeder Eintrag enthält Metadaten und die EDIFACT-Nutzlast unter
`payload.payload`.

```json
{
  "value": [
    {
      "ID": "beispiel-id",
      "messageID": "Nachrichtenkennung",
      "communicationPartnerID": "Partnerkennung",
      "direction": "Inbound",
      "messageFormat": "UTILMD",
      "processingStatus": "Completed",
      "transferTimestamp": "2026-01-01T12:00:00Z",
      "payload": {
        "payload": "UNH+1+UTILMD:D:11A:UN..."
      }
    }
  ]
}
```

Fehlt `ID` oder ist der Wert doppelt vergeben, vergibt die Anwendung eine eigene, eindeutige
Kennung — die Auswahl in der Liste bleibt dadurch eindeutig.

## Sicherheit und Darstellung

Die eingelesene Datei ist Fremddaten. Die Oberfläche wird deshalb ausschließlich über
`document.createElement` und `textContent` aufgebaut; es gibt kein `innerHTML` und keine manuelle
HTML-Maskierung. Damit kann kein Feldinhalt als Markup interpretiert werden.

Die Suchhervorhebung arbeitet auf dem Rohtext und liefert Textabschnitte
([`splitByQuery`](src/format.js)), die erst in der DOM-Schicht in `<mark>`-Elemente umgesetzt
werden. Ein Suchbegriff kann dadurch weder eine HTML-Entity zerstören noch als regulärer Ausdruck
wirken.

## Zugänglichkeit

- Die Seitenüberschrift steht als `<h1>` im Dokument, nicht in einem CSS-Pseudoelement.
- Ansicht- und Nachrichten-Umschalter folgen dem ARIA-Tabs-Muster mit `aria-selected` und
  Pfeiltasten-Navigation.
- Trefferzahl (`role="status"`) und Meldungen (`role="alert"`) werden angekündigt; es gibt keine
  `alert()`-Dialoge.
- Der ausgewählte Datensatz ist mit `aria-current` markiert. Sichtbarer und angekündigter Zustand
  hängen am selben Attribut — das Stylesheet greift `aria-selected` beziehungsweise `aria-current`
  ab, statt eine zweite Klasse zu führen.
- Alle Bedienelemente haben eine sichtbare Fokusdarstellung (`:focus-visible`).
- `prefers-reduced-motion` wird respektiert.

## Bekannte Einschränkungen

- **Schriftart.** Das Design ist auf _Bahnschrift_ ausgelegt, eine Windows-Schrift. Die
  Fallback-Kette greift auf macOS und Linux (`DIN Alternate`, `Roboto`, `system-ui`), das Bild
  weicht dort aber ab. Für eine plattformgleiche Darstellung müsste eine Webfont-Datei
  mitgeliefert werden.
- **Kein dunkles Farbschema.** Die Palette ist an das Corporate Design gebunden; eine dunkle
  Variante ist eine Design-Entscheidung und bewusst nicht vorweggenommen.
- **Sehr große Dateien.** Die Filterung läuft über einen vorberechneten Volltextindex und die
  Liste ist auf 250 Datensätze pro Seite begrenzt, es gibt aber kein Virtual Scrolling.
- **CSV-Download über `file://`.** Der Export legt die Datei über ein Blob und einen
  `download`-Link an. Das funktioniert in den gängigen Browsern auch beim Öffnen aus dem
  Dateisystem, einzelne Konfigurationen unterbinden es jedoch ohne Fehlermeldung. Der Viewer weist
  nach jedem Export darauf hin; bleibt der Download aus, hilft ein lokaler Webserver.

## Datenschutz und Daten

EDIFACT-Exporte können personenbezogene oder vertrauliche Geschäftsdaten enthalten. Produktive
Exporte gehören daher nicht in dieses Repository. `data/response.json` ist lokal vorhanden, wird
aber durch [.gitignore](.gitignore) bewusst ausgeschlossen. `data/sample-messages.json` verwendet
ausschließlich fiktive Daten und kann sicher als Beispieldatei verwendet werden.

## Technologie

- HTML5
- CSS3 mit Design-Token
- Vanilla JavaScript (klassische Skripte, ein Namensraum)
- Keine externen Laufzeitabhängigkeiten
- ESLint, Stylelint und Prettier als Entwicklungswerkzeuge

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
