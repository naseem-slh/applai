import type { DocxDocument } from '@/lib/docx/model'
import type { Paragraph } from '@/lib/docx/model'
import type { Range as TextRange } from '@/lib/docx/replace'

/**
 * Die Textprüfung — was der Rechtschreibprüfung des Browsers entgeht.
 *
 * **Warum es sie gibt.** Die Arbeitsfläche prüft die Rechtschreibung längst:
 * `DocumentView` setzt `spellCheck` und die Sprache des Dokuments, der
 * Browser malt rote Wellenlinien und bietet im Kontextmenü Vorschläge an. Er
 * prüft dabei aber **einzelne Wörter gegen ein Wörterbuch**. Alles, was aus
 * zwei richtigen Wörtern besteht oder aus Zeichensetzung, läuft ungehindert
 * durch — und genau das überlebt bis in den abgeschickten Brief: das doppelte
 * „die die" aus dem Umstellen, das Leerzeichen vor dem Komma, die geraden
 * Anführungszeichen.
 *
 * **Warum selbst gebaut.** LanguageTool wäre ein fremder Host und damit durch
 * G3 gesperrt; außerdem ginge der ganze Brief an einen Dritten. Selbst
 * betreiben hieße einen Server und verstieße gegen G1. Bleibt eine eigene
 * Prüfung — ohne Netz, ohne Modell, ohne neue Abhängigkeit. Sie rechnet nur
 * und kennt weder React noch den Speicher; sie liegt bei der Oberfläche und
 * nicht in `lib/domain`, weil sie dieselbe Rolle hat wie `unbackedClaims.ts`
 * und `foreignCompanies.ts` (siehe die Notiz in `marks.ts`).
 *
 * **Was bewusst fehlt: `das`/`dass` und die Kommasetzung.** Beides braucht
 * eine Satzanalyse. Eine Regelfassung meldete zuverlässig auch richtige
 * Sätze — „Ich denke, das Team passt" wäre ein Treffer —, und eine Prüfung,
 * die falschen Alarm schlägt, wird nach dem dritten Mal weggeklickt. Die
 * Spezifikation zieht dieselbe Linie schon bei den Zahlwörtern: „sonst nähme
 * niemand die Warnung mehr ernst."
 *
 * **Nichts wird mitgeführt.** Wie bei den unbelegten Aussagen werden die
 * Befunde bei jedem Dokumentstand neu gesucht, statt Bereiche über
 * Bearbeitungen hinwegzuschieben. Ein Befund, den der Nutzer behoben hat,
 * verschwindet damit von selbst.
 *
 * **Unicode statt ASCII.** Überall `\p{L}`/`\p{N}` und nie `\w`/`\b` — die
 * Regel des Projekts, begründet in `lib/privacy/anonymize.ts`: `\b` fände in
 * „BioÖkotech" eine Wortgrenze, wo keine ist.
 */

export type ProofreadingRule =
  | 'doubledWord'
  | 'spaceBeforePunctuation'
  | 'missingSpaceAfterComma'
  | 'doubleSpace'
  | 'seidForSeit'
  | 'hyphenAsDash'
  | 'straightQuote'

export interface ProofreadingFinding {
  /**
   * Stabil über Neuberechnungen hinweg, solange der Befund an derselben
   * Stelle steht — Listenschlüssel und Kennung des offenen Menüs.
   */
  id: string
  rule: ProofreadingRule
  /** Bereich im Dokumenttext, Ende exklusiv. */
  range: TextRange
  /** Was dort steht. */
  found: string
  /** Was stattdessen dort stehen soll. */
  suggestion: string
  /** Der Absatz, in dem der Befund liegt. `null`, wenn er in keinem liegt. */
  paragraph: number | null
}

/**
 * Geteilte Referenz für die Abbruchpfade, damit ein `useMemo` darüber nicht
 * bei jedem Durchlauf ein neues Feld liefert (wie in `foreignCompanies.ts`).
 */
const EMPTY: ProofreadingFinding[] = []

/**
 * Artikel und Relativpronomen, die sich **richtig** verdoppeln: „die
 * Kollegen, die die Software entwickeln". Nach einem Komma ist die
 * Verdopplung dieser Wörter deutsche Grammatik und kein Tippfehler.
 */
const DOUBLING_PRONOUNS = new Set(['der', 'die', 'das', 'dem', 'den', 'deren', 'dessen'])

/** Nur Leerzeichen und Tabulator — nie `\s`, das schlösse den Absatzumbruch ein. */
const BLANK = '[ \\t]'

interface RuleDefinition {
  rule: ProofreadingRule
  /** Nur für deutsche Dokumente? Typografie und Wortverwechslung sind sprachgebunden. */
  german: boolean
  pattern: RegExp
  /**
   * Der Ersatzvorschlag, oder `null`, wenn dieser Treffer keiner ist —
   * damit eine Regel ihre eigenen Ausnahmen kennt.
   */
  suggest: (match: RegExpExecArray, text: string) => string | null
}

