import { describe, expect, it } from 'vitest'
import { filterModels, isProModel, isTextOutputModel } from './modelFilter'

function choice(id: string) {
  return { id, label: id }
}

describe('isTextOutputModel', () => {
  it('lässt gewöhnliche Textmodelle durch', () => {
    expect(isTextOutputModel('gemini-2.5-flash')).toBe(true)
    expect(isTextOutputModel('gemini-3.6-flash')).toBe(true)
  })

  it.each([
    'text-embedding-004',
    'gemini-embedding-001',
    'imagen-4.0-generate-001',
    'gemini-2.5-flash-image',
    'veo-3.0-generate-001',
    'gemini-2.5-flash-preview-tts',
    'gemini-live-2.5-flash-preview',
    'aqa',
    // Auch innerhalb der Gemini-Familie: Diese tun etwas anderes, als Text
    // zu schreiben.
    'gemini-robotics-er-1.5-preview',
    'gemini-2.5-computer-use-preview',
  ])('hält %s heraus, weil es keinen Text ausgibt', (id) => {
    expect(isTextOutputModel(id)).toBe(false)
  })

  // Der Grund für die Umstellung auf eine erlaubte Familie: Diese Namen
  // enthalten keinen der verbotenen Bestandteile und rutschten deshalb
  // durch, obwohl AI Studio sie in eigenen Abschnitten führt.
  it.each([
    'gemma-3-27b-it',
    'gemma-3n-e4b-it',
    'learnlm-2.0-flash-experimental',
    'nano-banana',
  ])('hält %s heraus, weil es nicht zur Textfamilie gehört', (id) => {
    expect(isTextOutputModel(id)).toBe(false)
  })
})

describe('isProModel', () => {
  it('erkennt Pro als eigenes Namensglied', () => {
    expect(isProModel('gemini-2.5-pro')).toBe(true)
    expect(isProModel('gemini-3-pro-preview')).toBe(true)
  })

  it('hält ein Wort, das nur mit „pro" beginnt, nicht für ein Pro-Modell', () => {
    expect(isProModel('gemini-prometheus')).toBe(false)
    expect(isProModel('gemini-2.5-flash')).toBe(false)
  })
})

describe('filterModels', () => {
  const ALL = [
    choice('gemini-2.5-flash'),
    choice('gemini-2.5-pro'),
    choice('text-embedding-004'),
    choice('gemini-2.5-flash-preview-tts'),
  ]

  it('zeigt im kostenlosen Tarif nur Textmodelle ohne Pro', () => {
    expect(filterModels(ALL, { includePro: false }).map((entry) => entry.id)).toEqual([
      'gemini-2.5-flash',
    ])
  })

  it('nimmt Pro dazu, sobald der Tarif es hergibt', () => {
    expect(filterModels(ALL, { includePro: true }).map((entry) => entry.id)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ])
  })
})

/**
 * Der Bestand, wie AI Studio ihn unter „Textausgabemodelle" führt (Stand
 * August 2026, aus der Konsole eines kostenlosen Tarifs übernommen). Die
 * Kennungen sind die üblichen Namen der Anzeigenamen; geprüft wird die
 * **Regel**, nicht die Schreibweise einzelner Kennungen.
 *
 * Der Sinn dieses Blocks: Die Regel ist eine Heuristik über fremde Namen und
 * lag schon zweimal daneben. Ein Testfall am echten Bestand ist das
 * Einzige, was sie ehrlich hält.
 */
describe('filterModels am tatsächlichen Bestand', () => {
  const TEXT_OUT = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-3-flash',
    'gemini-3.1-pro',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
  ].map(choice)

  it('lässt jedes Textausgabemodell durch, sobald der Tarif Pro hergibt', () => {
    expect(filterModels(TEXT_OUT, { includePro: true })).toHaveLength(TEXT_OUT.length)
  })

  // Nachgemessen am Konto des Nutzers: Pro-Modelle stehen im kostenlosen
  // Tarif auf null Anfragen am Tag. Sie anzubieten hieße, ein Modell in die
  // Liste zu stellen, das zuverlässig scheitert.
  it('nimmt im kostenlosen Tarif genau die Pro-Modelle heraus', () => {
    const shown = filterModels(TEXT_OUT, { includePro: false }).map((entry) => entry.id)

    expect(shown).not.toContain('gemini-2.5-pro')
    expect(shown).not.toContain('gemini-3.1-pro')
    expect(shown).toHaveLength(TEXT_OUT.length - 2)
  })

  it('behält die Lite-Modelle, die im kostenlosen Tarif die größten Kontingente haben', () => {
    const shown = filterModels(TEXT_OUT, { includePro: false }).map((entry) => entry.id)

    expect(shown).toContain('gemini-3.1-flash-lite')
    expect(shown).toContain('gemini-3.5-flash-lite')
  })
})

