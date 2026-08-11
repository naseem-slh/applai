import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRequest } from '../ai/provider'
import { ModelResponseError } from '../ai/modelJson'
import { computeSentenceLength, deriveStyleProfile, detectAddress, styleProfileToPromptFragment } from './styleProfile'
import type { StyleProfile } from './styleProfile'
import {
  ABBREVIATION_SENTENCE_FIXTURE,
  DU_COVER_LETTER_FIXTURE,
  NEUTRAL_COVER_LETTER_FIXTURE,
  SIE_COVER_LETTER_FIXTURE,
} from './styleProfile.fixtures'

/**
 * Abgefangener `LlmProvider`-Stub, identisch zum Muster aus `jobAd.test.ts`
 * (Aufgabe 9) — nie ein echter Netzwerkaufruf.
 */
function stubProvider(response: string | (() => string)): LlmProvider & { lastRequest?: LlmRequest } {
  const provider: LlmProvider & { lastRequest?: LlmRequest } = {
    id: 'gemini',
    label: 'Stub',
    endpoint: 'https://example.invalid',
    generate: (req) => {
      provider.lastRequest = req
      return Promise.resolve(typeof response === 'function' ? response() : response)
    },
  }
  return provider
}

// Zwei zusammenhängende, WÖRTLICHE Sätze aus SIE_COVER_LETTER_FIXTURE (nur
// die Zeilenumbrüche des Fließtexts sind zu Leerzeichen normalisiert — genau
// das, was ein Modell beim Abtippen ebenfalls tun würde).
const SIE_VERBATIM_SAMPLE =
  'Ihre Anzeige spricht mich besonders an, weil Sie großen Wert auf strukturiertes Arbeiten legen – genau das zeichnet mich aus. ' +
  'Gerne überzeuge ich Sie in einem persönlichen Gespräch von meiner Motivation.'

const DU_VERBATIM_SAMPLE =
  'Wenn du auf der Suche nach jemandem bist, der anpackt statt lange zu diskutieren, dann lass uns reden. ' +
  'Ich freue mich, dich und dein Team bald kennenzulernen!'

const VALID_SIE_RESPONSE = JSON.stringify({
  formality: 78,
  traits: ['nennt Ergebnisse mit konkreten Zahlen', 'kurze, direkte Einleitungssätze'],
  sample: SIE_VERBATIM_SAMPLE,
})

describe('computeSentenceLength', () => {
  it('berechnet die durchschnittliche Wortzahl pro Satz für zwei einfache Sätze', () => {
    expect(computeSentenceLength('Das ist ein Satz. Das ist noch ein Satz.')).toBe(4.5)
  })

  it('liefert 0 für einen leeren Text', () => {
    expect(computeSentenceLength('')).toBe(0)
  })

  it('liefert 0 für einen Text, der nur aus Leerraum besteht', () => {
    expect(computeSentenceLength('   \n  ')).toBe(0)
  })

  it('behandelt einen Doppelpunkt vor einer Aufzählung nicht als Satzende', () => {
    const text = 'Meine Kompetenzen sind: Teamarbeit, Kommunikation und Zeitmanagement. Ich freue mich auf das Gespräch.'
    // 2 echte Sätze (7 + 6 Wörter) = 13 / 2 = 6.5 – ein Doppelpunkt-Split hätte 3 "Sätze" ergeben.
    expect(computeSentenceLength(text)).toBe(6.5)
  })

  it('behandelt eine Ellipse nicht als eigenständigen zusätzlichen Satz', () => {
    const text = 'Ich habe lange gezögert... Aber dann habe ich mich entschieden.'
    // 2 echte Sätze (4 + 6 Wörter) = 10 / 2 = 5.0
    expect(computeSentenceLength(text)).toBe(5)
  })

  it('ignoriert Abkürzungen ("Dr.", "z. B.") und ein Tag-Monatsname-Datum ("15. März 2024") beim Zählen der Satzenden', () => {
    // Von Hand ausgezählt (siehe styleProfile.fixtures.ts): genau 3 echte
    // Sätze, 28 Wörter insgesamt → 9.3. Ein naiver Split auf jeden "."
    // würde 8 Fragmente liefern (u. a. "Frau Dr" / " Meier hat mich am 15" /
    // " März 2024 …" / " Themen waren z" / " B" / …) und einen Durchschnitt
    // von 28/8 = 3.5 vortäuschen – deutlich erkennbar falsch.
    expect(computeSentenceLength(ABBREVIATION_SENTENCE_FIXTURE)).toBe(9.3)
  })
})

