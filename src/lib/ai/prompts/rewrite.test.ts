import { describe, expect, it } from 'vitest'
import { buildRewritePrompt, buildTranslationPrompt, VARIANT_COUNT } from './rewrite'
import type { RewritePromptInput } from './rewrite'

/**
 * Tests für die Prompts der Umformulierung (Aufgabe 11). Reine
 * Zeichenketten-Prüfungen — kein Modell, kein Netz.
 */

const BASIS: RewritePromptInput = {
  selection: 'Ich habe drei Jahre lang ein Team von fünf Personen geführt.',
  contextBefore: 'Nach meinem Studium der Betriebswirtschaft bin ich in die Logistikbranche gewechselt.',
  contextAfter: 'Diese Erfahrung möchte ich nun in Ihrem Unternehmen einbringen.',
  jobAd: {
    company: 'Musterwerk Solutions GmbH',
    position: 'Teamleitung Logistik',
    tone: 'sachlich und direkt',
    requirements: ['Führungserfahrung', 'Kenntnisse in der Disposition'],
  },
  facts: 'Berufserfahrung: 2021 bis 2024 Teamleitung Disposition, Führung von fünf Mitarbeitenden.',
  styleFragment: 'Stilprofil des Nutzers: Förmlichkeit 70/100',
  truthMode: 'strict',
  targetLanguage: 'de',
  lengthGoal: 'similar',
}

describe('buildRewritePrompt', () => {
  it('verlangt genau drei Varianten und nennt die JSON-Form', () => {
    const { system } = buildRewritePrompt(BASIS)

    expect(VARIANT_COUNT).toBe(3)
    expect(system).toContain('genau drei')
    expect(system).toContain('"variants"')
    expect(system).toContain('"unbackedClaims"')
    expect(system).toContain('nicht zwei, nicht vier')
  })

  it('sagt ausdrücklich, dass der Kontext nur zum Mitlesen ist und nicht zurückgegeben wird', () => {
    const { system, user } = buildRewritePrompt(BASIS)

    expect(system).toContain('nur zum Mitlesen')
    expect(system).toContain('ausschließlich den Ersatz für die Auswahl')
    expect(user).toContain('NUR ZUM MITLESEN')
  })

  it('verlangt drei erkennbar verschiedene Ansätze statt drei Wortvarianten', () => {
    const { system } = buildRewritePrompt(BASIS)

    expect(system).toContain('Variante 1')
    expect(system).toContain('Variante 2')
    expect(system).toContain('Variante 3')
    expect(system).toContain('dürfen sich nicht nur in einzelnen Wörtern unterscheiden')
  })

  it('trägt im Modus "strict" die Anweisung, ausschließlich Belegtes zu verwenden', () => {
    const { system } = buildRewritePrompt({ ...BASIS, truthMode: 'strict' })

    expect(system).toContain('ausschließlich Aussagen, die in der Faktenbasis oder in der markierten Auswahl selbst belegt sind')
    expect(system).toContain('leeres Array')
    expect(system).not.toContain('Verallgemeinerungen, die der belegte Inhalt bereits trägt')
  })

  it('erlaubt im Modus "bridge" nur inhaltlich gedeckte Verallgemeinerungen', () => {
    const { system } = buildRewritePrompt({ ...BASIS, truthMode: 'bridge' })

    expect(system).toContain('Verallgemeinerungen, die der belegte Inhalt bereits trägt')
    expect(system).toContain('leeres Array')
  })

  it('verlangt im Modus "free" jede unbelegte Aussage wörtlich in unbackedClaims', () => {
    const { system } = buildRewritePrompt({ ...BASIS, truthMode: 'free' })

    expect(system).toContain('WÖRTLICH')
    expect(system).toContain('farbig markiert')
    expect(system).toContain('einzeln bestätigen')
    expect(system).toContain('Export')
  })

  it('nennt die Zielsprache im Klartext', () => {
    expect(buildRewritePrompt({ ...BASIS, targetLanguage: 'de' }).user).toContain('Zielsprache: Deutsch')
    expect(buildRewritePrompt({ ...BASIS, targetLanguage: 'en' }).user).toContain('Zielsprache: Englisch')
  })

  it('erzeugt für jedes Längenziel eine andere Anweisung', () => {
    const kurz = buildRewritePrompt({ ...BASIS, lengthGoal: 'shorter' }).system
    const gleich = buildRewritePrompt({ ...BASIS, lengthGoal: 'similar' }).system
    const lang = buildRewritePrompt({ ...BASIS, lengthGoal: 'longer' }).system

    expect(new Set([kurz, gleich, lang]).size).toBe(3)
    expect(kurz).toContain('kürzer')
    expect(lang).toContain('ausführlicher')
  })

  it('weist an, Platzhalter anonymisierter Daten unverändert zu übernehmen', () => {
    const { system } = buildRewritePrompt(BASIS)

    expect(system).toContain('[NAME]')
    expect(system).toContain('unverändert')
  })

  it('übernimmt Auswahl, Kontext, Faktenbasis, Stilbaustein und Anzeigendaten in den Nutzer-Prompt', () => {
    const { user } = buildRewritePrompt(BASIS)

    expect(user).toContain(BASIS.selection)
    expect(user).toContain(BASIS.contextBefore)
    expect(user).toContain(BASIS.contextAfter)
    expect(user).toContain(BASIS.styleFragment)
    expect(user).toContain(BASIS.facts)
    expect(user).toContain('Musterwerk Solutions GmbH')
    expect(user).toContain('Teamleitung Logistik')
    expect(user).toContain('sachlich und direkt')
    expect(user).toContain('Führungserfahrung')
  })

  it('schreibt bei leerer Faktenbasis einen ausdrücklichen Hinweis statt leerer Anführungszeichen', () => {
    const { user } = buildRewritePrompt({ ...BASIS, facts: '   ' })

    expect(user).toContain('(keine Unterlagen übergeben)')
  })

  it('schreibt bei fehlender Firma und Position "nicht genannt" statt eines erfundenen Werts', () => {
    const { user } = buildRewritePrompt({ ...BASIS, jobAd: { ...BASIS.jobAd, company: null, position: null } })

    expect(user).toContain('nicht genannt')
  })
})

describe('buildTranslationPrompt', () => {
  it('verlangt nur die Übersetzung der Auswahl als JSON, ohne Anpassung', () => {
    const { system, user } = buildTranslationPrompt({
      selection: BASIS.selection,
      contextBefore: BASIS.contextBefore,
      contextAfter: BASIS.contextAfter,
      sourceLanguage: 'de',
      targetLanguage: 'en',
    })

    expect(system).toContain('"translation"')
    expect(system).toContain('nur zum Mitlesen')
    expect(system).toContain('nicht umformulieren')
    expect(system).toContain('zweiten, getrennten Schritt')
    expect(user).toContain('Quellsprache: Deutsch')
    expect(user).toContain('Zielsprache: Englisch')
    expect(user).toContain(BASIS.selection)
    expect(user).toContain(BASIS.contextBefore)
  })

  it('weist auch beim Übersetzen an, Platzhalter unverändert zu lassen', () => {
    const { system } = buildTranslationPrompt({
      selection: 'Ich bin [NAME].',
      contextBefore: '',
      contextAfter: '',
      sourceLanguage: 'de',
      targetLanguage: 'en',
    })

    expect(system).toContain('[NAME]')
    expect(system).toContain('unverändert')
  })
})
