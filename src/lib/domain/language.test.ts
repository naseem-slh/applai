import { describe, expect, it } from 'vitest'
import { _internal, detectLanguage } from './language'
import {
  ENGLISH_JOB_AD_FIXTURE,
  GERMAN_JOB_AD_ENGLISH_TERMS_FIXTURE,
  GERMAN_JOB_AD_FIXTURE,
} from './jobAd.fixtures'

describe('detectLanguage', () => {
  it('erkennt eine deutsche Stellenanzeige als "de"', () => {
    expect(detectLanguage(GERMAN_JOB_AD_FIXTURE)).toBe('de')
  })

  it('erkennt eine englische Stellenanzeige als "en"', () => {
    expect(detectLanguage(ENGLISH_JOB_AD_FIXTURE)).toBe('en')
  })

  it('erkennt eine deutsche Anzeige voller englischer Fachbegriffe weiterhin als "de" (Härtefall der Stoppwort-Zählung)', () => {
    expect(detectLanguage(GERMAN_JOB_AD_ENGLISH_TERMS_FIXTURE)).toBe('de')
  })

  it('liefert bei einem Text ganz ohne Stoppwörter "de" (Applais Standardsprache bei Gleichstand)', () => {
    expect(detectLanguage('Kubernetes React TypeScript Terraform')).toBe('de')
  })

  it('ist unempfindlich gegenüber Groß-/Kleinschreibung', () => {
    expect(detectLanguage('DER UND MIT FÜR DEN DEM')).toBe('de')
    expect(detectLanguage('THE AND FOR WITH FROM')).toBe('en')
  })

  it('liefert bei leerem Text die Standardsprache "de"', () => {
    expect(detectLanguage('')).toBe('de')
  })
})

describe('Stoppwortlisten', () => {
  it('Deutsch und Englisch überschneiden sich nicht (sonst keine Unterscheidungskraft, siehe language.ts)', () => {
    const overlap = [..._internal.GERMAN_STOPWORDS].filter((word) => _internal.ENGLISH_STOPWORDS.has(word))
    expect(overlap).toEqual([])
  })
})
