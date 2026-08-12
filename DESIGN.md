---
name: Applai
description: Reine Browser-App, die ein bestehendes Anschreiben an eine Stellenausschreibung anpasst. Ruhig, dokumentzentriert, modern statt klinisch
colors:
  surface: "#F4FAFC"
  surface-alt: "#E8F4FA"
  surface-raised: "#FFFFFF"
  border: "#D9E8F0"
  ink: "#03045E"
  ink-strong: "#010229"
  muted: "#4D5680"
  accent: "#0077B6"
  accent-light: "#00B4D8"
  accent-dark: "#005C86"
  accent-contrast: "#FFFFFF"
  accent-text: "#00628F"
  success: "#0D6E52"
  error: "#B3261E"
  warning: "#8A5200"
  info: "#0077B6"
  surface-hover: "#E2F2F8"
  accent-soft: "#CAF0F8"
  control-border: "#6F7D95"
  overlay: "rgb(3 4 94 / 0.42)"
  mark: "#FFE9A8"
  mark-done: "#CDEBD6"
typography:
  display:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "clamp(1.75rem, 3vw + 1rem, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  subheading:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  xxl: "3rem"
elevation:
  raised: "0 1px 2px rgb(3 4 94 / 0.06), 0 2px 8px rgb(3 4 94 / 0.06)"
  overlay: "0 4px 12px rgb(3 4 94 / 0.08), 0 16px 32px rgb(3 4 94 / 0.14)"
focus:
  color: "var(--color-accent)"
  width: "2px"
  offset: "2px"
motion:
  duration: "120ms"
  duration-overlay: "180ms"
  easing: "cubic-bezier(0, 0, 0.2, 1)"
components:
  button:
    primary-bg-hover: "var(--color-accent-dark)"
    danger-bg-hover: "#8F1E17"
    danger-fg: "#FFFFFF"
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
`focus.color` → `--color-accent`), folgen dessen dunkler Fassung von selbst und
brauchen keinen eigenen Eintrag.

## Leitgedanken

- **Helle Grundfläche in warmem Grauton, nicht `#FFFFFF`.** `surface` (`#F7F4EF`)
  wirkt wie Papier, nicht wie ein leerer Bildschirm — passend zu einer App, die
  sich um ein Dokument dreht. `surface-raised` (reines Weiß) bleibt Karten und
  Popovers vorbehalten, die sich bewusst vom Hintergrund abheben sollen.
- **Eine ruhige Akzentfarbe.** `accent` ist ein gedämpftes Tannengrün
  (`#3E6259`) — es wirkt seriös und zurückhaltend, nicht wie eine
  Marketing-Farbe, und funktioniert sowohl für Bewerbungen als auch für
  Interface-Elemente (Knöpfe, Fokusringe, aktive Zustände).
- **Großzügige Zeilenhöhe für Fließtext.** `body` nutzt `line-height: 1.7` —
  das Anschreiben ist der Kern der Anwendung und muss sich lesen lassen wie
  ein gedrucktes Dokument, nicht wie eine dichte Oberfläche.
- **Radien 4–12 px.** Kleine Elemente (Chips, Eingabefelder) `sm` (4px),
  Karten und Popover `md`–`lg` (8–12px). Keine größeren Radien — die App soll
  ruhig wirken, nicht verspielt.
- **Dunkle Variante** über `prefers-color-scheme: dark` (Systemeinstellung)
  und zusätzlich über `[data-theme="dark"]` bzw. `[data-theme="light"]`
  (bewusste Nutzerwahl in den Einstellungen, überstimmt die Systemeinstellung
  in beide Richtungen). Siehe `src/styles/design.css`.

## Schrift

Selbst gehostet unter `public/fonts/` (G2 — keine Google Fonts, keine
Laufzeit-Ressourcen von fremden Hosts): **Inter Variable**, Lateinisch-Subset
(deckt deutsche Umlaute und ß über den Unicode-Bereich U+0000–00FF ab),
SIL Open Font License 1.1. Eine einzelne Schriftfamilie für Fließtext und
Überschriften hält die App ruhig und reduziert die Zahl der Ladevorgänge.