describe('detectAddress', () => {
  it('erkennt ein "Sie"-Anschreiben trotz einer satzanfangsbedingten Großschreibung von "sie" (Firma statt Anrede)', () => {
    expect(detectAddress(SIE_COVER_LETTER_FIXTURE)).toBe('sie')
  })

  it('erkennt ein "du"-Anschreiben', () => {
    expect(detectAddress(DU_COVER_LETTER_FIXTURE)).toBe('du')
  })

  it('erkennt ein Anschreiben ganz ohne direkte Anrede als "none"', () => {
    expect(detectAddress(NEUTRAL_COVER_LETTER_FIXTURE)).toBe('none')
  })

  it('zählt ein großgeschriebenes "Sie" am Satzanfang NICHT als Höflichkeitsanrede, wenn es die einzige Fundstelle ist', () => {
    // "Sie" bezieht sich hier beide Male auf "Die Musterwerk GmbH" (die
    // Firma), ist aber jeweils nur wegen der Satzanfangsposition
    // großgeschrieben – keine echte Anrede der Leserin/des Lesers.
    const text =
      'Die Musterwerk GmbH wurde 1998 gegründet. Sie beschäftigt heute über 300 Mitarbeitende in ganz Deutschland. ' +
      'Sie exportiert ihre Produkte in über 20 Länder.'
    expect(detectAddress(text)).toBe('none')
  })

  it('liefert "none" bei einem Unentschieden zwischen "Sie"- und "du"-Treffern', () => {
    const text = 'Ich habe Ihre Anzeige gelesen. Kannst du mir mehr erzählen?'
    expect(detectAddress(text)).toBe('none')
  })

  it('liefert "none" für einen leeren Text', () => {
    expect(detectAddress('')).toBe('none')
  })
})

