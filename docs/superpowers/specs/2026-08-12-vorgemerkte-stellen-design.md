# Vorgemerkte Stellen — Mehrfachmarkierung und wiederverwendbare Vorlage

Stand: 12. August 2026 · Bauabschnitt 1, Nachtrag zu Aufgabe 14

## Warum

Heute trägt die Arbeitsfläche genau **eine** Markierung. `useDocumentSelection`
hält eine `EditorSelection`, `SelectionLayer` zeigt sie an, `VariantPopover`
formuliert sie um, `applyVariant` ersetzt ihren Bereich — und jede Änderung am
Dokument löscht sie. Wer ein Anschreiben an eine Ausschreibung anpasst, arbeitet
aber nicht an einer Stelle, sondern an fünf oder acht: der Einleitung, zwei
Erfahrungsabsätzen, dem Schlusssatz. Die Liste dieser Stellen ist bei jeder
Bewerbung dieselbe, weil das Grundanschreiben dasselbe ist. Heute muss sie jedes
Mal neu im Kopf entstehen.

Dieser Entwurf bringt zweierlei:

1. **Mehrere Stellen gleichzeitig vormerken**, auch über Absatzgrenzen hinweg
   und an voneinander getrennten Punkten des Briefes.
2. **Die Stellen bleiben erhalten.** Sie werden je Anschreiben gemerkt und beim
   nächsten Mal selbsttätig wiederhergestellt — die Vormerkungen sind die
   wiederverwendbare Arbeitsvorlage für die nächste Ausschreibung.

Gespeichert werden die **Stellen**, nicht ihr Wortlaut als Baustein. Es entsteht
keine Formulierungsbibliothek; der Wortlaut wird ausschließlich als Suchanker
abgelegt, um die Stelle wiederzufinden.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Vormerkung** (`Mark`) | Ein Zeichenbereich im Brief, den der Nutzer später umformulieren will. Kein zweiter Markierungsmechanismus, sondern eine aufbewahrte Markierung. |
| **Anker** (`MarkAnchor`) | Die gespeicherte Form einer Vormerkung: Bereich, Wortlaut beim Vormerken, etwas Text davor und danach. |
| **Satz** (`MarkSet`) | Alle Anker zu einem Anschreiben, unter dessen Fingerabdruck abgelegt. |
| **Laufende Markierung** | Die bestehende `EditorSelection` — bleibt unverändert das, womit umformuliert wird. |

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Was wird gespeichert? | Die Stellen (Positionen), nicht der Wortlaut als Baustein |
| Ablauf beim Umformulieren | Eine Stelle nach der anderen, über die bestehende Varianten-Kette |
| Robustheit gegen Textänderungen | Wortlaut als Suchanker, Markierung wird nachgeführt |
| Verwaltung der Vorlagen | Keine. Still je Anschreiben gemerkt, selbsttätig wiederhergestellt |
| Platzierung der Liste | Seitenspalte, neben Briefkopf, Lückenliste und Stilprofil |
| Aufheben einer Vormerkung | Dieselbe Stelle noch einmal vormerken (Umschalter) |
| Überschneidende Auswahl | Die alte Vormerkung fällt weg, die neue tritt an ihre Stelle |

## Bedienung

1. Der Nutzer markiert wie bisher mit der Maus. In der Werkzeugleiste steht ein
   neuer Knopf **„Stelle vormerken"**, gesperrt, solange nichts oder nur
   Leerraum markiert ist (`EditorSelection.hasContent`).
