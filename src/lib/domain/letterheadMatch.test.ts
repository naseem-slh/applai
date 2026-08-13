import { describe, expect, it } from 'vitest'
import { matchLetterhead, type ParagraphSlice } from './letterheadMatch'

/**
 * Baut Absätze mit denselben Offsets, die `parseDocx` erzeugt: Der
 * Dokumenttext verbindet die Absätze mit `\n`, und dieses Trennzeichen
 * gehört zu keinem der beiden angrenzenden Bereiche.
 */
function slices(...texts: string[]): ParagraphSlice[] {
  let start = 0
  return texts.map((text, index) => {
    const slice: ParagraphSlice = { index, text, start, end: start + text.length }
    start += text.length + 1
    return slice
  })
}

const BRIEF_DE = slices(
  'Alte Muster GmbH',
  'Musterstraße 12',
  '10115 Berlin',
  '',
  'Berlin, 14.03.2026',
  '',
  'Bewerbung als Disponentin',
  '',
  'Sehr geehrte Frau Klein,',
  '',
  'mit großem Interesse habe ich Ihre Bewerbung um Aufmerksamkeit gelesen.',
  'Bewerbung ist für mich mehr als ein Wort — 12.08.2020 begann meine Laufbahn.',
)

describe('matchLetterhead', () => {
  it('findet alle vier Felder im deutschen Brief', () => {
    const matches = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(matches.map((match) => match.field)).toEqual(['recipient', 'date', 'subject', 'salutation'])
  })

  it('ersetzt beim Datum nur die Datumsstelle, nicht den Ortszusatz', () => {
    const [, date] = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(date?.previous).toBe('14.03.2026')
    expect(date?.paragraph).toBe(4)
  })

  it('ersetzt beim Empfänger nur den Firmennamen, nicht die Anschrift', () => {
    const [recipient] = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(recipient?.previous).toBe('Alte Muster GmbH')
    expect(recipient?.range).toEqual({ from: 0, to: 'Alte Muster GmbH'.length })
  })

  it('nimmt „Bewerbung" aus dem Fließtext nicht für den Betreff', () => {
    const [, , subject] = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'Neue Beispiel AG')

    expect(subject?.paragraph).toBe(6)
  })

  it('nimmt ein Datum unterhalb der Anrede nicht für das Briefdatum', () => {
    const ohneKopfdatum = slices('Sehr geehrte Damen und Herren,', '', 'Seit 12.08.2020 arbeite ich dort.')

    const matches = matchLetterhead(ohneKopfdatum, [], null)

    expect(matches.map((match) => match.field)).toEqual(['salutation'])
  })

  it('findet Anrede, Datum und Betreff im englischen Brief', () => {
    const brief = slices('August 12, 2026', '', 'Application for Dispatcher', '', 'Dear Ms. Connolly,')

    const matches = matchLetterhead(brief, [], null)

    expect(matches.map((match) => match.field)).toEqual(['date', 'subject', 'salutation'])
  })

  it('findet ohne bekannte Firmen keinen Empfänger', () => {
    const matches = matchLetterhead(BRIEF_DE, [], null)

    expect(matches.some((match) => match.field === 'recipient')).toBe(false)
  })

  it('schließt die aktuelle Firma von der Empfängersuche aus', () => {
    const matches = matchLetterhead(BRIEF_DE, ['Alte Muster GmbH'], 'alte muster gmbh')

    expect(matches.some((match) => match.field === 'recipient')).toBe(false)
  })

  it('nimmt bei mehreren bekannten Firmen den obersten Absatz', () => {
    const brief = slices('Alte Muster GmbH', 'Zweite Firma AG', '', 'Sehr geehrte Damen und Herren,')

    const [recipient] = matchLetterhead(brief, ['Zweite Firma AG', 'Alte Muster GmbH'], null)

    expect(recipient?.paragraph).toBe(0)
  })

  it('sucht ohne Anrede nur in den ersten 15 Absätzen', () => {
    const lang = slices(...Array.from({ length: 20 }, (_, index) => `Absatz ${index}`), '01.01.2026')

    expect(matchLetterhead(lang, [], null)).toEqual([])
  })
})
