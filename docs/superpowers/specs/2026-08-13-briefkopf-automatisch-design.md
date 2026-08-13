# Briefkopf selbsttätig übernehmen

Stand: 13. August 2026 · Bauabschnitt 1, Nachtrag zu Aufgabe 12/13

## Warum

Der Briefkopf wird heute vollständig vorgeschlagen — `suggestLetterhead`
(`src/lib/domain/letterhead.ts`) baut Empfänger, Datum, Betreff und Anrede
deterministisch aus der bereits gelesenen `JobAd`. Ins Anschreiben kommt er
trotzdem nur von Hand: Der Nutzer markiert eine Stelle, klickt „Einsetzen",
und das für jedes der vier Felder einzeln. Vier Markierungen, vier Klicks —
bei jeder Bewerbung erneut, und immer für dieselbe mechanische Arbeit.

Der Word- und PDF-Export braucht dafür keine eigene Änderung: `downloadDocx`
serialisiert den laufenden Dokumentstand, der PDF-Export liest denselben
Brief. Was im Dokument steht, ist in beiden Ausgaben enthalten.
Das manuelle Einsetzen ist die einzige Lücke zwischen Vorschlag und Ergebnis.

## Die bestehende Entscheidung, und was sich an ihr ändert

`LetterheadPanel.tsx` begründet das manuelle Einsetzen ausdrücklich:

> Der naheliegende Weg — den vorhandenen Briefkopf selbst finden und
> überschreiben — ist bewusst nicht gegangen: Ein Anschreiben trägt
> Empfänger, Datum, Betreff und Anrede in beliebig vielen Absätzen, in
> beliebiger Reihenfolge, oft in einer Tabelle oder einem Textrahmen. Wer sie
> automatisch sucht, rät; und wer beim Raten danebenliegt, überschreibt eine
> falsche Zeile in genau der Datei, deren Unversehrtheit dieses Projekt
> verspricht.

Diese Begründung bleibt gültig — sie wird nicht verworfen, sondern
eingegrenzt. Der Einwand trifft das *Raten*, nicht das *Finden*. Für Anrede
und Datum ist die Fundstelle nicht geraten, sondern an einer Formel
erkennbar; für den Empfänger liefert die bereits vorhandene
Fremdfirmen-Suche einen harten Anker. Wo diese Sicherheit fehlt, ändert sich
gar nichts: Der Einsetzen-Knopf bleibt unverändert bestehen und ist weiterhin
der Weg für jedes nicht sicher gefundene Feld.

Kein Feld wird je auf Verdacht überschrieben. Das ist die Linie.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Treffer** (`LetterheadMatch`) | Eine im Brief gefundene Stelle, an der ein Briefkopffeld heute steht — Feld, Zeichenbereich, Absatz und bisheriger Wortlaut. |
| **Suchfenster** | Der Bereich des Briefes, in dem überhaupt gesucht wird: oberhalb und einschließlich der Anrede, ersatzweise die ersten 15 Absätze. |
| **Bericht** | Die Aufstellung „Alt → Neu" je Feld im Briefkopf-Bereich, samt der nicht gefundenen Felder. |

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wann läuft die Übernahme? | Einmal, sobald die Anzeigen-Analyse `jobAd` geliefert hat |
| Was passiert bei unsicherer Erkennung? | Nichts — das Feld bleibt beim Einsetzen-Knopf |
| Brief ohne Briefkopf | Es wird keiner erzeugt. Neue Absätze legt diese Arbeit nicht an |
| Rückgängig | Ein einziger Schritt für alle Ersetzungen zusammen |
| Sichtbarkeit | Geänderte Absätze farbig umrandet, bis der Nutzer sie wegklickt |
| Teilersatz erkennbar machen | Bericht „Alt → Neu" je Feld, zusätzlich zur Absatzkontur |
| Fehler während der Anwendung | Alles oder nichts — das Dokument bleibt unberührt |
| KI beteiligt? | Nein. Die Erkennung ist vollständig deterministisch |

