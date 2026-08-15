import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRequest } from '../ai/provider'
import { ModelResponseError } from '../ai/modelJson'
import type { AnonymizationSettings } from '../privacy/withAnonymization'
import type { JobAd } from './jobAd'
import { analyzeGaps } from './gaps'

/**
 * Tests für `analyzeGaps` (Aufgabe 12) — immer gegen einen abgefangenen
 * `LlmProvider`, nie gegen ein echtes Netz (Muster aus
 * `jobAd.test.ts`/`rewrite.test.ts`).
 */
function stubProvider(...antworten: string[]): LlmProvider & { requests: LlmRequest[] } {
  const provider: LlmProvider & { requests: LlmRequest[] } = {
    id: 'gemini',
    label: 'Stub',
    model: 'test-modell',
    endpoint: 'https://example.invalid',
    requests: [],
    generate: (req) => {
      provider.requests.push(req)
      const antwort = antworten[provider.requests.length - 1]
      if (antwort === undefined) {
        return Promise.reject(new Error(`Stub: keine Antwort für Aufruf ${provider.requests.length} hinterlegt`))
      }
      return Promise.resolve(antwort)
    },
  }
  return provider
}

const JOB_AD: JobAd = {
  language: 'de',
  company: 'Musterwerk Solutions GmbH',
  position: 'Teamleitung Disposition',
  contactPerson: null,
  salutation: null,
  requirements: [
    { text: 'Mehrjährige Führungserfahrung', kind: 'experience' },
    { text: 'Kenntnisse in der Tourenplanung', kind: 'skill' },
    { text: 'Verhandlungssichere Englischkenntnisse', kind: 'language' },
  ],
  tone: 'sachlich und direkt',
}

const FACTS = `Lebenslauf
Name: Max Mustermann
E-Mail: max.mustermann@beispiel.de

Berufserfahrung
2021 bis 2024 Teamleitung Disposition bei einem Logistikdienstleister, fachliche Führung von fünf Mitarbeitenden
2017 bis 2021 Sachbearbeitung Disposition`

const PRIVAT_AN: AnonymizationSettings = { enabled: true, userName: 'Max Mustermann' }
const PRIVAT_AUS: AnonymizationSettings = { enabled: false, userName: 'Max Mustermann' }

function antwort(
  eintraege: Array<{ index: number; status: 'covered' | 'partial' | 'missing'; evidence?: string | null }>,
): string {
  return JSON.stringify({
    assessments: eintraege.map((e) => ({
      index: e.index,
      status: e.status,
      evidence: e.evidence ?? (e.status === 'missing' ? null : 'Beleg'),
    })),
  })
}

const VOLLSTAENDIGE_ANTWORT = antwort([
  { index: 0, status: 'covered', evidence: 'Drei Jahre Teamleitung Disposition mit fachlicher Führung von fünf Mitarbeitenden.' },
  { index: 1, status: 'partial', evidence: 'Erfahrung in der Disposition, aber keine ausdrückliche Tourenplanung genannt.' },
  { index: 2, status: 'missing' },
])

