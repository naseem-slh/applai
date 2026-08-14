# Originalgetreue Arbeitsfläche — der Brief sieht aus wie der Brief

Stand: 14. August 2026 · Bauabschnitt 2

## Warum

Die Arbeitsfläche zeigt das Anschreiben als Rohtext. Ein `<p>` je Absatz,
`white-space: pre-wrap`, sechzehn Pixel Abstand dazwischen, ein Blattrand von
9,5 % der Breite. Schrift, Grad, Einzüge, Zeilenabstände, Seitenränder,
Symbolzeichen und alle schwebenden Objekte fallen weg.

An einem wirklichen Anschreiben sieht man die Folgen alle auf einmal. Der
Brief, an dem dieser Entwurf gemessen wurde, ist in Calibri Light 12 pt
gesetzt, der Name steht eingerückt auf 6,7 cm, das Datum auf 12,5 cm, der
Fließtext hat 1 cm rechten Einzug, die Empfängeranschrift sitzt in einem
Textfeld, die Unterschrift ist ein Bild, und die Kontaktzeile trennt ihre
Angaben mit Wingdings-Punkten. Auf dem Bildschirm steht davon: alles bündig
links, in der Schrift der Oberfläche, mit klaffenden Lücken zwischen den
Absätzen, `□`-Kästen statt `•`, ohne Anschriftenfeld und ohne Unterschrift.

Das ist nicht nur unschön. Der Nutzer soll entscheiden, ob eine umformulierte
Stelle in seinen Brief passt — und das kann er nicht an einem Text beurteilen,
der aussieht wie ein Chatverlauf. Der Satzspiegel entscheidet mit, ob ein
Absatz zu lang geworden ist, und ob der Brief noch auf eine Seite geht.

## Was der Bestand schon trägt

Der Umbau ist kleiner, als die Aufgabe klingt: **Das Auslesen ist vollständig
da und wird auf dem Bildschirm nur nicht benutzt.**

**`format.ts` liest bereits alles.** 1105 Zeilen, geprüft, im Einsatz: Schriften,
Grade, Auszeichnungen, Farben, Ausrichtung, Einzüge, Zeilen- und
Absatzabstände, Tabulatoren, Seitenmaße und -ränder, Kopf- und Fußzeilen in
ihren drei Ausführungen, Bilder und schwebende Objekte samt ihrer
Blattkoordinaten. Die PDF-Ausfuhr setzt damit originalgetreu. Der Bildschirm
ruft es nicht auf.

**Die Zeichen stimmen zeichengenau überein.** Die Beiträge von `ParagraphItem`
ergeben aneinandergehängt genau `Paragraph.text` (`format.ts:150`), und ein
Test hält beide zusammen. Das ist die tragende Zusicherung dieses Entwurfs:
Läufe dürfen zu `<span>` werden, ohne dass das Offset-Modell es merkt.

**Die Symbolübersetzung ist geschrieben.** `translateSymbolText`
(`export/pdf/symbols.ts`) bildet `U+F09F` auf `•` ab — genau der Kasten aus der
Kontaktzeile. Nur die Ausfuhr ruft sie auf.

**Die Schriften liegen im Projekt.** Carlito und die Liberation-Familien,
metrikgleich zu Calibri, Arial, Times und Courier (`public/fonts/pdf/`).
`requiredFontKeys` (`layout.ts:171`) sagt, welche Schnitte ein Brief braucht,
`loadFonts` (`fonts.ts:145`) holt und parst sie.

**Der Klon trennt Beständiges von Wechselndem.** `replaceRange` klont den
XML-Baum tief (`replace.ts:53`), teilt `zip` aber bewusst (`replace.ts:91`).
Daran hängt der ganze Zwischenspeicher weiter unten.

## Der Weg: CSS-Fluss, nicht eigener Satz

Jeder `ParagraphItem` wird ein `<span>` mit seiner Zeichenformatierung, jeder
Absatz trägt seine Absatzformatierung, jede Seite ihre Ränder. Den
Zeilenumbruch macht der Browser — mit denselben mitgelieferten, metrikgleichen
Schriften, aus denen auch die Ausfuhr rechnet.

