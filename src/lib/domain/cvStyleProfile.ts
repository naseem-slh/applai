import { z } from 'zod'
import type { LlmProvider } from '../ai/provider'
import { ModelResponseError, parseModelJson, truncateForError } from '../ai/modelJson'
import { buildCvStyleProfilePrompt } from '../ai/prompts/cvStyleProfile'
import { detectLanguage } from './language'

/**
 * Das Stilprofil eines **Lebenslaufs**.
 *
 * **Warum nicht `StyleProfile`.** Jenes misst Satzlänge, Anredeform und
 * Förmlichkeit — Eigenschaften von Prosa. An einem Aufzählungspunkt
 * („Entwickelt Steuerungssoftware für die Fertigung") hat davon nichts etwas
 * zu greifen: Er hat keinen Adressaten, oft kein finites Verb und mit
 * „Förmlichkeit" keine sinnvolle Skala. Was ihn stattdessen kennzeichnet, ist
 * seine **Form**: ob er mit einem Verb beginnt, in welcher Zeit er steht, ob
 * ein Punkt am Ende steht, wie lang er ist.
 *
 * **Und warum es ihn überhaupt braucht.** Eine umformulierte Zeile, die
 * anders gebaut ist als die zehn darüber, fällt sofort auf — die Liste liest
 * sich danach wie zusammengesetzt. Das Profil ist die Beschreibung, an die
 * sich die Umformulierung halten soll. Bei einer Bewerbung, die nur den
 * Lebenslauf verlangt, ist es zudem das **einzige** Stilprofil: Ein
 * Anschreiben, aus dem sich eines ableiten ließe, gibt es dort nicht.
 *
 * Dieselbe Arbeitsteilung wie in `styleProfile.ts`: Was Code entscheiden
 * kann, entscheidet Code. Vom Modell kommen nur die beiden Felder, für die
 * es Sprachverständnis braucht, dazu Merkmale und ein wörtliches Beispiel.
 */

/** „Entwickelt …" gegen „Entwicklung von …". */
export type BulletForm = 'verbFirst' | 'nounPhrase' | 'mixed'
export type BulletTense = 'present' | 'past' | 'mixed'

export interface CvStyleProfile {
  /** Vom Modell. */
  bulletForm: BulletForm
  /** Vom Modell. */
  tense: BulletTense
  /** Deterministisch, siehe `detectPerson`. */
  person: 'none' | 'first'
  /** Deterministisch, siehe `detectTerminalPunctuation`. */
  terminalPunctuation: boolean
  /** Deterministisch, siehe `computeBulletLength`: Median der Wörter je Eintrag. */
  bulletLength: number
  /** Kurze, konkrete Beobachtungen. Freitext vom Modell, in der Sprache des Lebenslaufs. */
  traits: string[]
  /** Ein repräsentativer Eintrag aus dem Original, WÖRTLICH. */
  sample: string
}

/**
 * Das fertige Profil als Laufzeitschema — gebraucht vom Auswertungsspeicher,
 * der `unknown` zurückgibt. Die Bindung an `z.ZodType<CvStyleProfile>` sorgt
 * dafür, dass Schema und Schnittstelle nicht auseinanderlaufen.
 */
export const CvStyleProfileSchema: z.ZodType<CvStyleProfile> = z.object({
  bulletForm: z.union([z.literal('verbFirst'), z.literal('nounPhrase'), z.literal('mixed')]),
  tense: z.union([z.literal('present'), z.literal('past'), z.literal('mixed')]),
  person: z.union([z.literal('none'), z.literal('first')]),
  terminalPunctuation: z.boolean(),
  bulletLength: z.number(),
  traits: z.array(z.string()),
  sample: z.string(),
})

