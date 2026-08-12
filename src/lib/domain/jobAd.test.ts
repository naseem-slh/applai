import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRequest } from '../ai/provider'
import { ModelResponseError } from '../ai/modelJson'
import { analyzeJobAd, JobAdSchema } from './jobAd'
import { ENGLISH_JOB_AD_FIXTURE, GERMAN_JOB_AD_FIXTURE } from './jobAd.fixtures'

/**
 * Abgefangener `LlmProvider`-Stub für alle Tests hier — nie ein echter
 * Netzwerkaufruf (siehe Aufgabenstellung: "Test zuerst gegen eine
 * abgefangene Antwort"). `capturedRequest` erlaubt Tests, die den
 * tatsächlich gesendeten Prompt prüfen wollen.
 */
function stubProvider(response: string | (() => string)): LlmProvider & { lastRequest?: LlmRequest } {
  const provider: LlmProvider & { lastRequest?: LlmRequest } = {
    id: 'gemini',
    label: 'Stub',
    model: 'test-modell',
    endpoint: 'https://example.invalid',
    generate: (req) => {
      provider.lastRequest = req
      return Promise.resolve(typeof response === 'function' ? response() : response)
    },
  }
  return provider
}

const VALID_GERMAN_RESPONSE = JSON.stringify({
  language: 'de',
  company: 'Musterwerk Solutions GmbH',
  position: 'Senior Frontend-Entwicklerin / Senior Frontend-Entwickler (m/w/d)',
  contactPerson: 'Dr. Thomas Weber',
  salutation: 'Sehr geehrter Herr Dr. Weber',
  requirements: [
    { text: 'Mindestens 4 Jahre Berufserfahrung in der Frontend-Entwicklung', kind: 'experience' },
    { text: 'Sehr gute Kenntnisse in React und TypeScript', kind: 'skill' },
    { text: 'Abgeschlossenes Studium der Informatik oder vergleichbar', kind: 'education' },
    { text: 'Verhandlungssichere Deutschkenntnisse, gute Englischkenntnisse', kind: 'language' },
    { text: 'Teamfähigkeit und strukturierte Arbeitsweise', kind: 'soft' },
  ],
  tone: 'locker und kollegial, duzt die Bewerbenden',
})

const VALID_ENGLISH_RESPONSE = JSON.stringify({
  language: 'en',
  company: 'Brightleaf Analytics Inc.',
  position: 'Senior Backend Engineer',
  contactPerson: 'Sarah Connolly',
  salutation: 'Dear Ms. Connolly',
  requirements: [
    { text: '5+ years of professional backend development experience', kind: 'experience' },
    { text: 'Strong knowledge of distributed systems and relational databases', kind: 'skill' },
  ],
  tone: 'professional and collaborative',
})

