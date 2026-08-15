---
name: Applai
description: Reine Browser-App, die ein bestehendes Anschreiben an eine Stellenausschreibung anpasst. Liniertes Papier, Tinte, harte Kanten
colors:
  paper: "#FFFFFF"
  rule: "#C3D8EA"
  margin: "#AECBE5"
  room-edge: "transparent"
  doodle: "rgb(23 27 60 / 0.18)"
  on-room: "var(--ink-strong)"
  line: "#0D1B4B"
  line-soft: "#3A4680"
  pop: "#0D1B4B"
  card: "#FBF6EC"
  ink: "#16205C"
  ink-strong: "#0D1B4B"
  muted: "#4E5885"
  field: "#FFFFFF"
  accent: "#FF7A45"
  accent-line: "#C9531F"
  accent-deep: "#B8461A"
  accent-ink: "#2B1004"
  accent-text: "#B8461A"
  accent-wash: "#FFF0E8"
  done: "#22C98F"
  done-line: "#0F8F64"
  done-deep: "#0F8F64"
  done-ink: "#06301F"
  done-text: "#0B7050"
  done-wash: "#DDF7EC"
  error: "#D6293E"
  error-deep: "#A01D2E"
  error-ink: "#FFFFFF"
  page-line: "#D5D9E8"
  overlay: "rgb(10 14 45 / 0.5)"
  focus: "var(--accent-deep)"
elevation:
  card: "0 16px 30px rgb(13 27 75 / 0.13)"
  btn: "0 10px 18px rgb(13 27 75 / 0.14)"
  page: "0 1px 2px rgb(13 27 75 / 0.07), 0 12px 28px rgb(13 27 75 / 0.13), 0 34px 68px rgb(13 27 75 / 0.1)"
sizes:
  rule-step: "34px"
  pop-height: "6px"
radius:
  card: "34px"
  tile: "24px"
  control: "16px"
  sheet: "8px"
  pill: "9999px"
typography:
  display:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 2.4vw + 1rem, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  subheading:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  caption:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Fredoka, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  xxl: "3rem"
focus:
  color: "var(--focus)"
  width: "3px"
  offset: "3px"
motion:
  duration: "140ms"
  duration-overlay: "180ms"
  easing: "cubic-bezier(0, 0, 0.2, 1)"
  bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)"
components:
  button:
    danger-bg-hover: "var(--error-deep)"
    danger-fg: "var(--error-ink)"
---

# Applai — Design-Token

Diese Datei ist die verbindliche Quelle für Farb-, Typografie-, Radius- und
Abstandswerte. Die YAML-Kopfzeile oben ist maschinenlesbar; `src/styles/design.css`
spiegelt dieselben Werte als CSS-Variablen. Ändert sich ein Wert, wird er an
**beiden** Stellen angepasst.

Die Kopfzeile führt die **hellen** Werte. Die dunkle Entsprechung steht
ausschließlich in `src/styles/design.css`, und zwar an zwei Stellen (Systemwahl
und ausdrückliche Nutzerwahl). Jedes neue Farb- oder Schattentoken braucht
deshalb drei Einträge: hell in der Kopfzeile und in `:root`, dunkel in beiden
Dunkelblöcken. Tokens, die nur ein anderes Token weiterreichen (etwa
`focus.color` → `--focus`), folgen dessen dunkler Fassung von selbst und
brauchen keinen eigenen Eintrag.

## Leitgedanken

Die Werte stammen aus den vier abgenommenen Attrappen in `.scratch/mock/`
(`v20`–`v23`). Sie sind dort über mehr als zwölf Durchgänge entstanden und auf
Kontrast geprüft worden. Was hier steht, ist ihre Begründung — nicht ihre
Ableitung.

- **Der Raum ist ein liniertes DIN-A4-Blatt.** Papierweißer Grund, Zeilen im
  klassischen Blassblau im Abstand der Lineatur 27 (9 mm, bei 96 dpi rund
  34 px), links der Rand bei 14 % der Fensterbreite. Kein Farbverlauf: Papier
  ist flach. Die Tiefe kommt allein aus der leichten Abdunklung zu den Rändern
  (`room-edge`). Darauf liegt die Karte wie ein Aufkleber.
- **Was die Formen trennt, ist die Kontur, nicht der Helligkeitsunterschied.**
  Die Karte (`card`, `#FBF6EC`) steht mit 1,08:1 gegen das Blatt — bei diesem
  Wert trägt nicht mehr die Helligkeit, sondern der Farbton: warm gegen
  neutralweiß. Die Ablösung machen die 3 px dicke Tintenkontur (`line`), die
  harte Kante darunter (`pop`) und der weiche Schatten dahinter
  (`elevation.card`). Ein erster heller Entwurf mit weißer Karte ohne Kontur
  auf blassem Cyan ist genau daran gescheitert.
- **Zwei Linienstärken, mehr nicht.** Tinte (`line`) für Karten und Knöpfe,
  weiche Tinte (`line-soft`) für Kacheln, Eingabefelder und Trennlinien. Daran
  hängt die ganze Hierarchie; eine dritte Stärke gibt es nicht.
- **Farbe hat zwei Rollen, jede genau eine Farbe.** Tangerine (`accent`) heißt
  „hier ist etwas zu tun", Minze (`done`) heißt „erledigt". Deshalb braucht die
  Oberfläche keine Worte, um ihren Stand mitzuteilen — die Nummer einer
  vorgemerkten Stelle, die Ablegekachel, der Fortschritt sagen ihn über die
  Farbe. Rot (`error`) kommt an genau zwei Stellen vor: bei abgeschalteter
  Anonymisierung und beim Löschen.
- **Formen: Karte 34 px · Kacheln 24 px · Bedienelemente 16 px · Knöpfe Pille
  · Brief 8 px.** Der Brief ist das einzige Blatt mit 8 px — er zeigt ein
  Word-Dokument, und ein Word-Dokument hat keine runden Ecken.
- **Das Blatt der Arbeitsfläche bleibt in beiden Themen weiß.** Es zeigt die
  Word-Datei, und die sieht im Dunkelmodus nicht anders aus. Seine Farben sind
  feste Werte, keine abgeleiteten; nur Kontur (`page-line`) und Schatten
  (`elevation.page`) gehen mit dem Thema mit, weil sie zur Oberfläche gehören
  und nicht zum Dokument.
- **Dunkle Variante** über `prefers-color-scheme: dark` (Systemeinstellung)
  und zusätzlich über `[data-theme="dark"]` bzw. `[data-theme="light"]`
  (bewusste Nutzerwahl in den Einstellungen, überstimmt die Systemeinstellung
  in beide Richtungen). Siehe `src/styles/design.css`. Tailwinds eingebaute
  `dark:`-Variante kennt nur den ersten Weg und ist deshalb in `design.css`
  über `@custom-variant` durch eine ersetzt, die beide bedient.

## Schrift

Selbst gehostet unter `public/fonts/` (G2 — keine Google Fonts, keine
Laufzeit-Ressourcen von fremden Hosts), beide im Lateinisch-Subset (deckt
deutsche Umlaute und ß über den Unicode-Bereich U+0000–00FF ab), beide SIL
Open Font License 1.1:

- **Fredoka Variable** (`--font-display`, Utility `font-display`) — rund und
  spielzeughaft, für alles, was **erkannt** wird: Marke, Titel, Überschriften,
  Beschriftungen, Knöpfe, Zähler.
- **Inter Variable** (`--font-sans`, Utility `font-sans`) — für alles, was
  **gelesen** wird: Anzeigentext, Eingaben, Hinweise, Dateinamen, der Brief.

Die Trennung ist die eigentliche Regel und nicht die Schriftwahl: Wer eine
Beschriftung in Inter setzt, nimmt ihr die Zugehörigkeit zur Bedienung; wer
einen Absatz in Fredoka setzt, macht ihn schwer lesbar. `--font-sans` heißt
so, weil Tailwind diesen Namen selbst für die Grundschrift nutzt — ein
zweites `--font-body` mit demselben Wert wäre eine zweite Wahrheit.

## Komponenten-Token und die Regeln der Oberfläche

Mit Aufgabe 13a sind die acht Primitive unter `src/components/ui/` entstanden:
Button, Card, Dialog, Popover, Select, Switch, Slider, Tooltip. Was sie an
Regeln festlegen, gilt für jede Ansicht, die darauf aufbaut.

### Wie Token verbraucht werden

In der Oberfläche steht ein Farbtoken immer als `var()` in einer
Tailwind-Klasse: `bg-[var(--accent)]`, `text-[var(--muted)]`,
`border-[var(--line)]`. Das ist ausführlicher als ein `bg-accent`, aber es hat
einen Grund: die Farb- und Schattentoken stehen in `:root` und nicht in
`@theme`. Tailwind liest den Wert eines `@theme`-Tokens beim Erzeugen der
Utility-Klasse aus und schreibt ihn direkt hinein — die dunkle Variante
könnte ihn danach nicht mehr überstimmen. Über `var()` bleibt die Umschaltung
erhalten.

In `@theme` gehört nur, was Tailwind selbst so benennt und was keine dunkle
Fassung braucht. Genau dort — und nur dort — entsteht dafür eine eigene
Utility:

| Token | Utility |
|---|---|
| `--font-sans`, `--font-display` | `font-sans`, `font-display` |
| `--radius-{card,tile,control,sheet,pill}` | `rounded-card`, `rounded-tile`, … |
| `--ease-bounce` | `ease-bounce` |
| `--default-transition-*` | steckt in jeder `transition-*` |
| `--animate-*` | `animate-fill`, `animate-pop`, … |

Die Radien heißen `--radius-…` und nicht `--r-…` wie in den Attrappen: Nur
unter Tailwinds eigenem Namensraum entsteht die Utility, und ein `--r-card`
in `@theme` erzeugte gar nichts. Die Werte sind unverändert.

**Die harte Kante ist ein Schatten, kein `border-bottom`.** Dafür steht die
Utility `pop` in `design.css`: `box-shadow: 0 var(--pop-height) 0 var(--pop)`
plus der weiche Schatten dahinter. Nur als Schatten folgt die Kante dem Radius
des Elements, und nur so lässt sie sich beim Drücken auf null fahren, während
das Element um dieselbe Höhe nach unten wandert — genau daraus entsteht der
Druckpunkt. Die Höhe steht als `--pop-height` am Element (Knöpfe 6 px,
Nebenknöpfe 4 px, Kontrollkästchen 3 px, Karten 8–10 px), die Farbe als
`--pop-color`, wenn sie von der Tinte abweicht (der Warnknopf trägt
`--error-deep`, der stille Knopf und das leere Kästchen `--line-soft`).

**Was man anfassen kann, hat die Kante — und nur das.** Knöpfe, Kacheln,
Kontrollkästchen. Der `Switch` ausdrücklich nicht: Er ist eine Rille, in der
ein Knauf läuft, und Rillen liegen nicht auf. Eingabefelder ebenso wenig; sie
sind Vertiefungen im Papier, keine Gegenstände darauf.

**Die alten `--color-…`-Namen leben als Brücken weiter.** Rund fünfzig Dateien
außerhalb der vier umgestalteten Ansichten verbrauchen sie — die
Erststart-Zustände, die Anbauten der Arbeitsfläche. In `:root` reicht jeder
alte Name auf sein neues Ziel durch (`--color-ink: var(--ink)`), sodass alles
sofort in der neuen Welt steht. Wer eine Datei ohnehin anfasst, ersetzt den
alten Namen durch den neuen; ist ein Name nirgends mehr in Gebrauch
(`grep -rn '--color-…' src/`), fällt seine Brücke weg. Neue Oberfläche nimmt
ausschließlich die neuen Namen.

Zusammengesetzte Klassen laufen immer durch `cn()` aus `src/lib/utils.ts`.
Damit gewinnt eine von außen übergebene Klasse gegen die Variante, statt sich
mit ihr zu überlagern.

### Abstände in der Praxis

Tailwinds Zahlenskala trifft die Abstandstoken genau: `2` = 0.5rem (`xs`),
`3` = 0.75rem (`sm`), `4` = 1rem (`md`), `6` = 1.5rem (`lg`), `8` = 2rem
(`xl`), `12` = 3rem (`xxl`). Die Primitive nutzen deshalb `p-4`, `gap-3`,
`px-6` statt `p-[var(--space-md)]` — gleicher Wert, lesbarere Klasse.

**Diese sechs Stufen sind die Skala des Aufbaus.** Jeder Abstand *zwischen*
Elementen und *um* sie herum kommt daraus. `p-5` oder `gap-7` fallen aus der
Skala und gehören nicht in die Oberfläche.

**Im Inneren eines Bedienelements gilt eine zweite, kurze Reihe: `0.5`
(2 px), `1` (4 px) und `1.5` (6 px).** Das weicht die Skala nicht auf,
sondern ist ihr Gegenstück: ein Schalter ist 24 px hoch, ein Tooltip eine
Zeile kurz — der kleinste Schritt der Aufbau-Skala (8 px) sprengt beides.
Wollte man ihn erzwingen, käme ein 40 px hoher Schalter heraus, und der
sähe aus wie ein Eingabefeld. Wo die Feinmaße heute vorkommen:

| Ort | Wert | Wofür |
|---|---|---|
| `Switch` | `p-0.5` | 2 px zwischen Kontur und Knauf; mehr, und der Knauf fiele unter 16 px |
| `Slider` | `h-1.5` | 6 px Schienenhöhe; höher liest sie sich als Fortschrittsbalken |
| `Select` (Viewport) | `p-1` | 4 px, damit der innen liegende Fokusring eines Eintrags nicht am Rand der Liste klebt |
| `Select` (Gruppenüberschrift) | `py-1.5` | 6 px, damit die Überschrift dichter sitzt als die Einträge darunter |
| `Select` (Trennlinie) | `my-1` | 4 px beidseits einer 1-px-Linie |
| `Tooltip` | `px-2 py-1` | 8/4 px — ein Hinweis von einer Zeile, kein Kasten |