## Erkennung — `src/lib/domain/letterheadMatch.ts` (neu)

Rein, ohne React, ohne DOM. Beantwortet ausschließlich die Frage **wo** ein
Feld heute steht; **was** dort hinsoll, liefert weiterhin `suggestLetterhead`.

```ts
export type LetterheadField = 'recipient' | 'date' | 'subject' | 'salutation'

export interface ParagraphSlice {
  index: number
  text: string
  start: number
  end: number
}

export interface LetterheadMatch {
  field: LetterheadField
  range: { from: number; to: number }   // Dokumenttext, Ende exklusiv
  paragraph: number
  previous: string
}

export function matchLetterhead(
  paragraphs: readonly ParagraphSlice[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadMatch[]
```

`ParagraphSlice` ist bewusst eine strukturelle Teilmenge von `Paragraph` und
nicht der Typ selbst: So bleibt das Modul frei von `docx`- und DOM-Typen und
ohne `.docx`-Fixture testbar.

### Suchfenster

Gesucht wird ausschließlich oberhalb und einschließlich des Anredeabsatzes.
Wird keine Anrede gefunden, gelten die ersten 15 Absätze. Diese Grenze ist die
tragende Absicherung der ganzen Erkennung: Ohne sie könnte ein „Bewerbung" im
Fließtext als Betreff durchgehen oder ein Datum in der Berufserfahrung als
Briefdatum.

### Regeln je Feld

| Feld | Regel | Ersetzter Bereich |
|---|---|---|
| **Anrede** | Erster Absatz im Fenster, dessen getrimmter Text mit einer bekannten Formel beginnt: `Sehr geehrte`, `Sehr geehrter`, `Sehr geehrtes`, `Liebe`, `Lieber`, `Guten Tag`, `Hallo`, `Dear`, `To whom it may concern` | ganzer Absatz |
| **Datum** | Absatz im Fenster oberhalb der Anrede, in dem ein Datum steht und außer ihm höchstens 40 weitere Zeichen | **nur die Datumsstelle** |
| **Betreff** | Absatz im Fenster oberhalb der Anrede, dessen getrimmter Text mit `Bewerbung`, `Betreff`, `Application` oder `Re:` beginnt | ganzer Absatz |
| **Empfänger** | Absatz im Fenster oberhalb der Anrede, der einen Firmennamen aus der Bewerbungsliste als ganzes Wort enthält (`findWholeWordOccurrences`, dieselbe Suche wie die Fremdfirmen-Warnung) | **nur der Firmenname** |

Erkannte Datumsformen: `12.08.2026`, `12. August 2026`, `August 12, 2026`,
`2026-08-12`. Dass beim Datum nur die Fundstelle selbst ersetzt wird und nicht
der Absatz, ist wesentlich: Ein Ortspräfix wie „Berlin, " muss stehen bleiben.

Beim Empfänger gilt dasselbe aus demselben Grund — ersetzt wird der
Firmenname, nicht der Absatz, damit eine mehrzeilige Anschrift nicht
verschwindet. Die Nebenwirkung ist beabsichtigt und für den Nutzer sichtbar:
Straße und Postleitzahl der alten Firma bleiben stehen und müssen von Hand
berichtigt werden. Genau dafür gibt es den Bericht.

### Mehrere Treffer im selben Feld

Enthält das Fenster mehrere Absätze mit einem alten Firmennamen — etwa weil
zwei frühere Bewerbungen in der Liste stehen —, gewinnt der **oberste**
Absatz, und darin das **erste** Vorkommen. Die Anschrift steht in einem
Geschäftsbrief über allem anderen. Alle weiteren Vorkommen bleiben
unangetastet und werden weiterhin von der Fremdfirmen-Warnung beanstandet,
die dafür der zuständige Mechanismus ist.

Dasselbe gilt für Datum und Betreff: der oberste passende Absatz gewinnt.

### Überschneidungen

Treffer dürfen sich nicht überlappen. Bei Konflikt gewinnt in dieser
Reihenfolge: Anrede, Datum, Betreff, Empfänger — nach absteigender
Verlässlichkeit der Regel. Der unterlegene Treffer entfällt ersatzlos.