describe('analyzeJobAd', () => {
  it('parst eine gültige, vollständige Modellantwort zu JobAd', async () => {
    const provider = stubProvider(VALID_GERMAN_RESPONSE)
    const result = await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')

    expect(result.language).toBe('de')
    expect(result.company).toBe('Musterwerk Solutions GmbH')
    expect(result.position).toBe('Senior Frontend-Entwicklerin / Senior Frontend-Entwickler (m/w/d)')
    expect(result.contactPerson).toBe('Dr. Thomas Weber')
    expect(result.salutation).toBe('Sehr geehrter Herr Dr. Weber')
    expect(result.requirements).toHaveLength(5)
    expect(result.requirements[0]).toEqual({
      text: 'Mindestens 4 Jahre Berufserfahrung in der Frontend-Entwicklung',
      kind: 'experience',
    })
    expect(result.tone).toBe('locker und kollegial, duzt die Bewerbenden')
  })

  it('parst eine gültige englische Modellantwort zu JobAd', async () => {
    const provider = stubProvider(VALID_ENGLISH_RESPONSE)
    const result = await analyzeJobAd(ENGLISH_JOB_AD_FIXTURE, provider, 'test-key')

    expect(result.language).toBe('en')
    expect(result.company).toBe('Brightleaf Analytics Inc.')
    expect(result.salutation).toBe('Dear Ms. Connolly')
  })

  it('fordert eine JSON-Antwort vom Provider an (json: true)', async () => {
    const provider = stubProvider(VALID_GERMAN_RESPONSE)
    await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')
    expect(provider.lastRequest?.json).toBe(true)
  })

  it('übergibt den Anzeigentext unverändert im Nutzer-Prompt', async () => {
    const provider = stubProvider(VALID_GERMAN_RESPONSE)
    await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')
    expect(provider.lastRequest?.user).toContain(GERMAN_JOB_AD_FIXTURE)
  })

  it('macht fehlende company/position/contactPerson/salutation zu null statt zu erfundenen Werten', async () => {
    const raw = JSON.stringify({
      language: 'de',
      company: null,
      position: null,
      contactPerson: null,
      salutation: null,
      requirements: [],
      tone: 'sachlich',
    })
    const provider = stubProvider(raw)
    const result = await analyzeJobAd('anonyme Anzeige', provider, 'test-key')

    expect(result.company).toBeNull()
    expect(result.position).toBeNull()
    expect(result.contactPerson).toBeNull()
    expect(result.salutation).toBeNull()
  })

  it('akzeptiert eine leere requirements-Liste als echtes Ergebnis, nicht als Fehler', async () => {
    const raw = JSON.stringify({
      language: 'de',
      company: null,
      position: null,
      contactPerson: null,
      salutation: null,
      requirements: [],
      tone: 'sachlich',
    })
    const provider = stubProvider(raw)
    const result = await analyzeJobAd('anonyme Anzeige', provider, 'test-key')
    expect(result.requirements).toEqual([])
  })

  it('wirft bei fehlerhaftem/abgeschnittenem JSON eine ModelResponseError statt stillschweigend zu erfinden', async () => {
    const provider = stubProvider('{"language":"de","company":"Ac')
    await expect(analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('wirft eine verständliche Fehlermeldung mit Feldnamen bei fehlendem Pflichtfeld (z. B. vertipptem Feldnamen)', async () => {
    const raw = JSON.stringify({
      language: 'de',
      compnay: 'Tippfehler GmbH', // absichtlicher Tippfehler statt "company"
      position: null,
      contactPerson: null,
      salutation: null,
      requirements: [],
      tone: 'sachlich',
    })
    const provider = stubProvider(raw)
    await expect(analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')).rejects.toThrow(/company/)
  })

  it('ignoriert eine Modellantwort in einem Markdown-Codeblock', async () => {
    const provider = stubProvider('```json\n' + VALID_GERMAN_RESPONSE + '\n```')
    const result = await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')
    expect(result.company).toBe('Musterwerk Solutions GmbH')
  })

  it('ignoriert Fließtext vor der JSON-Antwort', async () => {
    const provider = stubProvider(`Gerne, hier ist die Analyse:\n${VALID_GERMAN_RESPONSE}`)
    const result = await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')
    expect(result.company).toBe('Musterwerk Solutions GmbH')
  })

  it('lässt ein unerwartetes Zusatzfeld der Modellantwort unbeanstandet, statt zu scheitern', async () => {
    const withExtraField = JSON.stringify({
      ...JSON.parse(VALID_GERMAN_RESPONSE),
      confidence: 0.92,
    })
    const provider = stubProvider(withExtraField)
    const result = await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')
    expect(result.company).toBe('Musterwerk Solutions GmbH')
    expect(result).not.toHaveProperty('confidence')
  })

  it('erzwingt salutation: null, wenn contactPerson null ist – auch wenn das Modell trotzdem eine Anrede erfindet', async () => {
    const raw = JSON.stringify({
      language: 'de',
      company: null,
      position: null,
      contactPerson: null,
      salutation: 'Sehr geehrte Damen und Herren', // G10-Verstoß: erfundene Anrede ohne Ansprechpartner
      requirements: [],
      tone: 'sachlich',
    })
    const provider = stubProvider(raw)
    await expect(analyzeJobAd('anonyme Anzeige', provider, 'test-key')).rejects.toThrow(/salutation/)
  })

  it('lässt salutation zu, wenn contactPerson gesetzt ist', () => {
    const parsed = JobAdSchema.safeParse({
      language: 'de',
      company: null,
      position: null,
      contactPerson: 'Dr. Thomas Weber',
      salutation: 'Sehr geehrter Herr Dr. Weber',
      requirements: [],
      tone: 'sachlich',
    })
    expect(parsed.success).toBe(true)
  })

  it('die deterministische Spracherkennung gewinnt über eine abweichende Modellangabe', async () => {
    // Modell behauptet fälschlich "en", der Anzeigentext ist eindeutig deutsch.
    const raw = JSON.stringify({ ...JSON.parse(VALID_GERMAN_RESPONSE), language: 'en' })
    const provider = stubProvider(raw)
    const result = await analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')
    expect(result.language).toBe('de')
  })

  it('behandelt eine leere Zeichenkette wie null bei company/position/contactPerson (kein erfundener Platzhalter)', () => {
    const parsed = JobAdSchema.safeParse({
      language: 'de',
      company: '',
      position: '   ',
      contactPerson: null,
      salutation: null,
      requirements: [],
      tone: 'sachlich',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.company).toBeNull()
    expect(parsed.data?.position).toBeNull()
  })

  it('lehnt einen unbekannten "kind"-Wert bei einer Anforderung mit Feldbezug ab', async () => {
    const raw = JSON.stringify({
      ...JSON.parse(VALID_GERMAN_RESPONSE),
      requirements: [{ text: 'Irgendwas', kind: 'requirement' }],
    })
    const provider = stubProvider(raw)
    await expect(analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')).rejects.toThrow(/kind/)
  })

  // ---------------------------------------------------------------------
  // Fix-Runde 1 (siehe task-9-report.md, Review-Fund "Critical"): ein
  // Modell, das statt JSON-`null` ein Platzhalterwort wie "unbekannt"
  // schreibt, darf nicht unbemerkt wie ein echter Firmenname/Ansprechpartner
  // durchgereicht werden.
  // ---------------------------------------------------------------------
  it('macht Platzhalterwörter statt null bei company/position/contactPerson/salutation zu echtem null (Ende-zu-Ende über analyzeJobAd)', async () => {
    const raw = JSON.stringify({
      language: 'de',
      company: 'N/A',
      position: 'unbekannt',
      contactPerson: '-',
      salutation: 'k.A.',
      requirements: [],
      tone: 'sachlich',
    })
    const provider = stubProvider(raw)
    const result = await analyzeJobAd('anonyme Anzeige', provider, 'test-key')

    expect(result.company).toBeNull()
    expect(result.position).toBeNull()
    expect(result.contactPerson).toBeNull()
    expect(result.salutation).toBeNull()
  })

  it('lässt einen Firmennamen, der zufällig ein Platzhalterwort als Teilstring enthält, unangetastet', () => {
    const parsed = JobAdSchema.safeParse({
      language: 'de',
      company: 'Unknown Origins GmbH',
      position: null,
      contactPerson: null,
      salutation: null,
      requirements: [],
      tone: 'sachlich',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.company).toBe('Unknown Origins GmbH')
  })

  it('lehnt eine Anforderung mit leerem "text" mit Feldbezug ab, statt sie stillschweigend zu übernehmen', async () => {
    const raw = JSON.stringify({
      ...JSON.parse(VALID_GERMAN_RESPONSE),
      requirements: [{ text: '', kind: 'skill' }],
    })
    const provider = stubProvider(raw)
    await expect(analyzeJobAd(GERMAN_JOB_AD_FIXTURE, provider, 'test-key')).rejects.toThrow(/text/)
  })
})
