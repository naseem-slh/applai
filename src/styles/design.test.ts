// Wächter über die von Hand gepflegte Synchronität zwischen DESIGN.md und
// design.css. Beide Dateien sagen es selbst als Regel — durchgesetzt hat
// es bisher niemand. Mit Aufgabe 13a sind es 42 Paare geworden, und die
// dunklen Werte stehen zusätzlich zweimal (Systemwahl und ausdrückliche
// Nutzerwahl) und müssen untereinander gleich bleiben. Ab hier fällt jedes
// Auseinanderlaufen im Test auf, nicht erst im Browser.
//
// Lädt beide Dateien per node:fs/promises von der Platte und läuft deshalb
// unter tsconfig.test.json (mit 'node'), nicht unter tsconfig.app.json.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

// --------------------------------------------------------------- Werkzeuge

/** Vergleichsform: ohne Anführungszeichen, mit einfachem Leerraum, klein.
 *  DESIGN.md schreibt "#F7F4EF" und "Inter Variable, sans-serif",
 *  design.css schreibt #f7f4ef und 'Inter Variable', sans-serif — gemeint
 *  ist beides Mal dasselbe. */
function normalise(value: string): string {
  return value
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Inhalt eines Blocks über ausgeglichene Klammern — @theme enthält
 *  verschachtelte @keyframes, eine Regex bis zur ersten `}` reichte nicht. */
function blockBody(css: string, header: string): string {
  const start = css.indexOf(header)
  if (start === -1) throw new Error(`Block nicht gefunden: ${header}`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`Block nicht geschlossen: ${header}`)
}

/** Alle Custom Properties eines Blocks. Verschachtelte Regeln (@keyframes)
 *  bringen keine mit, deren Deklarationen beginnen nicht mit `--`. */
function customProperties(body: string): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    found.set(match[1], normalise(match[2]))
  }
  return found
}

/** Die YAML-Kopfzeile von DESIGN.md ist eine reine Einrückungs-Baumstruktur
 *  aus Schlüsseln und skalaren Werten — dafür braucht es keine
 *  YAML-Abhängigkeit (G9). Ergebnis sind Blätter mit Punktpfad, z. B.
 *  `typography.display.fontSize`. */
function parseFrontMatter(markdown: string): Map<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown)
  if (!match) throw new Error('Keine YAML-Kopfzeile in DESIGN.md gefunden')

  const leaves = new Map<string, string>()
  const path: string[] = []
  for (const line of match[1].split('\n')) {
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (indent % 2 !== 0) throw new Error(`Ungerade Einrückung: ${line}`)
    path.length = indent / 2

    const entry = /^\s*([A-Za-z0-9-]+):\s*(.*)$/.exec(line)
    if (!entry) throw new Error(`Unerwartete Zeile in der Kopfzeile: ${line}`)
    const [, key, value] = entry
    if (value === '') {
      path.push(key)
    } else {
      leaves.set([...path, key].join('.'), normalise(value))
    }
  }
  return leaves
}

// ------------------------------------------------------------- Zuordnungen

/** Blätter ohne CSS-Pendant. Ausdrücklich aufgezählt, damit ein neues
 *  Token nicht stillschweigend durch die Abdeckungsprüfung fällt. */
const OHNE_CSS_ENTSPRECHUNG = new Set(['name', 'description'])

/** Blätter, die nicht auf eine einzelne Variable zeigen und weiter unten
 *  eigens geprüft werden. */
const GESONDERT_GEPRUEFT = new Set([
  // steckt in --animate-overlay-in / --animate-content-in
  'motion.duration-overlay',
  // alle typography.*.fontFamily zeigen auf dasselbe --font-sans in @theme
])

type Ziel = { block: 'root' | 'theme'; name: string }

/** Wo ein Blatt der Kopfzeile in design.css landet. `null` heißt: keine
 *  Zuordnung bekannt — der Abdeckungstest schlägt dann an. */
function zuordnen(path: string): Ziel | null {
  const teile = path.split('.')

  if (teile[0] === 'colors' && teile.length === 2)
    return { block: 'root', name: `--color-${teile[1]}` }

  if (teile[0] === 'spacing' && teile.length === 2)
    return { block: 'root', name: `--space-${teile[1]}` }

  if (teile[0] === 'elevation' && teile.length === 2)
    return { block: 'root', name: `--shadow-${teile[1]}` }

  if (teile[0] === 'rounded' && teile.length === 2)
    // sm/md/lg liegen in @theme, weil Tailwind genau diese Namen selbst
    // nutzt; pill hat kein Tailwind-Pendant und steht in :root.
    return teile[1] === 'pill'
      ? { block: 'root', name: '--radius-pill' }
      : { block: 'theme', name: `--radius-${teile[1]}` }

  if (teile[0] === 'focus' && teile.length === 2)
    return { block: 'root', name: `--focus-ring-${teile[1]}` }

  if (teile[0] === 'components' && teile[1] === 'button' && teile.length === 3)
    return { block: 'root', name: `--btn-${teile[2]}` }

  if (teile[0] === 'motion' && teile[1] === 'duration')
    return { block: 'theme', name: '--default-transition-duration' }
  if (teile[0] === 'motion' && teile[1] === 'easing')
    return { block: 'theme', name: '--default-transition-timing-function' }

  if (teile[0] === 'typography' && teile.length === 3) {
    const rolle = teile[1]
    const suffix: Record<string, string> = {
      fontSize: 'size',
      fontWeight: 'weight',
      lineHeight: 'leading',
      letterSpacing: 'tracking',
    }
    if (teile[2] === 'fontFamily') return { block: 'theme', name: '--font-sans' }
    const teil = suffix[teile[2]]
    return teil ? { block: 'root', name: `--text-${rolle}-${teil}` } : null
  }

  return null
}

