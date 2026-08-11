import { z } from 'zod'
import type { LlmProvider } from '../ai/provider'
import { ModelResponseError, parseModelJson, truncateForError } from '../ai/modelJson'
import { buildRewritePrompt, buildTranslationPrompt, VARIANT_COUNT } from '../ai/prompts/rewrite'
import type { LengthGoal } from '../ai/prompts/rewrite'
import { withAnonymization } from '../privacy/withAnonymization'
import type { AnonymizationSettings } from '../privacy/withAnonymization'
import type { TruthMode } from '../storage/adapter'
import type { JobAd } from './jobAd'
import { detectLanguage } from './language'
import { styleProfileToPromptFragment } from './styleProfile'
import type { StyleProfile } from './styleProfile'

/**
 * Aufgabe 11 — eine markierte Textstelle in drei Varianten umschreiben.
 *
 * Das ist der Kern des Produkts (`docs/spec.md`: "**Drei Varianten** zur
 * Auswahl"). Alles davor war Vorbereitung. Zwei Projektentscheidungen
 * entscheiden sich hier:
 *
 * - **G10 — die KI erfindet keine Fakten**, außer im ausdrücklich gewählten
 *   freien Modus, dort mit Markierung, Einzelbestätigung und Exportsperre.
 *   Der Mechanismus dafür ist `Variant.unbackedClaims`: leer in `strict` und
 *   `bridge` (hier erzwungen, nicht nur erbeten), gefüllt und wörtlich
 *   zitierbar in `free`.
 * - **Persönliche Daten werden vor dem Senden ersetzt** — über
 *   `withAnonymization` (`src/lib/privacy`), das denselben Zyklus auch für
 *   die Aufgaben 10 und 12 bereitstellt.
 *
 * Was diese Datei prüft und was nicht — siehe die einzelnen `assert…`
 * Funktionen unten und den Abschnitt "Was `strict` garantiert" im Bericht
 * (task-11-report.md). Kurz: Anzahl, Modusdisziplin, Kontexttreue und
 * Zitierbarkeit sind maschinell geprüft; ob eine Aussage tatsächlich durch
 * `facts` gedeckt ist, ist es NICHT — das kann Code ohne ein zweites Modell
 * nicht entscheiden.
 */

export interface RewriteRequest {
  selection: string
  /** Bis zu 600 Zeichen davor — wird mitgelesen, nie verändert. */
  contextBefore: string
  contextAfter: string
  jobAd: JobAd
  style: StyleProfile
  truthMode: TruthMode
  /** Fließtext aus Lebenslauf + Anschreiben als Faktenbasis. */
  facts: string
  targetLanguage: 'de' | 'en'
  /**
   * Beide Regler 0–100 (Aufgabe 13, `docs/spec.md`: "zwei bis drei
   * Schieberegler (förmlich↔locker, kurz↔ausführlich)").
   *
   * - `formality`: absoluter Zielwert, der die aus dem Anschreiben
   *   abgeleitete Förmlichkeit im Prompt **ersetzt**. Die Oberfläche stellt
   *   den Regler anfangs auf `style.formality`, "unverändert" ist damit
   *   ausdrückbar.
   * - `length`: 0 = deutlich kürzer, 50 = etwa gleich lang, 100 = deutlich
   *   ausführlicher.
   *
   * Beide wirken ausschließlich über den Prompt (Stilbaustein und
   * Längenanweisung), niemals über `LlmRequest.temperature` — das Feld ist
   * auf allen drei Anbietern wirkungslos oder schädlich (siehe
   * `ai/provider.ts`).
   */
  sliders: { formality: number; length: number }
}

/** Eine Formulierungsvariante. `unbackedClaims` ist im Modus `free` gefüllt, sonst leer. */
export interface Variant {
  text: string
  unbackedClaims: string[]
}

/**
 * Fehler in der Anfrage selbst — nicht in der Modellantwort. Eigene Klasse
 * (statt `ModelResponseError`), weil hier gar kein Modell gefragt wurde: Die
 * Oberfläche soll den Unterschied zwischen "die KI hat Unsinn geliefert" und
 * "es war nichts markiert" anzeigen können, ohne im Fehlertext zu suchen.
 * Der Text ist wie überall eine Entwickler-Diagnose, kein Oberflächentext
 * (G8) — die Oberfläche übersetzt selbst.
 */
