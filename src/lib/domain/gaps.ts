import { z } from 'zod'
import type { LlmProvider } from '../ai/provider'
import { parseModelJson } from '../ai/modelJson'
import { buildGapsPrompt } from '../ai/prompts/gaps'
import { withAnonymization } from '../privacy/withAnonymization'
import type { AnonymizationSettings } from '../privacy/withAnonymization'
import type { JobAd, Requirement } from './jobAd'

/**
 * Aufgabe 12 — Lückenliste: für jede Anforderung der Stellenanzeige
 * feststellen, ob die Fakten der Bewerberin/des Bewerbers sie decken
 * (`docs/spec.md`: "Was die Anzeige verlangt, was gedeckt ist, was fehlt").
 *
 * Das ist der Mechanismus, der unbelegte Anforderungen aus dem Anschreiben
 * heraushält – genau die Kehrseite von Aufgabe 11 (`rewriteSelection`), wo
 * G10 verhindert, dass eine erfundene Aussage in eine EINZELNE Textstelle
 * gelangt. Hier geht es um die ANFORDERUNGEN insgesamt: Was nicht gedeckt
 * ist, steht in dieser Liste statt stillschweigend im Brief zu landen (das
 * "Auffüllen" der Lücke bleibt bewusst der Oberfläche/dem Nutzer überlassen,
 * nicht der KI).
 *
 * **Kein Zahlenwert (Produktentscheidung, keine Auslassung):** `GapEntry`
 * hat kein Score-/Prozent-/Bewertungsfeld, das Schema unten ebenso wenig,
 * und der Prompt (`ai/prompts/gaps.ts`) verbietet der KI ausdrücklich, eine
 * Zahl in "evidence" unterzubringen. "Wie stark" gedeckt ist NICHT
 * ausdrückbar außer über die drei Status-Werte – ein Deckungsgrad in
 * Prozent wäre erfunden (die KI kann nicht seriös zwischen "68 %" und
 * "71 %" unterscheiden), würde aber wie eine harte Messung aussehen und
 * genau deshalb missbraucht werden.
 *
 * **"index" statt Anforderungstext als Bindeglied (siehe `ai/prompts/gaps.ts`):**
 * Jeder Eintrag der Modellantwort verweist über eine Nummer auf die
 * ANFORDERUNG AUS DER EINGABE zurück. `analyzeGaps` bindet jeden Eintrag
 * über `index` an das Original-`Requirement`-Objekt aus `jobAd.requirements`
 * – nie an einen vom Modell zurückgegebenen Anforderungstext (den es hier
 * bewusst gar nicht gibt). Das garantiert "genau ein Eintrag pro
 * Anforderung, in Eingabereihenfolge" auch dann, wenn das Modell die
 * Einträge in anderer Reihenfolge zurückgibt: Das Ergebnis-Array wird über
 * `entries[assessment.index] = …` an der Eingabeposition befüllt, die
 * Rückgabereihenfolge der Antwort spielt keine Rolle.
 *
 * **Anonymisierung — nur die Faktenbasis, nicht die Anzeige.** `facts` ist
 * Nutzertext (Lebenslauf/Anschreiben) und läuft durch `withAnonymization`
 * (siehe `privacy/withAnonymization.ts`, Abschnitt "Aufgabe 12"). Die
 * Anzeige selbst geht unverändert in den Prompt – ein öffentliches Dokument
 * der Firma, keine personenbezogenen Daten des Nutzers (dieselbe Begründung
 * wie in `domain/jobAd.ts`, `analyzeJobAd`).
 *
 * **`privacy` als fünfter, PFLICHTIGER Parameter – bewusste Abweichung von
 * der wörtlichen Aufgabenstellung** (die nur vier Parameter nennt), analog
 * zu `rewriteSelection` in Aufgabe 11. `withAnonymization` wird HIER INNEN
 * aufgerufen, nicht von der Oberfläche außen herum – ein optionaler
 * Parameter hätte sich beim Aufruf stillschweigend weglassen lassen, mit dem
 * Klarnamen des Nutzers als Preis. Das weicht von dem Aufrufbeispiel für
 * Aufgabe 12 in `withAnonymization.ts` ab, das einen äußeren Aufruf
 * skizziert (dort vor dieser Aufgabe niedergeschrieben, als Vorgriff) – die
 * Entscheidung dieser Aufgabe war, denselben pflichtigen Parameter wie
 * `rewriteSelection` zu verwenden, damit beide KI-Aufrufe mit Nutzertext
 * dieselbe, nicht vergessbare Form haben. Der Kommentar dort wurde
 * entsprechend nachgezogen.
 */