describe('deriveStyleProfile', () => {
  it('parst eine gültige Modellantwort zu einem vollständigen StyleProfile (Sie-Anschreiben)', async () => {
    const provider = stubProvider(VALID_SIE_RESPONSE)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')

    expect(result.formality).toBe(78)
    expect(result.address).toBe('sie')
    expect(result.sentenceLength).toBeGreaterThan(0)
    expect(result.traits).toEqual(['nennt Ergebnisse mit konkreten Zahlen', 'kurze, direkte Einleitungssätze'])
    expect(result.sample).toBe(SIE_VERBATIM_SAMPLE)
  })

  it('berechnet sentenceLength und address deterministisch, nicht aus der Modellantwort', async () => {
    // Die Modellantwort enthält gar kein sentenceLength/address-Feld –
    // wäre eines davon irrtümlich vom Modell erwartet, würde das Parsen
    // hier bereits scheitern.
    const provider = stubProvider(VALID_SIE_RESPONSE)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.sentenceLength).toBe(computeSentenceLength(SIE_COVER_LETTER_FIXTURE))
    expect(result.address).toBe(detectAddress(SIE_COVER_LETTER_FIXTURE))
  })

  it('fordert eine JSON-Antwort vom Provider an (json: true)', async () => {
    const provider = stubProvider(VALID_SIE_RESPONSE)
    await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(provider.lastRequest?.json).toBe(true)
  })

  it('übergibt den Anschreiben-Text unverändert im Nutzer-Prompt', async () => {
    const provider = stubProvider(VALID_SIE_RESPONSE)
    await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(provider.lastRequest?.user).toContain(SIE_COVER_LETTER_FIXTURE)
  })

  it('erkennt die Sprache des Anschreibens deterministisch und trägt sie in den Systemprompt ein', async () => {
    const englishLetter =
      'Dear Hiring Team,\n\nI was excited to see your job posting and believe my background is a strong match. ' +
      'I would welcome the opportunity to discuss this further.\n\nBest regards,\nAlex Berger'
    const provider = stubProvider(
      JSON.stringify({
        formality: 60,
        traits: ['uses concise sentences'],
        sample: 'I was excited to see your job posting and believe my background is a strong match. I would welcome the opportunity to discuss this further.',
      }),
    )
    await deriveStyleProfile(englishLetter, provider, 'test-key')
    expect(provider.lastRequest?.system).toContain('"en"')
  })

  it('wirft bei fehlerhaftem/abgeschnittenem JSON eine ModelResponseError', async () => {
    const provider = stubProvider('{"formality": 70, "traits": ["x"')
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('wirft eine verständliche Fehlermeldung mit Feldnamen bei fehlendem Pflichtfeld', async () => {
    const raw = JSON.stringify({ formality: 70, traits: ['x'] }) // "sample" fehlt
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(/sample/)
  })

  it('ignoriert eine Modellantwort in einem Markdown-Codeblock', async () => {
    const provider = stubProvider('```json\n' + VALID_SIE_RESPONSE + '\n```')
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(78)
  })

  it('lässt ein unerwartetes Zusatzfeld der Modellantwort unbeanstandet, statt zu scheitern', async () => {
    const withExtraField = JSON.stringify({ ...JSON.parse(VALID_SIE_RESPONSE), confidence: 0.91 })
    const provider = stubProvider(withExtraField)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(78)
  })

  // ---------------------------------------------------------------------
  // G10 hat hier "echte Zähne" (Auftrag): "sample" MUSS wörtlich im
  // Original stehen. Eine Modellantwort mit einem nicht enthaltenen
  // "sample" wird verworfen, nicht stillschweigend übernommen.
  // ---------------------------------------------------------------------
  it('wirft eine ModelResponseError, wenn "sample" nicht wörtlich im Original vorkommt (G10)', async () => {
    const raw = JSON.stringify({
      formality: 70,
      traits: ['wirkt zielstrebig'],
      sample: 'Dieser Satz steht so nicht im Originalanschreiben und wurde erfunden.',
    })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(/sample/i)
  })

  it('akzeptiert ein "sample", dessen Zeilenumbrüche im Original von den Leerzeichen der Modellantwort abweichen', async () => {
    // SIE_VERBATIM_SAMPLE hat Leerzeichen an Stellen, an denen die Fixture
    // umgebrochene Zeilen hat – die Rundlauf-Normalisierung muss das
    // gleichsetzen, statt fälschlich "nicht wörtlich" zu melden.
    const provider = stubProvider(VALID_SIE_RESPONSE)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.sample).toBe(SIE_VERBATIM_SAMPLE)
  })

  // ---------------------------------------------------------------------
  // "formality" außerhalb 0–100 ist eine Schema-Verletzung, kein Zufallswert.
  // ---------------------------------------------------------------------
  it('wirft eine ModelResponseError, wenn "formality" über 100 liegt', async () => {
    const raw = JSON.stringify({ formality: 150, traits: ['x'], sample: SIE_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('wirft eine ModelResponseError, wenn "formality" negativ ist', async () => {
    const raw = JSON.stringify({ formality: -5, traits: ['x'], sample: SIE_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  // ---------------------------------------------------------------------
  // formality ↔ address-Kohärenzprüfung (Auftrag: "a du-letter scoring 95
  // is incoherent... make it explicit and testable, not a silent clamp").
  // Nur in RICHTUNG "du" + sehr hohe formality geprüft, siehe Bericht.
  // ---------------------------------------------------------------------
  it('wirft eine ModelResponseError, wenn ein "du"-Anschreiben eine formality weit über der du-Grenze bekommt (widerspricht der Prompt-Ankerdefinition)', async () => {
    const raw = JSON.stringify({ formality: 96, traits: ['x'], sample: DU_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    await expect(deriveStyleProfile(DU_COVER_LETTER_FIXTURE, provider, 'test-key')).rejects.toThrow(ModelResponseError)
  })

  it('akzeptiert eine moderate formality für ein "du"-Anschreiben (kein Widerspruch, keine Ausnahme)', async () => {
    const raw = JSON.stringify({ formality: 60, traits: ['x'], sample: DU_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    const result = await deriveStyleProfile(DU_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(60)
  })

  it('akzeptiert eine niedrige formality für ein "Sie"-Anschreiben (keine Prüfung in dieser Richtung)', async () => {
    const raw = JSON.stringify({ formality: 10, traits: ['x'], sample: SIE_VERBATIM_SAMPLE })
    const provider = stubProvider(raw)
    const result = await deriveStyleProfile(SIE_COVER_LETTER_FIXTURE, provider, 'test-key')
    expect(result.formality).toBe(10)
  })
})

describe('styleProfileToPromptFragment', () => {
  const baseProfile: StyleProfile = {
    formality: 75,
    sentenceLength: 14.2,
    address: 'sie',
    traits: ['nennt Ergebnisse mit konkreten Zahlen', 'kurze Einleitungssätze'],
    sample: SIE_VERBATIM_SAMPLE,
  }

  it('enthält alle fünf Profilfelder', () => {
    const fragment = styleProfileToPromptFragment(baseProfile)
    expect(fragment).toContain('75')
    expect(fragment).toContain('14.2')
    expect(fragment.toLowerCase()).toMatch(/sie/i)
    expect(fragment).toContain('nennt Ergebnisse mit konkreten Zahlen')
    expect(fragment).toContain('kurze Einleitungssätze')
    expect(fragment).toContain(SIE_VERBATIM_SAMPLE)
  })

  it('ändert sich sichtbar, wenn sich formality ändert', () => {
    const locker = styleProfileToPromptFragment({ ...baseProfile, formality: 10 })
    const foermlich = styleProfileToPromptFragment({ ...baseProfile, formality: 90 })
    expect(locker).not.toBe(foermlich)
    expect(locker).toContain('10')
    expect(foermlich).toContain('90')
  })

  it('ändert sich sichtbar, wenn sich sentenceLength ändert', () => {
    const kurz = styleProfileToPromptFragment({ ...baseProfile, sentenceLength: 6 })
    const lang = styleProfileToPromptFragment({ ...baseProfile, sentenceLength: 28 })
    expect(kurz).not.toBe(lang)
    expect(kurz).toContain('6')
    expect(lang).toContain('28')
  })

  it('ändert sich sichtbar, wenn sich address ändert', () => {
    const sie = styleProfileToPromptFragment({ ...baseProfile, address: 'sie' })
    const du = styleProfileToPromptFragment({ ...baseProfile, address: 'du' })
    const none = styleProfileToPromptFragment({ ...baseProfile, address: 'none' })
    expect(new Set([sie, du, none]).size).toBe(3)
  })

  it('klemmt eine per Regler über 100 hinaus verschobene formality auf 100, statt sie unverändert auszugeben', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, formality: 130 })
    expect(fragment).toContain('100')
    expect(fragment).not.toContain('130')
  })

  it('klemmt eine negative formality auf 0', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, formality: -20 })
    expect(fragment).toContain('0/100')
  })

  it('klemmt eine negative sentenceLength auf 0, statt sie unverändert auszugeben', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, sentenceLength: -5 })
    expect(fragment).not.toContain('-5')
  })

  it('fällt bei einer nicht-endlichen formality (NaN) auf einen neutralen Wert zurück, statt NaN auszugeben', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, formality: Number.NaN })
    expect(fragment).not.toContain('NaN')
  })

  it('zeigt einen Platzhaltertext, wenn traits leer ist, statt einen leeren Abschnitt zu erzeugen', () => {
    const fragment = styleProfileToPromptFragment({ ...baseProfile, traits: [] })
    expect(fragment.length).toBeGreaterThan(0)
    expect(fragment).toMatch(/keine|kein/i)
  })

  it('bricht bei einem ungültigen, handbearbeiteten address-Wert nicht ab, sondern fällt sicher zurück', () => {
    const tampered = { ...baseProfile, address: 'invalid' } as unknown as StyleProfile
    expect(() => styleProfileToPromptFragment(tampered)).not.toThrow()
  })
})
