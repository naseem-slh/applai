# Umsetzungsplan — Vorgemerkte Stellen

Entwurf: [`../specs/2026-08-12-vorgemerkte-stellen-design.md`](../specs/2026-08-12-vorgemerkte-stellen-design.md)

Sieben Schritte, jeder für sich lauffähig. Nach jedem:
`npm run lint && npm run typecheck && npm test`. Ein Commit je Schritt.

## 1 — Rechnen (`marks.ts`)

Reine Funktionen, kein React, keine Oberfläche. Zuerst die Tests.

- `toggleMark` — trimmen, deckungsgleich = aufheben, überschneidend = ersetzen
- `relocate` — Stelle wiederfinden (alte Position → eindeutiger Treffer →
  Kontext → nicht gefunden)
- `shiftMarks` — Stellen bei Textänderungen nachführen
- `letterFingerprint` — SHA-256 des normalisierten Brieftexts

Danach kann noch niemand etwas vormerken. Aber das Herz ist geprüft.

## 2 — Speichern (`adapter.ts`, `indexeddb.ts`)

- `MarkAnchor`, `MarkSet` und vier Methoden in die Schnittstelle
- Objektspeicher `markSets`, Datenbankfassung 1 → 2
- Sicherungsdatei Fassung 1 → 2, alte Dateien bleiben lesbar
- `clearAll` löscht mit

## 3 — Zustand (`useMarks.ts`)

Hängt 1 und 2 zusammen: Liste im Speicher halten, vormerken, aufheben, abhaken,
beim Betreten wiederherstellen, eine Sekunde nach der letzten Änderung sichern.

## 4 — Verlauf (`useDocumentHistory.ts`)

Verlaufsstand wird `{ document, marks }`, damit Strg+Z beides zusammen
zurückholt. Bestehende Tests mitziehen.

## 5 — Sichtbar machen (`MarkPanel.tsx`, `SelectionLayer.tsx`, `design.css`)

- Knopf „Stelle vormerken" / „Vormerkung aufheben" in der Leiste
- Liste in der Seitenspalte: Nummer, Vorschau, Haken, entfernen,
  Fortschrittszeile, Restliste „nicht wiedergefunden"
- Farbige Hinterlegung über `::highlight`, `useMarkHighlight.ts`
- Alle Texte über i18n, `de` und `en`

## 6 — Verdrahten (`Editor.tsx`)

- Ein gemeinsamer `applyEdit(range, text)` für alle drei Änderungswege,
  damit keiner das Nachführen vergisst
- Klick auf einen Eintrag setzt die laufende Markierung
- Übernommene Variante hakt die Stelle ab, entfernt sie **nicht**

## 7 — Abschluss

- Ende-zu-Ende-Durchlauf in Playwright samt `axe`
- `docs/spec.md`, Zeile „Auswahl" ergänzen
