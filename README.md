# EDIFACT Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-00558f.svg)](LICENSE)
![Static HTML](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JavaScript-0072bc)
![Local processing](https://img.shields.io/badge/data-local%20processing-2d7d46)
![EDIFACT](https://img.shields.io/badge/format-EDIFACT-004b80)

> Ein schlanker, browserbasierter Viewer fuer JSON-Exporte mit EDIFACT-Nutzlasten.

Der EDIFACT Explorer macht Fachnachrichten durchsuchbar und lesbar. Er zeigt Metadaten, erkannte EDIFACT-Segmente und die originale Nutzlast in einer fokussierten Arbeitsansicht an. Die Verarbeitung findet ausschliesslich im Browser statt.

## Funktionen

| Karte                 | Beschreibung                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- |
| Suche und Filter      | Volltextsuche sowie Filter nach Format, Richtung, Status und Kategorie.             |
| Strukturierte Ansicht | EDIFACT-Segmente werden mit Bezeichnung und Elementen dargestellt.                  |
| Mehrfachnachrichten   | Sammelnachrichten werden erkannt und einzeln navigierbar gemacht.                   |
| Rohdaten              | Die unveraenderte EDIFACT-Nutzlast ist pro Nachricht einsehbar.                     |
| Lokale Verarbeitung   | Hochgeladene Daten bleiben im Browser und werden nicht an einen Server uebertragen. |

## Starten

Es gibt keine Abhaengigkeiten und keinen Build-Schritt.

1. [index.html](index.html) im Browser oeffnen.
2. Eine JSON-Datei ueber **JSON-Datei oeffnen** auswaehlen.
3. Nachrichten durchsuchen, filtern und im Detailbereich untersuchen.

Alternativ kann die Datei ueber einen beliebigen lokalen Webserver bereitgestellt werden.

Als sicheren Einstieg enthaelt [data/sample-messages.json](data/sample-messages.json) vollstaendig fiktive Beispiele fuer alle unterstuetzten Nachrichtenformate. Die Datei kann direkt im Viewer geoeffnet werden.

## Projektstruktur

| Datei                                | Verantwortung                                        |
| ------------------------------------ | ---------------------------------------------------- |
| [index.html](index.html)             | Semantische Struktur und Einbindung der Anwendung.   |
| [styles.css](styles.css)             | Layout, responsive Darstellung und visuelles Design. |
| [app.js](app.js)                     | Datei-Import, EDIFACT-Parser, Filter und Rendering.  |
| [.editorconfig](.editorconfig)       | Einheitliche Editor-Konventionen.                    |
| [.prettierrc.json](.prettierrc.json) | Konfiguration fuer die automatische Formatierung.    |

## Erwartetes Datenformat

Die Anwendung erwartet ein JSON-Objekt mit einer `value`-Liste. Jeder Eintrag enthaelt Metadaten und die EDIFACT-Nutzlast unter `payload.payload`.

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

## Datenschutz und Daten

EDIFACT-Exporte koennen personenbezogene oder vertrauliche Geschaeftsdaten enthalten. Produktive Exporte gehoeren daher nicht in dieses Repository. `data/response.json` ist lokal vorhanden, wird aber durch [.gitignore](.gitignore) bewusst ausgeschlossen. `data/sample-messages.json` verwendet ausschliesslich fiktive Daten und kann sicher als Beispieldatei verwendet werden.

## Technologie

- HTML5
- CSS3
- Vanilla JavaScript
- Keine externen Laufzeitabhaengigkeiten

## Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).
