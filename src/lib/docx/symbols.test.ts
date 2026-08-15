import { describe, expect, it } from 'vitest'

import { isSymbolFont, translateSymbol, translateSymbolText } from './symbols'

describe('translateSymbol — Bildschriften', () => {
  /**
   * Der Fall aus dem Anlass dieser Arbeit: In der Kontaktzeile eines
   * Anschreibens trennte ein Wingdings-Zeichen die Angaben. Ohne Übersetzung
   * stand dort ein leerer Kasten.
   */
  it('macht aus dem Wingdings-Trenner einen Aufzählungspunkt', () => {
    expect(translateSymbol('Wingdings', 0xf09f)).toBe(0x2022)
    expect(translateSymbolText('Wingdings', '')).toBe('•')
  })

  it('versteht das Zeichen auch ohne Privatbereich', () => {
    expect(translateSymbol('Wingdings', 0x9f)).toBe(0x2022)
  })

  it('nimmt den Schriftnamen ohne Rücksicht auf Schreibweise', () => {
    expect(isSymbolFont('WINGDINGS')).toBe(true)
    expect(isSymbolFont('Wingdings 2')).toBe(true)
    expect(isSymbolFont('Calibri')).toBe(false)
  })

  /**
   * Ein Bildzeichen ohne zeichenbare Entsprechung — eine zeigende Hand etwa
   * liegt in einer Unicode-Ebene, die keine der mitgelieferten Schriften
   * führt. Sichtbar an der richtigen Stelle ist besser als ein Kasten.
   */
  it('fällt bei einem Zeichen ohne Entsprechung auf den Punkt zurück', () => {
    expect(translateSymbol('Wingdings', 0xf046)).toBe(0x2022)
  })

  it('setzt Buchstaben einer Bildschrift nicht als Buchstaben', () => {
    // „l" ist in Wingdings kein L, sondern ein Punkt.
    expect(translateSymbolText('Wingdings', 'l')).toBe('●')
  })

  it('lässt eine gewöhnliche Schrift unangetastet', () => {
    expect(translateSymbol('Calibri', 0x41)).toBeNull()
    expect(translateSymbolText('Calibri', 'Anschreiben')).toBe('Anschreiben')
  })
})

describe('translateSymbol — Symbol', () => {
  it('bildet die lateinischen Buchstaben auf Griechisch ab', () => {
    expect(translateSymbolText('Symbol', 'abg')).toBe('αβγ')
    expect(translateSymbolText('Symbol', 'ABG')).toBe('ΑΒΓ')
  })

  /**
   * Anders als bei den Bildschriften sind Ziffern und Satzzeichen in Symbol
   * das, was sie überall sind — sie bleiben stehen.
   */
  it('lässt Ziffern und Satzzeichen stehen', () => {
    expect(translateSymbolText('Symbol', '(2026)')).toBe('(2026)')
  })

  it('übersetzt die gebräuchlichen Rechenzeichen', () => {
    expect(translateSymbolText('Symbol', '°±´¸')).toBe('°±×÷')
  })

  it('lässt Leerzeichen Leerzeichen bleiben', () => {
    expect(translateSymbolText('Wingdings', 'a b')).toBe('• •')
  })
})
