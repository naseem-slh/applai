import { describe, expect, it } from 'vitest'
import de from './locales/de.json'
import en from './locales/en.json'
import i18n from './i18n'

/** Alle Blattpfade eines Übersetzungsbaums, z. B. `onboarding.key.submit`. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('i18n', () => {
  it('löst einen bekannten Schlüssel auf Deutsch auf', () => {
    expect(i18n.getFixedT('de')('app.name')).toBe('Applai')
    expect(i18n.getFixedT('de')('routes.editor.heading')).toBe('Arbeitsfläche')
  })

  it('löst denselben Schlüssel auf Englisch anders auf', () => {
    expect(i18n.getFixedT('en')('routes.editor.heading')).toBe('Workspace')
    expect(i18n.getFixedT('en')('nav.settings')).toBe('Settings')
  })

  // G8 hängt daran, dass beide Dateien denselben Umfang haben: Ein nur auf
  // Deutsch angelegter Schlüssel fiele sonst erst der englischen Nutzerin
  // auf, und zwar als roher Schlüsselname in der Oberfläche.
  it('führt in beiden Sprachen genau dieselben Schlüssel', () => {
    const german = leafPaths(de).sort()
    const english = leafPaths(en).sort()

    expect(german.length).toBeGreaterThan(50)
    expect(english).toEqual(german)
  })

  // Handover an Aufgabe 13 (siehe src/lib/ai/errors.ts): eine Übersetzung
  // pro LlmError.kind, plus die Gemini-spezifische Variante für 'quota'.
  // Diese Schlüssel entstehen mit Aufgabe 7, bevor eine Oberfläche sie
  // konsumiert — dieser Test hält lediglich fest, dass beide Sprachen sie
  // (unterschiedlich) auflösen, damit sie nicht unbemerkt auseinanderlaufen.
  it('löst alle KI-Fehlermeldungen (LlmError.kind + Gemini-Variante) in beiden Sprachen auf', () => {
    const keys = [
      'ai.errors.invalid_key',
      'ai.errors.rate_limit',
      'ai.errors.quota',
      'ai.errors.quota_gemini',
      'ai.errors.network',
      'ai.errors.blocked',
      'ai.errors.unknown',
    ]
    for (const key of keys) {
      const de = i18n.getFixedT('de')(key)
      const en = i18n.getFixedT('en')(key)
      expect(de).not.toBe(key) // kein fehlender Schlüssel (i18next gibt sonst den Schlüssel selbst zurück)
      expect(en).not.toBe(key)
      expect(de).not.toBe(en)
    }
  })
})