**Die Grenze ist scharf: ein Feinmaß beschreibt das Innenleben genau eines
Bedienelements.** Der Abstand zwischen einer Beschriftung und ihrem Feld,
zwischen zwei Karten, zwischen den Knöpfen einer Fußzeile ist Aufbau und
nimmt die sechs Stufen — auch dann, wenn es „nur ein bisschen enger" sein
soll. Ein `gap-1` in einer Ansicht heißt fast immer, dass der falsche
Behälter gewählt wurde.

Nicht unter die Abstandsskala fallen **feste Maße** — Breiten und
Kantenlängen, die aus der Geometrie eines Elements folgen (`size-4` für
eine Glyphe, `w-72` für das Popover, `max-w-lg` für den Dialog, `max-w-64`
für den Tooltip). Ebenso ein Innenabstand, der Platz für ein anderes
Element freihalten muss: die Dialogüberschrift trägt `pr-10`, weil der
Schließknopf 40 px breit ist. Sie folgt dessen Größe, nicht der Skala, und
sagt das im Kommentar.

### Höhen von Bedienelementen

**Die Maße sind polsterbasiert, nicht höhenbasiert.** In den Attrappen hat
kein Bedienelement eine feste Höhe; jedes ergibt sie aus Polsterung, Kontur
und Zeilenhöhe. Das ist kein Zufall: Bei 3 px Kontur ringsum und einer
Beschriftung, deren Größe sich ändert, wäre jede feste Höhe eine zweite
Wahrheit, die beim ersten längeren Wort auseinanderfällt.

Die untere Polsterung ist überall **ein Pixel größer als die obere**. Fredoka
sitzt optisch hoch in ihrer Zeile; ohne diesen Ausgleich klebt jede
Beschriftung an der Unterkante ihres Knopfes.

Was daraus folgt (gerechnet mit `line-height: 1.6` aus dem Fließtext):

| Element | Polsterung | ergibt |
|---|---|---|
| `Button size="sm"` | `pt-[6px] pb-[7px] px-[13px]` | ~40 px |
| `Button size="md"` | `pt-[9px] pb-[10px] px-4` | ~47 px |
| `Button size="lg"` | `pt-[10px] pb-3 px-[26px]` | ~54 px |
| `Button size="icon"` | fest `size-[42px]` | 42 px |
| `Button size="iconSm"` | fest `size-[30px]` | 30 px |
| `Input`, `SelectTrigger` | `py-3 px-4` | ~52 px |
| `Choice` (Reihe) | `p-[3px]` außen, `pt-[7px] pb-[8px]` innen | ~55 px |
| `Switch` | fest `h-[34px] w-[62px]` | 34 px |
| `Slider` (Schiene) | fest `h-[14px]`, Griff `size-6` | 14 / 24 px |
| `Checkbox` | fest `size-6` | 24 px |

Jedes anfassbare Element liegt damit über der Mindestzielgröße aus WCAG 2.5.8
(24 × 24). Die beiden festen Ausnahmen sind Absicht: Der Schalter lebt davon,
flacher zu sein als die Felder um ihn herum, und der Reglergriff nimmt die
14 px hohe Schiene als Trefferfläche mit.

**Eine weitere Größe ist eine Entscheidung und gehört hierher**, nicht in eine
einzelne Ansicht.

### Höhenstaffelung

Genau drei Ebenen, mehr nicht — und die Höhe trägt hier nicht der Schatten,
sondern die **harte Kante**:

1. **Das Blatt** — der Raum selbst (`paper`) mit seinen Zeilen, seinem Rand
   und den Kritzeleien. Ohne Kontur, ohne Kante, ohne Schatten.
2. **Die Karte** — `card`, 3 px `line`, `rounded-card`, harte Kante von 8–10 px
   und `elevation.card` dahinter. Alles, was auf dem Blatt liegt.
3. **Die Überlagerung** — Dialog, Popover, Auswahlliste: dieselbe Bauform wie
   die Karte, dieselbe Kante, dazu die Abdunklung (`overlay`) darunter. Alle
   liegen auf `z-50`; darüber hinaus vergibt die Anwendung nur die drei
   niedrigen Ebenen des Raums (Blatt 0, Hülle 1, Figuren 2–3).

Im dunklen Modus bleibt die Kante genau dieselbe Mechanik — sie ist eine
Fläche in `pop` und kein Schlagschatten, und Flächen sind auf dunklem Grund
genauso sichtbar wie auf hellem. Das ist der Grund, warum diese Welt ohne die
Lichtkante auskommt, die der vorige Entwurf im Dunkeln brauchte.

### Fokus

Ein einziger Ring für das ganze Programm, als Utility `focus-ring` in
`design.css`: 3 px in `--focus`, 3 px Versatz, nur bei `:focus-visible`.
**3 px und nicht 2** — in einer Welt aus 3 px dicken Konturen wäre ein
2-px-Ring die dünnste Linie auf dem Bildschirm und läse sich als Versehen.
`--focus` ist im Hellen `accent-deep`, im Dunklen `accent-text`: beide Male
der Ton, der „hier ist etwas zu tun" schon trägt.

`outline` statt `box-shadow`, damit der Ring den Radius des Elements von
selbst übernimmt und von überlaufenden Containern nicht beschnitten wird. Der
Versatz legt ihn auf die Fläche hinter dem Element — deshalb bleibt er auch
auf einem gefüllten Akzentknopf sichtbar.

Ausnahme: in Listen, die ihren Inhalt beschneiden (Auswahlliste), liegt der
Ring innen (`focus-ring-inset`).

**Zweite Ausnahme: das angeklickte Textfeld.** `:focus-visible` regelt das
überall sonst von selbst — ein angeklickter Knopf erfüllt es nicht. Bei
Textfeldern macht der Browser eine Ausnahme, und zwar mit Absicht: Sie nehmen
Tasten entgegen, also gilt jeder Fokus darauf als tastaturtauglich. Wer in ein
Feld klickt, bekäme deshalb denselben Ring wie jemand, der hintabt, obwohl er
genau weiß, wo er hingefahren ist. `useInputModality` schreibt die Eingabeart
als `data-eingabe` an das Wurzelelement, und eine Regel **ohne Layer** nimmt
dem Feld den Ring, solange sie „zeiger" sagt (ohne Layer, weil sie sowohl die
Grundregel unten als auch die Utility am Element schlagen muss). Als Eingabeart
zählt nur die Tabulatortaste — jeder Tastendruck wäre falsch, sonst spränge der
Ring mitten im ersten getippten Wort an.

Der Fokus bleibt dabei sichtbar: Die Kontur des Feldes wechselt auf Tangerine.
Sie ersetzt den Ring aber nicht überall, denn allein wäre sie zu schwach —
2,0:1 in der Helligkeit gegen die weiche Tinte, ein Sprung nur im Farbton. Für
die Tastatur bleibt es deshalb beim Ring.