## Anwendung — `src/components/editor/letterheadApply.ts` (neu)

Zuschnitt wie `foreignCompanies.ts`: der Adapter zwischen reiner Logik und
Arbeitsfläche.

```ts
export interface LetterheadChange {
  field: LetterheadField
  paragraph: number
  previous: string
  next: string
}

export interface LetterheadApplication {
  document: DocxDocument
  marks: readonly Mark[]
  changes: LetterheadChange[]
  missing: LetterheadField[]
}
```

Regeln, in dieser Reihenfolge:

1. **Leere Neuwerte werden übersprungen.** `suggestLetterhead` gibt
   `recipient: ''` zurück, wenn die Firma in der Anzeige fehlt. Diese Regel
   verhindert, dass ein leerer Vorschlag den alten Adressblock löscht — die
   wichtigste Einzelregel des Moduls.
2. **Ersetzt wird von hinten nach vorn**, nach absteigendem `range.from`.
   Sonst verschieben sich die Offsets der noch offenen Treffer.
3. **Vormerkungen werden mitgeführt** (`shiftMarks` je Ersetzung). Beim
   Laden eines Entwurfs mit `keepMarks` können bereits welche liegen.
4. **Alles oder nichts.** Wirft eine Ersetzung, wird der gesamte Stapel
   verworfen und das übergebene Dokument unverändert zurückgegeben. Ein halb
   angewandter Briefkopf entsteht nie.

Absätze in Tabellenzellen, Textrahmen oder mit Abschnittswechsel brauchen
keine Sonderbehandlung: Es wird immer Ersatztext geliefert, also entfernt
`replaceRange` in keinem Fall einen Absatz.

## Einbindung — `src/routes/Editor.tsx`

Läuft **einmal je Paarung aus Dokument und Stellenanzeige**, sobald die
Analyse `jobAd` geliefert hat. Der Ref merkt sich diese Paarung, nicht bloß
ein „schon gelaufen": Analysiert der Nutzer zu demselben Brief eine zweite
Anzeige, soll der Briefkopf erneut übernommen werden — dann steht in ihm ja
bereits die vorige Firma und ist damit selbst der alte Briefkopf. Gegen
erneutes Auslösen bei jedem Rendern oder nach einer späteren Bearbeitung
riegelt derselbe Ref ab. Ein einziger `commit` erzeugt einen einzigen
Rückgängig-Schritt — nicht vier `applyEdit`-Aufrufe hintereinander, die
läsen alle denselben veralteten `docx`-Stand aus der Closure.

## Oberfläche

### Hervorhebung

`DocumentView` erhält `letterheadParagraphs` als dritte Menge neben
`claimParagraphs` und `foreignParagraphs`. Die Absatzkontur liegt bereits
immer an und ist nur farblos, es verschiebt sich also kein Zeichen.

| Zustand | Farbe | Vorrang |
|---|---|---|
| beanstandet (Fremdfirma, unbelegte Aussage) | `--color-error` | 1 |
| Verschiebungswarnung | `--color-warning` | 2 |
| Briefkopf geändert | `--color-info` | 3 |

Der Briefkopf steht hinten an: Ein falscher Firmenname hält den Export auf,
„hier wurde etwas geändert" ist ein Hinweis. Die Hervorhebung bleibt, bis der
Nutzer sie im Briefkopf-Bereich wegklickt — nicht bis zum nächsten Rendern,
sonst ist sie fort, bevor jemand hingesehen hat.

Nimmt der Nutzer die Übernahme mit Strg+Z zurück, verschwindet die
Hervorhebung mit ihr: Sie bezeichnet Änderungen, die es dann nicht mehr
gibt. Der Bericht verschwindet ebenfalls.

### Bericht

