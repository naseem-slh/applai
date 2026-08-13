# Nächste Anzeige — ein Durchlauf statt vieler Klicks

Stand: 13. August 2026 · Bauabschnitt 1, Nachtrag zu Aufgabe 12/13/14

## Warum

Wer sich auf zehn Stellen bewirbt, macht heute zehnmal dieselbe Arbeit. Die
Anwendung merkt sich zwar bereits, *welche* Stellen im Anschreiben angepasst
gehören — die Merkliste samt Ankern übersteht den Wechsel der Ausschreibung
(`useMarks`, e2e-Test „stellt die Stellen bei der nächsten Ausschreibung
wieder her"). Was sie nicht tut: sie *abarbeiten*. Der Nutzer klickt jede
Stelle einzeln an, fordert Varianten an, übernimmt eine, und das N-mal, bei
jeder Bewerbung erneut.

Das Gedächtnis ist also da, die Ausführung fehlt. Diese Arbeit schließt genau
diese Lücke: ein Knopf, die neue Ausschreibung hinein, und der Brief steht
fertig zum Herunterladen.

## Was der Bestand schon trägt

Es entsteht auffällig wenig Neues — fast alles ist vorhanden und wird nur
noch der Reihe nach angesteuert:

| Vorhanden | Wofür der Durchlauf es nutzt |
|---|---|
| `session.letter.docxBase` + `parseDocx` + `reset` | Zurück auf das hochgeladene Original — derselbe Weg, den das Betreten der Arbeitsfläche geht |
| `useMarks` / `marks.ts` (`restoreMarks`, `relocate`) | Die vorgemerkten Stellen wiederfinden |
| `analyzeJobAd` | Die neue Ausschreibung auswerten |
| `buildRewriteRequest` + `rewriteVariants` | Je Stelle drei Varianten, streng geprüft |
| `applyEdit` in `Editor.tsx` | Der **eine** Weg, auf dem sich Brieftext ändert |
| `applyLetterhead` | Empfänger, Firma und Anrede aus der neuen Anzeige, im Stapel |
| `VariantPopover` | Die Auswahl im Modus „Varianten zeigen" |
| Absatzkontur „selbsttätig geändert", Bericht „Alt → Neu" | Nachvollziehbarkeit, Muster vom Briefkopf |
| `ClaimGuard` / `useUnbackedClaims` | Einzelbestätigung im freien Modus (G10) |

Der Stilprofil-Aufruf entfällt: Das Profil hängt am Anschreiben, und das
Anschreiben ändert sich nicht.

## `applyEdit` ist die Linie

`Editor.tsx` schreibt über `applyEdit`:

> **Der eine Weg, auf dem sich der Brieftext ändert.** Tippen, eine
> übernommene Variante und ein eingesetztes Briefkopf-Feld laufen alle hier
> hindurch: `replaceRange` bildet den neuen Stand, `shiftMarks` führt die
> vorgemerkten Stellen nach, und beides geht in **einem** `commit` in den
> Verlauf. Ein vierter Änderungsweg, der das Nachführen vergäße, wäre der
> wahrscheinlichste Fehler dieser Erweiterung — deshalb gibt es nur diesen
> einen.

Der Durchlauf bekommt **keinen** eigenen Änderungsweg. Er ruft `applyEdit`,
Stelle für Stelle, wie ein sehr schneller Nutzer. Das ist die wichtigste
Einzelentscheidung dieser Spezifikation.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Durchlauf** | Der ganze Vorgang von „neue Anzeige eingefügt" bis „alle Stellen erledigt oder abgebrochen" |
| **Schritt** | Eine vorgemerkte Stelle innerhalb des Durchlaufs, angesprochen über ihre Marken-Kennung |
| **Betriebsart** | `schnell` (erste Variante übernehmen) oder `waehlen` (an jeder Stelle anhalten) |
| **Halt** | Der Wartezustand: der Durchlauf ruht und erwartet eine Entscheidung — weiter, überspringen, abbrechen |

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Grundlage des neuen Briefes | Immer das hochgeladene Original, nie die zuletzt exportierte Fassung |
| Wo beginnt der Durchlauf? | Knopf „Nächste Anzeige" in der Exportleiste, Dialog mit Textfeld und beiden Betriebsarten |
| Was geschieht mit den drei Varianten? | `schnell`: erste übernehmen · `waehlen`: an jeder Stelle zeigen |
| Fehler während des Laufs | Anhalten und fragen; Übernommenes bleibt stehen |
| Unbelegte Aussagen (freier Modus) | Halt **auch** im Schnellmodus — G10 verlangt Einzelbestätigung |
| Briefkopf | Läuft über den vorhandenen selbsttätigen Weg, alles oder nichts |
| Anforderungsabgleich (`useGapAnalysis`) | Läuft **nicht** mit — er kostet eine Anfrage und ist ausdrücklich auf Abruf |
| Rückgängig | Je Stelle ein eigener Verlaufsschritt, wie bei einer übernommenen Variante heute |
| Bewerbungsliste | Neuer Eintrag; die Warnung bei gleicher Firma greift unverändert |
| Kosten | 1 Anfrage für die Anzeige + 1 je vorgemerkter Stelle, im Dialog vorab beziffert |
| Stilprofil | Wird nicht neu geholt |

## Der Durchlauf — `src/lib/domain/reapply.ts` (neu)

Eine reine Zustandsmaschine. Kein React, kein Anbieter, kein Dokument: Sie
besitzt die **Reihenfolge**, nicht den Text. Damit ist der Kern dieser
Erweiterung ohne Oberfläche prüfbar — die Architektur-Grenze aus `CLAUDE.md`.

### Zustände

```
bereit → anzeigeWirdGelesen → laeuft ⇄ haelt → fertig
                                   ↘ abgebrochen
```

| Zustand | Bedeutung |
|---|---|
| `bereit` | Dialog offen, nichts angefordert |
| `anzeigeWirdGelesen` | `analyzeJobAd` unterwegs; der einzige Zustand vor dem ersten bezahlten Umschreiben |
| `laeuft` | Für den Schritt am Zeiger werden Varianten geholt |
| `haelt` | Wartet auf eine Entscheidung, mit einem von vier Gründen (siehe unten) |
| `fertig` | Zeiger hinter der letzten Stelle |
| `abgebrochen` | Nutzer hat abgebrochen; Übernommenes bleibt |

### Übergänge

Reine Funktionen, jede nimmt einen Zustand und gibt einen neuen zurück:
`starten`, `anzeigeGelesen`, `variantenDa`, `waehlen`, `fehler`,
`ueberspringen`, `abbrechen`. Nur `variantenDa` kennt die Betriebsart:

| | `schnell` | `waehlen` |
|---|---|---|
| Varianten ohne unbelegte Aussagen | erste übernehmen, Zeiger weiter | `haelt` mit drei Varianten |
| Varianten mit unbelegten Aussagen | `haelt` (G10) | `haelt` mit drei Varianten |
| Fehler | `haelt` mit Grund | `haelt` mit Grund |

Der Wartezustand muss für die Fehlerregel ohnehin existieren; die zweite
Betriebsart ist deshalb fast geschenkt. Das ist der Grund für diesen
Zuschnitt.

### Die vier Haltegründe

Genau vier, und die Oberfläche unterscheidet sie:

| Grund | Entsteht bei | Auswege |
|---|---|---|
| `wahl` | Betriebsart `waehlen`, Varianten liegen vor | übernehmen · überspringen · abbrechen |
| `unbelegteAussagen` | Variante trägt `unbackedClaims` (nur freier Modus) | einzeln bestätigen · überspringen · abbrechen |
| `anbieterfehler` | Netz, Schlüssel, Kontingent | erneut versuchen · überspringen · abbrechen |
| `antwortVerworfen` | `rewrite.ts` hat die Modellantwort zurückgewiesen | erneut versuchen · überspringen · abbrechen |

„Stelle nicht wiedergefunden" ist **kein** Halt: Das steht vor dem ersten
Aufruf fest und wird im Dialog gemeldet, nicht mitten im Lauf.

### Warum die Bereiche nicht in der Maschine liegen

Ein Schritt trägt die **Marken-Kennung**, nicht den Zeichenbereich. Jede
Übernahme verschiebt den Text hinter sich; ein gespeicherter Bereich wäre
nach dem ersten Schritt falsch. Die Steuerung liest den aktuellen Bereich vor
jedem Schritt frisch aus der Merkliste — die `shiftMarks` in `applyEdit`
bereits nachgeführt hat.

## Steuerung — `src/components/editor/useReapply.ts` (neu)

Der Haken hält alles, was die Maschine nicht anfassen darf: Anbieteraufrufe,
Abbruchsignal, die laufende `JobAd`, den Fortschrittstext. Sein Ablauf:

1. `parseDocx(session.letter.docxBase)` → `reset(parsed)` — zurück auf das
   Original.
2. `restoreMarks` gegen den Originaltext. Nicht wiedergefundene Stellen
   werden gezählt und **vor** dem ersten bezahlten Aufruf gemeldet. Alle
   wiedergefundenen Stellen stehen wieder **offen**: Das Abgehakt-Sein galt
   der vorigen Bewerbung, nicht der Stelle selbst.
3. Den neuen Anzeigentext in die Sitzung setzen. `analyzeJobAd` wird
   **nicht** selbst gerufen: `useLetterAnalysis` hängt bereits an
   `session.jobAdText`, und damit erbt der Durchlauf Auswertungsspeicher,
   Fehleranzeige, Wiederholung und den selbsttätigen Briefkopf, ohne sie
   nachzubauen. Es entsteht kein neuer KI-Aufrufort (G3, G4). Gewartet wird
   auf die **Identität** der neuen `JobAd`; ein Statuswert allein wäre der
   der vorigen Anzeige. Das Stilprofil liegt unter `letterText` im
   Zwischenspeicher und wird nicht neu geholt — die Kostenzusage „1 + N"
   bleibt gültig.
4. Je Schritt: Bereich aus der Merkliste lesen → `buildRewriteRequest` mit
   neuer `jobAd`, unverändertem Stilprofil, Wahrheitsmodus und Reglern →
   `rewriteVariants` → Ergebnis in die Maschine geben.
5. Bei Übernahme: `applyEdit(bereich, text, { completes: true })` und
   `claims.add(variant.unbackedClaims)` — dieselbe Reihenfolge wie in
   `applyVariant` heute, weil `locateClaims` die Aussagen erst im Dokument
   findet.

## Einbindung — `src/routes/Editor.tsx`

Der Haken wird neben den vorhandenen aufgerufen und bekommt `applyEdit`,
`session`, `style`, `truthMode`, `sliders`, `marks` und `claims` gereicht.
Neu in der Oberfläche: der Knopf in der Exportleiste, der Dialog, die
Fortschrittszeile und der Bericht. `Editor.tsx` ist bereits über 1000 Zeilen
lang — der Durchlauf kommt deshalb ausdrücklich **nicht** als weitere
`useCallback`-Kette dort hinein, sondern bleibt hinter dem Haken.

## Oberfläche

### Dialog

Auf der vorhandenen `Dialog`-Grundform: Textfeld für die Ausschreibung,
Vorabmeldung („5 Stellen vorgemerkt, 1 nicht wiedergefunden"), Kostenzeile
(„kostet 6 Anfragen"), zwei Knöpfe — „Schnell übernehmen" und
„Varianten zeigen". Beide sind gesperrt, solange das Textfeld leer ist.

### Während des Laufs

Eine ruhige Zeile: „Stelle 3 von 7", daneben „Abbrechen". **Kein Balken,
keine Prozentzahl** — dieselbe Begründung wie bei der Lückenliste, die einen
Prozentwert ausdrücklich ablehnt.

### Wählen-Modus

Die drei Formulierungen stehen **im Halt selbst**, mit demselben
Übernahme-Knopf wie im Fähnchen am Brief.

Ursprünglich war dafür die vorhandene `VariantPopover` vorgesehen. Das geht
nicht: Sie holt ihre Varianten selbst und nimmt keine entgegen. Sie zu
benutzen hieße, dieselbe Stelle ein zweites Mal anzufragen — die Kostenzusage
des Dialogs („eine Anfrage je Stelle") wäre gebrochen. Die Beschriftung des
Knopfes bleibt dieselbe, damit derselbe Vorgang auch gleich heißt.

### Bericht

„Alt → Neu" je Stelle nach dem Muster des Briefkopf-Berichts, dazu die
übersprungenen Stellen mit Grund. Die Absätze tragen die vorhandene Kontur
für selbsttätig Geändertes, bis der Nutzer sie wegklickt.

Alle Texte über i18next in `de` und `en` (G8), Schlüsselraum
`editor.reapply.*`.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Anbieterfehler (Netz, Schlüssel, Kontingent) | `haelt`, Grund über den vorhandenen `AiErrorNotice` |
| Modellantwort verworfen (`rewrite.ts` prüft Anzahl, Modusdisziplin, Kontexttreue, Zitierbarkeit) | `haelt` mit Grund |
| Stelle nicht wiedergefunden | Vorab im Dialog gemeldet, Schritt entfällt, kein Aufruf |
| Unbelegte Aussagen im freien Modus | `haelt`, auch im Schnellmodus — G10 |
| Anzeige nicht auswertbar | Der Durchlauf wartet; der Brief steht als hergestelltes Original da, und die vorhandene Fehlermeldung samt „Erneut versuchen" führt weiter. **Nicht** die vorige Fassung — das Original herzustellen ist der erste Schritt und muss vor der neuen Anzeige geschehen, sonst liefe der selbsttätige Briefkopf auf dem alten Text und käme nie wieder zum Zug. Der Dialog sagt genau das zu: „Der Brief entsteht neu aus Ihrem hochgeladenen Anschreiben." |
| Abbruch durch den Nutzer | Übernommenes bleibt stehen, Rest bleibt offen in der Merkliste |

Im strengen Modus ist `unbackedClaims` immer leer — dort läuft der
Schnellmodus tatsächlich ohne Rückfrage durch. Der freie Modus bezahlt seine
Freiheit mit Bestätigungen; das ist keine Bequemlichkeitsfrage, sondern G10.

## Was ausdrücklich nicht gebaut wird

- **Kein Sammel-Rückzieher** für den ganzen Durchlauf. Strg+Z nimmt Stellen
  einzeln zurück, wie heute.
- **Keine Warteschlange über mehrere Anzeigen.** Ein Durchlauf, eine Anzeige.
- **Kein automatischer Anforderungsabgleich.** Er kostet eine Anfrage und
  bleibt auf Abruf.
- **Keine parallelen Anbieteraufrufe.** Der Reihe nach: ein Abbruch soll
  sofort wirken, und Anbieter drosseln.
- **Keine benannten Vorlagen.** Die Merkliste bleibt ohne Verwaltung.

## Tests

| Ebene | Datei | Was geprüft wird |
|---|---|---|
| Domäne | `src/lib/domain/reapply.test.ts` | Alle Übergänge, beide Betriebsarten, alle vier Halte, überspringen, abbrechen, Reihenfolge. Ohne Oberfläche |
| Haken | `src/components/editor/useReapply.test.tsx` | Genau ein `applyEdit` je Stelle, Bereiche frisch gelesen, Halt bei unbelegten Aussagen, Abbruch bricht wirklich ab |
| Komponente | `src/routes/Editor.test.tsx` | Ein Durchlauf über zwei Stellen von Ende zu Ende |
| Ende zu Ende | `e2e/reapply.spec.ts` | Schneller Durchlauf vom ersten Export bis zur zweiten Word-Datei; dazu der Wählen-Modus |
| Barrierefreiheit | `e2e/a11y.spec.ts` | Dialog und Fortschrittszeile als neue Zustände |

Testgetrieben: erst der rote Test, dann der Code.

## Berührte Dateien

**Neu**

- `src/lib/domain/reapply.ts` + Test
- `src/components/editor/useReapply.ts` + Test
- `src/components/editor/ReapplyDialog.tsx` + Test
- `e2e/reapply.spec.ts`

**Geändert**

- `src/routes/Editor.tsx` — Haken einbinden, Knopf, Dialog, Fortschritt, Bericht
- `src/components/editor/ExportBar.tsx` — Knopf „Nächste Anzeige"
- `src/lib/i18n/locales/de.json`, `en.json` — `editor.reapply.*`
- `e2e/a11y.spec.ts` — neue Zustände