Der Ring ist die **Vorgabe**, nicht das Opt-in: eine Grundregel im
`base`-Layer gibt ihn allem, was der Browser von sich aus fokussierbar
macht (`a[href]`, `button`, `input`, `select`, `textarea`, `summary`,
`[tabindex]` außer `-1`). Wer die Klasse `focus-ring` vergisst, bekommt
trotzdem denselben Ring statt des Browser-Rings — und kein Prüfwerkzeug
hätte das gemeldet, weil axe die Fokusdarstellung nicht bewertet. Die Regel
steht in `:where(…)` und damit auf Spezifität null: jede Klasse am Element
gewinnt weiterhin, auch `focus-ring-inset` und `focus:outline-none`.
`[tabindex="-1"]` ist ausgenommen, weil Radix genau das an die Flächen
setzt, die es beim Öffnen selbst fokussiert (Dialog- und Popover-Inhalt,
Auswahlliste) — ein Ring um eine ganze offene Liste wäre irreführend. Die
Klasse `focus-ring` bleibt trotzdem an den Primitiven: sie macht am
Element sichtbar, dass der Ring dazugehört, und trägt ihn auch dorthin, wo
kein natürlich fokussierbares Element sitzt.

### Bewegung

140 ms für Zustandswechsel von Farbe und Kontur, 180 ms für das Einblenden
einer Überlagerung, 140 ms für ihr Ausblenden. Zwei Kurven, und die Wahl
zwischen ihnen ist die Regel:

- **`ease-out`** (`--default-transition-timing-function`) für alles, was
  **verblasst**: Farbe, Kontur, Deckkraft, das Ausblenden einer Überlagerung.
- **`ease-bounce`** (`cubic-bezier(0.34, 1.56, 0.64, 1)`) für alles, was
  **einrastet**: der Druckpunkt eines Knopfes, der Knauf eines Schalters, das
  Aufklappen eines Feldes, das Hereinkommen einer Überlagerung. Sie schwingt
  über das Ziel hinaus und kommt zurück — dieselbe Bewegung, die ein
  Aufkleber macht, wenn man ihn andrückt.

Der Druckpunkt eines Knopfes ist **keine** Animation, sondern ein Zustand:
Beim Drücken wandert der Knopf um `--pop-height` nach unten und seine harte
Kante geht auf null. Beides zusammen liest sich als „gedrückt", und beides
kehrt beim Loslassen von selbst zurück.

Bewegt werden nur `opacity`, `transform`/`translate`/`scale`, `box-shadow`
und Farben. Wer im Betriebssystem reduzierte Bewegung eingestellt hat,
bekommt dieselben Zustände ohne Übergang — die Regel steht zentral in
`design.css`, die Primitive müssen sie nicht einzeln beachten.

**Ausnahme `data-motion-essential`.** Die zentrale Regel klemmt Dauer *und*
Wiederholungszahl ein. Das ist für schmückende Bewegung richtig und für
Bewegung mit Aufgabe falsch: ein Wartezeiger, der nach einer Umdrehung
stehenbleibt, meldet „abgestürzt" statt „läuft noch". Wer eine dauerhafte
Anzeige baut, setzt das Attribut `data-motion-essential` an das animierte
Element und ist damit von der Klammer ausgenommen. Der Preis: die Anzeige
beachtet die Einstellung dann selbst. Im reduzierten Modus heißt das
langsames Auf- und Abblenden statt schnellem Kreisen, nichts Blitzendes,
kein Wandern über den Bildschirm.

**Auf- und Zuklappen sind zwei Bewegungen, nicht eine.** Dafür steht
`components/ui/Collapse.tsx`. Ein `{bedingung && …}` klappt nur in eine
Richtung weich: Beim Aufgehen steht der Inhalt schon da und das Raster fährt
von `0fr` auf `1fr` an ihm entlang; beim Zugehen ist er im selben Durchlauf
fort, das Raster hat nichts mehr, woran es schrumpfen könnte, und die Karte
springt. Gemessen auf der Einstiegsseite, bevor es das Teil gab: zehn
Zwischenhöhen beim Füllen, **eine einzige Stufe** beim Leeren. `Collapse` hält
den zuletzt gezeigten Inhalt fest, bis die Bewegung durch ist. Auf geht es mit
der federnden Kurve (300 ms), zu kürzer und gerade (220 ms) — die Feder
schießt über ihr Ziel hinaus, und unter `0fr` gibt es nichts mehr zu zeigen.
Für die Dauer des Zugehens ist der Inhalt `inert`: Der Weg mit der
Tabulatortaste führt nicht in einen Bereich, den niemand mehr sieht.

Wer eine solche Hülle in eine Spalte mit Abstand setzt, muss den Abstand im
geschlossenen Zustand zurückgeben (`data-[open=false]:-mb-…`) — eine Hülle
ohne Höhe erzeugt trotzdem eine Lücke. Auf der Einstiegsseite steht der
Kartenabstand deshalb als `--luecke` da.

**Was gar nicht erst geladen wird.** Die bewegte Fassung der Marke
(`logo-schreck*.webp`, je rund 875 KB) steht im Ruhezustand **nirgends als
Quelle**; dort trägt das Bild einen durchsichtigen Punkt als `data:`-Adresse.
Wer nie auf den Schriftzug zeigt, holt die Datei nie; bei
`prefers-reduced-motion: reduce` wird sie überhaupt nicht angefordert. Das ist
kein Feinschliff, sondern der Grund, warum die Datei vertretbar ist.

### Der Regler und seine Stufen

Der `Slider` bekommt keine Zahlenspanne, sondern eine Liste benannter
Stufen (`steps`, mindestens zwei — der Typ verlangt es). In Aufgabe 14
steuern zwei davon die Formulierung des Auftrags an das Modell (*förmlich ↔
locker*, *kurz ↔ ausführlich*); es sind ausdrücklich **keine**
Modelltemperaturen, dieser Parameter ist bei allen drei Anbietern tot.

Wie die Stufen aussehen, entscheidet das Primitiv — nicht die Ansicht:

```
├──────●─────────┤
förmlich  neutral  locker
```

Unter der Schiene steht eine Zeile aus drei Feldern: links die erste Stufe,
rechts die letzte, in der Mitte hervorgehoben die aktuelle. Die Enden sagen,
wofür die Achse steht; die Mitte sagt, wo man ist. Nur die Enden zu zeigen
reichte nicht — bei fünf Stufen ist an der Griffposition nicht abzulesen, ob
„eher förmlich" oder „neutral" gewählt ist. Steht der Griff an einem Ende,
erscheint dessen Name zweimal (klein außen, hervorgehoben in der Mitte);
das liest sich als Bestätigung.

Ohne Teilstriche auf der Schiene: sie müssten zugleich auf der gefüllten
(Akzent) und auf der leeren Hälfte (`surface-alt`) erkennbar sein, was mit
einer Farbe nicht geht, und sie trügen nichts bei, was nicht schon im Namen
der Stufe steht. Dass die Skala stuft, zeigt das Einrasten des Griffs.

Die Beschriftungszeile ist `aria-hidden`: dieselbe Auskunft steht als
`aria-valuetext` am Griff, sonst käme sie im Lesemodus doppelt. **Eine
Ansicht baut keine eigene Beschriftung daneben** — sie gibt dem Regler nur
seinen Namen (`aria-label` oder `aria-labelledby`, übersetzt) und die
Stufennamen. Die Enden stehen in `--color-muted` und gehören damit auf
`surface` oder `surface-raised`, nicht in eine Karte mit `variant="subtle"`
(siehe Kontrast).