describe('analyzeGaps — genau ein Eintrag pro Anforderung, in Eingabereihenfolge', () => {
  it('liefert genau einen Eintrag pro Anforderung in der Reihenfolge der Eingabe', async () => {
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    const result = await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)

    expect(result).toHaveLength(3)
    expect(result[0]?.requirement).toEqual(JOB_AD.requirements[0])
    expect(result[1]?.requirement).toEqual(JOB_AD.requirements[1])
    expect(result[2]?.requirement).toEqual(JOB_AD.requirements[2])
    expect(result[0]?.status).toBe('covered')
    expect(result[1]?.status).toBe('partial')
    expect(result[2]?.status).toBe('missing')
    expect(result[2]?.evidence).toBeNull()
  })

  it('ordnet eine unsortiert zurückgegebene Antwort korrekt der Eingabereihenfolge zu', async () => {
    const durcheinander = antwort([
      { index: 2, status: 'missing' },
      { index: 0, status: 'covered', evidence: 'Beleg für Punkt 0' },
      { index: 1, status: 'partial', evidence: 'Beleg für Punkt 1' },
    ])
    const provider = stubProvider(durcheinander)
    const result = await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)

    expect(result[0]?.requirement.text).toBe('Mehrjährige Führungserfahrung')
    expect(result[0]?.status).toBe('covered')
    expect(result[2]?.requirement.text).toBe('Verhandlungssichere Englischkenntnisse')
    expect(result[2]?.status).toBe('missing')
  })

  it('kein Eintrag enthält irgendeinen Zahlenwert – nur requirement, status und evidence', async () => {
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    const result = await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)

    for (const entry of result) {
      expect(Object.keys(entry).sort()).toEqual(['evidence', 'requirement', 'status'])
    }
  })

  it('scheitert, wenn das Modell zu wenige Einträge liefert', async () => {
    const zuWenig = antwort([
      { index: 0, status: 'covered', evidence: 'Beleg' },
      { index: 1, status: 'missing' },
    ])
    const provider = stubProvider(zuWenig)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('scheitert, wenn das Modell zu viele Einträge liefert', async () => {
    const zuViel = antwort([
      { index: 0, status: 'covered', evidence: 'Beleg' },
      { index: 1, status: 'partial', evidence: 'Beleg' },
      { index: 2, status: 'missing' },
      { index: 3, status: 'missing' },
    ])
    const provider = stubProvider(zuViel)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('scheitert, wenn ein Index doppelt vorkommt (auch bei korrekter Anzahl)', async () => {
    const doppelterIndex = antwort([
      { index: 0, status: 'covered', evidence: 'Beleg' },
      { index: 0, status: 'partial', evidence: 'Beleg' },
      { index: 2, status: 'missing' },
    ])
    const provider = stubProvider(doppelterIndex)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('scheitert, wenn ein Index außerhalb des gültigen Bereichs liegt', async () => {
    const ungueltigerIndex = antwort([
      { index: 0, status: 'covered', evidence: 'Beleg' },
      { index: 1, status: 'partial', evidence: 'Beleg' },
      { index: 7, status: 'missing' },
    ])
    const provider = stubProvider(ungueltigerIndex)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('liefert bei einer Stellenanzeige ganz ohne Anforderungen eine leere Liste, ohne das Modell zu rufen', async () => {
    const provider = stubProvider()
    const result = await analyzeGaps({ ...JOB_AD, requirements: [] }, FACTS, provider, 'k', PRIVAT_AUS)
    expect(result).toEqual([])
    expect(provider.requests).toHaveLength(0)
  })
})

describe('analyzeGaps — Modellantwort und Schema', () => {
  it('fordert eine JSON-Antwort an (json: true)', async () => {
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)
    expect(provider.requests[0]?.json).toBe(true)
  })

  it('wirft bei fehlerhaftem/abgeschnittenem JSON eine ModelResponseError', async () => {
    const provider = stubProvider('{"assessments":[{"index":0,"stat')
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('lehnt einen ungültigen status-Wert ab', async () => {
    const raw = JSON.stringify({
      assessments: [
        { index: 0, status: 'fully', evidence: 'Beleg' },
        { index: 1, status: 'missing', evidence: null },
        { index: 2, status: 'missing', evidence: null },
      ],
    })
    const provider = stubProvider(raw)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('lehnt eine leere evidence-Zeichenkette ab statt sie stillschweigend zu übernehmen', async () => {
    const raw = JSON.stringify({
      assessments: [
        { index: 0, status: 'covered', evidence: '' },
        { index: 1, status: 'missing', evidence: null },
        { index: 2, status: 'missing', evidence: null },
      ],
    })
    const provider = stubProvider(raw)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('lehnt "covered" ohne evidence ab – eine unbelegte Deckung wird nicht stillschweigend übernommen', async () => {
    const raw = JSON.stringify({
      assessments: [
        { index: 0, status: 'covered', evidence: null },
        { index: 1, status: 'missing', evidence: null },
        { index: 2, status: 'missing', evidence: null },
      ],
    })
    const provider = stubProvider(raw)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('lehnt "missing" MIT evidence ab – ohne Deckung gibt es nichts zu belegen', async () => {
    const raw = JSON.stringify({
      assessments: [
        { index: 0, status: 'covered', evidence: 'Beleg' },
        { index: 1, status: 'partial', evidence: 'Beleg' },
        { index: 2, status: 'missing', evidence: 'Doch ein Beleg' },
      ],
    })
    const provider = stubProvider(raw)
    await expect(analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('ignoriert eine Modellantwort in einem Markdown-Codeblock', async () => {
    const provider = stubProvider('```json\n' + VOLLSTAENDIGE_ANTWORT + '\n```')
    const result = await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)
    expect(result).toHaveLength(3)
  })
})

describe('analyzeGaps — Anonymisierung', () => {
  it('ersetzt persönliche Daten in der Faktenbasis vor dem Senden und tauscht sie in evidence zurück', async () => {
    const mitPlatzhalter = antwort([
      { index: 0, status: 'covered', evidence: 'Laut Lebenslauf war [NAME] drei Jahre in der Teamleitung tätig.' },
      { index: 1, status: 'missing' },
      { index: 2, status: 'missing' },
    ])
    const provider = stubProvider(mitPlatzhalter)
    const result = await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AN)

    const gesendet = provider.requests[0]?.user ?? ''
    expect(gesendet).toContain('[NAME]')
    expect(gesendet).not.toContain('Max Mustermann')

    expect(result[0]?.evidence).toBe('Laut Lebenslauf war Max Mustermann drei Jahre in der Teamleitung tätig.')
  })

  it('sendet bei abgeschalteter Anonymisierung den Klartext', async () => {
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)
    expect(provider.requests[0]?.user).toContain('Max Mustermann')
  })

  it('anonymisiert die Stellenanzeige nicht – Firma und Position gehören zur Anzeige, nicht zum Nutzer', async () => {
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AN)
    // Anforderungen (aus der Anzeige) stehen unverändert im Prompt, auch bei
    // eingeschalteter Anonymisierung – die Anzeige selbst wird nicht anonymisiert.
    expect(provider.requests[0]?.user).toContain('Mehrjährige Führungserfahrung')
  })
})

describe('analyzeGaps — Prompt-Inhalt', () => {
  it('übergibt jede Anforderung an den Prompt', async () => {
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    await analyzeGaps(JOB_AD, FACTS, provider, 'k', PRIVAT_AUS)
    const user = provider.requests[0]?.user ?? ''
    expect(user).toContain('Mehrjährige Führungserfahrung')
    expect(user).toContain('Kenntnisse in der Tourenplanung')
    expect(user).toContain('Verhandlungssichere Englischkenntnisse')
  })

  it('trägt die Sprache der englischen Anzeige in den Prompt ein', async () => {
    const englischeAnzeige: JobAd = { ...JOB_AD, language: 'en' }
    const provider = stubProvider(VOLLSTAENDIGE_ANTWORT)
    await analyzeGaps(englischeAnzeige, FACTS, provider, 'k', PRIVAT_AUS)
    expect(provider.requests[0]?.system).toContain('Englisch')
  })
})
