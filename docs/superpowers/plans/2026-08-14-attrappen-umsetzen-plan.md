# Applai — Die Attrappen in die Anwendung übernehmen

> **Für agentische Umsetzung:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development` oder `superpowers:executing-plans`. Schritte nutzen Checkbox-Syntax (`- [ ]`).
>
> Vor der Gestaltungsarbeit zusätzlich `impeccable` laden (Abschnitt „Refinement preserves"), nicht `new-work`: Die Gestaltung ist entschieden und liegt fertig vor. Diese Arbeit setzt sie um, sie erfindet sie nicht neu.

**Ziel:** Die vier Attrappen in `.scratch/mock/` werden die echte Oberfläche. Aus handgeschriebenem CSS in Einzeldateien wird React mit Tailwind 4 und Token — in genau dem Aufbau, den die Anwendung heute schon hat.

**Was sich ändert:** die Gestaltung. **Was sich nicht ändert:** Aufbau, Zustandshaltung, Fachlogik, Texte, `src/lib/**`. Kein Umbau der Architektur, keine neuen Abhängigkeiten.

---

## Ausgangslage

Die Anwendung läuft heute auf dem ruhigen blauen Entwurf aus `DESIGN.md` (Akzent `#0077B6`, Inter durchgehend, Radien 4/8/12px, 1px-Konturen, weiche Erhebung). Parallel dazu sind über zwölf Durchgänge vier Attrappen in einer anderen Welt entstanden: **liniertes Papier, Tinte, harte Kanten**. Sie sind abgenommen und eingecheckt, aber nichts davon steckt in `src/`.

| Attrappe | wird | heute |
|---|---|---|
| `.scratch/mock/v20-vorbereiten.html` | `/` | `src/routes/Start.tsx` |
| `.scratch/mock/v23-arbeitsflaeche.html` | `/editor` | `src/routes/Editor.tsx` |
| `.scratch/mock/v21-datenschutz.html` | `/datenschutz` | `src/routes/Privacy.tsx` |
| `.scratch/mock/v22-einstellungen.html` | `/settings` | `src/routes/Settings.tsx` |

**Die Erststart-Zustände bleiben, wie sie sind.** `v18-erststart.html` (Laden, Datenschutzhinweis, Schlüssel einrichten, entsperren, beschädigter Eintrag) ist abgenommen und braucht keine Überarbeitung. Sie erben lediglich die geteilten Teile — Token und die Marke —, weil die global sind; ihr Aufbau und ihre Texte werden nicht angefasst.

Die Bilddateien liegen bereits im Baum und sind eingecheckt:

```
public/marke/     logo-ruhe.webp · logo-ruhe-hell.webp          (Standbild, hell/dunkel)
                  logo-schreck.webp · logo-schreck-hell.webp    (bewegt, je ~875 KB)
public/figuren/   warten · jubeln · spaehen · spaehen-oben
                  schirm · inkognito · jonglieren · luftballon
```

`.scratch/mock/assets.py` erzeugt sie neu, `.scratch/mock/artefakt.py` backt eine Attrappe zur Fassung ohne Aussenverweise zusammen. Beide sind dokumentiert.

---

## Reihenfolge

Token zuerst, dann die Bausteine, dann die Ansichten. Wer mit einer Ansicht anfängt, baut ihre Knöpfe zweimal.

---

## Schritt 1 — Token

Die neue Welt ist keine Umfärbung. Sie bringt Begriffe mit, die es heute nicht gibt: eine **Tintenkontur** (`--line`), eine **harte Kante** unter jeder Fläche (`--pop`, `--pop-height`), **Papier gegen Karte** (`--paper` / `--card`), eine zweite Schrift (`--font-display`) und eine federnde Kurve (`--bounce`).

- [ ] Token aus dem `:root`-Block von `v20-vorbereiten.html` wörtlich nach `src/styles/design.css` übernehmen. Nicht abtippen — kopieren; die Werte sind über mehrere Durchgänge auf Kontrast geprüft.
- [ ] Die drei Themenzustände beibehalten, wie die Attrappe sie führt: `:root` (hell), `@media (prefers-color-scheme: dark)` mit `:root:not([data-theme='light'])`, und `:root[data-theme='dark']`. Die Einstellungsseite schaltet über `data-theme`, die Systemwahl über die Medienabfrage — beide müssen wirken.
- [ ] `--font-display: 'Fredoka'` in `@theme` aufnehmen, damit Tailwind eine Utility dafür kennt. `public/fonts/fredoka-variable-latin.woff2` liegt bereit; `@font-face` samt `unicode-range` aus der Attrappe übernehmen.
- [ ] `DESIGN.md` **im selben Commit** nachziehen. Die YAML-Kopfzeile ist laut Projektregel die Quelle der Wahrheit; zwei auseinanderlaufende Wahrheiten sind schlimmer als eine veraltete.
- [ ] Alte Token nur entfernen, wenn sie nirgends mehr stehen. `grep -rn '--color-accent-light' src/` vor jedem Löschen.

**Achtung Tailwind 4:** Schrift-, Radius- und Bewegungstoken gehören in `@theme`, nicht in `:root` — nur dort greifen Tailwinds eigene Utilities darauf zu. `design.css` erklärt das bereits am Kopf; die Begründung gilt unverändert.

---

## Schritt 2 — Die vierzehn Bausteine in `src/components/ui/`

Hier steckt die eigentliche Arbeit. Die heutigen Primitive sprechen eine andere Sprache: 1px-Rand, weicher Schatten, 8px-Radius. Die neue: **3px Tinte, harte Kante darunter, Pille oder 24px**.

- [ ] `Button.tsx` zuerst — er ist laut eigenem Kommentar die Vorlage für alles Weitere. Die vier Varianten (`primary`, `secondary`, `ghost`, `danger`) bleiben; ihr Aussehen kommt aus der Attrappe (`.go`, `.btn`, `.mini`, `.btn--danger`).
- [ ] Die harte Kante ist `box-shadow: 0 var(--pop-height) 0 …` plus der weiche Schatten dahinter — **kein** `border-bottom`. Beim Drücken wandert der Knopf um `--pop-height` nach unten und die Kante verschwindet; so entsteht der Druckpunkt.
- [ ] `Card.tsx`, `SectionCard.tsx`, `Dialog.tsx`, `Popover.tsx`: Radius `--r-card` (34px), 3px `--line`, harte Kante, Grund `--card`.
- [ ] `Input.tsx`, `Field.tsx`, `Select.tsx`, `Checkbox.tsx`, `Switch.tsx`, `Slider.tsx`, `Choice.tsx`: Radius `--r-control` (16px), Grund `--field`, Kontur `--line-soft`.
- [ ] `icons.tsx` um das Zahnrad erweitern. **Pfad wörtlich aus Phosphor 2.1.1 „regular"** übernehmen, wie die Datei es für alle anderen vorschreibt — nachgezeichnete Sinnbilder passen daneben nie. Der Pfad steht fertig in `v23-arbeitsflaeche.html`.
- [ ] Radix bleibt. Die Attrappen sind reines HTML und kennen keine Tastaturbedienung; die Primitive haben sie bereits.

---

## Schritt 3 — Rahmen und Marke

- [ ] `AppLayout.tsx`: Der Raum ist ein liniertes DIN-A4-Blatt. Die drei Verläufe (Zeilen, roter Rand bei 14%, Abdunklung zum Rand) und die sieben Kritzeleien aus der Attrappe übernehmen, `position: fixed`, `z-index: 0`, `aria-hidden`.
- [ ] Neuer Baustein `Wordmark` (`src/components/app/`). Er ersetzt Bildmarke plus Textzeile.

**Der Schriftzug hat drei Eigenheiten, die sich nicht von selbst ergeben:**

1. **Zwei Ruhefassungen.** Tinte auf hellem, Weiß auf dunklem Grund. Umgeschaltet wird über `color-scheme` — dieselbe Antwort für Systemwahl und ausdrückliche Wahl. Beide `<img>` tragen `alt=""`, den Namen sagt eine `sr-only`-Zeile.
2. **Zentriert wird die Tinte, nicht der Rahmen.** Rechts im Bild stehen 11,4% leer (Platz für die ausschlagenden Arme), links 0,6%. Ohne Ausgleich sitzt der Schriftzug sichtbar links der Mitte. Der Ausgleich ist `margin-right: calc(var(--breite) * -0.1078)`. **`max-width: 100%` zerstört das** — es löst sich gegen die verkleinerte Zelle auf und schrumpft die Marke; Mediengrößen stattdessen über die Breite regeln.
3. **Beim Zeigen erschrickt der Bleistift.** Eine bewegte WebP-Datei lässt sich nicht zurückspulen: Dieselbe Quelle erneut zuzuweisen setzt den Lauf nicht zurück. Eine frische Objektadresse (`URL.createObjectURL`) erzwingt neues Entschlüsseln und damit das erste Bild. Geholt wird die Datei einmal, dann liegt sie als Klumpen bereit.

- [ ] Im Ruhezustand hat das bewegte Bild **keine Quelle**. Wer nie hinzeigt, lädt die 875 KB nie. Das ist kein Feinschliff, sondern der Grund, warum die Datei überhaupt vertretbar ist.
- [ ] Bei `prefers-reduced-motion: reduce` bleibt alles stehen und es wird **nichts geladen**.
- [ ] Auf dem Finger gibt es kein Zeigen: Ein Tippen spielt den Lauf einmal ab (3000 ms) und hört von selbst auf.
- [ ] Läuft nicht weiter, wenn die Seite verborgen ist (`visibilitychange`).
- [ ] Größen: `/` 400px, `/datenschutz` und `/settings` 200px, `/editor` 190px. Die Startseite ist der Eingang und darf auftreten; die übrigen Kopfzeilen sind Wegweiser.

---

## Schritt 4 — Die Figuren

Acht Posen derselben Figur, jede an ihrer Stelle mit einer Aussage:

| Ansicht | Figur | sagt |
|---|---|---|
| `/` | `warten` → `jubeln` | wartet lesend, springt auf, wenn alles beisammen ist |
| `/` | `spaehen` | schaut um die linke Kartenkante |
| `/editor` | `spaehen-oben` | schaut über das Blatt, an dem geschrieben wird |
| `/datenschutz` | `schirm` | was bleibt, bleibt trocken |
| `/datenschutz` | `inkognito` | was hinausgeht, wird nicht erkannt |
| `/settings` | `jonglieren` | die Kette der Modelle hält mehrere in der Luft |
| `/settings` | `luftballon` | die Sicherung nimmt die Sorge |

**Vier Regeln, jede teuer erkauft:**

- [ ] **Gleich groß heißt gleich große Person, nicht gleich großes Bild.** Beim Schirm nimmt die Wolke die halbe Bildhöhe, beim Ballon der Ballon ein Drittel. Gleich hohe Bilder ergeben verschieden große Personen. Maß ist die **Kopfbreite**; die Tabelle steht in `assets.py`. Auf `/datenschutz` und `/settings` sind alle vier auf 66px Kopf gerechnet.
- [ ] **Sie liegen im Blatt, nicht in den Karten.** Als Kind einer Karte richtet sich eine Figur nach ihr aus und liest sich als deren Beigabe. Sie gehören in die Hintergrundebene (`.room`), zu den Kritzeleien. Waagerecht verankert an der Fenstermitte: `calc(50% + halbe Inhaltsbreite + Abstand)` — so bleibt der Abstand zur Karte auf jedem Fenster derselbe.
- [ ] **Nie auf einer Linie.** Zwei gespiegelte Figuren in gleicher Höhe lesen sich als Ornament. Eine steht hoch und weiter weg, die andere tief und dichter dran, jede anders gekippt (−4°/5° bzw. 5°/−3°). Die Neigung ist die der Kacheln und Kritzeleien, die der Entwurf ohnehin führt.
- [ ] **Sie verschwinden, wenn kein Platz ist**, statt am Bildrand zu kleben: `/datenschutz` ab 1140px, `/settings` ab 1280px, die Spähende auf `/` ab 1140px. Die Werte sind gemessen, nicht geschätzt — beim Ändern der Größen neu messen.

**Die zwei Spähenden brauchen eine Ausrichtung auf den Pixel.** Ihre Vorlagen bringen eine eigene Mauer mit (Senkrecht- bzw. Querstrich), die beim Zuschnitt entfernt wurde, damit die Kante der Karte beziehungsweise des Blattes die Mauer ist:

- `spaehen`: Kante bei **90,57 % der Breite** → `left: calc(var(--breite) * -0.9057 - 1.5px)` an der Karte (die 1,5px sind die halbe Konturstärke, weil `left: 0` die Innenkante meint).
- `spaehen-oben`: Kante bei **91,31 % der Höhe**, Bild 640×538 → `top: calc(var(--breite) * -0.7676)` am Blatt.

- [ ] Alle Figuren sind `aria-hidden`. Sie sagen nichts, was die Oberfläche nicht auch sagt.

---

## Schritt 5 — Die Ansichten

### `/` — Start

- [ ] Kein Schrittanzeiger. Er zählte Schritte, die sich von selbst zählen.
- [ ] Der Weiter-Knopf steht **in** der Karte, rechts unten. Keine Punkteleiste darunter.
- [ ] **Ausgefüllt muss die Seite ohne Rollen ins Fenster passen** — mit Datei, Anzeige und ausgeklapptem Namensfeld. Drei Stufen nach Fensterhöhe (840 / 730 / 680px) machen Marke, Kachel und Anzeigenfeld kleiner. Die Marke gibt zuerst nach: Sie ist Schmuck, die Karte ist die Arbeit. Gemessen passt es ab 620px Fensterhöhe.
- [ ] Die Marke sitzt tiefer über einen **bildlichen** Versatz (`translate`), nicht über Polster: Die Bühne setzt sich mit ihren auto-Rändern neu mittig, ein Pixel Polster oben verschöbe die Karte um einen halben.
- [ ] **Die Ladeanzeige der Kachel** läuft einmal von 0 auf 100 %, in derselben Zeit wie das Lesen im Programm. Eine unendliche Pulsanzeige wird mitten in der Bewegung abgeschnitten und kommt nie oben an.
- [ ] Beide Kacheln bleiben **gleich hoch**, auch wenn eine geladen ist: `flex: 1` in ihrem Halter, `grid-auto-rows: 1fr` für den einspaltigen Fall. Sonst schrumpft die volle Kachel um 19px, statt sich zu füllen.
- [ ] Beschriftung und Dateiname brauchen `position: relative`, sonst malt die absolut gesetzte Füllung über sie hinweg.

### `/editor` — Arbeitsfläche

- [ ] Kein Schrittanzeiger. Marke links, rechts die Wahl der Unterlage und das Zahnrad.
- [ ] „Einstellungen" ist ein Zahnrad ohne Wort und braucht darum ein `aria-label`.
- [ ] Die Bühne rückt 44px nach unten, damit der Kopf der Spähenden ganz sichtbar ist — die Kopfzeile nicht: Die Figur schaut über das Blatt, nicht über die Marke. Erst ab 560px nötig; darunter bricht die Kopfzeile um und schafft den Platz von selbst.
- [ ] **Das Blatt bleibt in beiden Themen weiß.** Es zeigt die Word-Datei, und die sieht im Dunkelmodus nicht anders aus. Seine Farben sind feste Werte, keine abgeleiteten.

### `/datenschutz` und `/settings`

- [ ] Kopfzeile dreispaltig (`1fr auto 1fr`), Zurück-Knopf links, Marke mittig. **Beide brauchen `grid-row: 1`** — sonst setzt die Platzierung den Knopf eine Zeile tiefer, weil die Marke im Markup zuerst steht und Spalte 2 belegt.
- [ ] Unter 560px frisst die Knopfbeschriftung die Seitenspalte auf und schiebt die Marke aus der Mitte. Dort gibt die Kopfzeile die Mitte auf: eines links, eines rechts, mit umgekehrter Laufrichtung, damit der Knopf links bleibt.
- [ ] Inhalt, Texte und Aufbau beider Seiten bleiben unverändert.

---

## Schritt 6 — Was dabei nicht kaputtgehen darf

- [ ] **Jeder sichtbare Text läuft über i18next** (G8). Die Attrappen haben deutschen Text fest verdrahtet — beim Übernehmen gehört er nach `locales/de.json` und `en.json`. Neue Schlüssel für neue Beschriftungen, keine Sammelschlüssel.
- [ ] **Keine neuen Abhängigkeiten** (G9). Alles hier geht mit Tailwind, CVA und den vorhandenen Primitiven.
- [ ] **Keine Laufzeit-Ressourcen von fremden Hosts** (G2). Schriften und Bilder liegen im Projekt.
- [ ] Die bestehenden Tests laufen weiter. Wo eine Prüfung an einer Klasse oder einem Text hängt, wird die Prüfung mitgezogen — aber erst nachdem verstanden ist, was sie zusichert.
- [ ] `npm run lint && npm run typecheck && npm test` nach jedem Schritt.

---

## Schritt 7 — Nachweis

Nicht behaupten, sondern messen. Die Attrappen sind mit Playwright geprüft worden; dieselben Prüfungen gehören in `e2e/`:

- [ ] **axe: null Verstöße** auf allen vier Ansichten, in beiden Themen. `@axe-core/playwright` ist eingerichtet.
- [ ] **Kein Querlauf** von 360px bis 1920px.
- [ ] **`/` passt ausgefüllt ins Fenster** ab 620px Höhe — mit Datei, Anzeige und Namensfeld.
- [ ] **Die Marke steht mittig** (`/datenschutz`, `/settings`) und links (`/`, `/editor`) — auf den Pixel, über alle Breiten.
- [ ] **Beide Kacheln auf `/` sind gleich hoch** in allen drei Zuständen: leer, eine geladen, beide geladen.
- [ ] **Bei `prefers-reduced-motion` wird die bewegte Datei nie geholt.** Über den Netzwerkmitschnitt prüfbar.
- [ ] Tastaturweg durch jede Ansicht: sichtbarer Fokus überall, kein Element ohne Namen.

---

## Schritt 8 — Prüfung durch zwei Skills

Erst wenn alles steht und die Nachweise grün sind:

- [ ] **`web-design-guidelines`** über die vier Ansichten laufen lassen. Sie prüft gegen die Web Interface Guidelines — Fokus, Trefferflächen, Kontrast, Bewegung, Formularverhalten.
- [ ] **`impeccable`** anschließend, und zwar in dieser Reihenfolge:
  - `/impeccable audit` — Technik: Barrierefreiheit, Leistung, Verhalten über Größen hinweg.
  - `/impeccable critique` — Gestaltung: Hierarchie, Blickführung, kognitive Last.
  - `/impeccable polish` — nur, was die beiden davor aufgedeckt haben.
- [ ] Befunde nach Schwere sortieren. **Was aus der Attrappe stammt, ist eine Entscheidung, kein Versehen** — die harten Kanten, die dicken Konturen, die Kippung sind gewollt. Ein Befund dagegen wird berichtet, nicht stillschweigend wegpoliert.
- [ ] Was wirklich ein Fehler ist, wird behoben und erneut gemessen.

---

## Zum Nachschlagen

- Die Attrappen tragen ihre Begründungen im Kopf jeder Datei — dort steht, **warum** etwas so ist, nicht nur dass es so ist. Vor dem Übernehmen lesen.
- `.scratch/mock/artefakt.py` baut aus einer Attrappe eine Fassung ohne Aussenverweise; nützlich zum Vergleichen von Vorher und Nachher.
- Die Commits `f142840`, `e214b74`, `5886695`, `3de3ed4`, `69b710f`, `6797cc4`, `31956b9`, `9354b02`, `5dbe22e`, `4285f1c`, `31a101b` tragen die Gestaltungsentscheidungen samt Messwerten in ihren Nachrichten.