/**
 * Die Regeln in absteigender Vorrangfolge: Überschneiden sich zwei Befunde,
 * bleibt der weiter oben stehende. Das kommt wirklich vor — „Wort  Wort"
 * ist zugleich ein doppeltes Wort und ein doppeltes Leerzeichen, und
 * gemeldet gehört das Wort.
 */
const RULES: RuleDefinition[] = [
  {
    rule: 'doubledWord',
    german: false,
    // Dasselbe Wort zweimal, nur durch Leerraum getrennt. Die Rückreferenz
    // vergleicht unter `i` ohne Rücksicht auf Groß- und Kleinschreibung,
    // damit auch „Die die" auffällt.
    pattern: new RegExp(`(?<![\\p{L}\\p{N}])(\\p{L}+)(${BLANK}+)\\1(?![\\p{L}\\p{N}])`, 'giu'),
    suggest: (match, text) => {
      const word = match[1] ?? ''
      if (DOUBLING_PRONOUNS.has(word.toLowerCase()) && followsComma(text, match.index)) return null
      return word
    },
  },
  {
    rule: 'spaceBeforePunctuation',
    german: false,
    // Der einzelne Punkt nur, wenn ihm kein weiterer folgt: „…" ist gewollt.
    pattern: new RegExp(`${BLANK}+(?:[,;:!?]|\\.(?!\\.))`, 'gu'),
    suggest: (match) => match[0].trimStart(),
  },
  {
    rule: 'missingSpaceAfterComma',
    german: false,
    // Nur Komma und Semikolon. Der Punkt bliebe außen vor: „z.B.", „1.234"
    // und „applai.pages.dev" wären allesamt Treffer. Und auch hier nicht,
    // wenn eine Ziffer davorsteht — „1,5" ist eine Zahl.
    pattern: /(?<!\p{N})([,;])(?=\p{L})/gu,
    suggest: (match) => `${match[1]} `,
  },
  {
    rule: 'doubleSpace',
    german: false,
    // **Genau** zwei. Drei und mehr sind eine Ausrichtung von Hand und
    // gewollt; sie zu melden hieße, dem Nutzer sein eigenes Layout
    // auszureden.
    pattern: /(?<=[\p{L}\p{N}]) {2}(?=[\p{L}\p{N}])/gu,
    suggest: () => ' ',
  },
  {
    rule: 'seidForSeit',
    german: true,
    // `seid` ist ausschließlich die Ihr-Form von „sein". In einem Brief in
    // der Sie-Form kommt sie nicht vor — steht sie da, ist „seit" gemeint.
    pattern: /(?<![\p{L}\p{N}])(seid)(?![\p{L}\p{N}])/giu,
    suggest: (match, text) => {
      if (precededByIhr(text, match.index)) return null
      const found = match[1] ?? ''
      return found[0] === found[0]?.toUpperCase() ? 'Seit' : 'seit'
    },
  },
  {
    rule: 'hyphenAsDash',
    german: true,
    // Zwischen zwei Wörtern steht im Deutschen der Gedankenstrich, nicht der
    // Bindestrich. Am Wort klebende Bindestriche („E-Mail") sind davon nicht
    // betroffen, weil beidseitig ein Leerzeichen verlangt wird.
    pattern: /(?<=[\p{L}\p{N}]) - (?=[\p{L}\p{N}])/gu,
    suggest: () => ' – ',
  },
  {
    rule: 'straightQuote',
    german: true,
    pattern: /["']/gu,
    suggest: (match, text) => {
      if (match[0] === "'") {
        // Der gerade Hochstrich ist im Deutschen fast immer ein Apostroph
        // („geht's"), und dafür ist U+2019 das richtige Zeichen — dasselbe
        // Zeichen schließt auch ein einfaches Anführungszeichen. Ein
        // öffnendes einfaches Anführungszeichen kommt in einem Anschreiben
        // praktisch nicht vor und wäre die schlechtere Wette.
        return '’'
      }
      // Gerade Anführungszeichen wechseln sich ab: das erste im Absatz
      // öffnet, das zweite schließt.
      return countBefore(text, '"', match.index) % 2 === 0 ? '„' : '“'
    },
  },
]

/**
 * Sucht alle Befunde im laufenden Dokumentstand.
 *
 * Die Sprache entscheidet über den Regelsatz: Doppelte Wörter und
 * Zeichensetzung sind in jeder Sprache falsch, deutsche Anführungszeichen und
 * `seit`/`seid` sind es nur auf Deutsch. Ein englischer Brief bekäme sonst
 * gesagt, seine korrekten Anführungszeichen seien falsch — und eine Prüfung,
 * die nachweislich irrt, glaubt danach niemand mehr.
 */
export function findProofreadingIssues(
  docx: DocxDocument | null,
  language: 'de' | 'en',
): ProofreadingFinding[] {
  if (docx === null) return EMPTY

  const text = docx.text
  const found: Located[] = []

  for (const definition of RULES) {
    if (definition.german && language !== 'de') continue

    // Das Muster steht auf Modulebene und trägt seinen Stand in `lastIndex`
    // mit sich. Einmal zurückgesetzt statt je Aufruf neu gebaut: Ein `RegExp`
    // je Regel und Tastendruck ist Abfall, den niemand braucht.
    const pattern = definition.pattern
    pattern.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      // Ein Treffer der Länge null käme nie voran.
      if (match[0].length === 0) {
        pattern.lastIndex += 1
        continue
      }
      const suggestion = definition.suggest(match, text)
      if (suggestion === null) continue

      const range = { from: match.index, to: match.index + match[0].length }
      found.push({
        id: `${definition.rule}-${range.from}`,
        rule: definition.rule,
        range,
        found: match[0],
        suggestion,
      })
    }
  }

  if (found.length === 0) return EMPTY
  return withParagraphs(docx.paragraphs, withoutOverlaps(found))
}