## Komponenten-Token und die Regeln der Oberfläche

Mit Aufgabe 13a sind die acht Primitive unter `src/components/ui/` entstanden:
Button, Card, Dialog, Popover, Select, Switch, Slider, Tooltip. Was sie an
Regeln festlegen, gilt für jede Ansicht, die darauf aufbaut.

### Wie Token verbraucht werden

In der Oberfläche steht ein Token immer als `var()` in einer Tailwind-Klasse:
`bg-[var(--color-accent)]`, `text-[var(--color-muted)]`,
`shadow-[var(--shadow-raised)]`. Das ist ausführlicher als ein `bg-accent`,
aber es hat einen Grund: die Farb- und Schattentoken stehen in `:root` und
nicht in `@theme`. Tailwind liest den Wert eines `@theme`-Tokens beim Erzeugen
der Utility-Klasse aus und schreibt ihn direkt hinein — die dunkle Variante
könnte ihn danach nicht mehr überstimmen. Über `var()` bleibt die Umschaltung
erhalten. In `@theme` gehört nur, was Tailwind selbst so benennt und was keine
dunkle Fassung braucht: `--font-sans`, `--radius-{sm,md,lg}`,
`--default-transition-*` und die `--animate-*`.

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

Was in einer Textzeile steht und angefasst wird, liegt auf dem
Aufbau-Raster: `sm` = 2rem (`h-8`), `md` = 2.5rem (`h-10`), `lg` = 3rem
(`h-12`). Knopf und Auswahlauslöser nutzen genau diese drei; `size-10` am
Sinnbildknopf ist dasselbe Maß quadratisch.

Daneben steht **eine** weitere Höhe, und die ist Absicht: der Schalter ist
1.5rem (`h-6`, 24 px) hoch und 44 px breit. Seine Bauform lebt davon,
flacher zu sein als die Felder um ihn herum; auf 40 px gebracht wäre er als
Schalter nicht mehr zu erkennen. 24 px erreichen zugleich gerade die
Mindestzielgröße aus WCAG 2.5.8 (24 × 24), die Breite liegt weit darüber.
Aus 24 px Höhe, 1 px Kontur und `p-0.5` bleiben 18 px für den Knauf
(`size-4.5`) und 20 px Weg (`translate-x-5`).

Der Regler hat gar keine Zeilenhöhe: er ist eine 6 px hohe Schiene
(`h-1.5`) mit einem 20 px großen Griff (`size-5`) und darunter seiner
Beschriftungszeile. Der Griff ist damit das kleinste Ziel der Oberfläche —
vertretbar, weil die Schiene den Treffer mitnimmt und jede Stufe zusätzlich
mit der Tastatur erreichbar ist.

**Damit ist die Liste vollständig**: 24 px (Schalter), 32/40/48 px (Knöpfe,
Auswahl). Eine weitere Höhe ist eine Entscheidung und gehört hierher, nicht
in eine einzelne Ansicht.

### Höhenstaffelung

Genau drei Ebenen, mehr nicht — zwei davon brauchen einen Schatten, die
Grundfläche kommt ohne aus. `design.css` und `Card.tsx` zählen genauso:

1. **Fläche** — die Seite selbst (`surface`), ohne Schatten.
2. **`raised`** — Karten, die sich abheben sollen: `surface-raised`, 1 px
   Kontur, `--shadow-raised`.
3. **`overlay`** — Dialog, Popover, Auswahlliste, Tooltip: dieselbe Fläche,
   dieselbe Kontur, `--shadow-overlay`. Alle liegen auf `z-50`; darüber hinaus
   vergibt die Anwendung keine z-Indizes.