### Der Maßstabsregler

Daneben steht **ein** zweites Bedienelement mit einer Schiene, und das ist
Absicht: der Maßstabsregler der Arbeitsfläche (`editor/ZoomControl.tsx`),
unten rechts am Blatt, wie der Zoom in Word und in jedem PDF-Betrachter.

Er bekommt als einziger eine **Zahlenspanne** statt benannter Stufen, weil
ein Maßstab eine Zahl ist: „60 %" sagt vollständig, was es sagt — anders als
eine Stellschraube zwischen „förmlich" und „locker", wo eine 63 nichts
bedeutet. Aus demselben Grund steht sein Stand als Prozentzahl in derselben
Zeile wie die Schiene und nicht als Beschriftungszeile darunter; der Stand
ist zugleich der Knopf zurück auf 100 %.

Damit nutzt er nicht das Primitiv `ui/Slider.tsx`, sondern setzt selbst auf
`SliderPrimitive` auf. Schiene, Bereich und Griff tragen dieselben Klassen
wie dort — der Regler soll wie ein Regler aussehen, gleich welcher von
beiden. **Einen dritten gibt es nicht**: Wer eine Schiene braucht, nimmt die
benannten Stufen; wer eine Zahl braucht, hat diesen hier.

Die Spanne läuft von 25 % bis 100 %, in Schritten von 5. 100 % ist das obere
Ende und nicht die Mitte wie bei Word, denn dort füllt das Blatt seine Spalte
bereits aus — darüber hinaus müsste der Bereich zusätzlich waagerecht
blättern. Eine Raste bei 100 % erübrigt sich damit: Der Anschlag der Schiene
und die Ende-Taste treffen sie von selbst.

Der Maßstab wirkt über die **Breite des Blattkastens**, nie über
`transform: scale()`. Aus der Breite misst die Fläche ihr `--pt`, und daran
hängt jedes Maß des Briefes (siehe `editor/documentStyle.ts`). Eine
Skalierung über `transform` verschöbe Cursorsetzung und Trefferprüfung im
`contenteditable` gegen das, was der Nutzer sieht.

### Benennung der Varianten

`variant` beschreibt den Ton, `size` die Größe, `padding` den Innenabstand.

**Knopf** — die Mechanik ist in allen vier dieselbe (`pop-press`), und seit
dem einen Aussehen unterscheidet sie außer dem Warnknopf auch sonst nichts:

| `variant` | Attrappe | Füllung · Kontur · Kante |
|---|---|---|
| `primary` | `.go`, `.btn--accent` | `field` · Tinte · Tinte |
| `secondary` | `.btn`, `.mini` | `field` · Tinte · Tinte |
| `ghost` | `.btn--quiet`, `.icon-button` | `field` · Tinte · Tinte |
| `danger` | `.btn--danger` | Rot · Tinte · `error-deep` |

**Unter dem Zeiger wird jeder Knopf ganz orange** — außer dem Warnknopf, der
ins Dunkelrot geht. Vormals trugen die ersten drei drei Ruhezustände und
sagten damit dasselbe zweimal: Was auf einer Karte die Hauptsache ist, sagt
ihr Platz. Übrig bleibt für Tangerine eine Bedeutung, „das ist der Knopf, auf
dem du gerade stehst", und die gilt immer nur für einen.

Die drei Namen stehen weiter am Aufrufort: Sie sagen, welche Handlung die
Hauptsache ist, und eine sichtbare Rangfolge entstünde an einer einzigen
Stelle wieder (`buttonVariants` in `Button.tsx`).

**Karte**: `default` (Kante 8 px), `raised` (Kante 10 px — die eine Karte, die
die Seite trägt), `subtle` (eingelassen: `field`, weiche Tinte,
`rounded-tile`, **keine** Kante), `danger` (Kontur in Rot, Bauform
unverändert).

### Markennamen und Übersetzung