**Verworfen: den Bildschirm von `layoutDocument()` setzen lassen.** Das wäre
seitengleich mit dem PDF. Es macht aus einem Absatz aber N gesetzte
Zeilenkästen und bricht damit die Grundlage von `documentSelection.ts`: ein
`<p>` je Absatz, Offsets darin. Der Preis wäre ein Neubau von
Markierungsabbildung, Cursorsetzung und Eingabemethoden-Behandlung — genau die
Stellen, deren Kommentare in `DocumentView.tsx` festhalten, was sie einmal
gekostet haben, und dazu ein Neusatz je Tastendruck.

Der Preis des gewählten Wegs steht dagegen fest und ist klein: Words
Umbruchverfahren ist nicht das des Browsers. Beide brechen gierig über
dieselben Vorschubbreiten um, stimmen also fast immer überein; wo sie es nicht
tun, sitzt der Seitenumbruch auf dem Bildschirm eine Zeile neben dem im PDF.
Sollte sich das im Gebrauch als störend erweisen, lässt sich der Umbruch
nachträglich aus `layoutDocument()` beziehen, ohne die Darstellung anzufassen.

## Die Teile

### Format lesen, ohne es je Tastendruck zu bezahlen

`readDocumentFormat` parst heute bei jedem Aufruf `styles.xml` (29 KB) und
`theme1.xml` (8 KB) mit. Je Tastendruck wäre das nicht tragbar.

Deshalb wird der beständige Teil herausgelöst: `readFormatContext(docx)` liefert
Formatvorlagen, Design und Beziehungen und wird in einer `WeakMap` an
`docx.zip` gehalten. Diese Teile werden nie gepatcht — `replaceRange` fasst nur
`word/document.xml` an —, und `zip` bleibt über alle Bearbeitungsstände
dasselbe Objekt.

Übrig bleibt je Tastendruck `readParagraph` über die bereits geparsten Knoten.
Neben dem tiefen Klon und `buildTextModel`, die heute schon je Tastendruck
laufen, fällt das nicht ins Gewicht.

Kein Zwischenspeicher je Absatz: Der Klon gibt jedem Absatzknoten eine neue
Identität, eine `WeakMap` darauf träfe nie.

### Ein Maßstab, eine Variable

Die Seite bleibt so breit wie die gemessene Spalte. Daraus ergibt sich ein
CSS-Eigenschaftswert `--pt` — gemessene Breite in Pixeln geteilt durch
`page.widthPt` —, und jedes Maß der Darstellung steht als
`calc(var(--pt) * N)`.

Damit skaliert der ganze Brief mit der Spaltenbreite, ohne
`transform: scale()`. Das ist kein Geschmacksurteil: Eine Skalierung über
`transform` verschiebt Cursorsetzung und Trefferprüfung in einem
`contentEditable` gegenüber dem, was der Nutzer sieht.

Seitenpolsterung, Seitenhöhe und die Texthöhe für `splitIntoPages` kommen
damit aus `PageFormat` statt aus dem festen A4-Verhältnis.

### `documentStyle.ts` — Format zu CSS

Ein reines Modul ohne React, neben dem Code, den es bedient.

**Absatzabstände als Polsterung, nicht als Rand.** Zwei Gründe, beide
zwingend: CSS-Ränder benachbarter Geschwister fallen zusammen, Words
`spaceBefore`/`spaceAfter` tun das nicht; und `offsetHeight` schließt
Polsterung ein, Ränder nicht — die Messung in `usePagination` bliebe sonst
falsch. Damit entfällt zugleich `PARAGRAPH_GAP`: Der Abstand steckt im Absatz.

**Zeilenhöhe.** Bei `rule: 'exact'` und `'atLeast'` der Wert unmittelbar. Bei
`'auto'` meint Word *Faktor × natürliche Zeilenhöhe der Schrift*, und das ist
nicht das `normal` des Browsers; gerechnet wird deshalb aus den echten
Metriken über `readTrueType` — dieselbe Quelle, aus der `layout.ts` rechnet.

