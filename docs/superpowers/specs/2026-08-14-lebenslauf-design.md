# Lebenslauf anpassen — dieselbe Arbeitsfläche, ein zweites Dokument

Stand: 14. August 2026 · Bauabschnitt 2, erste Aufgabe

## Warum

`docs/spec.md` sagt unter „Mindestanforderung": *Anschreiben **oder** Lebenslauf
muss vorhanden sein*. Die Einstiegsseite hält sich daran — sie nimmt beide
Unterlagen entgegen. Die Arbeitsfläche nicht: `Editor.tsx` zeigt ohne
Anschreiben eine Sackgasse (Zeile 842) und verweist auf die Zeile „Reihenfolge"
derselben Spezifikation, die den Lebenslauf in den zweiten Bauabschnitt
verschiebt.

Das trifft einen echten Fall, keinen Randfall. Viele Ausschreibungen verlangen
ausdrücklich nur einen Lebenslauf. Wer sich auf eine solche Stelle bewirbt,
kann Applai heute überhaupt nicht benutzen — er lädt seine Unterlagen hoch,
fügt die Anzeige ein und landet auf einer Karte, die ihm mitteilt, dass sein
Dokument nicht an der Reihe ist.

Dieser Entwurf bringt den Lebenslauf in die Arbeitsfläche, mit **demselben**
Mechanismus: Stelle markieren, drei Varianten, nichts erfunden. Was
hinzukommt, sind die Anpassungen, die ein Lebenslauf braucht — und eine
Sicherung gegen den einen Fehler, der bei einem Lebenslauf teurer ist als bei
einem Brief: die verrutschte Jahreszahl.

## Was der Bestand schon trägt

Der Umbau ist kleiner, als die Aufgabe klingt. Vier Befunde:

**Der Lebenslauf ist längst geladen.** `Start.tsx` führt zwei Ablegefelder
(`Slot = 'letter' | 'cv'`), `StartSession` trägt beide Dokumente, und
`CV_DRAFT_ID` (`appContext.ts:101`) gibt ihm seit jeher einen eigenen Entwurf.
Benutzt wird er nur als Belegquelle (`Editor.tsx:317`, `factsFrom`).

**Die Dokument-Hooks sind schon dokumentunabhängig.** `useDocumentHistory()`
nimmt keine Parameter. `useDraftAutosave` nimmt eine `draftId` und schreibt zu
`letterheadAppliedFor` ausdrücklich „oder dieser Entwurf braucht sie nicht
(Lebenslauf)". `useMarks` trennt Quelltext (`letterText`, bestimmt den
Fingerabdruck) vom Arbeitstext (`documentText`). Briefgebunden ist die
Verdrahtung in `Editor.tsx`, nicht der Baustein.

**Vorgemerkte Stellen brauchen keine Schemaänderung.** `MarkSet.id` ist der
Fingerabdruck des Dokumenttexts (`adapter.ts:89`), nicht die Kennung
`letter`/`cv`. Ein Lebenslauf bekommt seinen eigenen Satz, sobald er zum ersten
Mal geöffnet wird.

**Word-Export trägt Lebensläufe bereits.** `paragraphNodesOf` sammelt alle
`w:p` unabhängig von ihrer Verschachtelung, und `replace.ts:464` begründet den
Schutz des letzten Absatzes einer Tabellenzelle mit genau diesem Fall:
„Adressblöcke und zweispaltige Lebensläufe sind Tabellen."

