import { describe, expect, it } from 'vitest'
import { ANALYSIS_CACHE_VERSION, analysisCacheKey } from './analysisCache'

describe('analysisCacheKey', () => {
  it('liefert für dieselbe Eingabe denselben Schlüssel', async () => {
    const [a, b] = await Promise.all([
      analysisCacheKey('jobAd', 'modell-x', 'Wir suchen eine Entwicklerin.'),
      analysisCacheKey('jobAd', 'modell-x', 'Wir suchen eine Entwicklerin.'),
    ])
    expect(a).toBe(b)
  })

  it('trennt die Arten, damit Anzeige und Stilprofil sich nie verwechseln', async () => {
    const [a, b] = await Promise.all([
      analysisCacheKey('jobAd', 'modell-x', 'derselbe Text'),
      analysisCacheKey('style', 'modell-x', 'derselbe Text'),
    ])
    expect(a).not.toBe(b)
  })

  // Ein anderes Modell antwortet anders. Ein Eintrag des einen darf dem
  // anderen nicht untergeschoben werden.
  it('trennt die Modelle', async () => {
    const [a, b] = await Promise.all([
      analysisCacheKey('jobAd', 'modell-x', 'derselbe Text'),
      analysisCacheKey('jobAd', 'modell-y', 'derselbe Text'),
    ])
    expect(a).not.toBe(b)
  })

  // Ändern sich Prompt oder Auswertung, wird die Fassung erhöht und alles
  // Alte damit unbrauchbar, ohne dass jemand aufräumen muss.
  it('trägt Art und Fassung offen im Schlüssel', async () => {
    const key = await analysisCacheKey('style', 'modell-x', 'Text')
    expect(key.startsWith(`style:${ANALYSIS_CACHE_VERSION}:modell-x:`)).toBe(true)
  })

  it('ignoriert Unterschiede im Leerraum der Eingabe', async () => {
    const [a, b] = await Promise.all([
      analysisCacheKey('jobAd', 'm', 'Zeile eins\n\nZeile zwei'),
      analysisCacheKey('jobAd', 'm', '  Zeile eins Zeile zwei '),
    ])
    expect(a).toBe(b)
  })
})