export interface GapEntry {
  requirement: Requirement
  status: 'covered' | 'partial' | 'missing'
  evidence: string | null
}

/**
 * `evidence` ist FREITEXT, das das Modell selbst formuliert (eine
 * Begründung, keine wörtliche Übernahme eines Fakt-Felds) – deshalb bewusst
 * `z.string().min(1).nullable()` statt `nullableFactString`
 * (`src/lib/ai/modelJson.ts`): Jene Funktion ist nur für Fakt-Felder gedacht
 * (Eigennamen, Zitate) und würde hier ein Platzhalter-Wort, das zufällig in
 * einer legitimen Begründung vorkommt, fälschlich zu `null` machen.
 * `.min(1)` lehnt eine leere Zeichenkette ab statt sie wie `null`
 * durchzureichen – dieselbe Linie wie `RequirementSchema.text` in
 * `jobAd.ts`: eine leere Begründung ist kein plausibles Ergebnis, sondern
 * ein Zeichen für eine kaputte Antwort.
 */
const GapAssessmentSchema = z.object({
  index: z.number().int(),
  status: z.enum(['covered', 'partial', 'missing']),
  evidence: z.string().min(1).nullable(),
})

/**
 * "Genau ein Eintrag pro Anforderung" ist ein Vertrag, keine Hoffnung
 * (dieselbe Linie wie `VARIANT_COUNT`/`.length(3)` in Aufgabe 11): Die
 * Antwort MUSS exakt `count` Einträge enthalten, jeder mit einem im Bereich
 * `[0, count)` liegenden, im gesamten Array EINDEUTIGEN `index`. Zusammen
 * erzwingen `.length(count)` und die Eindeutigkeits-/Bereichsprüfung unten
 * eine Bijektion zu `0..count-1` – kein Requirement bleibt unbeantwortet,
 * keines wird doppelt beantwortet, kein Index zeigt ins Leere.
 *
 * Zweite Prüfung im selben Durchlauf: `status`/`evidence` dürfen sich nicht
 * widersprechen. "missing" mit gesetztem `evidence` würde behaupten, es
 * gäbe einen Beleg für eine als nicht gedeckt markierte Anforderung – logisch
 * unmöglich. "covered"/"partial" mit `evidence: null` wäre eine behauptete
 * Deckung ganz ohne Beleg – nicht nachprüfbar und damit im Kern derselbe
 * G10-Fall wie ein erfundener Fakt: eine Behauptung, die der Nutzer nicht
 * verifizieren kann. Der Prompt bittet bereits um diese Kopplung (Regel 3);
 * hier wird sie zusätzlich erzwungen statt nur erbeten – dieselbe Linie wie
 * `salutation`↔`contactPerson` in Aufgabe 9.
 */