`LlmProvider.label` (`Google Gemini`, `OpenAI`, `Anthropic`) ist ein
fest verdrahteter Markenname und **läuft nicht durch i18next**. Das ist die
Regel für die ganze Oberfläche: Ein Eigenname heißt in beiden Sprachen
gleich; ihn zu übersetzen hieße, denselben Wert an zwei weiteren Stellen zu
pflegen und eine Übersetzung einzuladen, wo keine hingehört
(„Anthropisch"). G8 gilt für Text, der sich mit der Sprache ändert — ein
Markenname tut das nicht.

Steht der Name **in** einem Satz, wird der Satz übersetzt und der Name als
Wert eingesetzt: `t('onboarding.key.guideHeading', { provider:
PROVIDERS[id].label })`. Nie umgekehrt, also nie ein Satzstück im
Anbieterregister.

Dieselbe Regel gilt für die auswärtigen Adressen der Anbieter: Sie stehen in
`src/components/onboarding/providerLinks.ts`, nicht in den
Übersetzungsdateien. Eine Adresse ist kein Text, und ein toter Verweis in
einer JSON-Datei fiele niemandem auf.

### Prosa nennt die Handlung, nicht den Knopf

Ein erklärender Satz zitiert **kein eigenes Bedienelement**. Er beschreibt,
was geschieht, nicht wohin geklickt wird.

Falsch, und genau so ist es passiert:

> „Noch nichts vorgemerkt. Markieren Sie eine Textstelle und wählen Sie
> „Stelle vormerken"."

Richtig:

> „Noch nichts vorgemerkt. Markieren Sie eine Textstelle im Brief, dann
> steht sie hier."

Der Grund ist nicht Geschmack. Der erste Satz wurde **unwahr**, als der
Knopf „Stelle vormerken" wegfiel, und schickte den Nutzer nach etwas
suchen, das es nicht mehr gibt. Der zweite kann durch den Wegfall eines
Knopfes gar nicht unwahr werden, weil er keinen nennt — und er ist kürzer.

**Warum das eine Schreibregel ist und kein Test.** Ein Wächter „jedes
Zitat muss der Wert eines anderen Schlüssels sein" wurde erwogen und
ausgezählt: 16 Zitate im Deutschen, davon **eines** auf ein eigenes
Bedienelement auflösbar und dreizehn Fremdbegriffe aus den Konsolen der
Anbieter („Get API key", „API keys", „AIza", „sk-ant-"). Vier Fünftel
wären Ausnahmen gewesen. Schlimmer: Im Englischen löst
`onboarding.key.guide.anthropic.step2` das Zitat „Settings" zufällig auf
`routes.settings.heading` auf, gemeint ist aber Anthropics Menüpunkt — der
Wächter hätte dort grün gemeldet und danebengelegen. Ein Wächter, der
einen Fall schützt, dreizehn Ausnahmen verwaltet und einmal still irrt,
kostet mehr, als er einbringt.

Die Zahlen stammen aus `.scratch/zitate.py` und gelten für den Stand nach
dem Aufräumen der drei Ansichten. Wer sie nachrechnet und andere Werte
bekommt, hat vermutlich gerade Oberflächentexte hinzugefügt; das Verhältnis
ist das Argument, nicht die einzelne Zahl.

Zitate um **fremde** Beschriftungen sind ausdrücklich richtig: Wer durch
die Konsole eines Anbieters führt, muss dessen Wörter nennen. Die Regel
gilt für die eigene Oberfläche.

### Eingabefelder

**Weiche Tinte, nicht volle.** Eingabefelder tragen `--line-soft`, Knöpfe
`--line`. Daran hängt die Hierarchie dieser Welt: Was man drückt, ist
kräftiger umrandet als das, was man ausfüllt. Wer das vertauscht, macht ein
Feld zum Knopf.

- **`Input` und `Textarea`** (`src/components/ui/Input.tsx`) tragen genau
  die Gestalt des Auswahlauslösers: `py-3 px-4`, `rounded-control` (16 px),
  3 px `--line-soft`, `--field` als Grund, `focus-ring`. Unter dem Zeiger und
  im Fokus antwortet die **Kontur** (`--accent-line`), nicht die Fläche: Ein
  Feld, das seinen Grund wechselt, sieht aus, als hätte es seinen Inhalt
  verloren. Ein beanstandetes Feld bekommt zusätzlich `aria-invalid` und eine
  Kontur in `--error` — die Farbe trägt den Zustand nie allein, die Meldung
  darunter tut es. Das mehrzeilige Feld fällt aus der Liste der Steuerhöhen
  (es trägt einen Absatz, keine Zeile): `min-h-[150px]`, `py-3.5`,
  `leading-[1.65]`, `resize-y`. Es wächst **nicht** mit dem Inhalt; eine
  eingefügte Stellenausschreibung schöbe sonst den Weiter-Knopf aus dem Bild.
- **`Field`** (`src/components/ui/Field.tsx`) ist die Hülle: Beschriftung
  oben, Bedienelement in der Mitte, Fehler und Hinweis darunter — in dieser
  Reihenfolge, sichtbar wie in `aria-describedby`. Der Fehler steht vor dem
  Hinweis, damit die Vorlesesoftware zuerst sagt, was zu tun ist. Ein
  Platzhalter ersetzt nie die Beschriftung. `labelledBy` schaltet auf
  `aria-labelledby` um, für Bedienelemente, die ein `<label for>` nicht
  benennt (der Auslöser der Auswahlliste ist ein `<button>`).
- Die drei Textklassen `FIELD_LABEL_CLASS`, `FIELD_HINT_CLASS` und
  `FIELD_ERROR_CLASS` werden aus `Field.tsx` **mitexportiert**. Das ist
  Absicht: Dieselbe Beschriftungsklasse trägt auch die Zwischenüberschrift
  eines Formulars, und derselbe Hinweiston steht auch neben einem
  Bedienelement, das kein Feld ist. Zwei Kopien wären zwei Gelegenheiten
  auseinanderzulaufen. Die Beschriftung steht in Fredoka und im Gewicht einer
  Überschrift — in dieser Welt ist sie das, was einen Abschnitt benennt; der
  Hinweis darunter eine Stufe kleiner als der Fließtext (`--text-caption-*`).

Nach einem abgelehnten Absenden springt der Fokus auf das erste
beanstandete Feld.

### Abschnitte in Karten

`SectionCard` (`src/components/ui/SectionCard.tsx`) ist Karte, `<section
aria-labelledby>` und Überschrift in einem. Vorgabe ist die der
Schlüsseleinrichtung, aus der sie stammt: `variant="raised"`,
`padding="lg"`, `h2`. Die Einstellungen setzen `variant="default"` — sechs
hervorgehobene Karten untereinander wären sechsmal „das hier ist wichtig".
`headingLevel={3}` gibt es für einen Abschnitt innerhalb eines Abschnitts.

Damit hat `Card` weiterhin keine Unterteile; die Kopfstruktur steckt in
`SectionCard`, nicht in `Card` selbst.

### Die Dokumentfläche

Seit Aufgabe 14a gibt es die Ansicht, um die sich alles dreht. Was sie
festlegt, gilt für ihre Anbauten (14b, 14c) und für den Export (15):

- **Das Blatt ist weiß, in beiden Themen.** Es zeigt die Word-Datei, und die
  sieht im Dunkelmodus nicht anders aus. Grund und Schriftfarbe sind feste
  Werte (`#FFFFFF`, `#16205C`), keine Token; nur Kontur (`page-line`) und
  Schatten (`elevation.page`) gehen mit dem Thema mit, weil sie zur
  Oberfläche gehören und nicht zum Dokument. Das Blatt ist zugleich das
  einzige mit `rounded-sheet` (8 px) — ein Word-Dokument hat keine runden
  Ecken.
- **Die Werkzeugleiste ist eine Karte** wie alles auf dem Blatt: 3 px Tinte,
  harte Kante darunter. Eine randlose Leiste über die volle Spaltenbreite
  sah auf dem linierten Papier aus wie ein abgerissener Streifen. Sie steht
  fest über dem Blatt, statt mitzublättern, und bekommt **keinen** z-Index —
  `z-50` bleibt den Überlagerungen vorbehalten.
- **`lang` gehört an den Text, nicht an die Anwendung.** Der Brief kann in
  einer anderen Sprache stehen als die Oberfläche. Die Dokumentfläche trägt
  die deterministisch erkannte Sprache (`detectLanguage`), damit die
  Rechtschreibprüfung und die Vorlesesoftware sie richtig behandeln.
- **Ein Absatz, den eine Markierung an seinem Platz festhalten würde**,
  bekommt eine Kontur in `--color-warning`. Die Kontur liegt an jedem Absatz
  an, nur farblos, damit sich beim Hervorheben kein Zeichen verschiebt. Die
  Farbe trägt die Bedeutung nie allein: Der Hinweis in der Leiste nennt
  Absatz und Grund im Text (`--color-warning` ist keine Textfarbe, siehe
  Kontrast). Hervorgehoben wird deshalb genau die Menge, die die Leiste auch
  benennt — ein festgehaltener Absatz, der als erster betroffen ist,
  verrutscht nicht und bekommt keine Kontur.
- **Die Feinmarkierung hängt am Zeigegerät, nicht an der Fensterbreite.**
  `(pointer: coarse)` entscheidet, ob einzelne Stellen markierbar sind
  (`usePrecisePointer`); ein schmal gezogenes Fenster mit Maus behält sie,
  ein Tablet im Querformat nicht. **Getippt werden darf überall**: Weggenommen
  wird nur die Markierung, nie die Bearbeitung.
- **Das Modell gewinnt.** Was auf der Fläche steht, ist die Ansicht eines
  `DocxDocument`. Weicht der DOM davon ab, wird er zurückgeschrieben — auch
  wenn dabei der Schreibcursor springt. Eine Ansicht, die etwas anderes
  zeigt als das, was exportiert wird, wäre der schlimmere Fehler.

### Der Raum, die Marke und die Figuren

Drei Teile, die es vor der Übernahme der Attrappen nicht gab und die jede
Ansicht erbt.

**Der Raum** (`components/app/Room.tsx`) ist das linierte Blatt und liegt als
`fixed inset-0 z-0` unter allem. Zwei Lagen: das Papier selbst (`room-paper`
in `design.css` — Zeilen, roter Rand bei 14 % der Fensterbreite, Abdunklung
zum Rand) und sieben Kritzeleien, von Hand gesetzt und ab 1024 px sichtbar.
Beides ist `aria-hidden` und nimmt keine Zeigerereignisse an. **Es gibt keine
gemeinsame Kopfzeile mehr**: Jede Ansicht baut ihre eigene, weil jede eine
andere braucht. Was der Rahmen trotzdem trägt, sind die zwei Verweise, die von
überall erreichbar sein müssen (Datenschutz mit Impressum nach § 5 DDG,
Einstellungen) — als ruhige Zeile am Fuß.

**Die Marke** (`components/app/Wordmark.tsx`) ist ein Bild, keine Schrift.
Drei Eigenheiten, die sich nicht von selbst ergeben und deshalb hier stehen:

1. **Zwei Ruhefassungen**, umgeschaltet über die `dark:`-Variante. Beide
   `<img>` tragen `alt=""`; den Namen sagt eine `sr-only`-Zeile.
2. **Zentriert wird die Tinte, nicht der Rahmen.** Rechts im Bild stehen
   11,4 % leer (Platz für die ausschlagenden Arme des Bleistifts), links
   0,6 %. Der Ausgleich ist `margin-right: calc(var(--breite) * -0.1078)`.
   **`max-width: 100%` zerstört das** — es löst sich gegen die verkleinerte
   Zelle auf und schrumpft die Marke. Größen laufen ausschließlich über
   `--breite`, und zwar als **Klasse** (`[--breite:400px]`), nie als
   Stilwert: Ein Stilwert am Element gewönne gegen jede Medienabfrage.
3. **Beim Zeigen erschrickt der Bleistift.** Eine bewegte WebP-Datei lässt
   sich nicht zurückspulen; eine frische Objektadresse
   (`URL.createObjectURL`) erzwingt neues Entschlüsseln und damit das erste
   Bild. Geholt wird die Datei einmal, dann liegt sie als Klumpen bereit —
   und im Ruhezustand trägt das bewegte Bild statt ihrer einen durchsichtigen
   Punkt (siehe Bewegung). **Kein leeres `src`:** Nimmt man einem gerade
   ladenden Bild die Quelle, zeigt der Browser sein Zeichen für ein kaputtes
   Bild, und genau das passiert beim Wegzeigen, während die 875 KB noch
   unterwegs sind.
4. **Der Zeiger geht, die Bewegung hört auf** — sofort, nicht am Ende des
   Zyklus, aber mit einer Blende von 200 ms. Sie geht nur in eine Richtung:
   hinein ohne, weil das erste Bild der Bewegung das Ruhebild ist und der
   Wechsel dort ohnehin unsichtbar; heraus mit, weil dort ein beliebiges Bild
   aus der Mitte des Laufs gegen die Ruhefassung steht und ein Schnitt
   dazwischen zuckt. Die Ruhefassung kommt ohne Blende zurück und die
   Bewegung verlöscht über ihr — so ist immer etwas Ganzes zu sehen. Die
   Datei wird erst nach der Blende freigegeben; vorher wäre die Blende gegen
   ein leeres Bild. Auf dem Finger gibt es kein Weggehen; ein Tippen spielt
   genau einen Lauf ab (64 Bilder in 3000 ms) und hört von selbst auf.
5. **Es reagiert die Tinte, nicht der Kasten.** Die 11,4 % leere Fläche rechts
   gehören zum Bild und damit zum Kasten — bei 380 px Marke sind das 43 px,
   in denen nichts zu sehen ist. Wer dort vorbeifährt, sah die Marke
   erschrecken, ohne sie berührt zu haben. Die empfindliche Fläche ist
   deshalb auf die **ruhende** Tinte zugeschnitten (0,62 % bis 88,59 % der
   Breite, nachgemessen am Alphakanal). Dass die Arme im Lauf bis 99,53 %
   ausschlagen, ändert nichts: Dorthin kommen sie erst, wenn schon jemand
   hinzeigt.

Größen: `/` 560 px, `/datenschutz` und `/settings` 200 px, `/editor` 190 px.
Die Einstiegsseite ist der Eingang und darf auftreten; die übrigen Kopfzeilen
sind Wegweiser.

Auf `/` wird die Marke von **drei** Spuren begrenzt, und es gilt die engste
(`min()`): Ein flaches Fenster hat wenig Platz über der Karte, ein schmales
hat eine hohe Karte und damit ebenfalls wenig, und die dritte Spur ist das
Zusammentreffen von beidem. Medienabfragen allein könnten das nicht sagen —
auf einem schmalen **und** flachen Fenster gewönne die, die Tailwind zuletzt
ausgibt. Dasselbe gilt für den Versatz, mit dem die
Marke tiefer sitzt; seine Breitenstufen sind die zwei Stellen, an denen der
Aufbau ohnehin umspringt (1240 px: der reservierte Platz für die Eckfigur
fällt weg; 640 px: die Kacheln stehen nebeneinander).

**Die Figuren** (`components/app/Figures.tsx`) sind acht Posen derselben
Person. Vier Regeln, jede teuer erkauft:

- **Gleich groß heißt gleich große Person, nicht gleich großes Bild.** Beim
  Schirm nimmt die Wolke die halbe Bildhöhe ein, beim Ballon der Ballon ein
  Drittel. Maß ist die **Kopfbreite**; auf `/datenschutz` und `/settings`
  sind alle vier auf 66 px Kopf gerechnet — daher vier ungleiche Breiten für
  gleich große Leute.
- **Sie liegen im Blatt, nicht in den Karten.** Als Kind einer Karte richtet
  sich eine Figur nach ihr aus und liest sich als deren Beigabe. Waagerecht
  verankert an der **Fenstermitte**: `calc(50% + halbe Inhaltsbreite +
  Abstand)`. Die zwei Spähenden sind die Ausnahme: Ihre Vorlage bringt eine
  eigene Mauer mit, die beim Zuschnitt entfernt wurde, damit die Kante der
  Karte beziehungsweise der Spalte die Mauer ist — sie hängen an dem, um das
  sie herumschauen.
- **Nie auf einer Linie.** Zwei gespiegelte Figuren in gleicher Höhe lesen
  sich als Ornament. Eine steht hoch und weiter weg, die andere tief und
  dichter dran, jede anders gekippt.
- **Sie verschwinden, wenn kein Platz ist**, statt am Bildrand zu kleben:
  `/datenschutz` ab 1140 px, `/settings` ab 1280 px, die Spähende auf `/` ab
  1100 px, die über dem Blatt ab 560 px. Die Werte sind gemessen — beim
  Ändern der Größen neu messen.

Alle Figuren sind `aria-hidden`, `loading="lazy"` und `decoding="async"`: Sie
sagen nichts, was die Oberfläche nicht auch sagt, und keine steht über dem
Falz.

### Auszeichnungen im Text

Im Brief selbst gibt es **zwei** Arten, etwas hervorzuheben, und die Wahl
zwischen ihnen ist keine Geschmacksfrage: Ein `<span>` um ein Wort bräche die
Offset-Rechnung, auf der Markierung und Ersetzung beruhen, und fiele im
`contentEditable` beim ersten Tastendruck auseinander. Beide Wege kommen
deshalb ohne Eingriff in den Baum aus.

1. **Die Kontur am Absatzrand** — ein Pseudoelement im linken Steg, 2 px
   breit, immer vorhanden und nur farblos, damit sich beim Hervorheben kein
   Zeichen verschiebt. Sie sagt „in diesem Absatz steckt etwas": unbelegte
   Aussage und Fremdfirma in `--color-error`, festgehaltener Absatz in
   `--color-warning`, übernommener Briefkopf in `--color-info`.
2. **Die Hervorhebung über `::highlight()`** — die CSS Custom Highlight API,
   für alles, was **Zeichen** und nicht Absätze meint. Sie färbt Bereiche,
   ohne den Baum anzufassen. Wirksam sind darin nur `color`,
   `background-color`, `text-decoration`, `text-shadow` und
   `-webkit-text-stroke`; Polsterung, Rahmen und Radius ignoriert der
   Browser. Vorgemerkte Stellen bekommen eine Fläche
   (`--color-mark`, erledigt `--color-mark-done`), die Befunde der
   Textprüfung eine rote Wellenlinie.

Die Wellenlinie ist bewusst die aus Word: Sie ist das eingeführte Zeichen für
„hier stimmt etwas nicht", und sie liegt ohnehin schon im Brief, weil der
Browser mit seiner eigenen Rechtschreibprüfung dieselbe Form malt. Sie trägt
`text-decoration-skip-ink: none`, sonst bliebe von einem Befund aus zwei
Zeichen kaum Linie übrig. Rot und nicht Gelb, weil `--color-warning` als
Textfarbe verboten ist und eine Linie unter dem Wort wie eine Auszeichnung
des Worts gelesen wird.

**Keine dieser Auszeichnungen steht für sich.** Zu jeder gehört eine Liste,
die dasselbe in Worten sagt — `ClaimGuard`, `MarkPanel`, `ProofreadingPanel`.
Wo die Custom Highlight API fehlt, entfällt die Auszeichnung und sonst
nichts. Eine Farbe im Fließtext, die als einzige Auskunft trüge, wäre für
jeden verloren, der sie nicht unterscheiden kann — und für jeden, der nicht
zufällig hinsieht.

### Kontrast

Gemessen an der Palette dieser Welt (`.scratch/mock/` → `design.css`), nicht
geschätzt. Die Zahlen unten stammen aus einer Nachrechnung beider Themen; wer
einen Wert ändert, rechnet sie neu.

**Die tragende Regel: Was eine Form abgrenzt, ist die Kontur — nicht der
Helligkeitsunterschied der Flächen.** Karte gegen Blatt steht bei 1,08:1 (hell)
und 1,33:1 (dunkel). Das ist Absicht und kein Versehen: Getragen wird die
Abgrenzung von der 3 px dicken Tinte, der harten Kante darunter und dem
Schatten dahinter. Wer die Kontur wegnimmt und die Flächen aufhellt, hat den
Entwurf verlassen.

Was daraus folgt:

- **Fließtext trägt auf jeder Fläche.** Im Hellen erreicht `muted` zwischen
  6,08 (auf `done-wash`) und 6,87 (auf dem Blatt), `ink` zwischen 13,3 und
  15,1; im Dunklen `muted` zwischen 5,50 und 8,01. Die alte Einschränkung
  „`muted` nur auf zwei Flächen" ist damit hinfällig — jede der fünf Flächen
  trägt jede der sechs Textfarben über 4,5:1.
- **`accent-text` ist nicht `accent-line`.** Die Konturfarbe `#C9531F`
  erreicht als Fließtext nur 4,43 / 4,11 / 3,98 (Blatt / Karte /
  Akzentwäsche) und verfehlt 4,5:1. Der Schriftton liegt deshalb eine Stufe
  tiefer bei `#B8461A` (5,34 / 4,96 / 4,81). Als **Kontur** bleibt `#C9531F`
  richtig, dort gilt 3:1 und sie erreicht 4,11 auf der Karte.
- **Eine gefüllte Akzentfläche wird nicht von ihrer Füllung abgegrenzt.**
  Tangerine auf der Karte steht bei 2,40:1, Minze bei 1,99:1. Beide tragen
  immer eine Kontur in `line` (15,3:1) beziehungsweise `done-line` (3,8:1),
  und die erfüllt WCAG 1.4.11. Die Schrift **auf** der Füllung sitzt sicher:
  `accent-ink` auf Tangerine 6,89, `done-ink` auf Minze 6,77, `error-ink` auf
  Rot 4,95.
- **`error` als Textfarbe gehört auf Karte und Blatt** (4,59 und 4,95), nicht
  auf `accent-wash` (4,45) oder `done-wash` (4,38). Rot kommt ohnehin nur an
  zwei Stellen vor, und beide liegen auf der Karte.

**Ein offener Befund, aus der Attrappe übernommen.** Im **Dunkelmodus**
erreicht die Tintenkontur `line` (`#3B4794`) gegen die Karte nur 1,79:1,
`line-soft` 2,92:1 — unter den 3:1, die WCAG 1.4.11 für die Grenze eines
Bedienelements verlangt. Im Hellen sind es 15,3:1, das Problem ist allein ein
dunkles. Getragen wird die Erkennbarkeit dort von der harten Kante, von der
Beschriftung des Knopfes und beim Hauptknopf von der Füllung selbst
(Tangerine gegen Karte 6,66:1). Das ist eine Entscheidung des Entwurfs — die
Konturen sollen im Dunkeln zurücktreten, damit die Karten wie Papier wirken
und nicht wie ein Drahtgitter. Es bleibt trotzdem ein messbarer Verstoß gegen
eine strenge Lesart von 1.4.11 und steht deshalb hier, statt stillschweigend
weggeräumt zu werden. `axe` meldet ihn nicht: Es prüft 1.4.3 (Text), nicht
1.4.11.

Ein Zustand hängt nie allein an der Farbe: der Schalter verschiebt seinen
Knauf, die Auswahlliste setzt einen Haken, die vorgemerkte Stelle bekommt zur
Fläche eine Linie darunter, der gesperrte Knopf trägt `disabled`.

### Sinnbilder

Es gibt keine Sinnbild-Bibliothek (G2, G9). Die Glyphen stehen als Pfaddaten
in `src/components/ui/icons.tsx`, **wörtlich übernommen aus Phosphor Icons
2.1.1, Strichstärke „regular", MIT-Lizenz**. Wörtlich und nicht nachgezeichnet
ist die eigentliche Regel: Nachgezeichnete Sinnbilder sehen nebeneinander nie
gleich aus, und die Abweichung fällt genau dann auf, wenn zwei davon in einer
Reihe stehen. Wer ein weiteres braucht, holt seinen Pfad aus derselben Quelle
und trägt ihn dort ein, statt ein Paket aufzunehmen.

Jedes Sinnbild ist `aria-hidden` und steht neben seiner Beschriftung. Wo
ausnahmsweise keine danebensteht — das Zahnrad in der Kopfzeile der
Arbeitsfläche —, trägt der Knopf ein übersetztes `aria-label`.
