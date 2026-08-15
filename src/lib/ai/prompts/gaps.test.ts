import { describe, expect, it } from 'vitest'
import { buildGapsPrompt } from './gaps'
import type { GapsPromptInput } from './gaps'

const BASIS: GapsPromptInput = {
  requirements: [
    { index: 0, text: 'Mindestens 4 Jahre Berufserfahrung', kind: 'experience' },
    { index: 1, text: 'Sehr gute Kenntnisse in React und TypeScript', kind: 'skill' },
  ],
  language: 'de',
  facts: 'Lebenslauf\n2020 bis 2024 Frontend-Entwicklung mit React und TypeScript',
}

describe('buildGapsPrompt', () => {
  it('verlangt eine reine JSON-Antwort ohne Codeblock oder Fließtext', () => {
    const { system } = buildGapsPrompt(BASIS)
    expect(system.toLowerCase()).toContain('json')
    expect(system.toLowerCase()).toMatch(/kein markdown|ohne codeblock/)
  })

  it('beschreibt "assessments" mit "index", "status" und "evidence" im Schema-Teil', () => {
    const { system } = buildGapsPrompt(BASIS)
    expect(system).toContain('assessments')
    expect(system).toContain('index')
    expect(system).toContain('status')
    expect(system).toContain('evidence')
    expect(system).toContain('covered')
    expect(system).toContain('partial')
    expect(system).toContain('missing')
  })

  it('verlangt genau einen Eintrag pro Anforderung, keinen Index doppelt und keinen ausgelassen', () => {
    const { system } = buildGapsPrompt(BASIS)
    expect(system).toMatch(/genau EINEN Eintrag|nicht mehr, nicht weniger/)
    expect(system.toLowerCase()).toMatch(/doppelt/)
  })

  it('verbietet ausdrücklich jeden Zahlenwert/Prozentwert für den Deckungsgrad', () => {
    const { system } = buildGapsPrompt(BASIS)
    expect(system.toLowerCase()).toMatch(/prozentwert|zahl/)
    expect(system).toContain('%')
  })

  it('nennt die Nichts-erfinden-Regel für "evidence"', () => {
    const { system } = buildGapsPrompt(BASIS)
    expect(system.toLowerCase()).toMatch(/erfinde niemals|kein weltwissen/)
  })

  it('trägt jede Anforderung mit ihrer Nummer, Art und ihrem Text in den Nutzer-Prompt ein', () => {
    const { user } = buildGapsPrompt(BASIS)
    expect(user).toContain('0. [experience] Mindestens 4 Jahre Berufserfahrung')
    expect(user).toContain('1. [skill] Sehr gute Kenntnisse in React und TypeScript')
  })

  it('übernimmt die Faktenbasis unverändert in den Nutzer-Prompt', () => {
    const { user } = buildGapsPrompt(BASIS)
    expect(user).toContain(BASIS.facts)
  })

  it('nennt im Systemprompt die Sprache für "evidence", einmal für "de" und einmal für "en"', () => {
    const de = buildGapsPrompt({ ...BASIS, language: 'de' })
    const en = buildGapsPrompt({ ...BASIS, language: 'en' })
    expect(de.system).toContain('Deutsch')
    expect(en.system).toContain('Englisch')
  })

  it('erzeugt bei leerer Anforderungsliste einen Nutzer-Prompt ohne Anforderungszeilen', () => {
    const { user } = buildGapsPrompt({ ...BASIS, requirements: [] })
    // Bewusst NICHT `.not.toContain('0.')` (Fix-Runde 1, Review-Fund): Das
    // bestand nur zufällig, weil `BASIS.facts` kein "0." enthält — eine
    // Faktenbasis mit z. B. "2020. Abschluss" hätte den Test grundlos rot
    // gefärbt. Stattdessen gezielt gegen den Anforderungszeilen-Musterkopf
    // geprüft (Zeilenanfang, Ziffer, Punkt, Leerzeichen — siehe
    // `buildUserPrompt`, `${r.index}. [${r.kind}] ${r.text}`).
    expect(user).not.toMatch(/^\d+\. /m)
    expect(user).toContain(BASIS.facts)
  })
})