Nicht trägt der Bestand **den PDF-Schreiber**: `export/pdf/layout.ts:33` nennt
Tabellen unter dem, was bewusst fehlt. Ein tabellenbasierter Lebenslauf käme
als PDF ohne seine Tabelle heraus — still, ohne Hinweis.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Arbeitsumfang** (`scope`) | Welche Unterlagen bei dieser Bewerbung angepasst werden. Auf der Vorbereiten-Seite gewählt |
| **Faktenquelle** | Ein geladenes Dokument, das *nicht* im Arbeitsumfang liegt. Es belegt, was im anderen Dokument stehen darf, wird aber nicht angefasst |
| **Bewerbungsebene** | Zustand, der für die ganze Bewerbung gilt: Anzeige, Lückenliste, Wahrheitsmodus, Zielsprache, Export |
| **Dokumentebene** | Zustand, den jedes Dokument für sich hat: Verlauf, Markierung, Vormerkungen, Entwurf, Stilprofil |
| **Ziffernangabe** (`Figure`) | Eine Zahl in einer der Formen, in denen Lebensläufe Zahlen schreiben — Jahr, Monat/Jahr, Datum, Zeitraum, Menge, Prozent |

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Umfang der Anpassung | Derselbe Mechanismus wie beim Anschreiben, mit lebenslauftauglichen Prompts. **Kein** Umsortieren, **keine** Schwerpunktvorschläge, **kein** erzeugter Profilabschnitt |
| Navigation | Ein Schritt, zwei Dokumente. Umschalter über dem Dokument; die Seitenspalten gehören zur Bewerbung und bleiben stehen |
| Wer wählt was | Der Arbeitsumfang wird auf der Vorbereiten-Seite gewählt. In der Arbeitsfläche nachträglich dazuschaltbar |
| Faktenschutz | Deterministische Prüfung je Variante auf Zahlen und Datumsangaben, **für beide Dokumente**. Warnung mit Bestätigung, keine harte Sperre |
| Stil | Eigenes Lebenslauf-Stilprofil, aus dem Lebenslauf abgeleitet, einsehbar und korrigierbar |
| Regler | Nur kurz↔ausführlich. Förmlichkeit trägt das Stilprofil, nicht ein Regler |
| Auswahl | Kein „Ganzes Dokument" beim Lebenslauf. Auf Touch wählt ein Tippen den Absatz |
| PDF-Export | Gesperrt, sobald das Dokument eine Tabelle trägt. Word und Kopierfeld bleiben |
| PDF-Eingang | Mehrspaltiges PDF ist nicht anpassbar, nur Faktenquelle. Einspaltige PDFs bleiben bearbeitbar |
| Faktenbasis | Immer das hochgeladene Original, nie der laufende Stand |
| Export | Ein Bereich für die Bewerbung, Knöpfe je Dokument. Bewerbungseintrag beim ersten Export, danach nicht mehr |
| Exportsperre | Je Dokument, nicht gesamt |
| Durchlauf | Folgt dem Arbeitsumfang: Anzeige einmal auswerten, dann die vorgemerkten Stellen jedes gewählten Dokuments |
| Reifegrad | **Beta**, sichtbar gekennzeichnet: Marke am Reiter des Umschalters, Prüfhinweis über dem Blatt. Nichts wird gesperrt — eine Beta, die man nicht benutzen kann, erzeugt keine Erfahrung, aus der sie herauswachsen könnte |

## Der Schnitt

`Editor.tsx` trägt heute 1292 Zeilen und mischt zwei Ebenen, die einander nie
brauchen. Der Schnitt trennt sie entlang der Grenze, die schon im Zustand
liegt.

### `EditorShell` — die Bewerbungsebene

Bleibt die Route `/editor`. Hält: Anzeigenauswertung, Lückenliste,
Wahrheitsmodus, Zielsprache samt Sprachnachfrage, bekannte Firmen und
Fremdfirmen-Warnung, Bewerbungseintrag, Export-Bereich, Umschalter und den
Durchlauf.

### `useDocumentWorkspace` — die Dokumentebene

Neu, `src/components/editor/useDocumentWorkspace.ts`. Bündelt die vorhandenen
Hooks — `useDocumentHistory`, `useDocumentSelection`, `useMarks`,
`useDraftAutosave`, `useUnbackedClaims` — und die Rückrufe `rewrite`,
`applyEdit`, `applyVariant`, `restoreOriginal`.

```ts
export interface DocumentWorkspaceOptions {
  kind: 'letter' | 'cv'
  draftId: string
  /** Das hochgeladene Original. `null`, wenn dieses Dokument nicht im Arbeitsumfang liegt. */
  source: LoadedDocument | null
  storage: StorageAdapter
  /** Einmal in der Schale gemessen, nicht je Dokument (`usePrecisePointer`). */
  precise: boolean
  keepMarks: boolean
  /** Nur der Brief: `Draft.letterheadAppliedFor`. */
  letterheadAppliedFor?: string | null
}
```

**Anbieter, Schlüssel, Anzeige und Faktenbasis stehen bewusst nicht darin.**
Sie werden nur für den Modellaufruf gebraucht, und den setzt die Schale
zusammen — sie kennt beide Stilprofile, der Haken keines. Ein Haken, der beide
Formen kennen müsste, kennte auch beide Prompt-Wege und wäre genau der
Sammelpunkt, den dieser Schnitt auflöst.