2. Die Stelle erscheint nummeriert in der Seitenspalte, in Dokumentreihenfolge,
   mit Textvorschau und Fortschrittszeile („2 von 5 erledigt").
3. Ein Klick auf einen Eintrag **aktiviert** ihn: `select(mark.range)` setzt die
   laufende Markierung, der Absatz wird ins Bild gerollt. Ab hier arbeitet alles
   Bestehende unverändert weiter — `VariantPopover`, Wahrheitsmodus,
   `ClaimGuard`, Exportsperre.
4. **Die Vormerkung wird dabei nicht verbraucht.** Sie bleibt in der Liste und
   bleibt im Text hinterlegt. Wird eine Variante übernommen, wird sie lediglich
   **abgehakt**; ihr Bereich umfasst danach den neuen Wortlaut.
5. Ein Knopf „nächste offene Stelle" springt weiter. Nicht von selbst — ein
   Sprung würde dem Nutzer das Bild wegziehen, während er das Ergebnis liest.
6. Je Eintrag: entfernen. Über der Liste: alle entfernen.

`done` ist Zustand **dieser** Bewerbungsrunde und wird nicht gespeichert. Beim
nächsten Anschreiben sind alle Stellen wieder offen.

## Datenmodell

Im Arbeitsspeicher:

```ts
interface Mark {
  id: string        // stabile Kennung, nur für Liste und Auswahl
  range: TextRange  // wo sie jetzt steht — wandert bei jeder Textänderung mit
  anchor: string    // Wortlaut beim Vormerken — der Suchanker fürs Wiederfinden
  current: string   // Wortlaut, den der Bereich jetzt überdeckt (Vorschau)
  done: boolean     // in dieser Runde erledigt
}
```

Im Speicher (`src/lib/storage/adapter.ts`):

```ts
interface MarkAnchor {
  text: string    // Wortlaut beim Vormerken
  before: string  // bis zu MARK_CONTEXT_CHARS Zeichen davor
  after: string   // bis zu MARK_CONTEXT_CHARS Zeichen danach
  from: number
  to: number
}

interface MarkSet {
  id: string      // Fingerabdruck des Anschreibens
  anchors: MarkAnchor[]
  savedAt: number
}
```

`MARK_CONTEXT_CHARS = 60`. Der Kontext dient allein dazu, mehrdeutige Treffer
aufzulösen; die 600 Zeichen aus `documentSelection.ts` wären hier unnötig viel
Briefinhalt im Speicher.

**Der Anker ist der Wortlaut beim Vormerken, nicht der spätere.** Das ist die
richtige Wahl für eine Vorlage: Beim nächsten Mal wird das Grundanschreiben
geladen, nicht die für die letzte Firma angepasste Fassung. Die Kehrseite gehört
dazu und wird nicht verschwiegen — wird eine Stelle erst vorgemerkt, **nachdem**
sie umformuliert wurde, trägt sie den angepassten Wortlaut als Anker und wird
beim nächsten Mal nicht wiedergefunden. Sie landet dann in der Restliste
„nicht wiedergefunden".

## Die Umschaltregel

`toggleMark(marks, range, text)`, in dieser Reihenfolge:

1. **Trimmen.** Leerraum an beiden Enden der Auswahl fällt weg. Eine Vormerkung
   ist immer der getrimmte Bereich. Bleibt nichts übrig, geschieht nichts.
2. **Deckungsgleich?** Gibt es eine Vormerkung mit genau diesem Bereich, wird
   sie **aufgehoben**. Der Knopf heißt in diesem Fall „Vormerkung aufheben".
3. **Überschneidend?** Alle Vormerkungen, deren Bereich sich mit dem neuen um
   mindestens ein Zeichen überschneidet, fallen weg; die neue tritt an ihre
   Stelle. Die Leiste kündigt das an: „ersetzt Vormerkung 2".
4. **Sonst** wird die neue Vormerkung hinzugefügt.

Berührung an einer Grenze (`a.to === b.from`) ist keine Überschneidung.

Das Trimmen in Schritt 1 ist zugleich die Toleranz für Schritt 2: Wer eine
Stelle mit der Maus neu zieht und dabei das Leerzeichen dahinter mitnimmt, hebt
sie trotzdem auf statt sie um ein Zeichen versetzt neu zu setzen.

Warum zwei getrennte Vormerkungen sich nicht überschneiden dürfen: Wird die eine
umformuliert, verschiebt sich mitten im Bereich der anderen der Text. Sie zeigte
danach auf Bruchstücke, und die zweite Ersetzung träfe die falschen Zeichen.

## Darstellung im Text

Mehrere Bereiche gleichzeitig hervorheben, **ohne den DOM anzufassen**: die CSS
Custom Highlight API. `CSS.highlights.set('applai-mark', new Highlight(...))`
mit einer Regel `::highlight(applai-mark)` in `design.css`, hinterlegt mit
`--color-accent-soft`; erledigte Stellen bekommen über einen zweiten Namen
`applai-mark-done` eine blassere Hinterlegung.

Das ist hier keine Spielerei, sondern der einzige gangbare Weg.
`DocumentView` hält ausdrücklich fest, dass eine Auszeichnung **innerhalb** des
Absatztexts die Offset-Rechnung in `documentSelection.ts` bricht — deshalb
werden unbelegte Aussagen und Fremdfirmen auch nur auf Absatzebene hervorgehoben.
Die Fläche ist zudem `contentEditable`, wo eingeschobene `<span>` beim Tippen
ohnehin zerfielen. Die Highlight-API verändert den Baum nicht; sie färbt
Bereiche ein, die als `Range` übergeben werden.

Wo die API fehlt (jsdom in den Tests, ältere Browser), entfällt die
Hinterlegung, alles andere funktioniert. Das ist tragbar, weil die Bedeutung
nicht an der Farbe hängt, sondern an der nummerierten Liste mit Textvorschau —
dieselbe Regel, der `retainedParagraphs` und `claimParagraphs` schon folgen
(DESIGN.md, „Kontrast").

## Wiederfinden

`relocate(text, anchor): TextRange | null` — vier Stufen, deterministisch, ohne
Modellaufruf:

1. Steht an `from…to` noch derselbe Wortlaut, ist die Stelle gefunden. Der
   Regelfall bei unverändertem Grundanschreiben.
2. Sonst den Wortlaut im ganzen Brief suchen. **Genau ein** Vorkommen → das ist
   die Stelle, sie hat sich nur verschoben.
3. **Mehrere** Vorkommen → mit `before` und `after` bewerten: längste
   Übereinstimmung am linken und am rechten Rand, addiert. Ein eindeutiger
   Sieger gewinnt.
4. Kein Vorkommen, oder Gleichstand in Stufe 3 → **nicht wiedergefunden.**

In Stufe 4 wird nicht geraten. Eine falsch gesetzte Vormerkung führte dazu, dass
das Modell die falsche Textstelle umformuliert; eine fehlende ist ein sichtbarer
Verlust, den der Nutzer in zwei Sekunden von Hand behebt. Nicht wiedergefundene
Anker stehen mit ihrem gespeicherten Wortlaut abgedunkelt unter der Liste und
lassen sich einzeln verwerfen.

## Automatisches Wiederherstellen

Der **Fingerabdruck** eines Anschreibens ist der SHA-256 seines auf einfachen
Leerraum normalisierten Textes, hexadezimal. WebCrypto, kein neues Paket (G9).

Beim Betreten der Arbeitsfläche:

1. Fingerabdruck aus `session.letter.text` berechnen.
2. `loadMarkSet(fingerprint)` → Treffer: Anker auflösen, Vormerkungen setzen.
3. Kein Treffer: den **zuletzt gespeicherten** Satz gegen den Brief probieren.
   Übernommen wird er nur, wenn **mehr als die Hälfte** seiner Anker
   wiedergefunden wird; sonst wird leer begonnen.
4. Was geschehen ist, steht in einer Zeile im Bereich: „6 Stellen
   wiederhergestellt" bzw. „aus einem früheren Anschreiben übernommen — 5 von 6
   wiedergefunden". Daneben „alle entfernen".

Schritt 3 ist das, was die Sache haltbar macht. Ohne ihn wäre nach jeder kleinen
Überarbeitung des Grundanschreibens die ganze Vorlage weg — und genau dagegen
ist der Wortlaut-Anker gewählt worden. Die Schwelle „mehr als die Hälfte" ist
eine gesetzte Zahl: Sie unterscheidet „dasselbe Anschreiben, überarbeitet" von
„ein anderes Anschreiben, in dem zufällig ein Satz gleich lautet". Das Ergebnis
ist in Schritt 4 sichtbar und mit einem Klick verworfen.

Gespeichert wird selbsttätig, eine Sekunde nach der letzten Änderung am Satz —
dasselbe Muster wie `useDraftAutosave`, nur ohne sichtbare Zustandsanzeige.
Höchstens zehn Sätze; beim Speichern fällt der älteste heraus. Ein leer
gewordener Satz wird gelöscht, nicht leer gespeichert.

## Speicherschicht

`StorageAdapter` bekommt vier Methoden:

```ts
listMarkSets(): Promise<MarkSet[]>
loadMarkSet(id: string): Promise<MarkSet | null>
saveMarkSet(set: MarkSet): Promise<void>
deleteMarkSet(id: string): Promise<void>
```

`loadMarkSet` liefert `null` statt zu werfen, `deleteMarkSet` wirft bei
unbekannter Kennung nicht — „fehlt bereits" ist in dieser Schicht durchgehend
kein Fehlerfall (siehe `deleteDraft`).

In `indexeddb.ts`: neuer Objektspeicher `markSets` mit `keyPath: 'id'`,
`STORAGE_DB_VERSION` von 1 auf 2. Das bestehende `onupgradeneeded` legt jeden
Speicher nur an, wenn er fehlt — bestehende Datenbanken wachsen also mit, ohne
Datenverlust.

`exportAll`/`importAll` nehmen die Sätze mit: `EXPORT_FORMAT_VERSION` von 1 auf
2, neues Feld `markSets`. Eine Sicherungsdatei der Fassung 1 wird weiterhin
angenommen und liefert einen leeren Bestand an Vormerkungen. `clearAll` löscht
den neuen Speicher mit.

Ankertexte sind Briefinhalt und liegen deshalb in IndexedDB, nie in
`localStorage` (G5). Kein anderer Programmteil greift auf den Speicher zu als
`src/lib/storage`.

## Verlauf und Textänderungen

**Verschieben.** `shiftMarks(marks, range, insertedLength)` führt jede
Vormerkung nach, gerechnet aus `delta = insertedLength - (range.to - range.from)`:

| Lage der Vormerkung zur Änderung | Folge |
|---|---|
| vollständig davor | unverändert |
| vollständig dahinter | beide Grenzen um `delta` verschoben |
| Änderung liegt vollständig in ihr | `to` um `delta` — die Stelle wächst und schrumpft mit dem Tippen |
| Änderung überdeckt sie vollständig | die Vormerkung fällt weg, ihr Text existiert nicht mehr |
| teilweise Überschneidung | auf den verbliebenen Teil beschnitten; bleibt nur Leerraum, fällt sie weg |

Danach wird `current` aus dem neuen Dokumenttext neu gelesen.

Alle drei Änderungswege der Arbeitsfläche (`handleParagraphInput`,
`applyVariant`, `insertAtSelection`) laufen dafür über einen gemeinsamen
`applyEdit(range, text, group?)` in `Editor.tsx`, der `replaceRange`, `commit`
und `shiftMarks` in einem Zug erledigt. Ein vierter Weg, der das vergäße, wäre
sonst der wahrscheinlichste Fehler dieser Erweiterung.

**Verlauf.** Ein Verlaufsstand ist künftig `{ document, marks }`. Strg+Z stellt
beides zusammen wieder her. `HistoryState` hält entsprechend `current` und
`past` als diesen Verbund; eine zusätzliche Aktion ändert nur die Vormerkungen,
ohne einen Schritt anzulegen — das Vormerken selbst ist kein Rückgängig-Schritt.

Der billigere Weg, nach jedem Rückgängigmachen die Anker neu zu suchen, scheitert
genau dort, wo es weh tut: Nach einer übernommenen Variante steht der Ankertext
nicht mehr im Brief, die Stelle wäre nicht auffindbar und ginge verloren.
Mitfahren ist exakt und kostet nichts — die Vormerkungen sind ein kleines Feld
neben einem Dokumentbaum, und unveränderte Stände teilen dasselbe Feld.

## Randfälle

- **Telefon und Tablet.** Vormerken setzt eine Feinmarkierung voraus und ist
  dort nicht verfügbar (`usePrecisePointer`). Wiederhergestellte Stellen
  dagegen schon: anklicken, umformulieren, übernehmen. Die Vorlage macht die
  Anwendung unterwegs erst brauchbar.
- **Speicher nicht erreichbar.** Vormerken funktioniert innerhalb der Sitzung,
  nur ohne Gedächtnis. Die bestehende Meldung `storageUnavailable` deckt das ab;
  eine zweite Warnung im Bereich wäre eine Doppelung.
- **Neues Dokument geladen.** `reset` leert die Vormerkungen und stößt das
  Wiederherstellen für den neuen Fingerabdruck an.
- **Wahrheitsmodus, Exportsperre, Fremdfirmen-Warnung, Lückenliste.**
  Unberührt. Vormerkungen ändern nichts am Modellaufruf, nur daran, welche
  Markierung gerade läuft.

## Architektur und Dateien

Neu:

| Datei | Rolle |
|---|---|
| `src/components/editor/marks.ts` | ohne React: Umschaltregel, Anker bilden, wiederfinden, verschieben, Fingerabdruck |
| `src/components/editor/useMarks.ts` | Zustand, Aktivieren, Wiederherstellen, selbsttätiges Speichern |
| `src/components/editor/useMarkHighlight.ts` | die Bereiche in die CSS Highlight API spiegeln |
| `src/components/editor/MarkPanel.tsx` | die Liste in der Seitenspalte (`SectionCard`, wie `GapList`) |

Geändert:

| Datei | Änderung |
|---|---|
| `src/components/editor/SelectionLayer.tsx` | Knopf „Stelle vormerken" / „Vormerkung aufheben", Hinweis „ersetzt Vormerkung n" |
| `src/components/editor/useDocumentHistory.ts` | Verlaufsstand um die Vormerkungen erweitert |
| `src/routes/Editor.tsx` | gemeinsamer `applyEdit`, Verdrahtung von Liste und Leiste |
| `src/lib/storage/adapter.ts` | `MarkAnchor`, `MarkSet`, vier Methoden |
| `src/lib/storage/indexeddb.ts` | Speicher `markSets`, Datenbankfassung 2, Sicherungsformat 2 |
| `src/styles/design.css` | `::highlight(applai-mark)` und `::highlight(applai-mark-done)` |
| `src/lib/i18n/locales/{de,en}.json` | `editor.marks.*` |

`marks.ts` liegt bei der Oberfläche und nicht in `src/lib/domain`, weil es
dieselbe Rolle hat wie `unbackedClaims.ts` und `foreignCompanies.ts`: reine,
ohne Oberfläche prüfbare Logik über einem `DocxDocument`, die kein KI-Anbieter
und kein Speicher braucht. Die Architektur-Grenzen bleiben unverändert.

## Prüfung

- `marks.test.ts` — Umschaltregel (deckungsgleich, überschneidend, angrenzend,
  nur Leerraum), alle vier Stufen des Wiederfindens, Verschieben in allen fünf
  Lagen, Fingerabdruck stabil gegen Leerraumunterschiede.
- `useMarks.test.ts` — Hinzufügen, Aufheben, Abhaken, Wiederherstellen bei
  Treffer, Rückfall auf den jüngsten Satz, Schwelle „mehr als die Hälfte",
  Speicher nicht erreichbar.
- `MarkPanel.test.tsx` — Reihenfolge, Fortschrittszeile, Restliste, alle Texte
  über i18n (G8).
- `useDocumentHistory.test.ts` — erweitert: Strg+Z stellt Text und
  Vormerkungen zusammen wieder her; Vormerken legt keinen Schritt an.
- `indexeddb.test.ts` — neuer Speicher, Sicherung hin und zurück, Datei der
  Fassung 1 lesbar, `clearAll` löscht mit.
- `Editor.test.tsx` — vormerken, anklicken, Variante übernehmen, Stelle ist
  abgehakt und **bleibt** vorgemerkt.
- Ein Playwright-Durchlauf über den ganzen Weg samt `@axe-core/playwright`.

Nach der Umsetzung: `npm run lint && npm run typecheck && npm test`.

## Änderung an der Spezifikation

`docs/spec.md`, Abschnitt „Bearbeitung", Zeile **Auswahl** wird ergänzt um:

> Mehrere Stellen gleichzeitig vormerkbar. Vormerkungen werden je Anschreiben
> gemerkt und beim nächsten Mal selbsttätig wiederhergestellt.

Das ist eine neue Produktentscheidung, keine Auslegung einer bestehenden.

## Verworfene Alternativen

| Verworfen | Warum |
|---|---|
| Wortlaut der Stellen als Bausteinbibliothek speichern | Nicht gewünscht: gespeichert werden die Stellen. Eine Bibliothek wäre ein eigenes Produkt mit eigener Verwaltung. |
| Alle Stellen auf einen Klick umformulieren | Verbraucht Kontingent auch für Stellen, die verworfen werden, und nimmt die Kontrolle Stelle für Stelle weg. |
| Alle Stellen in **einem** Modellaufruf | Bräuchte neuen Prompt, neue Antwortprüfung und machte die Wahrheitsprüfung je Stelle unschärfer (G10). |
| Benannte Vorlagen mit Verwaltungsansicht | Mehr Oberfläche als Nutzen für einen Nutzerkreis aus dem Betreiber und Bekannten. |
| Nur ganze Absätze vormerken | Nimmt die Feinmarkierung weg, die die erste Produktzusage der Bearbeitung ist. |
| Nur Positionen speichern, ohne Wortlaut | Fiele schon bei kleinen Änderungen am Briefanfang vollständig aus. |
| Vormerkungen nach jedem Rückgängigmachen neu ankern | Verlöre genau die Stellen, deren Text bereits ersetzt wurde. |
| Überlappende Vormerkungen zulassen | Die zweite Ersetzung träfe nach der ersten die falschen Zeichen. |
| Hervorhebung über eingeschobene `<span>` | Bricht die Offset-Rechnung und zerfällt im `contentEditable` beim Tippen. |