**Der leere Absatz.** Seine Mindesthöhe kommt aus `markFormat`. Genau dafür
gibt es das Feld (`format.ts:166`): Ein Absatz ohne Lauf hat keinen Grad und
fiele sonst auf null zusammen. In einem Anschreiben sind leere Absätze der
Zeilenfall zwischen Anrede, Text und Grußformel.

Dazu Einzüge als `margin-left/right`, Erstzeileneinzug als `text-indent`,
`text-align` aus `alignment`, und das Zeichen-CSS aus `CharacterFormat`.

### Schriften auf dem Bildschirm

`requiredFontKeys(format)` sagt, welche Schnitte gebraucht werden; `loadFonts`
holt sie bereits. Der Zwischenspeicher behält künftig die Rohbytes, sodass
**ein** Abruf beides bedient: die Metriken für die Zeilenhöhe und
`document.fonts.add(new FontFace(…))` für die Darstellung.

Geladen wird verzögert beim Öffnen des Dokuments, aus `public/fonts/pdf/`, also
aus dem Projekt (G2). Rund 286 KB je Schnitt; wer ein PDF ausgibt, lädt sie
ohnehin.

Zwei Verschiebungen, damit der Bildschirm nicht von der Ausfuhr abhängt:
`symbols.ts` wandert nach `src/lib/docx/` — es deutet Words Kodierung, das ist
Lesen, nicht Schreiben —, und die Zuordnung Word-Schriftname → mitgelieferte
Familie wird geteilt. Das Laden der TTF bleibt, wo es ist.

**Was das nicht heißt.** Calibri Light ist lizenziert und liegt nicht im
Projekt (G2, G4). Der Bildschirm zeigt Carlito: gleiche Breiten, gleicher
Umbruch, aber keinen Light-Schnitt, also etwas kräftiger als in Word. Das ist
dieselbe Näherung, die das PDF schon macht — und genau deshalb die richtige
Wahl: Bildschirm und Ausfuhr zeigen dasselbe. Eine lokal installierte
Originalschrift zu bevorzugen sähe besser aus und wäre eine Zusage, die die
Ausfuhr nicht einlöst.

### Der Abgleich in `DocumentView` — die heikle Stelle

Heute eine Zeile: Weicht `element.textContent` von `paragraph.text` ab, wird
der Absatztext überschrieben. Mit Läufen als `<span>` löschte das die
Formatierung mit aus. Stattdessen zwei Vergleiche:

- **Text weicht ab** → Läufe neu bauen, Cursor an den Absatzanfang. Dieselbe
  Regel „das Modell gewinnt" wie heute, dieselbe gewollte Unbequemlichkeit.
- **Text gleich, Laufaufbau abweichend** → ebenfalls neu bauen, den Cursor
  aber wiederherstellen. Das ist der Umformulierungsfall: `replaceRange` teilt
  Läufe, der Text kann derselbe bleiben.

Die Kennung des Laufaufbaus ist die Folge aus `(kind, Zeichenformat)` **ohne
Längen**. Darauf kommt alles an: Ein getipptes Zeichen verlängert einen Lauf,
ändert die Folge aber nicht — gewöhnliches Tippen baut also nie neu, und der
Cursor bleibt stehen, wo er war. Stünden Längen in der Kennung, spränge er bei
jedem Anschlag an den Absatzanfang.

**Hingenommene Grenze.** Ein Zeichen, das genau auf der Grenze zweier
verschieden formatierter Läufe getippt wird, bekommt am Bildschirm den
Nachbarn, den der Browser wählt — nicht zwingend den, dem `replaceRange` es
zuschlägt. Text und Kennung stimmen beide, es wird also nicht korrigiert. In
einem einschriftigen Brief tritt das nie zutage. Es wird benannt, nicht
wegkonstruiert.

### Die schwebende Ebene

