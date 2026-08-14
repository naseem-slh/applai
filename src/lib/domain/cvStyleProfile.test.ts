import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRequest } from '../ai/provider'
import { ModelResponseError } from '../ai/modelJson'
import {
  computeBulletLength,
  countedEntries,
  cvStyleProfileToPromptFragment,
  deriveCvStyleProfile,
  detectPerson,
  detectTerminalPunctuation,
  type CvStyleProfile,
} from './cvStyleProfile'

/** Abgefangener `LlmProvider`-Stub, wie in `styleProfile.test.ts` — nie ein echter Netzwerkaufruf. */
function stubProvider(response: string): LlmProvider & { lastRequest?: LlmRequest } {
  const provider: LlmProvider & { lastRequest?: LlmRequest } = {
    id: 'gemini',
    label: 'Stub',
    model: 'test-modell',
    endpoint: 'https://example.invalid',
    generate: (req) => {
      provider.lastRequest = req
      return Promise.resolve(response)
    },
  }
  return provider
}

/**
 * Ein Lebenslauf, wie ihn `parseDocx` liefert: Absätze durch `\n` getrennt,
 * darunter Überschriften, eine Datumsspalte und der Name — genau die kurzen
 * Zeilen, an denen sich Mittelwert und Median unterscheiden.
 */
const CV = [
  'Marlene Ostwald',
  'Berufserfahrung',
  '2019 – 2022',
  'Softwareentwicklerin bei der Nordwerk AG',
  'Entwickelt Steuerungssoftware für die Fertigung',
  'Verantwortet die Ablaufplanung von vier Anlagen',
  'Betreut die Schnittstelle zum Warenwirtschaftssystem',
  'Ausbildung',
  'Studium der Informatik an der TU Dresden',
].join('\n')

describe('countedEntries', () => {
  it('lässt Überschriften, Datumszeilen und den Namen aus', () => {
    expect(countedEntries(CV)).toEqual([
      'Softwareentwicklerin bei der Nordwerk AG',
      'Entwickelt Steuerungssoftware für die Fertigung',
      'Verantwortet die Ablaufplanung von vier Anlagen',
      'Betreut die Schnittstelle zum Warenwirtschaftssystem',
      'Studium der Informatik an der TU Dresden',
    ])
  })

  it('zählt eine Zeile mit genau drei Wörtern mit, eine mit zweien nicht', () => {
    expect(countedEntries('Eins zwei drei\nEins zwei')).toEqual(['Eins zwei drei'])
  })

  // Eine Datumsspalte hat durch Leerzeichen getrennt drei Zeichenketten und
  // wäre ohne die Buchstabenbedingung ein „Eintrag".
  it('lässt eine Datumsspanne aus, obwohl sie aus drei Zeichenketten besteht', () => {
    expect(countedEntries('2019 – 2022\n15.03.2019 – 30.06.2022')).toEqual([])
  })
})

describe('computeBulletLength', () => {
  it('nimmt den Median, nicht den Mittelwert', () => {
    // Fünf gezählte Einträge mit 5, 5, 5, 6 und 7 Wörtern → Median 5.
    expect(computeBulletLength(CV)).toBe(5)
  })

  it('lässt sich von einem einzelnen sehr langen Eintrag nicht verschieben', () => {
    // Der Mittelwert läge bei rund 18 Wörtern — einer Länge, die in diesem
    // Lebenslauf kein einziger Eintrag hat.
    const withOutlier = `${CV}\n${'Wort '.repeat(80).trim()}`
    expect(computeBulletLength(withOutlier)).toBe(6)
  })

  it('liefert 0, wenn es nichts zu messen gibt', () => {
    expect(computeBulletLength('')).toBe(0)
    expect(computeBulletLength('Name\n2019\nAusbildung')).toBe(0)
  })
})

describe('detectTerminalPunctuation', () => {
  it('meldet ja, sobald die Mehrheit der Einträge mit einem Punkt endet', () => {
    const text = ['Entwickelt Software für die Fertigung.', 'Betreut die Ablaufplanung.'].join('\n')
    expect(detectTerminalPunctuation(text)).toBe(true)
  })

  it('lässt einen einzelnen Punkt unter vielen Einträgen nicht durchschlagen', () => {
    const text = [
      'Entwickelt Steuerungssoftware für die Fertigung.',
      'Verantwortet die Ablaufplanung von vier Anlagen',
      'Betreut die Schnittstelle zum Warenwirtschaftssystem',
    ].join('\n')
    expect(detectTerminalPunctuation(text)).toBe(false)
  })

  it('meldet nein ohne gezählte Einträge', () => {
    expect(detectTerminalPunctuation('')).toBe(false)
  })
})