// ---------------------------------------------------------------------------
// Die gezählten Einträge — die Grundlage aller drei deterministischen Werte
// ---------------------------------------------------------------------------
//
// Ein Lebenslauf besteht nicht nur aus Aufzählungspunkten. Dazwischen stehen
// Überschriften („Berufserfahrung"), Datumszeilen („2019 – 2022"), der Name,
// die Anschrift. Diese Zeilen sind kurz, und wer sie mitzählt, misst nicht
// den Stil der Einträge, sondern den Aufbau des Blattes.
//
// REGEL: Gezählt wird jeder Absatz mit **mindestens drei Wörtern, die einen
// Buchstaben enthalten**. Das ist eine Schwelle, kein Klassifikator — sie
// erkennt keinen Aufzählungspunkt, sie wirft nur das Kürzeste heraus. Den
// Rest erledigt der Median (siehe `computeBulletLength`): Er trifft die Sorte
// Absatz, die am häufigsten vorkommt, und das sind in jedem Lebenslauf die
// Einträge. Damit braucht es keine Heuristik, die Einträge von Überschriften
// unterscheidet — und keine solche Heuristik kann falsch liegen.
//
// **Warum „mit einem Buchstaben" und nicht einfach „drei Wörter".** Eine
// Datumsspalte steht oft als „2019 – 2022" da: durch Leerzeichen getrennt
// sind das drei Zeichenketten, und die Zeile käme in die Messung, obwohl
// niemand sie als Eintrag liest. Dasselbe gilt für „15.03.2019 – 30.06.2022".
// Mit der Buchstabenbedingung fällt sie heraus, ohne dass irgendwo ein
// Datumsmuster steht, das eines Tages nicht passt.
//
// Gemessen wird die Länge danach über **alle** Wörter der Zeile, auch die
// reinen Zahlen: Wie lang ein Eintrag ist, hängt nicht davon ab, woraus er
// besteht.
// ---------------------------------------------------------------------------

const MIN_WORDS = 3
const HAS_LETTER = /\p{L}/u

function wordsOf(line: string): string[] {
  return line.trim().split(/\s+/).filter((word) => word.length > 0)
}

/** Die Absätze, über die gemessen wird. Siehe die Regel oben. */
export function countedEntries(cvText: string): string[] {
  return cvText
    .split('\n')
    .filter((line) => wordsOf(line).filter((word) => HAS_LETTER.test(word)).length >= MIN_WORDS)
}

/**
 * Der **Median** der Wörter je Eintrag, nicht der Mittelwert.
 *
 * Ein Mittelwert über alle Absätze bildet keinen einzigen davon ab: Zwei
 * Überschriften zu je einem Wort und acht Einträge zu je zwölf ergeben zehn,
 * und zehn schreibt niemand. Der Median dagegen ist immer die Länge eines
 * tatsächlich vorhandenen Eintrags.
 *
 * `0` bei einem Lebenslauf ohne gezählte Einträge — der Baustein lässt die
 * Zeile dann weg, statt eine Länge zu behaupten.
 */
export function computeBulletLength(cvText: string): number {
  const lengths = countedEntries(cvText)
    .map((line) => wordsOf(line).length)
    .sort((a, b) => a - b)
  if (lengths.length === 0) return 0
  const middle = Math.floor(lengths.length / 2)
  if (lengths.length % 2 === 1) return lengths[middle] ?? 0
  return Math.round(((lengths[middle - 1] ?? 0) + (lengths[middle] ?? 0)) / 2)
}

/**
 * Steht am Ende eines Eintrags ein Satzzeichen?
 *
 * `true`, sobald **mindestens die Hälfte** der gezählten Einträge auf `.`,
 * `!` oder `?` endet. Eine Mehrheit, keine Einzelbeobachtung: In jedem
 * Lebenslauf steht irgendwo ein Punkt (eine Abkürzung am Zeilenende, ein
 * ausformulierter Profilsatz), und ein einziger davon darf nicht die ganze
 * Liste umstellen.
 */
export function detectTerminalPunctuation(cvText: string): boolean {
  const entries = countedEntries(cvText)
  if (entries.length === 0) return false
  const withPunctuation = entries.filter((line) => /[.!?]$/.test(line.trim())).length
  return withPunctuation * 2 >= entries.length
}

// „ich" und seine Formen; im Englischen zusätzlich das großgeschriebene „I",
// das als einzelnes Wort steht. Bewusst ohne „mir"/„me" allein — sie kommen
// in Fachbegriffen und Firmennamen vor, und ein Fehlgriff hier stellte den
// ganzen Prompt um.
const FIRST_PERSON_DE = /\b(ich|mich|mein|meine[mnrs]?|meines)\b/i
const FIRST_PERSON_EN = /(\bI\b|\bmy\b)/