export class RewriteInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RewriteInputError'
  }
}

const REWRITE_LABEL = 'Umformulierung'
const TRANSLATION_LABEL = 'Übersetzung der Auswahl'

// ---------------------------------------------------------------------------
// Zod-Grenze — genau drei Varianten, Modusdisziplin
// ---------------------------------------------------------------------------

const VariantSchema = z.object({
  text: z.string().min(1),
  unbackedClaims: z.array(z.string().min(1)),
})

/**
 * "Genau drei Varianten" ist ein Vertrag, keine Hoffnung: `.length(3)` im
 * Schema. Zwei Varianten sind ein Fehlschlag der ganzen Antwort, vier ebenso
 * — **nicht** stillschweigend auf drei gekürzt. Begründung: Ein Modell, das
 * die deutlichste Anweisung des Prompts ("nicht zwei, nicht vier")
 * missachtet, hat mit hoher Wahrscheinlichkeit auch die leiseren Anweisungen
 * missachtet (Wahrheitsgrenze, Kontexttreue) — dieselbe Linie wie
 * `salutation`↔`contactPerson` in Aufgabe 9 und die Wörtlichkeitsprüfung von
 * `sample` in Aufgabe 10: Scheitern statt Selbstheilung.
 *
 * `unbackedClaims` muss in `strict` und `bridge` leer sein, und das wird hier
 * erzwungen statt nur im Prompt erbeten. **Fehler statt stillem Leeren:**
 * Ein leergeräumtes Array würde genau das Signal löschen, aus dem die
 * Oberfläche Markierung, Einzelbestätigung und Exportsperre baut (G10) — der
 * unbelegte Satz bliebe im Text stehen, nur eben unmarkiert und exportierbar.
 * Das ist der schlimmstmögliche Ausgang. Eine abgelehnte Antwort kostet
 * dagegen einen erneuten Versuch.
 */
function buildResponseSchema(truthMode: TruthMode) {
  return z
    .object({
      variants: z
        .array(VariantSchema)
        .length(VARIANT_COUNT, `Es müssen genau ${VARIANT_COUNT} Varianten sein`),
    })
    .superRefine((data, ctx) => {
      if (truthMode === 'free') return
      data.variants.forEach((variant, index) => {
        if (variant.unbackedClaims.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['variants', index, 'unbackedClaims'],
            message: `unbackedClaims muss im Modus "${truthMode}" leer sein – das Modell meldet selbst unbelegte Aussagen, obwohl dieser Modus ausschließlich Belegtes zulässt (G10)`,
          })
        }
      })
    })
}

const TranslationSchema = z.object({ translation: z.string().min(1) })