Karten ohne Hervorhebung bleiben flach und werden allein durch ihre Kontur
abgegrenzt. Im dunklen Modus trägt nicht der Schlagschatten die Höhe, sondern
eine Lichtkante oben (`inset 0 1px 0 …`) — ein Schatten auf dunklem Grund ist
nicht zu sehen.

### Fokus

Ein einziger Ring für das ganze Programm, als Utility `focus-ring` in
`design.css`: 2 px in der Akzentfarbe, 2 px Versatz, nur bei `:focus-visible`.
`outline` statt `box-shadow`, damit der Ring den Radius des Elements von selbst
übernimmt und von überlaufenden Containern nicht beschnitten wird. Der Versatz
legt ihn auf die Fläche hinter dem Element — deshalb bleibt er auch auf einem
gefüllten Akzentknopf sichtbar. Der Akzent erreicht gegen jede Fläche in beiden
Modi mindestens 5,3:1.

Ausnahme: in Listen, die ihren Inhalt beschneiden (Auswahlliste), liegt der
Ring innen (`-outline-offset-2`).

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

120 ms für Zustandswechsel, 180 ms für das Einblenden einer Überlagerung,
120 ms für ihr Ausblenden, immer `ease-out`. Bewegt werden nur `opacity`,
`transform` und Farben. Der Druckpunkt eines Knopfes ist eine sofortige
Verschiebung um 1 px, keine Animation. Wer im Betriebssystem reduzierte
Bewegung eingestellt hat, bekommt dieselben Zustände ohne Übergang — die Regel
steht zentral in `design.css`, die Primitive müssen sie nicht einzeln beachten.

**Ausnahme `data-motion-essential`.** Die zentrale Regel klemmt Dauer *und*
Wiederholungszahl ein. Das ist für schmückende Bewegung richtig und für
Bewegung mit Aufgabe falsch: ein Wartezeiger, der nach einer Umdrehung
stehenbleibt, meldet „abgestürzt" statt „läuft noch". Wer eine dauerhafte
Anzeige baut — ab Aufgabe 14 die „Antwort wird erzeugt"-Anzeige — setzt das
Attribut `data-motion-essential` an das animierte Element und ist damit von
der Klammer ausgenommen. Der Preis: die Anzeige beachtet die Einstellung
dann selbst. Im reduzierten Modus heißt das langsames Auf- und Abblenden
statt schnellem Kreisen, nichts Blitzendes, kein Wandern über den
Bildschirm.

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

### Benennung der Varianten

`variant` beschreibt den Ton, `size` die Größe, `padding` den Innenabstand.
Knopf: `primary` (gefüllter Akzent, höchstens einer pro Ansicht), `secondary`
(Kontur, Standard), `ghost` (erst unter dem Zeiger eine Fläche), `danger`.
Karte: `default`, `raised`, `subtle`.

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

### Eingabefelder

Seit Aufgabe 13c gibt es sie als Primitive — die in 13b angekündigte zweite
Ansicht ist mit Einstiegsseite und Einstellungen gleich dreimal gekommen:

- **`Input` und `Textarea`** (`src/components/ui/Input.tsx`) tragen genau
  die Gestalt des Auswahlauslösers: `h-10`, `rounded-md`,
  `--color-control-border`, `--color-surface-raised`, `px-3`, `text-sm`,
  `focus-ring`, unter dem Zeiger eine Kontur in der Akzentfarbe. Ein
  fehlerhaftes Feld bekommt zusätzlich `aria-invalid` und eine Kontur in
  `--color-error` — die Farbe trägt den Zustand nie allein, die Meldung
  darunter tut es. Das mehrzeilige Feld fällt aus der Liste der
  Steuerhöhen (es trägt einen Absatz, keine Zeile): `min-h-32`, `py-2`,
  Zeilenhöhe des Fließtexts, `resize-y`. Es wächst **nicht** mit dem
  Inhalt; eine eingefügte Stellenausschreibung schöbe sonst alles unter
  sich aus dem Bild.
