import { z } from 'zod'
import type { LlmProvider } from '../ai/provider'
import { parseModelJson } from '../ai/modelJson'
import { buildJobAdPrompt } from '../ai/prompts/jobAd'
import { detectLanguage } from './language'

/**
 * Aufgabe 9 — Stellenanzeige analysieren.
 *
 * `JobAdSchema` ist die Zod-Schema-Grenze für diese Modellantwort (siehe
 * Aufgabenstellung: "Zod-Schema als Grenze: Jede Modellantwort wird
 * geparst, bevor sie ins Programm gelangt"). Das ist das Muster, das die
 * Aufgaben 10–12 wiederverwenden: ein Zod-Schema neben der Domain-Funktion,
 * geparst über `parseModelJson` (`src/lib/ai/modelJson.ts`) — nirgendwo
 * sonst im Programm wird eine Modellantwort direkt mit `JSON.parse`
 * angefasst.
 */

/**
 * Trimmt eine nullable Zeichenkette und macht eine (nach dem Trimmen) leere
 * Zeichenkette zu `null`. Ein Modell, das statt `null` eine leere
 * Zeichenkette liefert, meint dasselbe: "nicht in der Anzeige gefunden" —
 * G10 verlangt in beiden Fällen dieselbe Behandlung, nicht zwei
 * verschiedene Repräsentationen von "nichts".
 */
const nullableFactString = z
  .string()
  .nullable()
  .transform((value) => (value === null || value.trim() === '' ? null : value.trim()))

/**
 * Eine einzelne aus der Anzeige gezogene Anforderung. `kind` ist eine feste
 * Aufzählung (kein Freitext) — Aufgabe 12 (Lückenliste) gruppiert und
 * vergleicht Anforderungen über dieses Feld, ein Freitext-Wert wäre dafür
 * nicht auswertbar.
 */
export const RequirementSchema = z.object({
  text: z.string(),
  kind: z.enum(['skill', 'experience', 'education', 'language', 'soft']),
})
export type Requirement = z.infer<typeof RequirementSchema>

/**
 * Das vollständige Analyseergebnis einer Stellenanzeige.
 *
 * Feld-Entscheidungen (siehe task-9-report.md für die vollständige
 * Begründung):
 *
 * - `company`, `position`, `contactPerson`: `null`, wenn nicht in der
 *   Anzeige genannt — niemals geraten (G10). Eine leere Zeichenkette zählt
 *   dabei als `null` (siehe `nullableFactString`).
 * - `salutation`: hängt zwingend von `contactPerson` ab — ist `null`, wenn
 *   `contactPerson` `null` ist. Erzwungen über `.superRefine` unten, nicht
 *   nur per Prompt-Anweisung: ein Modell, das die Regel trotzdem verletzt
 *   (erfundene Anrede ohne Ansprechpartner — der G10-Kernfall dieser
 *   Aufgabe), lässt die gesamte Antwort scheitern statt die Verletzung
 *   stillschweigend zu übernehmen.
 * - `requirements`: **keine** Mindestlänge. Eine leere Liste ist ein
 *   gültiges Ergebnis (eine Anzeige ganz ohne ausformulierte Anforderungen
 *   existiert, z. B. eine sehr kurze Kurzanzeige) — kein Parse-Fehler. Die
 *   aufrufende Oberfläche (Aufgabe 13) entscheidet, wie sie eine leere
 *   Liste anzeigt; das ist keine Entscheidung, die das Schema treffen
 *   sollte.
 * - `tone`: immer ein String, nie `null` — jede Anzeige hat einen Ton, auch
 *   ein rein sachlicher ist einer. `.min(1)`, weil eine leere Zeichenkette
 *   hier (anders als bei den nullable Feldern oben) kein plausibles
 *   "nichts gefunden"-Ergebnis ist, sondern ein Zeichen für eine kaputte
 *   Modellantwort.
 */
export const JobAdSchema = z
  .object({
    language: z.enum(['de', 'en']),
    company: nullableFactString,
    position: nullableFactString,
    contactPerson: nullableFactString,
    salutation: nullableFactString,
    requirements: z.array(RequirementSchema),
    tone: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.contactPerson === null && data.salutation !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['salutation'],
        message:
          'salutation muss null sein, wenn contactPerson null ist (kein Ansprechpartner erkannt – siehe G10, keine erfundene Anrede).',
      })
    }
  })

export type JobAd = z.infer<typeof JobAdSchema>

const JOB_AD_LABEL = 'Stellenanzeigen-Analyse'

/**
 * Zieht Firma, Position, Ansprechpartner, Anrede, Anforderungen und
 * Unternehmenston aus einer eingefügten Stellenanzeige.
 *
 * Ablauf:
 * 1. `detectLanguage` erkennt die Sprache deterministisch (Stoppwort-
 *    Zählung, `src/lib/domain/language.ts`) — **vor** jedem Modellaufruf.
 * 2. Der Prompt (`buildJobAdPrompt`) gibt dem Modell diese Erkennung nur
 *    zur Bestätigung mit.
 * 3. Die Modellantwort läuft durch `parseModelJson(JobAdSchema, …)` — die
 *    Zod-Grenze. Fehlerhaftes/abgeschnittenes JSON oder ein Schema-Verstoß
 *    wirft eine `ModelResponseError` mit Feldbezug, statt einen kaputten
 *    Wert durchzulassen.
 * 4. Das `language`-Feld der Modellantwort wird **immer** durch das
 *    deterministische Ergebnis überschrieben — reproduzierbar schlägt
 *    Modellmeinung. Widerspricht das Modell der Vorprüfung, gewinnt nicht
 *    das Modell (siehe task-9-report.md, Abschnitt "Spracherkennung").
 *
 * Ruft `anonymize` (Aufgabe 8) bewusst **nicht** auf: eine Stellenanzeige
 * ist ein öffentliches Dokument der Firma, keine personenbezogenen Daten
 * des Nutzers — Anonymisierung würde hier genau die Firmen- und
 * Ansprechpartner-Angaben entfernen, die diese Funktion extrahieren soll.
 */
export async function analyzeJobAd(text: string, provider: LlmProvider, apiKey: string): Promise<JobAd> {
  const detectedLanguage = detectLanguage(text)
  const { system, user } = buildJobAdPrompt(text, detectedLanguage)

  const raw = await provider.generate({ system, user, json: true }, apiKey)
  const parsed = parseModelJson(JobAdSchema, raw, JOB_AD_LABEL)

  return { ...parsed, language: detectedLanguage }
}
