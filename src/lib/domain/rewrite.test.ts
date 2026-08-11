import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRequest } from '../ai/provider'
import { ModelResponseError } from '../ai/modelJson'
import type { AnonymizationSettings } from '../privacy/withAnonymization'
import type { JobAd } from './jobAd'
import type { StyleProfile } from './styleProfile'
import { RewriteInputError, rewriteSelection } from './rewrite'
import type { RewriteRequest } from './rewrite'

/**
 * Tests für `rewriteSelection` (Aufgabe 11) — immer gegen einen
 * abgefangenen `LlmProvider`, nie gegen ein echtes Netz (Muster aus
 * `jobAd.test.ts`/`styleProfile.test.ts`, hier um eine Antwort-Warteschlange
 * erweitert, weil der Übersetzungsweg zwei Aufrufe macht).
 */
function stubProvider(...antworten: string[]): LlmProvider & { requests: LlmRequest[] } {
  const provider: LlmProvider & { requests: LlmRequest[] } = {
    id: 'gemini',
    label: 'Stub',
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
  ],
  tone: 'sachlich und direkt',
}

const STYLE: StyleProfile = {
  formality: 70,
  sentenceLength: 14,
  address: 'sie',
  traits: ['nennt Ergebnisse mit konkreten Zahlen', 'kurze Einleitungssätze'],
  sample: 'Ihre Anzeige hat mich sofort angesprochen. Ich bringe die geforderte Erfahrung mit.',
}

const FACTS = `Lebenslauf
Name: Max Mustermann
E-Mail: max.mustermann@beispiel.de
Telefon: (030) 12 34 56

Berufserfahrung
2021 bis 2024 Teamleitung Disposition bei einem Logistikdienstleister, fachliche Führung von fünf Mitarbeitenden
2017 bis 2021 Sachbearbeitung Disposition`

const SELECTION = 'Ich habe drei Jahre lang ein Team von fünf Personen geführt.'
const CONTEXT_BEFORE =
  'Nach meinem Studium der Betriebswirtschaft bin ich in die Logistikbranche gewechselt und habe dort früh Verantwortung übernommen.'
const CONTEXT_AFTER =
  'Diese Erfahrung möchte ich nun in Ihrem Unternehmen einbringen und gemeinsam mit Ihrem Team weiter ausbauen.'

const BASIS: RewriteRequest = {
  selection: SELECTION,
  contextBefore: CONTEXT_BEFORE,
  contextAfter: CONTEXT_AFTER,
  jobAd: JOB_AD,
  style: STYLE,
  truthMode: 'strict',
  facts: FACTS,
  targetLanguage: 'de',
  sliders: { formality: 70, length: 50 },
}

const PRIVAT_AN: AnonymizationSettings = { enabled: true, userName: 'Max Mustermann' }
const PRIVAT_AUS: AnonymizationSettings = { enabled: false, userName: 'Max Mustermann' }

function antwort(varianten: Array<{ text: string; unbackedClaims?: string[] }>): string {
  return JSON.stringify({
    variants: varianten.map((v) => ({ text: v.text, unbackedClaims: v.unbackedClaims ?? [] })),
  })
}