**Die Schale ruft den Hook zweimal auf, nicht die Anzeigebausteine.** Einmal
für den Brief, einmal für den Lebenslauf, mit `source: null` für das, was nicht
im Arbeitsumfang liegt. Zwei feste Aufrufe, keine Schleife — die
Hook-Reihenfolge bleibt über jedes Rendern gleich.

Der Grund ist der Durchlauf: Er läuft über beide Dokumente und braucht beide
Handles. Lägen die Hooks in den Anzeigebausteinen, müsste die Schale sie über
Refs nach oben reichen — ein Weg, auf dem der Zustand eines Renderdurchlaufs
hinterherhinkt. So gehören die Handles der Schale, und die Anzeige bekommt sie
als Eigenschaft.

### `DocumentColumn` und die Stellschrauben je Art

Geplant waren zwei Körper `LetterWorkspace`/`CvWorkspace`, die je ihr ganzes
Dokument samt Bereichen tragen. Beim Schnitt zeigte sich, dass das an der
Anordnung vorbeigeht: Das Raster verschränkt die beiden Ebenen. Links liegen
die Merkliste (Dokumentebene) **und** die Lückenliste (Bewerbungsebene),
rechts Export und Wahrheitsmodus (Bewerbung) **und** Briefkopf und Stilprofil
(Dokument). Ein Körper, der ein ganzes Dokument umschließt, müsste an drei
Stellen zugleich hineinrendern.

Deshalb:

- **`DocumentColumn`** — die mittlere Spalte, dokumentunabhängig. Leiste,
  `SelectionLayer`, `VariantPopover`, `DocumentView`, `ClaimGuard`. Was die
  Dokumente unterscheidet, kommt als Eigenschaft herein: Überschrift, ob
  „Ganzes Dokument" angeboten wird, fremde und vom Briefkopf berührte
  Absätze, und die fertige Umformulierungsfunktion.
- **Stellschrauben je Art** — `LetterheadPanel` und `StyleProfilePanel` beim
  Brief, `CvStyleProfilePanel` beim Lebenslauf. Sie stehen in der rechten
  Spalte der Schale, nicht in einem Körper.
- Die Merkliste ist dokumentunabhängig und wird aus dem Handle des
  **sichtbaren** Dokuments gespeist.

**Beide Dokumente bleiben eingehängt**, das ruhende mit `hidden`. Umschalten
darf weder den Rückgängig-Verlauf noch die laufende Markierung verwerfen, und
ein Neuaufbau parste das `word/document.xml` jedes Mal neu.

## Arbeitsumfang

`StartSession` bekommt ein Feld:

```ts
scope: { letter: boolean; cv: boolean }
```

Auf der Vorbereiten-Seite steht bei jeder Unterlage eine Auswahl „anpassen".
Sie ist gesperrt, solange das Feld leer ist, und gesperrt mit Begründung, wenn
das Dokument ein mehrspaltiges PDF ist (`LoadedDocument.multiColumn`). Der
Weiter-Knopf bleibt gesperrt, solange nichts gewählt ist — sonst führte die
Vorbereitung in eine Arbeitsfläche ohne Arbeit.

Nicht Gewähltes bleibt **Faktenquelle**: Sein Text zählt weiter als Beleg, es
erscheint nicht im Umschalter, und für es wird kein Stilprofil abgeleitet —
das spart bei einer Nur-Lebenslauf-Bewerbung einen Modellaufruf.

Im Umschalter steht ein Eintrag „auch … anpassen", wenn ein Dokument geladen,
aber nicht im Umfang ist. Ein Sinneswandel soll nicht über die Einstiegsseite
zurückmüssen.

## Lebenslauf-Stilprofil — `src/lib/domain/cvStyleProfile.ts` (neu)

Ein Lebenslauf ist keine Prosa. `StyleProfile` misst Satzlänge, Anrede und
Förmlichkeit — an einem Aufzählungspunkt hat davon nichts etwas zu greifen. Und
bei einer Nur-Lebenslauf-Bewerbung gibt es kein Anschreiben, aus dem sich
überhaupt eines ableiten ließe.