describe('detectPerson', () => {
  it('erkennt die Ich-Form, wenn sie die Regel ist', () => {
    const text = [
      'Ich entwickle Steuerungssoftware für die Fertigung',
      'Ich verantworte die Ablaufplanung von vier Anlagen',
      'Betreut die Schnittstelle zum Warenwirtschaftssystem',
    ].join('\n')
    expect(detectPerson(text)).toBe('first')
  })

  it('lässt ein einzelnes „ich" unter vielen Einträgen nicht durchschlagen', () => {
    const text = [
      'Ich suche eine Aufgabe mit Verantwortung',
      'Entwickelt Steuerungssoftware für die Fertigung',
      'Verantwortet die Ablaufplanung von vier Anlagen',
      'Betreut die Schnittstelle zum Warenwirtschaftssystem',
      'Pflegt die Dokumentation der Baugruppen',
    ].join('\n')
    expect(detectPerson(text)).toBe('none')
  })

  it('erkennt die englische Ich-Form', () => {
    const text = ['I develop control software', 'I own the release planning'].join('\n')
    expect(detectPerson(text)).toBe('first')
  })
})

describe('deriveCvStyleProfile', () => {
  const VALID = JSON.stringify({
    bulletForm: 'verbFirst',
    tense: 'present',
    traits: ['nennt die Zahl der betreuten Anlagen'],
    sample: 'Entwickelt Steuerungssoftware für die Fertigung',
  })

  it('setzt die gemessenen Felder selbst und übernimmt vom Modell nur Form, Zeitform, Merkmale und Beispiel', async () => {
    const profile = await deriveCvStyleProfile(CV, stubProvider(VALID), 'key')

    expect(profile).toEqual({
      bulletForm: 'verbFirst',
      tense: 'present',
      person: 'none',
      terminalPunctuation: false,
      bulletLength: 5,
      traits: ['nennt die Zahl der betreuten Anlagen'],
      sample: 'Entwickelt Steuerungssoftware für die Fertigung',
    })
  })

  it('gibt die Messwerte als Zusammenhang in den Prompt, nicht zur Übernahme', async () => {
    const provider = stubProvider(VALID)
    await deriveCvStyleProfile(CV, provider, 'key')

    expect(provider.lastRequest?.user).toContain('5 Wörter')
    expect(provider.lastRequest?.user).toContain('ohne Ich')
  })

  it('verwirft ein erfundenes Beispiel (G10)', async () => {
    const invented = JSON.stringify({
      bulletForm: 'verbFirst',
      tense: 'present',
      traits: ['knapp'],
      sample: 'Leitete ein Team von fünfzehn Entwicklerinnen',
    })

    await expect(deriveCvStyleProfile(CV, stubProvider(invented), 'key')).rejects.toBeInstanceOf(
      ModelResponseError,
    )
  })

  it('nimmt ein Beispiel an, dessen Leerraum anders umbrochen ist', async () => {
    const rewrapped = JSON.stringify({
      bulletForm: 'verbFirst',
      tense: 'present',
      traits: ['knapp'],
      sample: 'Entwickelt   Steuerungssoftware\nfür die Fertigung',
    })

    await expect(deriveCvStyleProfile(CV, stubProvider(rewrapped), 'key')).resolves.toMatchObject({
      bulletForm: 'verbFirst',
    })
  })
})

describe('cvStyleProfileToPromptFragment', () => {
  const PROFILE: CvStyleProfile = {
    bulletForm: 'verbFirst',
    tense: 'present',
    person: 'none',
    terminalPunctuation: false,
    bulletLength: 9,
    traits: ['nennt Ergebnisse mit Zahlen'],
    sample: 'Entwickelt Steuerungssoftware für die Fertigung',
  }

  it('nennt Form, Zeitform, Person, Schlusszeichen, Länge, Merkmale und Beispiel', () => {
    const fragment = cvStyleProfileToPromptFragment(PROFILE)

    expect(fragment).toContain('Verb')
    expect(fragment).toContain('Präsens')
    expect(fragment).toContain('ohne Ich')
    expect(fragment).toContain('ohne Satzzeichen')
    expect(fragment).toContain('9 Wörter')
    expect(fragment).toContain('nennt Ergebnisse mit Zahlen')
    expect(fragment).toContain('Entwickelt Steuerungssoftware für die Fertigung')
  })

  it('lässt die Längenzeile weg, statt eine Länge zu behaupten', () => {
    expect(cvStyleProfileToPromptFragment({ ...PROFILE, bulletLength: 0 })).not.toContain(
      'Übliche Länge',
    )
  })

  it('kommt mit einem von Hand geleerten Merkmalsfeld zurecht, statt zu scheitern', () => {
    expect(cvStyleProfileToPromptFragment({ ...PROFILE, traits: [] })).toContain(
      'keine besonderen Stilmerkmale',
    )
  })
})