// ---------------------------------------------------------------------------
// Prüfungen nach dem Parsen
// ---------------------------------------------------------------------------

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Wie viele normalisierte Zeichen vom Rand des Kontexts wörtlich in einer
 * Antwort vorkommen müssen, damit sie als "Kontext verschluckt" gilt. 40
 * Zeichen sind lang genug, dass eine zufällige Übereinstimmung praktisch
 * ausgeschlossen ist (eine gängige Wendung wie "in Ihrem Unternehmen
 * einbringen" ist kürzer), und kurz genug, dass ein Modell, das den letzten
 * Satz des Kontexts mitliefert, sicher erwischt wird.
 *
 * Ist der Kontext selbst kürzer als diese Grenze (z. B. eine Markierung am
 * Anfang des Briefs), wird nicht geprüft — eine dokumentierte Lücke, kein
 * Versehen: Bei sehr kurzem Kontext wäre jede Prüfung entweder wirkungslos
 * oder voller Fehlalarme.
 */
const CONTEXT_ECHO_CHARS = 40

function contextEdge(context: string, side: 'end' | 'start'): string | null {
  const normalized = normalizeWhitespace(context)
  if (normalized.length < CONTEXT_ECHO_CHARS) return null
  return side === 'end' ? normalized.slice(-CONTEXT_ECHO_CHARS) : normalized.slice(0, CONTEXT_ECHO_CHARS)
}

/**
 * "Kontext ist nur zum Mitlesen" steht im Prompt — notwendig, aber nicht
 * hinreichend, Modelle verstoßen ständig dagegen. Deshalb wird die Antwort
 * zusätzlich geprüft.
 *
 * **Fehler statt Zurechtschneiden:** Wer den Kontext aus der Variante
 * herausschneiden wollte, müsste raten, wo er endet und die eigentliche
 * Neuformulierung beginnt. Rät man falsch, landet ein halber Satz im Brief
 * des Nutzers — ein stiller Schaden an genau der Datei, deren Unversehrtheit
 * das ganze Projekt verspricht. Rät man gar nicht und übernimmt die Variante,
 * steht der Kontextsatz danach doppelt im Brief. Beides ist schlechter als
 * ein sichtbarer Fehlschlag mit erneutem Versuch.
 *
 * Geprüft wird die GESAMTE Antwort, nicht die einzelne Variante: Eine von
 * drei Varianten zu verwerfen würde die Zusage "genau drei" brechen.
 */
function assertNoContextEcho(texts: string[], contextBefore: string, contextAfter: string, label: string): void {
  const edges = [contextEdge(contextBefore, 'end'), contextEdge(contextAfter, 'start')].filter(
    (edge): edge is string => edge !== null,
  )
  if (edges.length === 0) return

  for (const text of texts) {
    const normalized = normalizeWhitespace(text)
    for (const edge of edges) {
      if (normalized.includes(edge)) {
        throw new ModelResponseError(
          label,
          `${label}: Die Antwort enthält den umgebenden Kontext wörtlich – der Kontext ist ausschließlich zum Mitlesen, zurückzugeben ist nur die Auswahl. Gelieferter Text (gekürzt): "${truncateForError(text)}"`,
        )
      }
    }
  }
}

/**
 * Drei fast gleiche Vorschläge sind kein Angebot zur Auswahl. Maschinell
 * entscheidbar ist davon nur der eindeutige Fall: zwei nach Leerraum-
 * Normalisierung identische Texte. Eine Ähnlichkeitsschwelle
 * (Levenshtein o. Ä.) wäre eine willkürliche Zahl, die zwangsläufig
 * legitime Varianten verwirft — "genuin verschieden" ist eine inhaltliche
 * Eigenschaft. Dafür ist die Prompt-Regel 3 zuständig (drei ausdrücklich
 * benannte Ansätze); hier steht nur der harte Fall.
 */
function assertVariantsAreDistinct(variants: Variant[], label: string): void {
  const seen = new Set<string>()
  for (const variant of variants) {
    const normalized = normalizeWhitespace(variant.text)
    if (seen.has(normalized)) {
      throw new ModelResponseError(
        label,
        `${label}: Zwei Varianten sind wortgleich – drei Vorschläge müssen sich unterscheiden, sonst ist die Auswahl keine. Doppelter Text (gekürzt): "${truncateForError(variant.text)}"`,
      )
    }
    seen.add(normalized)
  }
}

/**
 * Im Modus `free` muss jede gemeldete unbelegte Aussage WÖRTLICH im
 * Variantentext stehen (Leerraum normalisiert, wie bei `assertSampleIsVerbatim`
 * in Aufgabe 10). Grund: Aus `unbackedClaims` baut die Oberfläche die farbige
 * Markierung und die Einzelbestätigung — beides verlangt eine Fundstelle im
 * Text. Eine zusammenfassende Aussage ("Erfahrung im Ausland"), die so nicht
 * im Text steht, kann der Nutzer weder sehen noch gezielt bestätigen; die
 * Exportsperre bliebe dann eine Sperre ohne erkennbaren Grund. Dann lieber
 * die Antwort verwerfen, als die einzige Schutzvorrichtung des freien Modus
 * zur Dekoration zu machen.
 */
function assertClaimsAreVerbatim(variants: Variant[], label: string): void {
  for (const variant of variants) {
    const normalizedText = normalizeWhitespace(variant.text)
    for (const claim of variant.unbackedClaims) {
      const normalizedClaim = normalizeWhitespace(claim)
      if (normalizedClaim === '' || !normalizedText.includes(normalizedClaim)) {
        throw new ModelResponseError(
          label,
          `${label}: Eine gemeldete unbelegte Aussage steht nicht wörtlich im Variantentext – ohne Fundstelle sind farbige Markierung und Einzelbestätigung nicht möglich (G10, freier Modus). Aussage (gekürzt): "${truncateForError(claim)}"`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Regler — wirken über das Stilprofil und die Längenanweisung, nie über einen
// Modellparameter (siehe `RewriteRequest.sliders`)
// ---------------------------------------------------------------------------

function clampSlider(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, value))
}

/**
 * Der Längenregler verändert das Stilprofil messbar: Er skaliert die
 * durchschnittliche Satzlänge zwischen 0,6-fach (0) und 1,4-fach (100),
 * wodurch `styleProfileToPromptFragment` eine andere Beschreibung rendert
 * ("kurze, prägnante Sätze" ↔ "lange, ausführliche Sätze"). Zusätzlich
 * erzeugt {@link lengthGoal} eine ausdrückliche Anweisung im Systemprompt.
 * Zwei Hebel für denselben Regler, weil die Satzlänge allein nur die Form
 * beschreibt, nicht den gewünschten Umfang der ganzen Textstelle.
 */
function sentenceLengthFactor(length: number): number {
  return 0.6 + (clampSlider(length) / 100) * 0.8
}

function lengthGoal(length: number): LengthGoal {
  const value = clampSlider(length)
  if (value <= 33) return 'shorter'
  if (value >= 67) return 'longer'
  return 'similar'
}

function applySliders(style: StyleProfile, sliders: RewriteRequest['sliders']): StyleProfile {
  return {
    ...style,
    formality: clampSlider(sliders.formality),
    sentenceLength: style.sentenceLength * sentenceLengthFactor(sliders.length),
  }
}

// ---------------------------------------------------------------------------
// Sprache
// ---------------------------------------------------------------------------

/**
 * Die Quellsprache wird deterministisch erkannt (`detectLanguage`, Aufgabe 9)
 * — und zwar über Auswahl UND Kontext zusammen. Eine markierte Textstelle ist
 * oft nur ein Halbsatz; die Stoppwort-Zählung braucht Material, und der
 * umgebende Text ist garantiert derselbe Brief in derselben Sprache.
 *
 * `targetLanguage` wird bewusst NICHT als Quellsprache gelesen: Es ist die
 * Wunschsprache des Nutzers (laut `docs/spec.md` "Zielsprache = Sprache der
 * Anzeige. Nachfrage nur bei Abweichung"), nicht die Sprache des vorhandenen
 * Texts. `jobAd.language` trägt die Sprache der Anzeige, ist aber ebenfalls
 * nicht die Sprache des Anschreibens — die Oberfläche hat den Nutzer bei
 * Abweichung bereits gefragt, deshalb entscheidet hier allein
 * `targetLanguage` über das Ziel und `detectLanguage` über den Ausgangspunkt.
 */
function detectSourceLanguage(req: RewriteRequest): 'de' | 'en' {
  return detectLanguage([req.contextBefore, req.selection, req.contextAfter].join('\n'))
}

// ---------------------------------------------------------------------------
// Öffentliche Schnittstelle
// ---------------------------------------------------------------------------

/** Trennt die einzelnen Stilmerkmale wieder auf, nachdem sie als ein Feld anonymisiert wurden. */
function splitTraits(joined: string): string[] {
  return joined.split('\n').filter((trait) => trait.trim().length > 0)
}

/**
 * Formuliert die markierte Textstelle in genau drei Varianten neu.
 *
 * Ablauf:
 * 1. Leere Auswahl → `RewriteInputError`, ohne Modellaufruf.
 * 2. Quellsprache deterministisch erkennen (siehe {@link detectSourceLanguage}).
 * 3. `withAnonymization` ersetzt persönliche Daten in Auswahl, Kontext,
 *    Faktenbasis und Stilbaustein — in EINEM gemeinsamen Durchlauf, dessen
 *    Zuordnung für beide möglichen Modellaufrufe gilt.
 * 4. Weicht die Zielsprache von der Quellsprache ab: erst übersetzen
 *    (eigener Aufruf, eigener Prompt), dann anpassen — zwei getrennte
 *    Schritte laut `docs/spec.md`.
 * 5. Umformulieren, Antwort durch die Zod-Grenze, danach die vier Prüfungen
 *    (Anzahl und Modusdisziplin im Schema; Kontexttreue, Unterschiedlichkeit
 *    und Zitierbarkeit danach).
 * 6. Persönliche Daten in Variantentexten UND unbelegten Aussagen
 *    zurücktauschen.
 *
 * Der vierte Parameter ist **pflichtig**, obwohl der Plan nur drei nennt: Die
 * Anonymisierungseinstellung (standardmäßig an, abschaltbar) und der
 * Namenshinweis müssen von außen kommen — `RewriteRequest` kennt beides
 * nicht, und ein optionaler Parameter hätte sich stillschweigend weglassen
 * lassen, mit dem Klarnamen des Nutzers als Preis (siehe
 * `AnonymizationSettings.userName`).
 */
export async function rewriteSelection(
  req: RewriteRequest,
  provider: LlmProvider,
  apiKey: string,
  privacy: AnonymizationSettings,
): Promise<Variant[]> {
  if (req.selection.trim() === '') {
    throw new RewriteInputError(
      'Umformulierung: Die Auswahl ist leer oder besteht nur aus Leerraum – ohne markierten Text gibt es nichts umzuformulieren.',
    )
  }

  const sourceLanguage = detectSourceLanguage(req)
  const needsTranslation = sourceLanguage !== req.targetLanguage

  return withAnonymization(
    {
      selection: req.selection,
      contextBefore: req.contextBefore,
      contextAfter: req.contextAfter,
      facts: req.facts,
      styleSample: req.style.sample,
      styleTraits: req.style.traits.join('\n'),
    },
    privacy,
    async (fields) => {
      let selection = fields.selection

      if (needsTranslation) {
        const translationPrompt = buildTranslationPrompt({
          selection: fields.selection,
          contextBefore: fields.contextBefore,
          contextAfter: fields.contextAfter,
          sourceLanguage,
          targetLanguage: req.targetLanguage,
        })
        const rawTranslation = await provider.generate(
          { system: translationPrompt.system, user: translationPrompt.user, json: true },
          apiKey,
        )
        const translated = parseModelJson(TranslationSchema, rawTranslation, TRANSLATION_LABEL)
        assertNoContextEcho([translated.translation], fields.contextBefore, fields.contextAfter, TRANSLATION_LABEL)
        selection = translated.translation
      }

      const style = applySliders(
        { ...req.style, sample: fields.styleSample, traits: splitTraits(fields.styleTraits) },
        req.sliders,
      )

      const { system, user } = buildRewritePrompt({
        selection,
        contextBefore: fields.contextBefore,
        contextAfter: fields.contextAfter,
        jobAd: {
          company: req.jobAd.company,
          position: req.jobAd.position,
          tone: req.jobAd.tone,
          requirements: req.jobAd.requirements.map((requirement) => requirement.text),
        },
        facts: fields.facts,
        styleFragment: styleProfileToPromptFragment(style),
        truthMode: req.truthMode,
        targetLanguage: req.targetLanguage,
        lengthGoal: lengthGoal(req.sliders.length),
      })

      const raw = await provider.generate({ system, user, json: true }, apiKey)
      const parsed = parseModelJson(buildResponseSchema(req.truthMode), raw, REWRITE_LABEL)
      const variants: Variant[] = parsed.variants.map((variant) => ({
        text: variant.text,
        unbackedClaims: variant.unbackedClaims,
      }))

      assertNoContextEcho(
        variants.map((variant) => variant.text),
        fields.contextBefore,
        fields.contextAfter,
        REWRITE_LABEL,
      )
      assertVariantsAreDistinct(variants, REWRITE_LABEL)
      if (req.truthMode === 'free') assertClaimsAreVerbatim(variants, REWRITE_LABEL)

      return variants
    },
    (variants, restoreText) =>
      variants.map((variant) => ({
        text: restoreText(variant.text),
        unbackedClaims: variant.unbackedClaims.map(restoreText),
      })),
  )
}