const DREI_VARIANTEN = antwort([
  { text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt.' },
  { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
  { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
])

describe('rewriteSelection — genau drei Varianten', () => {
  it('liefert genau drei Varianten aus einer gültigen Modellantwort', async () => {
    const provider = stubProvider(DREI_VARIANTEN)
    const varianten = await rewriteSelection(BASIS, provider, 'test-key', PRIVAT_AUS)

    expect(varianten).toHaveLength(3)
    expect(varianten[0]).toEqual({
      text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt.',
      unbackedClaims: [],
    })
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]?.json).toBe(true)
  })

  it('scheitert, wenn das Modell nur zwei Varianten liefert — statt still weiterzumachen', async () => {
    const provider = stubProvider(antwort([{ text: 'Erste Variante.' }, { text: 'Zweite Variante.' }]))

    await expect(rewriteSelection(BASIS, provider, 'test-key', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
    await expect(rewriteSelection(BASIS, stubProvider(antwort([{ text: 'A.' }, { text: 'B.' }])), 'k', PRIVAT_AUS)).rejects.toThrow(
      /variants/,
    )
  })

  it('scheitert, wenn das Modell vier Varianten liefert — statt still zu kürzen', async () => {
    const provider = stubProvider(
      antwort([{ text: 'Eins.' }, { text: 'Zwei.' }, { text: 'Drei.' }, { text: 'Vier.' }]),
    )

    await expect(rewriteSelection(BASIS, provider, 'test-key', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })

  it('scheitert, wenn zwei Varianten wortgleich sind', async () => {
    const provider = stubProvider(
      antwort([
        { text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt.' },
        { text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt.' },
        { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
      ]),
    )

    await expect(rewriteSelection(BASIS, provider, 'test-key', PRIVAT_AUS)).rejects.toThrow(/unterscheiden/)
  })

  it('meldet eine kaputte Modellantwort über die gemeinsame Zod-Grenze', async () => {
    const provider = stubProvider('{"variants":[{"text":"abgeschnitten')

    await expect(rewriteSelection(BASIS, provider, 'test-key', PRIVAT_AUS)).rejects.toBeInstanceOf(ModelResponseError)
  })
})

describe('rewriteSelection — Wahrheitsmodi', () => {
  const MIT_ANSPRUCH = antwort([
    {
      text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt und dabei internationale Projekte verantwortet.',
      unbackedClaims: ['internationale Projekte verantwortet'],
    },
    { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
    { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
  ])

  it('scheitert im Modus "strict", wenn das Modell unbelegte Aussagen meldet', async () => {
    const provider = stubProvider(MIT_ANSPRUCH)

    await expect(rewriteSelection({ ...BASIS, truthMode: 'strict' }, provider, 'k', PRIVAT_AUS)).rejects.toThrow(
      /unbackedClaims/,
    )
  })

  it('scheitert im Modus "bridge", wenn das Modell unbelegte Aussagen meldet', async () => {
    const provider = stubProvider(MIT_ANSPRUCH)

    await expect(rewriteSelection({ ...BASIS, truthMode: 'bridge' }, provider, 'k', PRIVAT_AUS)).rejects.toThrow(
      /unbackedClaims/,
    )
  })

  it('gibt im Modus "free" die unbelegten Aussagen unverändert weiter — sie sind die Grundlage für Markierung, Bestätigung und Exportsperre', async () => {
    const provider = stubProvider(MIT_ANSPRUCH)
    const varianten = await rewriteSelection({ ...BASIS, truthMode: 'free' }, provider, 'k', PRIVAT_AUS)

    expect(varianten[0]?.unbackedClaims).toEqual(['internationale Projekte verantwortet'])
    expect(varianten[1]?.unbackedClaims).toEqual([])
    expect(varianten[2]?.unbackedClaims).toEqual([])
  })

  it('scheitert im Modus "free", wenn eine gemeldete Aussage nicht wörtlich im Variantentext steht', async () => {
    const provider = stubProvider(
      antwort([
        {
          text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt und dabei internationale Projekte verantwortet.',
          unbackedClaims: ['Erfahrung im Ausland'],
        },
        { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
        { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
      ]),
    )

    await expect(rewriteSelection({ ...BASIS, truthMode: 'free' }, provider, 'k', PRIVAT_AUS)).rejects.toThrow(/wörtlich/)
  })

  it('schreibt den Wahrheitsmodus in den Prompt', async () => {
    const provider = stubProvider(DREI_VARIANTEN)
    await rewriteSelection({ ...BASIS, truthMode: 'bridge' }, provider, 'k', PRIVAT_AUS)

    expect(provider.requests[0]?.system).toContain('Verallgemeinerungen, die der belegte Inhalt bereits trägt')
  })
})

describe('rewriteSelection — der Kontext ist nur zum Mitlesen', () => {
  it('scheitert, wenn eine Variante den Kontext davor mitliefert', async () => {
    const provider = stubProvider(
      antwort([
        { text: `${CONTEXT_BEFORE} Drei Jahre lang habe ich ein fünfköpfiges Team geführt.` },
        { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
        { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
      ]),
    )

    await expect(rewriteSelection(BASIS, provider, 'k', PRIVAT_AUS)).rejects.toThrow(/Kontext/)
  })

  it('scheitert, wenn eine Variante den Kontext danach mitliefert', async () => {
    const provider = stubProvider(
      antwort([
        { text: 'Drei Jahre lang habe ich ein fünfköpfiges Team geführt.' },
        { text: `Als Teamleiter trug ich Verantwortung für fünf Mitarbeitende. ${CONTEXT_AFTER}` },
        { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
      ]),
    )

    await expect(rewriteSelection(BASIS, provider, 'k', PRIVAT_AUS)).rejects.toThrow(/Kontext/)
  })

  it('lässt eine Variante durch, die den Kontext nur inhaltlich aufgreift', async () => {
    const provider = stubProvider(
      antwort([
        { text: 'Drei Jahre lang habe ich in der Logistikbranche ein fünfköpfiges Team geführt.' },
        { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
        { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
      ]),
    )

    await expect(rewriteSelection(BASIS, provider, 'k', PRIVAT_AUS)).resolves.toHaveLength(3)
  })
})

describe('rewriteSelection — leere Auswahl', () => {
  it('lehnt eine leere Auswahl ab, ohne das Modell zu fragen', async () => {
    const provider = stubProvider(DREI_VARIANTEN)

    await expect(rewriteSelection({ ...BASIS, selection: '' }, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(
      RewriteInputError,
    )
    expect(provider.requests).toHaveLength(0)
  })

  it('lehnt eine Auswahl aus reinem Leerraum ab, ohne das Modell zu fragen', async () => {
    const provider = stubProvider(DREI_VARIANTEN)

    await expect(rewriteSelection({ ...BASIS, selection: '   \n\t ' }, provider, 'k', PRIVAT_AUS)).rejects.toBeInstanceOf(
      RewriteInputError,
    )
    expect(provider.requests).toHaveLength(0)
  })
})

describe('rewriteSelection — Stilregler', () => {
  it('steuert die Förmlichkeit über das Stilprofil im Prompt, nicht über einen Modellparameter', async () => {
    const locker = stubProvider(DREI_VARIANTEN)
    await rewriteSelection({ ...BASIS, sliders: { formality: 10, length: 50 } }, locker, 'k', PRIVAT_AUS)

    const foermlich = stubProvider(DREI_VARIANTEN)
    await rewriteSelection({ ...BASIS, sliders: { formality: 90, length: 50 } }, foermlich, 'k', PRIVAT_AUS)

    expect(locker.requests[0]?.user).toContain('10/100')
    expect(foermlich.requests[0]?.user).toContain('90/100')
    expect(locker.requests[0]?.user).not.toBe(foermlich.requests[0]?.user)
    expect(locker.requests[0]?.temperature).toBeUndefined()
  })

  it('steuert die Länge über eine ausdrückliche Anweisung im Prompt', async () => {
    const kurz = stubProvider(DREI_VARIANTEN)
    await rewriteSelection({ ...BASIS, sliders: { formality: 70, length: 5 } }, kurz, 'k', PRIVAT_AUS)

    const lang = stubProvider(DREI_VARIANTEN)
    await rewriteSelection({ ...BASIS, sliders: { formality: 70, length: 95 } }, lang, 'k', PRIVAT_AUS)

    expect(kurz.requests[0]?.system).toContain('kürzer')
    expect(lang.requests[0]?.system).toContain('ausführlicher')
    expect(kurz.requests[0]?.system).not.toBe(lang.requests[0]?.system)
    // Der Regler verändert zusätzlich die im Stilbaustein genannte Satzlänge.
    expect(kurz.requests[0]?.user).not.toBe(lang.requests[0]?.user)
  })
})

describe('rewriteSelection — Anonymisierung', () => {
  const MIT_PLATZHALTER = antwort([
    { text: 'Als [NAME] habe ich drei Jahre lang ein fünfköpfiges Team geführt.' },
    { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
    { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
  ])

  it('ersetzt persönliche Daten vor dem Senden und tauscht sie in den Varianten zurück', async () => {
    const provider = stubProvider(MIT_PLATZHALTER)
    const varianten = await rewriteSelection(BASIS, provider, 'k', PRIVAT_AN)

    const gesendet = provider.requests[0]?.user ?? ''
    expect(gesendet).toContain('[NAME]')
    expect(gesendet).toContain('[EMAIL]')
    expect(gesendet).toContain('[TEL]')
    expect(gesendet).not.toContain('Max Mustermann')
    expect(gesendet).not.toContain('max.mustermann@beispiel.de')

    expect(varianten[0]?.text).toBe('Als Max Mustermann habe ich drei Jahre lang ein fünfköpfiges Team geführt.')
  })

  it('tauscht auch die unbelegten Aussagen im Modus "free" zurück', async () => {
    const provider = stubProvider(
      antwort([
        {
          text: 'Als [NAME] habe ich zusätzlich ein internationales Team aufgebaut.',
          unbackedClaims: ['[NAME] habe ich zusätzlich ein internationales Team aufgebaut'],
        },
        { text: 'Als Teamleiter trug ich drei Jahre lang die Verantwortung für fünf Mitarbeitende.' },
        { text: 'Über drei Jahre hinweg habe ich fünf Mitarbeitende fachlich geführt.' },
      ]),
    )

    const varianten = await rewriteSelection({ ...BASIS, truthMode: 'free' }, provider, 'k', PRIVAT_AN)

    expect(varianten[0]?.unbackedClaims[0]).toContain('Max Mustermann')
  })

  it('sendet bei abgeschalteter Anonymisierung den Klartext', async () => {
    const provider = stubProvider(DREI_VARIANTEN)
    await rewriteSelection(BASIS, provider, 'k', PRIVAT_AUS)

    expect(provider.requests[0]?.user).toContain('Max Mustermann')
    expect(provider.requests[0]?.user).toContain('max.mustermann@beispiel.de')
  })

  it('anonymisiert die Stellenanzeige nicht — Firma und Position gehören zur Anzeige, nicht zum Nutzer', async () => {
    const provider = stubProvider(DREI_VARIANTEN)
    await rewriteSelection(BASIS, provider, 'k', PRIVAT_AN)

    expect(provider.requests[0]?.user).toContain('Musterwerk Solutions GmbH')
    expect(provider.requests[0]?.user).toContain('Teamleitung Disposition')
  })
})

describe('rewriteSelection — abweichende Zielsprache', () => {
  const UEBERSETZUNG = JSON.stringify({
    translation: 'I led a team of five people for three years.',
  })
  const ENGLISCHE_VARIANTEN = antwort([
    { text: 'For three years I led a team of five.' },
    { text: 'As team lead I was responsible for five employees over three years.' },
    { text: 'Across three years I managed five team members.' },
  ])

  it('übersetzt zuerst und passt danach an — zwei getrennte Aufrufe', async () => {
    const provider = stubProvider(UEBERSETZUNG, ENGLISCHE_VARIANTEN)
    const varianten = await rewriteSelection({ ...BASIS, targetLanguage: 'en' }, provider, 'k', PRIVAT_AUS)

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[0]?.system).toContain('"translation"')
    expect(provider.requests[0]?.user).toContain(SELECTION)
    expect(provider.requests[1]?.system).toContain('"variants"')
    expect(provider.requests[1]?.user).toContain('I led a team of five people for three years.')
    expect(provider.requests[1]?.user).not.toContain(SELECTION)
    expect(varianten).toHaveLength(3)
    expect(varianten[0]?.text).toBe('For three years I led a team of five.')
  })

  it('macht nur einen Aufruf, wenn die Auswahl bereits in der Zielsprache steht', async () => {
    const provider = stubProvider(DREI_VARIANTEN)
    await rewriteSelection(BASIS, provider, 'k', PRIVAT_AUS)

    expect(provider.requests).toHaveLength(1)
  })

  it('erkennt die Quellsprache aus Auswahl und Kontext, statt targetLanguage blind zu vertrauen', async () => {
    const englisch: RewriteRequest = {
      ...BASIS,
      selection: 'I led a team of five people for three years.',
      contextBefore: 'After my degree in business administration I moved into the logistics industry.',
      contextAfter: 'I would like to bring this experience to your company and develop it further.',
      targetLanguage: 'de',
    }
    const provider = stubProvider(
      JSON.stringify({ translation: 'Ich habe drei Jahre lang ein Team von fünf Personen geführt.' }),
      DREI_VARIANTEN,
    )

    await rewriteSelection(englisch, provider, 'k', PRIVAT_AUS)

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[0]?.user).toContain('Quellsprache: Englisch')
  })

  it('scheitert, wenn die Übersetzung den Kontext mitliefert', async () => {
    const provider = stubProvider(
      JSON.stringify({ translation: `${CONTEXT_BEFORE} I led a team of five people.` }),
      ENGLISCHE_VARIANTEN,
    )

    await expect(rewriteSelection({ ...BASIS, targetLanguage: 'en' }, provider, 'k', PRIVAT_AUS)).rejects.toThrow(/Kontext/)
    expect(provider.requests).toHaveLength(1)
  })

  it('anonymisiert beide Aufrufe mit derselben Zuordnung', async () => {
    const provider = stubProvider(
      JSON.stringify({ translation: 'As [NAME] I led a team of five people for three years.' }),
      antwort([
        { text: 'As [NAME] I led a team of five.' },
        { text: 'As team lead I was responsible for five employees over three years.' },
        { text: 'Across three years I managed five team members.' },
      ]),
    )

    const varianten = await rewriteSelection({ ...BASIS, targetLanguage: 'en' }, provider, 'k', PRIVAT_AN)

    expect(provider.requests[0]?.user).not.toContain('Max Mustermann')
    expect(provider.requests[1]?.user).toContain('[NAME]')
    expect(provider.requests[1]?.user).not.toContain('Max Mustermann')
    expect(varianten[0]?.text).toBe('As Max Mustermann I led a team of five.')
  })
})

describe('rewriteSelection — Prompt-Inhalt', () => {
  it('übergibt Faktenbasis, Stilprofil und Anzeigendaten an das Modell', async () => {
    const provider = stubProvider(DREI_VARIANTEN)
    await rewriteSelection(BASIS, provider, 'k', PRIVAT_AUS)

    const user = provider.requests[0]?.user ?? ''
    expect(user).toContain('2021 bis 2024 Teamleitung Disposition')
    expect(user).toContain('nennt Ergebnisse mit konkreten Zahlen')
    expect(user).toContain('Mehrjährige Führungserfahrung')
    expect(user).toContain(SELECTION)
    expect(user).toContain(CONTEXT_BEFORE)
    expect(user).toContain(CONTEXT_AFTER)
  })
})