Anschriftenfeld, Briefkopflinie, Unterschrift, Kopf- und Fußzeile kommen
**nicht** in den `contentEditable`: Nicht bearbeitbare Inseln darin bringen den
Schreibcursor durcheinander. Sie liegen in einer absolut gesetzten
Geschwisterebene über den Seiten, mit `pointer-events: none`, aber im
Barrierefreiheitsbaum — die Empfängeranschrift soll vorgelesen werden.

Seitenoberkanten ergeben sich aus Seitenhöhe und Seitenabstand. Objekte mit
`fromV: 'paragraph'` brauchen die gemessene Oberkante ihres Absatzes; der
Messdurchlauf in `usePagination` erhebt sie ohnehin und meldet sie künftig mit.
`FloatContent` kommt in seinen drei Formen vor: Textfeld (Absätze über
dasselbe `documentStyle`, plus `BoxInsets`), Bild (Objekt-URL aus
`DocumentImage.bytes`), Form (Fläche oder Linie mit Strichstärke).

Das Anschriftenfeld bleibt ansichtsseitig. Es steht bewusst außerhalb des
Offset-Modells (`paragraphNodesOf` filtert verschachtelte Inhalte,
`parse.ts:126`); geändert wird es weiter über die Briefkopf-Leiste
(`letterheadApply.ts`), nicht durch Markieren.

### Was ersatzlos wegfällt

`collapsedEmptyParagraphs` und `VISIBLE_EMPTY_RUN` (`pagination.ts:91,114`),
die Eigenschaft `collapseBlankRuns`, `PARAGRAPH_GAP`, `p-[9.5%]`, `gap-4`.

Der Notbehelf gegen die klaffenden Leerzeilen entstand, weil eine leere Zeile
in Oberflächengröße rund 32 px kostete und ein Lauf davon ein Drittel Blatt
fraß. Mit den wirklichen Zeilenhöhen — im gemessenen Brief 6, 11 und 12 pt —
ist er nicht mehr nötig, sondern falsch: Er verschluckte Weißraum, den Word
wirklich zeigt.

## Reihenfolge

Jeder Schritt zuerst als Test, danach `npm run lint && npm run typecheck &&
npm test`.

1. `symbols.ts` und die Familienzuordnung teilen — reine Verschiebung.
2. `readFormatContext` herauslösen, `WeakMap` an `zip`.
3. `documentStyle.ts` samt Tests — rein, ohne DOM, der billigste Teil.
4. Schriftladen für den Bildschirm, Rohbytes im vorhandenen Zwischenspeicher.
5. Seitengeometrie: `--pt`, echte Ränder, Zusammenfallen entfernen.
6. Läufe als `<span>` samt neuem Abgleich — der heikle Schritt, deshalb spät.
7. Schwebende Ebene, Kopf- und Fußzeile.

## Nachweis

Die Vorlagen liegen schon da und decken die Fälle ab:
`anschreiben-formatiert.docx`, `anschreiben-kopf-fuss.docx`,
`anschreiben-schwebend.docx`, `anschreiben-sonderfaelle.docx` (erzeugt von
`tests/fixtures/build-fixtures.mjs`).

**Kein echter Brief ins Repository.** Es ist öffentlich, und ein Anschreiben
trägt Anschrift, Mobilnummer und E-Mail (G4 dem Sinn nach).

Zu belegen: Zeichen-CSS je Lauf; Zeilenhöhe `auto` gegen `exact`; Polsterung
statt Rand; Mindesthöhe des leeren Absatzes aus `markFormat`; Tippen baut
**nicht** neu; geänderter Laufaufbau baut neu und stellt den Cursor wieder her;
Eingaben bleiben auf einen Absatz beschränkt (die bestehenden Tests müssen grün
bleiben); `translateSymbolText` greift auf der Fläche.

Dazu `npm run e2e`, insbesondere `e2e/a11y.spec.ts`: Die schwebende Ebene darf
keinen Verstoß einbringen, und der Brief muss vorlesbar bleiben.

Am Schluss von Hand gegen einen wirklichen Brief und dessen PDF-Ausfuhr
desselben Standes. Ein Seitenumbruch, der um eine Zeile abweicht, ist der oben
benannte Preis und kein Fehler.
