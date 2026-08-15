import { describe, expect, it } from 'vitest'
import { checkFigures, extractFigures, hasFigureChanges } from './factsGuard'

describe('extractFigures', () => {
  it('liest Jahreszahlen, Zeitspannen und Mengen', () => {
    expect(extractFigures('Softwareentwickler bei Bosch, 2019–2022, 4 Anlagen')).toEqual([
      '2019',
      '2022',
      '4',
    ])
  })

  it('hält ein Datum als eine Angabe zusammen', () => {
    expect(extractFigures('vom 15.03.2019 bis 30.06.2022')).toEqual(['15.3.2019', '30.6.2022'])
  })

  it('macht die führende Null und das Dezimalkomma vergleichbar', () => {
    expect(extractFigures('03/2019')).toEqual(extractFigures('3/2019'))
    expect(extractFigures('1,5 Millionen')).toEqual(extractFigures('1.5 Millionen'))
  })

  it('liest die Zahl in einer Bezeichnung mit', () => {
    expect(extractFigures('zertifiziert nach ISO 9001')).toEqual(['9001'])
  })

  it('findet in einem Satz ohne Ziffern nichts', () => {
    expect(extractFigures('Verantwortet die Ablaufplanung mehrerer Anlagen')).toEqual([])
  })
})

describe('checkFigures', () => {
  it('meldet nichts, wenn alle Angaben wiederkehren', () => {
    const check = checkFigures(
      'Softwareentwickler bei Bosch, 2019–2022 — Mitarbeit an der Fertigungssteuerung',
      'Softwareentwickler bei Bosch, 2019–2022 — Weiterentwicklung der Fertigungssteuerung',
    )

    expect(check).toEqual({ added: [], removed: [] })
    expect(hasFigureChanges(check)).toBe(false)
  })

  it('meldet eine veränderte Jahreszahl auf beiden Seiten', () => {
    const check = checkFigures('bei Bosch, 2019–2022', 'bei Bosch, 2018–2022')

    expect(check.removed).toEqual(['2019'])
    expect(check.added).toEqual(['2018'])
    expect(hasFigureChanges(check)).toBe(true)
  })

  it('meldet eine verschwundene Angabe', () => {
    const check = checkFigures('Verantwortet 4 Anlagen', 'Verantwortet mehrere Anlagen')

    expect(check.removed).toEqual(['4'])
    expect(check.added).toEqual([])
  })

  it('meldet eine hinzugekommene Angabe', () => {
    const check = checkFigures('Verantwortet mehrere Anlagen', 'Verantwortet 12 Anlagen')

    expect(check.removed).toEqual([])
    expect(check.added).toEqual(['12'])
  })

  it('zählt Vorkommen, nicht nur Werte', () => {
    const check = checkFigures('2019, 2019 und 2022', '2019 und 2022')

    expect(check.removed).toEqual(['2019'])
    expect(check.added).toEqual([])
  })

  /**
   * Die ausdrückliche Grenze der Regel: Zahlwörter bleiben ungeprüft. Eine
   * Warnung, die bei „drei Jahre" → „3 Jahre" anschlägt, wird nach dem
   * dritten Mal weggeklickt — und schützt danach schlechter als keine.
   */
  it('meldet nichts, wenn ein Zahlwort zur Ziffer wird', () => {
    expect(hasFigureChanges(checkFigures('drei Jahre Erfahrung', 'drei Jahre Erfahrung'))).toBe(
      false,
    )
  })

  it('sieht das Zahlwort nicht als Angabe an', () => {
    expect(extractFigures('drei Jahre Erfahrung')).toEqual([])
  })

  it('nimmt eine andere Schreibweise derselben Spanne hin', () => {
    expect(hasFigureChanges(checkFigures('2019–2022', '2019 bis 2022'))).toBe(false)
  })
})