- **`Field`** (`src/components/ui/Field.tsx`) ist die Hülle: Beschriftung
  oben, Bedienelement in der Mitte, Fehler und Hinweis darunter — in dieser
  Reihenfolge, sichtbar wie in `aria-describedby`. Der Fehler steht vor dem
  Hinweis, damit die Vorlesesoftware zuerst sagt, was zu tun ist. Ein
  Platzhalter ersetzt nie die Beschriftung. `labelledBy` schaltet auf
  `aria-labelledby` um, für Bedienelemente, die ein `<label for>` nicht
  benennt (der Auslöser der Auswahlliste ist ein `<button>`).
- Die drei Textklassen `FIELD_LABEL_CLASS`, `FIELD_HINT_CLASS` und
  `FIELD_ERROR_CLASS` werden aus `Field.tsx` **mitexportiert**. Das ist
  Absicht: Dieselbe Beschriftungsklasse trägt auch die
  Zwischenüberschrift eines Formulars, und derselbe Hinweiston steht auch
  neben einem Bedienelement, das kein Feld ist. Zwei Kopien wären zwei
  Gelegenheiten auseinanderzulaufen.

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

- **Das Blatt ist die Spalte.** Werkzeugleiste, Abschnittsüberschrift und
  Karte stehen in einer `max-w-[72ch]` breiten Spalte an der linken Kante
  der Seite. Der Text darin liest sich mit `line-height: 1.7` wie ein
  gedrucktes Dokument (siehe Leitgedanken); mehr Breite ginge auf Kosten der
  Lesbarkeit, weniger sähe nicht mehr nach einem Brief aus.
- **Die Werkzeugleiste klebt oben** (`sticky top-0`) und bekommt **keinen**
  z-Index. Ein klebendes Element ist positioniert und liegt damit von selbst
  über dem Fließtext darunter; die drei Ebenen der Höhenstaffelung bleiben
  wie sie sind, `z-50` bleibt den Überlagerungen vorbehalten.
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

### Kontrast

Zwei Regeln, die aus den Messwerten der Palette folgen und leicht zu übersehen
sind:

- **`--color-muted` nur auf `surface` und `surface-raised`.** Auf
  `surface-alt` (4,46:1) und `surface-hover` (4,26:1) verfehlt es 4,5:1.
  Anfassbare Flächen tragen deshalb `--color-ink`, und die Auswahlliste
  wechselt unter dem Zeiger ihre Kontur statt ihrer Fläche.
- **`--color-control-border` statt `--color-border` an Bedienelementen.**
  `--color-border` ist eine Trennlinie (1,27:1) und reicht nicht, wo die Kontur
  das Element überhaupt erst erkennbar macht (WCAG 1.4.11 verlangt 3:1).
- **`--color-warning` ist keine Textfarbe.** Im hellen Modus erreicht sie
  3,41 auf `surface`, 3,12 auf `surface-alt` und 3,74 auf `surface-raised`,
  verfehlt also überall 4,5:1 (im dunklen Modus wäre sie mit 7,0–8,0 in
  Ordnung, aber eine Farbe, die nur in einem Modus trägt, ist keine).
  Eine Warnung im Fließtext nimmt deshalb `--color-error` (4,96 bis 5,94
  hell, 4,78 bis 5,41 dunkel) oder `--color-ink` mit `font-medium`. Als
  Flächen- oder Konturfarbe bleibt `--color-warning` brauchbar, dort gilt
  3:1.

Ein Zustand hängt nie allein an der Farbe: der Schalter verschiebt seinen
Knauf, die Auswahlliste setzt einen Haken, der gesperrte Knopf trägt
`disabled`.

### Sinnbilder

Es gibt keine Sinnbild-Bibliothek (G2, G9). Die drei benötigten Glyphen
(Schließen, Aufklapp-Winkel, Haken) stehen als kurzes Inline-SVG in der
Komponente, die sie braucht, jeweils `aria-hidden`. Wer ein viertes braucht,
legt es genauso an, statt ein Paket aufzunehmen.