/**
 * Schreibt dieser Lebenslauf in der Ich-Form?
 *
 * `first`, sobald **mindestens ein Viertel** der gezählten Einträge ein
 * Personalpronomen der ersten Person trägt. Ein einzelnes „ich" in einem
 * ausformulierten Profilsatz macht noch keinen Ich-Lebenslauf — die übrigen
 * dreißig Einträge stehen dann weiterhin ohne. Ein Viertel ist die Schwelle,
 * ab der die Form erkennbar die Regel und nicht die Ausnahme ist.
 */
export function detectPerson(cvText: string): 'none' | 'first' {
  const entries = countedEntries(cvText)
  if (entries.length === 0) return 'none'
  const withPronoun = entries.filter(
    (line) => FIRST_PERSON_DE.test(line) || FIRST_PERSON_EN.test(line),
  ).length
  return withPronoun * 4 >= entries.length ? 'first' : 'none'
}

// ---------------------------------------------------------------------------
// Ableitung
// ---------------------------------------------------------------------------

const CvStyleProfileModelSchema = z.object({
  bulletForm: z.union([z.literal('verbFirst'), z.literal('nounPhrase'), z.literal('mixed')]),
  tense: z.union([z.literal('present'), z.literal('past'), z.literal('mixed')]),
  traits: z.array(z.string().min(1)).min(1),
  sample: z.string().min(1),
})

const CV_STYLE_PROFILE_LABEL = 'Lebenslauf-Stilprofil'

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Dieselbe Zusicherung wie beim Anschreiben (`styleProfile.ts`): `sample`
 * MUSS wörtlich im Lebenslauf stehen. Der Nutzer liest es als Zitat aus
 * seinem eigenen Dokument; ein erfundener oder geglätteter Eintrag wäre eine
 * Behauptung über ihn, die er nie aufgeschrieben hat (G10). Verglichen wird
 * nach Normalisierung von Leerraum — dass ein Modell Zeilenumbrüche nicht
 * reproduziert, ist eine Layout-Frage, keine inhaltliche Änderung.
 */
function assertSampleIsVerbatim(sample: string, cvText: string, label: string): void {
  const normalizedSample = normalizeWhitespace(sample)
  const normalizedCv = normalizeWhitespace(cvText)
  if (normalizedSample === '' || !normalizedCv.includes(normalizedSample)) {
    throw new ModelResponseError(
      label,
      `${label}: "sample" steht nicht wörtlich im Lebenslauf – die KI darf keinen Beispieleintrag erfinden oder umformulieren (G10). Gelieferter Text (gekürzt): "${truncateForError(sample)}"`,
    )
  }
}

/**
 * Leitet das Stilprofil aus einem bestehenden Lebenslauf ab.
 *
 * Drei der sieben Felder stehen fest, bevor überhaupt gefragt wird
 * (`computeBulletLength`, `detectTerminalPunctuation`, `detectPerson`); sie
 * gehen dem Modell nur als Zusammenhang mit, nie zur Übernahme. Zurück
 * kommen Form, Zeitform, Merkmale und ein Beispiel — und das Beispiel wird
 * gegen das Original geprüft, bevor es irgendwo erscheint.
 *
 * Die Anonymisierung liegt **nicht** hier, sondern bei der aufrufenden Seite
 * (`withAnonymization`, dieselbe Linie wie `deriveStyleProfile`). Ein
 * Lebenslauf trägt Name, Anschrift, Geburtsdatum und Telefonnummer; ohne die
 * Klammer ginge alles davon unersetzt an den Anbieter.
 */
