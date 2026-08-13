import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, Route } from '@playwright/test'
import de from '../src/lib/i18n/locales/de.json' with { type: 'json' }

/**
 * Gemeinsames Rüstzeug der Ende-zu-Ende-Tests.
 *
 * **Die Oberflächentexte kommen aus derselben Datei wie die Oberfläche.**
 * Ein e2e-Test, der „Weiter" als Zeichenkette hineinschreibt, prüft am Ende
 * die eigene Kopie und bricht bei jeder Umformulierung — obwohl sich am
 * Verhalten nichts geändert hat. Über `t()` bricht er genau dann, wenn ein
 * Schlüssel verschwindet, und das ist ein echter Fund (G8).
 *
 * **Die Sprache ist fest Deutsch.** Die Anwendung wählt nach der
 * Browsersprache vor; Playwright startet je nach Maschine mit einer anderen.
 * `setLocale` setzt sie deshalb explizit.
 */

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures')

/** Auflösung eines Übersetzungsschlüssels, wie i18next sie vornimmt. */
export function t(path: string, values: Record<string, string | number> = {}): string {
  let node: unknown = resolve(path)

  // Mehrzahl wie i18next: Steht unter dem Schlüssel selbst nichts, entscheidet
  // `count` zwischen `_one` und `_other`. Ohne das wären alle gezählten Texte
  // aus dem Ende-zu-Ende-Test ausgesperrt.
  if (typeof node !== 'string' && typeof values.count === 'number') {
    node = resolve(`${path}_${values.count === 1 ? 'one' : 'other'}`)
  }

  if (typeof node !== 'string') {
    throw new Error(`Übersetzungsschlüssel "${path}" fehlt oder ist kein Text.`)
  }
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    node,
  )
}

/** Ein punktgetrennter Pfad in den deutschen Texten. */
function resolve(path: string): unknown {
  let node: unknown = de
  for (const key of path.split('.')) {
    if (node === undefined || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

// ---------------------------------------------------------------------------
// Abgefangene Modellantworten
// ---------------------------------------------------------------------------

const GEMINI_PATTERN = 'https://generativelanguage.googleapis.com/**'

export const JOB_AD_TEXT = `Stellenanzeige: Entwicklerin (m/w/d)

Die Musterwerk Solutions GmbH in Leipzig sucht eine Entwicklerin.

Dein Profil:
- Sehr gute Kenntnisse in TypeScript
- Mehrjährige Erfahrung in der Frontend-Entwicklung

Wir freuen uns auf deine Bewerbung.`

const JOB_AD_REPLY = {
  language: 'de',
  company: 'Musterwerk Solutions',
  position: 'Entwicklerin',
  contactPerson: null,
  salutation: null,
  requirements: [{ text: 'Sehr gute Kenntnisse in TypeScript', kind: 'skill' }],
  tone: 'sachlich',
}

/** Muss wörtlich im Anschreiben der Fixture stehen (Aufgabe 10 prüft das). */
const STYLE_REPLY = {
  formality: 70,
  traits: ['knappe Hauptsätze'],
  sample: 'ich bewerbe mich hiermit um die ausgeschriebene Stelle.',
}

export const VARIANT_TEXT = 'Ich bewerbe mich mit großer Freude um die ausgeschriebene Stelle.'

const REWRITE_REPLY = {
  variants: [
    { text: VARIANT_TEXT, unbackedClaims: [] },
    { text: 'Auf die ausgeschriebene Stelle bewerbe ich mich sehr gern.', unbackedClaims: [] },
    { text: 'Die ausgeschriebene Stelle passt genau zu meinem Weg.', unbackedClaims: [] },
  ],
}

const GAPS_REPLY = {
  assessments: [{ index: 0, status: 'covered', evidence: 'Im Anschreiben genannt' }],
}

function geminiBody(payload: unknown): string {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: 'STOP' }],
  })
}

/**
 * Fängt jeden Anbieteraufruf ab und antwortet anhand des Systemprompts.
 *
 * Abgefangen wird auf der Netzebene, nicht durch ein Verstellen der
 * Domänenfunktionen: Damit läuft in diesem Test alles mit, was die
 * Anwendung tatsächlich tut — Anonymisierung, Anbieter-Adapter, Zod-Grenze
 * und die Prüfungen der Aufgaben 9 bis 12. Zugleich zeigt jeder Aufruf, der
 * hier ankommt, dass die CSP ihn durchgelassen hat (G3).
 */
export async function stubProvider(page: Page): Promise<{ requests: string[] }> {
  const requests: string[] = []

  await page.route(GEMINI_PATTERN, async (route: Route) => {
    const body = route.request().postDataJSON() as {
      systemInstruction: { parts: { text: string }[] }
      contents: { parts: { text: string }[] }[]
    }
    const system = body.systemInstruction.parts[0]!.text
    requests.push(body.contents[0]!.parts[0]!.text)

    const payload = system.startsWith('Du analysierst eine Stellenanzeige')
      ? JOB_AD_REPLY
      : system.startsWith('Du analysierst den Schreibstil')
        ? STYLE_REPLY
        : system.startsWith('Du prüfst')
          ? GAPS_REPLY
          : REWRITE_REPLY

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: geminiBody(payload),
    })
  })

  return { requests }
}

// ---------------------------------------------------------------------------
// Wege durch die Oberfläche
// ---------------------------------------------------------------------------

/** Datenschutzhinweis bestätigen und einen kostenlosen Gemini-Schlüssel hinterlegen. */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: t('onboarding.privacy.accept') }).click()

  // `exact`, weil der Abschnitt „API-Schlüssel einrichten" heißt und eine
  // unscharfe Suche beide träfe.
  await page.getByLabel(t('onboarding.key.apiKeyLabel'), { exact: true }).fill('AIzaTestSchluessel')

  // Radix' Auswahlliste öffnet auf `pointerdown`.
  await page.getByRole('combobox', { name: t('onboarding.key.billingLabel') }).click()
  await page.getByRole('option', { name: t('onboarding.key.billingFree') }).click()

  await page.getByRole('button', { name: t('onboarding.key.submit') }).click()
  await page.getByRole('heading', { name: t('start.documents.heading') }).waitFor()
}

/** Anschreiben, Name und Stellenausschreibung eintragen und weitergehen. */
export async function fillStartPage(page: Page, jobAdText = JOB_AD_TEXT): Promise<void> {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(join(FIXTURES_DIR, 'anschreiben.docx'))
  await page.getByText(t('start.files.loaded', { name: 'anschreiben.docx' })).waitFor()

  await page.getByLabel(t('start.name.label'), { exact: true }).fill('Marlene Ostwald')
  await page.getByLabel(t('start.jobAd.label'), { exact: true }).fill(jobAdText)

  await page.getByRole('button', { name: t('start.continue') }).click()
}

/** Wartet, bis Anzeige und Stilprofil ausgewertet sind. */
export async function waitForAnalysis(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: t('editor.document.heading') }).waitFor()
  await page.getByText(t('editor.analysis.loading')).waitFor({ state: 'detached' })
}