// ------------------------------------------------------------------- Tests

let kopfzeile: Map<string, string>
let root: Map<string, string>
let theme: Map<string, string>
let dunkelSystem: Map<string, string>
let dunkelNutzerwahl: Map<string, string>

beforeAll(async () => {
  const markdown = await readFile(join(REPO_ROOT, 'DESIGN.md'), 'utf-8')
  const css = stripComments(
    await readFile(join(REPO_ROOT, 'src/styles/design.css'), 'utf-8'),
  )

  kopfzeile = parseFrontMatter(markdown)
  root = customProperties(blockBody(css, '\n:root {'))
  theme = customProperties(blockBody(css, '\n@theme {'))
  dunkelSystem = customProperties(
    blockBody(css, ":root:not([data-theme='light']) {"),
  )
  dunkelNutzerwahl = customProperties(
    blockBody(css, ":root[data-theme='dark'] {"),
  )
})

describe('DESIGN.md ↔ design.css', () => {
  it('liest überhaupt etwas aus beiden Dateien', () => {
    // Sicherung gegen den stillen Fehlschlag: eine kaputte Zerlegung liefert
    // leere Karten, und alle Prüfungen darunter wären dann leer und grün.
    expect(kopfzeile.size).toBeGreaterThan(40)
    expect(root.size).toBeGreaterThan(40)
    expect(theme.size).toBeGreaterThan(5)
    expect(dunkelSystem.size).toBeGreaterThan(20)
  })

  it('kennt zu jedem Wert der Kopfzeile eine Stelle in design.css', () => {
    const ohneZuordnung = [...kopfzeile.keys()].filter(
      (pfad) =>
        !OHNE_CSS_ENTSPRECHUNG.has(pfad) &&
        !GESONDERT_GEPRUEFT.has(pfad) &&
        zuordnen(pfad) === null,
    )
    // Wer ein Token in die Kopfzeile schreibt, muss hier eine Zuordnung
    // ergänzen — sonst bliebe es ungeprüft.
    expect(ohneZuordnung).toEqual([])
  })

  it('führt in :root und @theme dieselben Werte wie die Kopfzeile', () => {
    const abweichungen: string[] = []
    for (const [pfad, erwartet] of kopfzeile) {
      if (OHNE_CSS_ENTSPRECHUNG.has(pfad) || GESONDERT_GEPRUEFT.has(pfad))
        continue
      const ziel = zuordnen(pfad)
      if (!ziel) continue // vom Test darüber bereits gemeldet
      const quelle = ziel.block === 'root' ? root : theme
      const tatsaechlich = quelle.get(ziel.name)
      if (tatsaechlich !== erwartet) {
        abweichungen.push(
          `${pfad}: DESIGN.md "${erwartet}" vs. ${ziel.name} "${tatsaechlich ?? '(fehlt)'}"`,
        )
      }
    }
    expect(abweichungen).toEqual([])
  })

  it('setzt die Bewegungsdauern der Kopfzeile in die Animationen ein', () => {
    // motion.duration-overlay zeigt auf keine eigene Variable, sondern
    // steckt in den vier --animate-*: herein mit der Überlagerungsdauer,
    // heraus mit der kurzen.
    const herein = kopfzeile.get('motion.duration-overlay')
    const heraus = kopfzeile.get('motion.duration')
    const easing = kopfzeile.get('motion.easing')
    expect(herein).toBeDefined()

    for (const name of ['--animate-overlay-in', '--animate-content-in']) {
      expect(theme.get(name)).toContain(`${herein} ${easing}`)
    }
    for (const name of ['--animate-overlay-out', '--animate-content-out']) {
      expect(theme.get(name)).toContain(`${heraus} ${easing}`)
    }
  })

  it('nutzt für jede Schriftrolle dieselbe Familie wie --font-sans', () => {
    const familien = [...kopfzeile]
      .filter(([pfad]) => pfad.endsWith('.fontFamily'))
      .map(([, wert]) => wert)
    expect(familien.length).toBeGreaterThan(0)
    for (const familie of familien) {
      expect(familie).toBe(theme.get('--font-sans'))
    }
  })
})

describe('Dunkle Varianten', () => {
  it('sind in beiden Blöcken identisch', () => {
    // Systemwahl und ausdrückliche Nutzerwahl stehen zwangsläufig zweimal
    // im Blatt — auseinanderlaufen dürfen sie nie.
    expect(Object.fromEntries(dunkelNutzerwahl)).toEqual(
      Object.fromEntries(dunkelSystem),
    )
  })

  it('decken jedes umschaltbare Token aus :root ab', () => {
    // Farb-, Schatten- und Knopftoken wechseln mit dem Modus. Was in :root
    // steht und keine dunkle Fassung hat, wäre im Dunkeln schlicht falsch.
    // Ausgenommen ist, was ein anderes Token weiterreicht (--focus-ring-color
    // → --color-accent) — das folgt von selbst und trägt ein anderes Präfix.
    const umschaltbar = [...root.keys()].filter(
      (name) =>
        name.startsWith('--color-') ||
        name.startsWith('--shadow-') ||
        name.startsWith('--btn-'),
    )
    expect(umschaltbar.length).toBeGreaterThan(20)

    const fehlend = umschaltbar.filter((name) => !dunkelSystem.has(name))
    expect(fehlend).toEqual([])
  })

  it('führen nichts, was es in :root nicht gibt', () => {
    const ueberzaehlig = [...dunkelSystem.keys()].filter(
      (name) => !root.has(name),
    )
    expect(ueberzaehlig).toEqual([])
  })
})