Die Absatzkontur allein genügt nicht: Steht die alte Anschrift im selben
Absatz wie der Firmenname, umrandet sie beides, und der Teilersatz bleibt
unsichtbar. Eine Auszeichnung *innerhalb* des Absatzes ist ausgeschlossen —
sie bräuchte ein Zwischenelement und würde die Offset-Rechnung brechen, auf
der Markierung und Ersetzung beruhen (ausführlich begründet in
`foreignCompanies.ts`).

Der Briefkopf-Bereich zeigt deshalb zusätzlich, was geschehen ist:

```
Empfänger    Alte Muster GmbH → Neue Beispiel AG
Datum        14.03.2026 → 13.08.2026
Anrede       Sehr geehrte Frau Klein → Sehr geehrter Herr Dr. Meier
Betreff      nicht gefunden — bitte einsetzen
```

Diese Aufstellung ist das eigentliche Werkzeug: Sie zeigt, dass der Name
getauscht wurde, und lässt damit erkennen, dass die Straße darunter noch die
alte ist.

Alle Texte laufen über i18next, neue Schlüssel in `de.json` und `en.json`
(G8).

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Keine Firma in der Anzeige erkannt | Empfänger wird übersprungen, alter Block bleibt |
| Erste Nutzung, keine Altfirmen bekannt | Empfänger nicht auffindbar, bleibt beim Einsetzen-Knopf |
| Kein einziger Treffer | Nichts geschieht, der Bereich nennt alle vier Felder als nicht gefunden |
| Ersetzung wirft | Ganzer Stapel verworfen, Dokument unberührt |
| Überlappende Treffer | Höherwertiges Feld gewinnt, das andere entfällt |

## Was ausdrücklich nicht gebaut wird

- **Keine neuen Absätze.** `replaceRange` kann keine anlegen; überzählige
  Zeilen hängt es per `w:br` an den letzten betroffenen Absatz. Ein Brief
  ohne Adressblock bekommt keinen. Diese Fähigkeit nachzurüsten wäre ein
  Eingriff in genau das Modul, dessen Unauffälligkeit das Layoutversprechen
  trägt, bei zu kleinem Nutzen.
- **Keine Auszeichnung innerhalb eines Absatzes** (siehe Bericht oben).
- **Keine KI in der Erkennung.** Die Regeln sind deterministisch und damit
  prüfbar; ein Modell an dieser Stelle wäre genau das Raten, das die
  bestehende Entscheidung ablehnt.
- **Kein Wiederherstellen (Redo)** — die Arbeitsfläche kennt keines.

## Tests

| Datei | Prüft |
|---|---|
| `letterheadMatch.test.ts` | deutscher und englischer Brief; Datum mit Ortspräfix ergibt einen Bereich nur um das Datum; Brief ohne Anrede fällt auf die 15-Absatz-Grenze zurück; „Bewerbung" im Fließtext trifft nicht; Überschneidung löst nach Rangfolge auf; ohne bekannte Firmen kein Empfängertreffer |
| `letterheadApply.test.ts` | Ersetzung von hinten nach vorn; leerer Neuwert übersprungen; Vormerkungen verschoben; Abbruch bei Fehler lässt das Dokument unberührt |
| `Editor.test.tsx` | läuft genau einmal; ein Strg+Z nimmt alle Ersetzungen zurück; Hervorhebung erscheint und lässt sich wegklicken |
| `LetterheadPanel.test.tsx` | Bericht zeigt Alt → Neu und die nicht gefundenen Felder; Einsetzen-Knopf bleibt für sie bedienbar |

Die bestehenden 1289 Tests müssen grün bleiben.

## Berührte Dateien

| Datei | Art |
|---|---|
| `src/lib/domain/letterheadMatch.ts` | neu |
| `src/components/editor/letterheadApply.ts` | neu |
| `src/routes/Editor.tsx` | Einbindung, einmaliger Lauf, einmaliger `commit` |
| `src/components/editor/DocumentView.tsx` | dritte Absatzmenge, dritte Farbe |
| `src/components/editor/LetterheadPanel.tsx` | Bericht und Wegklicken |
| `src/lib/i18n/locales/{de,en}.json` | neue Schlüssel |