function buildResponseSchema(count: number) {
  return z
    .object({
      assessments: z.array(GapAssessmentSchema).length(count, `Es müssen genau ${count} Einträge sein`),
    })
    .superRefine((data, ctx) => {
      const seen = new Set<number>()
      data.assessments.forEach((assessment, i) => {
        if (assessment.index < 0 || assessment.index >= count) {
          ctx.addIssue({
            code: 'custom',
            path: ['assessments', i, 'index'],
            message: `index ${assessment.index} verweist auf keine der ${count} Anforderungen aus der Eingabe.`,
          })
        } else if (seen.has(assessment.index)) {
          ctx.addIssue({
            code: 'custom',
            path: ['assessments', i, 'index'],
            message: `index ${assessment.index} kommt mehrfach in der Antwort vor – es darf genau ein Eintrag pro Anforderung sein.`,
          })
        } else {
          seen.add(assessment.index)
        }

        if (assessment.status === 'missing' && assessment.evidence !== null) {
          ctx.addIssue({
            code: 'custom',
            path: ['assessments', i, 'evidence'],
            message: 'evidence muss null sein, wenn status "missing" ist – ohne Deckung gibt es nichts zu belegen.',
          })
        }
        if (assessment.status !== 'missing' && assessment.evidence === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['assessments', i, 'evidence'],
            message:
              'evidence darf nicht null sein, wenn status "covered" oder "partial" ist – eine behauptete Deckung ohne Beleg wäre eine unbelegte Behauptung (G10).',
          })
        }
      })
    })
}

const GAPS_LABEL = 'Lückenanalyse'

/**
 * Zieht für jede Anforderung der Stellenanzeige eine Statusaussage
 * ("covered"/"partial"/"missing") plus optionale Begründung.
 *
 * Ablauf:
 * 1. Keine Anforderungen → leere Liste, OHNE Modellaufruf (eine Anzeige ganz
 *    ohne erkennbare Anforderungen ist laut `jobAd.ts` ein gültiges Ergebnis
 *    von Aufgabe 9; ein Modellaufruf für nichts zu bewertende Punkte wäre
 *    reine Verschwendung und ein Sonderfall mehr für den Prompt).
 * 2. `withAnonymization` ersetzt persönliche Daten in `facts` – die Anzeige
 *    bleibt unangetastet (siehe Doc-Kommentar oben).
 * 3. Die Modellantwort läuft durch `parseModelJson(buildResponseSchema(...), …)`
 *    – die Zod-Grenze erzwingt Anzahl, Index-Eindeutigkeit/-Bereich und die
 *    status/evidence-Kopplung.
 * 4. Jeder Eintrag wird über `assessment.index` an das ORIGINAL-`Requirement`
 *    aus `jobAd.requirements` gebunden – das Ergebnis-Array hat danach
 *    zwingend Eingabereihenfolge, unabhängig von der Reihenfolge der Antwort.
 * 5. `evidence` wird zurückgetauscht (kann einen Platzhalter enthalten, wenn
 *    das Modell eine anonymisierte Textstelle zitiert hat).
 */
export async function analyzeGaps(
  jobAd: JobAd,
  facts: string,
  provider: LlmProvider,
  apiKey: string,
  privacy: AnonymizationSettings,
): Promise<GapEntry[]> {
  const requirements = jobAd.requirements
  if (requirements.length === 0) return []

  return withAnonymization(
    { facts },
    privacy,
    async (fields) => {
      const { system, user } = buildGapsPrompt({
        language: jobAd.language,
        requirements: requirements.map((requirement, index) => ({
          index,
          text: requirement.text,
          kind: requirement.kind,
        })),
        facts: fields.facts,
      })

      const raw = await provider.generate({ system, user, json: true }, apiKey)
      const parsed = parseModelJson(buildResponseSchema(requirements.length), raw, GAPS_LABEL)

      const entries: GapEntry[] = new Array(requirements.length)
      for (const assessment of parsed.assessments) {
        entries[assessment.index] = {
          requirement: requirements[assessment.index]!,
          status: assessment.status,
          evidence: assessment.evidence,
        }
      }
      return entries
    },
    (entries, restoreText) =>
      entries.map((entry) => ({
        ...entry,
        evidence: entry.evidence === null ? null : restoreText(entry.evidence),
      })),
  )
}