export async function deriveCvStyleProfile(
  cvText: string,
  provider: LlmProvider,
  apiKey: string,
): Promise<CvStyleProfile> {
  const bulletLength = computeBulletLength(cvText)
  const terminalPunctuation = detectTerminalPunctuation(cvText)
  const person = detectPerson(cvText)
  const detectedLanguage = detectLanguage(cvText)

  const { system, user } = buildCvStyleProfilePrompt(cvText, detectedLanguage, {
    bulletLength,
    terminalPunctuation,
    person,
  })
  const raw = await provider.generate({ system, user, json: true }, apiKey)
  const parsed = parseModelJson(CvStyleProfileModelSchema, raw, CV_STYLE_PROFILE_LABEL)

  assertSampleIsVerbatim(parsed.sample, cvText, CV_STYLE_PROFILE_LABEL)

  return {
    bulletForm: parsed.bulletForm,
    tense: parsed.tense,
    person,
    terminalPunctuation,
    bulletLength,
    traits: parsed.traits,
    sample: parsed.sample,
  }
}

// ---------------------------------------------------------------------------
// cvStyleProfileToPromptFragment — reine Rendering-Funktion, kein Modellaufruf
// ---------------------------------------------------------------------------
//
// Wie `styleProfileToPromptFragment`: Sie muss mit einem handbearbeiteten
// Profil sinnvoll umgehen (das Bedienfeld lässt jedes Feld ändern) und darf
// deshalb klemmen, aber nicht scheitern. Eine Anzeige- und Renderfunktion ist
// keine Prüfgrenze.
// ---------------------------------------------------------------------------

const BULLET_FORM_DESCRIPTIONS: Record<BulletForm, string> = {
  verbFirst: 'beginnt mit einem Verb ("Entwickelt …", "Verantwortet …")',
  nounPhrase: 'ist eine Nominalphrase ("Entwicklung von …", "Verantwortung für …")',
  mixed: 'wechselt zwischen Verb am Anfang und Nominalphrase',
}

const TENSE_DESCRIPTIONS: Record<BulletTense, string> = {
  present: 'Präsens',
  past: 'Vergangenheit',
  mixed: 'gemischt – laufende Tätigkeiten im Präsens, abgeschlossene in der Vergangenheit',
}

function clampBulletLength(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

/**
 * Rendert das Lebenslauf-Stilprofil als Baustein für den
 * Umformulierungs-Prompt. Reine Funktion, kein Modellaufruf, und wie die
 * übrigen Prompts ein Entwicklerartefakt (G8 gilt hier nicht).
 */
export function cvStyleProfileToPromptFragment(profile: CvStyleProfile): string {
  const bulletForm = BULLET_FORM_DESCRIPTIONS[profile.bulletForm] ?? BULLET_FORM_DESCRIPTIONS.mixed
  const tense = TENSE_DESCRIPTIONS[profile.tense] ?? TENSE_DESCRIPTIONS.mixed
  const bulletLength = clampBulletLength(profile.bulletLength)

  const traitLines = profile.traits
    .map((trait) => trait.trim())
    .filter((trait) => trait.length > 0)
    .map((trait) => `- ${trait}`)
    .join('\n')
  const traitsBlock = traitLines.length > 0 ? traitLines : '- (keine besonderen Stilmerkmale hinterlegt)'

  const lengthLine =
    bulletLength > 0
      ? `\n- Übliche Länge eines Eintrags: etwa ${bulletLength} Wörter`
      : ''

  const sample = profile.sample.trim()
  const sampleBlock = sample
    ? `\n- Beispieleintrag aus dem Original (zeigt die Form, nicht wörtlich kopieren):\n"${sample}"`
    : ''

  return `Stilprofil des Lebenslaufs (aus dem vorhandenen Dokument abgeleitet – in der EIGENEN Form dieses Lebenslaufs schreiben, nicht in einer allgemein "guten"):
- Form eines Eintrags: ${bulletForm}
- Zeitform: ${tense}
- Person: ${profile.person === 'first' ? 'Ich-Form ("Ich habe …")' : 'ohne Ich – die Einträge nennen die Tätigkeit, nicht die Person'}
- Satzzeichen am Ende: ${profile.terminalPunctuation ? 'ja, die Einträge enden mit einem Punkt' : 'nein, die Einträge enden ohne Satzzeichen'}${lengthLine}
- Stilmerkmale:
${traitsBlock}${sampleBlock}`
}
