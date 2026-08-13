import { describe, expect, it } from 'vitest'
import { buildJobAdPrompt } from './jobAd'

describe('buildJobAdPrompt', () => {
  it('nennt im Systemprompt die Nichts-erfinden-Regel für Firma, Stelle und Ansprechpartner', () => {
    const { system } = buildJobAdPrompt('irgendein Anzeigentext', 'de')
    expect(system).toContain('null')
    expect(system.toLowerCase()).toMatch(/nicht (in der anzeige|steht|erschließbar)|rate niemals|erfinde/)
  })

  it('nennt im Systemprompt die Abhängigkeit von salutation zu contactPerson', () => {
    const { system } = buildJobAdPrompt('irgendein Anzeigentext', 'de')
    expect(system).toContain('salutation')
    expect(system).toContain('contactPerson')
  })

  it('trägt die deterministisch erkannte Sprache in den Prompt ein, einmal für "de" und einmal für "en"', () => {
    const de = buildJobAdPrompt('Text', 'de')
    const en = buildJobAdPrompt('Text', 'en')
    expect(de.system + de.user).toContain('de')
    expect(en.system + en.user).toContain('en')
  })

  it('übernimmt den Anzeigentext unverändert in den Nutzer-Prompt', () => {
    const text = 'Einzigartiger Beispieltext 12345 für den Abgleich.'
    const { user } = buildJobAdPrompt(text, 'de')
    expect(user).toContain(text)
  })

  it('beschreibt alle sieben JobAd-Felder im Schema-Teil des Systemprompts', () => {
    const { system } = buildJobAdPrompt('Text', 'de')
    for (const field of ['language', 'company', 'position', 'contactPerson', 'salutation', 'requirements', 'tone']) {
      expect(system).toContain(field)
    }
  })

  /**
   * Ohne diese Auflage kürzt das Modell die Stellenbezeichnung auf ihren
   * Kern. Im Betreff des Anschreibens steht dann eine andere Stelle als in
   * der Anzeige des Empfängers — aus „Werkstudent (m/w/d) im Private Banking
   * als Unterstützung für die Bereichsleitung" wurde „Werkstudent (m/w/d) im
   * Private Banking".
   */
  it('verlangt die vollständige, ungekürzte Stellenbezeichnung', () => {
    const { system } = buildJobAdPrompt('Text', 'de')

    expect(system).toMatch(/VOLLSTÄNDIGE Stellenbezeichnung/u)
    expect(system.toLowerCase()).toMatch(/kürze sie nicht|nicht kürzen/u)
    // Das Gegenbeispiel steht ausdrücklich im Prompt: Es trägt die Auflage
    // deutlicher als jede Umschreibung.
    expect(system).toContain('nicht "Werkstudent"')
  })

  it('verlangt eine reine JSON-Antwort ohne Codeblock oder Fließtext', () => {
    const { system } = buildJobAdPrompt('Text', 'de')
    expect(system.toLowerCase()).toContain('json')
  })
})