```ts
export interface CvStyleProfile {
  /** Modell. „Entwickelt …" gegen „Entwicklung von …" */
  bulletForm: 'verbFirst' | 'nounPhrase' | 'mixed'
  /** Modell. */
  tense: 'present' | 'past' | 'mixed'
  /** Deterministisch: kommen „ich"/„mein" vor? */
  person: 'none' | 'first'
  /** Deterministisch: Anteil der Absätze mit Schlusspunkt. */
  terminalPunctuation: boolean
  /** Deterministisch: **Median** der Wörter je Absatz. */
  bulletLength: number
  /** Modell: kurze, konkrete Beobachtungen. */
  traits: string[]
  /** Modell: ein repräsentativer Eintrag, WÖRTLICH. */
  sample: string
}
```

Dieselbe Arbeitsteilung wie in `styleProfile.ts`: Was Code entscheiden kann,
entscheidet Code (`computeSentenceLength`, `detectAddress` sind das Vorbild),
und `sample` wird wie dort auf Wörtlichkeit geprüft.

**Median statt Mittelwert.** Ein Lebenslauf besteht nicht nur aus
Aufzählungspunkten, sondern auch aus Überschriften („Berufserfahrung"),
Datumszeilen und einer Anschrift. Ein Mittelwert über alle Absätze bildet keinen
einzigen davon ab; der Median trifft die Sorte Absatz, die am häufigsten
vorkommt — die Aufzählungspunkte. Damit braucht es keine Heuristik, die
Aufzählungspunkte von Überschriften unterscheidet, und keine solche Heuristik
kann falsch liegen.

`deriveCvStyleProfile(cvText, provider, apiKey)` und
`cvStyleProfileToPromptFragment(profile, lengthGoal)` spiegeln die Schnittstelle
des Briefprofils.

`analysisCache.ts` bekommt `AnalysisKind` um `'cvStyle'` erweitert. **Kein
Versionssprung**: `jobAd` und `style` behalten Prompt und Schema, und
Umformulierungen werden ohnehin nicht abgelegt.

## Umformulieren — `buildCvRewritePrompt`

Eine eigene Funktion in `src/lib/ai/prompts/rewrite.ts`, neben
`buildTranslationPrompt` — kein `kind`-Zweig im vorhandenen Prompt. Die Datei
hält es schon so: getrennte Aufgaben, getrennte Prompts, damit sich ihre
Fehlerquellen nicht vermischen.

Der Prompt verlangt: Aufzählungssprache statt Fließtext, keine Anrede, Form
nach dem Stilprofil, `VARIANT_COUNT` Varianten, Zielsprache im Klartext — und
Datum, Zahl, Arbeitgeber und Titel **wörtlich übernommen**.

## Faktenprüfung — `src/lib/domain/factsGuard.ts` (neu)

Reiner Code. Kein Modellaufruf, kein React.

**Die Regel.** Gelesen werden Ziffernangaben in den Formen, in denen Unterlagen
Zahlen schreiben: Jahreszahl (`2019`), Monat/Jahr (`03/2019`, `03.2019`), Datum
(`15.03.2019`), Zeitraum (`2019–2022`, `03/2019 – heute`), Menge mit Einheit,
Prozentwert. Vor dem Vergleich normalisiert: Bis-Strich vereinheitlicht,
Leerraum entfernt, führende Null im Monat ohne Bedeutung. Verglichen werden die
**Vorkommen**, nicht nur die Menge — zweimal `2019` ist etwas anderes als
einmal.

**Zahlwörter bleiben ungeprüft.** „drei Jahre" → „3 Jahre" ist keine
Faktenänderung, und eine Prüfung, die das meldet, wird nach dem dritten Mal
weggeklickt, ohne gelesen zu werden. Eine Warnung, der niemand mehr glaubt,
schützt schlechter als keine.

```ts
export interface FigureCheck {
  added: readonly string[]
  removed: readonly string[]
}
```

Die Anzeige paart eine entfernte und eine hinzugekommene Angabe **derselben
Art**, wenn die Paarung eindeutig ist („2019 → 2018"), und meldet sonst beide
getrennt. Sie rät nicht, welche Angabe welche ersetzt hat.

**Wo sie läuft.** In `domain/rewrite.ts`, nachdem Schema und Modusdisziplin
geprüft sind, als Feld an jeder `Variant` — analog `unbackedClaims`. Sie
**wirft nicht**: Eine veränderte Zahl ist ein Befund für den Nutzer, kein
Programmfehler. `VariantPopover` zeigt den Befund und sperrt „Übernehmen", bis
er bestätigt ist.

Weil die Prüfung im Fachbaustein sitzt und nicht in der Oberfläche, gilt sie
für beide Dokumente und für den Übersetzungsweg, ohne dass irgendwo ein Zweig
dafür entsteht. Das ist der Grund, warum „für beide Dokumente" fast nichts
kostet.

## Sperren

| Sperre | Erkennung | Was bleibt offen |
|---|---|---|
| PDF-Export bei Tabellen | `hasTables(docx)` — ein `w:tbl` vorhanden (neu in `lib/docx/parse.ts`) | Word-Export, Kopierfeld |
| Bearbeitung eines mehrspaltigen PDF | `LoadedDocument.multiColumn` | Das Dokument bleibt Faktenquelle |
| „Ganzes Dokument" beim Lebenslauf | `kind === 'cv'` | Ziehen mit der Maus, Tippen wählt den Absatz (`paragraphRange`, `documentSelection.ts:166`) |

Allen dreien liegt dieselbe Linie zugrunde: Eine Bewerbungsmappe, die still
falsch herauskommt, ist der schlechteste denkbare Ausgang. Jede Sperre nennt
ihren Grund im Klartext, keine verschweigt sich.

## Export

`ExportBar` wird von einem Dokument auf eine Liste umgestellt und gehört damit
der Bewerbungsebene:

```ts
documents: readonly {
  kind: 'letter' | 'cv'
  docx: DocxDocument
  /** Unbestätigte erfundene Aussagen in **diesem** Dokument. */
  blocked: boolean
  /** Dieses Dokument trägt eine Tabelle. */
  pdfBlocked: boolean
}[]
```

Der Bewerbungseintrag läuft beim **ersten** erzeugten Export und danach nicht
mehr — eine Bewerbung, zwei Dateien, ein Eintrag. Die Exportsperre wirkt je
Dokument: eine offene Aussage im Lebenslauf hält das fertige Anschreiben nicht
auf.

## Durchlauf

„Nächste Ausschreibung" zieht in die Schale. Reihenfolge: Originale herstellen,
**dann** die neue Anzeige auswerten (die bestehende Begründung in
`useReapply.ts` gilt unverändert — der selbsttätige Briefkopf darf nicht auf
dem alten Text laufen), danach die vorgemerkten Stellen jedes Dokuments im
Arbeitsumfang, Anschreiben zuerst. Der Dialog nennt die Zahl der Aufrufe
vorher; sie ist jetzt die Summe über beide Dokumente.

## Faktenbasis

`factsFrom` liest weiterhin die **hochgeladenen** Texte, nie den laufenden
Stand. Andernfalls entstünde eine Schleife: Eine im freien Modus erfundene
Zeile im Lebenslauf würde zum Beleg für den nächsten Satz im Anschreiben, und
G10 wäre über einen Umweg ausgehebelt, den niemand sieht. `session.cv.text`
hält den Originaltext ohnehin getrennt.

## Oberfläche

Über dem Dokument steht der Umschalter (`Anschreiben | Lebenslauf`), nur wenn
mehr als ein Dokument in Frage kommt. Die drei Spalten bleiben, wie sie sind;
links Anforderungen, Vormerkungen und Lückenliste, rechts Stellschrauben und
Ausgabe.

`nav.editor` heißt heute „Anschreiben anpassen" und wird zu „Unterlagen
anpassen". Der Gepflogenheiten-Hinweis in `LanguagePrompt` (Foto,
Geburtsdatum, Anschrift) beschreibt in Wahrheit einen Lebenslauf, keinen Brief;
sein Wortlaut bezieht sich künftig darauf, wenn der Lebenslauf im Umfang ist.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Nur Lebenslauf geladen | Arbeitsfläche öffnet mit dem Lebenslauf, kein Umschalter, kein Briefkopf, kein Briefstilprofil |
| Beide geladen, nur einer gewählt | Der andere bleibt Faktenquelle; im Umschalter steht „auch … anpassen" |
| Lebenslauf ist mehrspaltiges PDF | Auswahl auf der Vorbereiten-Seite gesperrt mit Begründung, Text zählt weiter als Beleg |
| Lebenslauf trägt Tabellen | Word ja, PDF gesperrt mit Begründung |
| Stilprofil des Lebenslaufs schlägt fehl | Wie beim Brief: die Arbeitsfläche steht, das Umformulieren dieses Dokuments ist bis zum Wiederholen nicht möglich |
| Variante verändert eine Zahl | Befund am Vorschlag, „Übernehmen" bis zur Bestätigung gesperrt |

## Was ausdrücklich nicht gebaut wird

Tabellensatz im PDF-Schreiber · Umsortieren oder Gewichten von Einträgen ·
erzeugter Profilabschnitt · Lebenslauf ohne Vorlage · originalgetreue
PDF→Word-Umwandlung · eine eigene Lückenliste je Dokument.

## Tests

- `factsGuard.test.ts` — Jahreszahl verändert, Zeitraum verschwunden, Zahl
  hinzugekommen, Zahlwort ohne Fehlalarm, führende Null ohne Fehlalarm,
  doppeltes Vorkommen
- `cvStyleProfile.test.ts` — Median über gemischte Absätze, Schlusspunkt,
  Person, Wörtlichkeit von `sample`
- `prompts/cvStyleProfile.test.ts` und der neue Zweig in `prompts/rewrite.test.ts`
- `useDocumentWorkspace.test.ts` — zwei Aufrufe, getrennte Verläufe, getrennte
  Entwürfe, getrennte Vormerkungssätze
- `CvWorkspace.test.tsx` — kein Briefkopf, kein „Ganzes Dokument", ein Regler
- erweitert: `Start.test.tsx` (Arbeitsumfang), `ExportBar.test.tsx` (zwei
  Dokumente, ein Bewerbungseintrag), `Editor.test.tsx` (Umschalter, Durchlauf)
- Ende zu Ende: ein Durchlauf **nur** mit Lebenslauf, gegen den gebauten Stand

## Berührte Dateien

**Neu:** `lib/domain/cvStyleProfile.ts` · `lib/ai/prompts/cvStyleProfile.ts` ·
`lib/domain/factsGuard.ts` · `components/editor/useDocumentWorkspace.ts` ·
`components/editor/DocumentColumn.tsx` ·
`components/editor/CvStyleProfilePanel.tsx` ·
`components/editor/DocumentSwitch.tsx`

**Geändert:** `routes/Editor.tsx` (wird zur Schale) · `routes/Start.tsx` ·
`components/app/appContext.ts` · `components/app/AppLayout.tsx` ·
`components/editor/ExportBar.tsx` · `components/editor/SelectionLayer.tsx` ·
`components/editor/VariantPopover.tsx` · `components/editor/useDocumentSelection.ts` ·
`components/editor/useReapply.ts` · `components/editor/rewriteRequest.ts` ·
`lib/domain/rewrite.ts` · `lib/domain/reapply.ts` · `lib/ai/prompts/rewrite.ts` ·
`lib/ai/analysisCache.ts` · `lib/docx/parse.ts` · `lib/export/docx.ts` ·
`lib/i18n/locales/de.json` · `lib/i18n/locales/en.json` · `docs/spec.md`

**Umbenannt:** `components/editor/useLetterAnalysis.ts` →
`useApplicationAnalysis.ts` — der Haken wertet jetzt die Bewerbung aus, nicht
das Anschreiben.

## Nachträge aus der Umsetzung

- **`LanguagePrompt` blieb unverändert.** Der Gepflogenheiten-Hinweis (Foto,
  Geburtsdatum, Anschrift) steht bereits im Text, ohne das Anschreiben zu
  nennen; ihn auf den Lebenslauf umzuformulieren hätte nichts hinzugefügt.
- **Der Auswertungsstand steht nur beim sichtbaren Dokument.** Er gehört der
  Bewerbung, und zweimal im Aufbau wäre es dieselbe Meldung an zwei Stellen —
  eine davon in einem verborgenen Teilbaum.
- **Der Durchlauf hält jetzt auch im Schnellmodus an**, wenn die
  Faktenprüfung anschlägt (`HaltReason` `faktenGeaendert`). „Schnell" heißt
  „ohne Rückfrage, wo nichts zu entscheiden ist"; eine verschobene
  Jahreszahl ist etwas zu entscheiden.
- **Ein vorgefundener roter Ende-zu-Ende-Test wurde berichtigt.**
  `e2e/reapply.spec.ts` hielt fest, der Knopf „Nächste Anzeige" erscheine
  ohne vorgemerkte Stelle nicht — Commit `0c0608f` hatte das mit Begründung
  geändert, ohne den Test nachzuziehen.