/** Ein Befund, bevor sein Absatz feststeht. */
type Located = Omit<ProofreadingFinding, 'paragraph'>

/**
 * Ordnet jedem Befund seinen Absatz zu — in **einem** Durchgang.
 *
 * `claimParagraphs` (`unbackedClaims.ts`) täte dasselbe, liefe dafür aber je
 * Befund über alle Absätze. Die Befunde stehen hier bereits nach Fundstelle
 * sortiert, also genügt ein mitwandernder Zeiger. Dieselbe Bedingung wie
 * dort: Ein Bereich berührt einen Absatz, wenn er vor dessen Ende beginnt und
 * nach dessen Anfang endet.
 */
function withParagraphs(
  paragraphs: readonly Paragraph[],
  findings: Located[],
): ProofreadingFinding[] {
  let at = 0
  return findings.map((finding) => {
    while (at < paragraphs.length && paragraphs[at]!.end <= finding.range.from) at += 1
    const paragraph = paragraphs[at]
    const touches =
      paragraph !== undefined &&
      paragraph.start < finding.range.to &&
      paragraph.end > finding.range.from
    return { ...finding, paragraph: touches ? paragraph.index : null }
  })
}

/**
 * Bei Überschneidung gewinnt die Regel mit dem höheren Vorrang — dasselbe
 * Vorgehen wie bei den Briefkopf-Treffern (`lib/domain/letterheadMatch.ts`).
 * Zwei Vorschläge für dieselben Zeichen wären nicht nur doppelt gemeldet,
 * sondern beim Übernehmen auch widersprüchlich.
 */
function withoutOverlaps(findings: Located[]): Located[] {
  const order = new Map(RULES.map((definition, index) => [definition.rule, index]))
  const byPriority = [...findings].sort(
    (a, b) => (order.get(a.rule) ?? 0) - (order.get(b.rule) ?? 0) || a.range.from - b.range.from,
  )

  const kept: Located[] = []
  for (const finding of byPriority) {
    const clashes = kept.some(
      (other) => other.range.from < finding.range.to && other.range.to > finding.range.from,
    )
    if (!clashes) kept.push(finding)
  }

  return kept.sort((a, b) => a.range.from - b.range.from)
}

/**
 * Leerraum sichtbar machen.
 *
 * Die halbe Prüfung dreht sich um Leerraum — ein doppeltes Leerzeichen, ein
 * Leerzeichen vor dem Komma. „ , durch , ersetzen" stünde sonst zweimal
 * dasselbe da. Das Mittelpunktzeichen zeigt, worum es geht; es steht nur in
 * der Anzeige und nie im Dokument.
 */
export function visibleText(text: string): string {
  return text.replace(/ /g, '·').replace(/\t/g, '→')
}

/** Steht vor dieser Stelle — nur über Leerraum hinweg — ein Komma? */
function followsComma(text: string, index: number): boolean {
  let at = index - 1
  while (at >= 0 && (text[at] === ' ' || text[at] === '\t')) at -= 1
  return at >= 0 && text[at] === ','
}

/** Wie oft steht `character` vor `index` im selben Absatz? */
function countBefore(text: string, character: string, index: number): number {
  let count = 0
  for (let at = index - 1; at >= 0; at -= 1) {
    if (text[at] === '\n') break
    if (text[at] === character) count += 1
  }
  return count
}

/** Die drei Wörter vor der Stelle, für die Ihr-Probe bei `seid`. */
const IHR_LOOKBEHIND_WORDS = 3

/**
 * Steht in den Wörtern unmittelbar davor ein „ihr"? Dann ist `seid` richtig
 * („ihr seid", „ihr alle seid").
 */
function precededByIhr(text: string, index: number): boolean {
  const before = text.slice(0, index)
  const words = before.match(/[\p{L}\p{N}]+/gu)
  if (words === null) return false
  return words
    .slice(-IHR_LOOKBEHIND_WORDS)
    .some((word) => word.toLowerCase() === 'ihr')
}
