import { describe, expect, it } from 'vitest'
import { buildStyleProfilePrompt } from './styleProfile'

describe('buildStyleProfilePrompt', () => {
  it('beschreibt alle drei Modellfelder im Schema-Teil des Systemprompts', () => {
    const { system } = buildStyleProfilePrompt('irgendein Anschreiben', 'de', 'sie', 12)
    for (const field of ['formality', 'traits', 'sample']) {
      expect(system).toContain(field)
    }
  })

  it('verlangt eine reine JSON-Antwort ohne Codeblock oder Fließtext', () => {
    const { system } = buildStyleProfilePrompt('Text', 'de', 'sie', 12)
    expect(system.toLowerCase()).toContain('json')
  })

  it('verankert die Förmlichkeits-Skala mit konkreten Ankerwerten 0, 50 und 100', () => {
    const { system } = buildStyleProfilePrompt('Text', 'de', 'sie', 12)
    expect(system).toContain('0')
    expect(system).toContain('50')
    expect(system).toContain('100')
    expect(system.toLowerCase()).toContain('locker')
    expect(system.toLowerCase()).toContain('förmlich')
  })

  it('nennt die Nichts-erfinden-Regel für "sample" ausdrücklich als wörtliches Zitat', () => {
    const { system } = buildStyleProfilePrompt('Text', 'de', 'sie', 12)
    expect(system.toLowerCase()).toMatch(/wörtlich|unverändert/)
    expect(system.toLowerCase()).toContain('zwei')
  })

  it('trägt die deterministisch erkannte Sprache in den Prompt ein, einmal für "de" und einmal für "en"', () => {
    const de = buildStyleProfilePrompt('Text', 'de', 'sie', 12)
    const en = buildStyleProfilePrompt('Text', 'en', 'sie', 12)
    expect(de.system + de.user).toContain('de')
    expect(en.system + en.user).toContain('en')
  })

  it('trägt die deterministisch erkannte Anredeform in den Nutzer-Prompt ein', () => {
    const sie = buildStyleProfilePrompt('Text', 'de', 'sie', 12)
    const du = buildStyleProfilePrompt('Text', 'de', 'du', 12)
    const none = buildStyleProfilePrompt('Text', 'de', 'none', 12)
    expect(sie.user).toMatch(/sie/i)
    expect(du.user).toMatch(/du/i)
    expect(none.user.toLowerCase()).toMatch(/keine|nicht/)
  })

  it('trägt die deterministisch berechnete Satzlänge in den Nutzer-Prompt ein', () => {
    const { user } = buildStyleProfilePrompt('Text', 'de', 'sie', 17.5)
    expect(user).toContain('17.5')
  })

  it('übernimmt den Anschreiben-Text unverändert in den Nutzer-Prompt', () => {
    const text = 'Einzigartiger Beispieltext 12345 für den Abgleich.'
    const { user } = buildStyleProfilePrompt(text, 'de', 'sie', 12)
    expect(user).toContain(text)
  })
})
