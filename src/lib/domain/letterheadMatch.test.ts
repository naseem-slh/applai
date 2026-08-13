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

  /**
   * Befund 3: `SALUTATION_WINDOW` (25) ist bewusst weiter als
   * `FALLBACK_WINDOW` (15) — die Präfixprüfung kennt keine Wortgrenze, und
   * „Liebe Grüße" oder „Liebe Kolleginnen" im Fließtext genügt, um fälschlich
   * als Anrede erkannt zu werden. Auch jenseits von Absatz 15 wird eine
   * Anrede also noch gefunden.
   */
  it('findet eine Anrede noch jenseits von Absatz 15', () => {
    const brief = slices(
      ...Array.from({ length: 18 }, (_, index) => `Absatz ${index}`),
      'Liebe Kolleginnen',
    )

    const matches = matchLetterhead(brief, [], null)

    expect(matches.map((match) => match.field)).toEqual(['salutation'])
    expect(matches[0]?.paragraph).toBe(18)
  })

  /**
   * Genau dieses weite Anrede-Fenster darf aber nicht das Suchfenster für
   * Empfänger, Datum und Betreff mit aufreißen: Wird eine Anrede erst in
   * Absatz 20 (fälschlich) erkannt, dürfen Empfänger/Datum/Betreff trotzdem
   * höchstens `FALLBACK_WINDOW` Absätze weit oberhalb gesucht werden — sonst
   * öffnet sich das Fenster weiter, als die Rückfallgrenze es je zuließe.
   */
  it('begrenzt das Suchfenster für Empfänger, Datum und Betreff auch bei später Anrede auf die Rückfallgrenze', () => {
    const brief = slices(
      'Alte Muster GmbH', // Absatz 0 — innerhalb der Rückfallgrenze
      ...Array.from({ length: 14 }, (_, index) => `Absatz ${index}`), // 1..14
      '01.02.2026', // Absatz 15 — genau AN der Rückfallgrenze, darf nicht mehr zählen
      ...Array.from({ length: 4 }, (_, index) => `Weiterer Absatz ${index}`), // 16..19
      'Liebe Kolleginnen', // Absatz 20 — fälschlich als Anrede erkannt
    )

    const matches = matchLetterhead(brief, ['Alte Muster GmbH'], null)

    expect(matches.some((match) => match.field === 'recipient')).toBe(true)
    expect(matches.some((match) => match.field === 'date')).toBe(false)
  })

  /**
   * Befund 1: Ein Word-Absatz mit manuellem Zeilenumbruch (Shift+Enter) ist
   * EIN Absatz mit mehreren durch `\n` getrennten Zeilen (siehe
   * `src/lib/docx/parse.ts`). Ein Betreffblock „Bewerbung als
   * Disponentin⏎Ihre Anzeige vom 05.08.2026" ist also ein einziger Absatz —
   * die Ersetzung darf nur die erste Zeile treffen, sonst verschwindet die
   * Bezugszeile darunter mit.
   */
  it('ersetzt bei einem mehrzeiligen Betreff nur die erste Zeile', () => {
    const brief = slices(
      'Bewerbung als Disponentin\nIhre Anzeige vom 05.08.2026',
      '',
      'Sehr geehrte Damen und Herren,',
    )

    const [subject] = matchLetterhead(brief, [], null)

    expect(subject?.field).toBe('subject')
    expect(subject?.previous).toBe('Bewerbung als Disponentin')
    expect(subject?.range).toEqual({ from: 0, to: 'Bewerbung als Disponentin'.length })
  })

  // Dasselbe Bild bei einer Anrede mit angehängter Leerzeile — auch das ist
  // strukturell ein Absatz mit `\n` darin, nicht ein zweiter Absatz.
  it('ersetzt bei einer Anrede mit angehängter Leerzeile nur die erste Zeile', () => {
    const brief = slices('Sehr geehrte Damen und Herren,\n', 'mit großem Interesse …')

    const [salutation] = matchLetterhead(brief, [], null)

    expect(salutation?.field).toBe('salutation')
    expect(salutation?.previous).toBe('Sehr geehrte Damen und Herren,')
    expect(salutation?.range).toEqual({ from: 0, to: 'Sehr geehrte Damen und Herren,'.length })
  })

  /**
   * Schaden 1 (Regression aus der ersten Fixrunde): Beginnt der Absatz MIT
   * einem `\n` (in Word der übliche Shift+Enter-Abstand vor der Anrede),
   * ist die erste Zeile leer — `wholeParagraph` darf dann nicht diese
   * leere erste Zeile nehmen (`range.from === range.to`), sondern muss zur
   * ersten NICHT-LEEREN Zeile weitergehen. Ein leerer Bereich ist für
   * `replaceRange` eine reine Einfügestelle, keine Ersetzung — die alte
   * Zeile bliebe stehen (siehe `letterheadApply.test.ts` für den Beweis am
   * Dokumenttext).
   */
  it('überspringt eine leere erste Zeile und nimmt die erste inhaltliche Zeile', () => {
    const brief = slices('\nSehr geehrte Damen und Herren,', 'mit großem Interesse …')

    const [salutation] = matchLetterhead(brief, [], null)

    expect(salutation?.previous).toBe('Sehr geehrte Damen und Herren,')
    expect(salutation?.range).toEqual({ from: 1, to: 1 + 'Sehr geehrte Damen und Herren,'.length })
  })

  // Auch eine erste Zeile aus reinem Leerraum (Tabulator, Leerzeichen) zählt
  // als leer, nicht nur eine vollständig leere Zeile.
  it('überspringt eine erste Zeile aus reinem Leerraum', () => {
    const brief = slices('  \t\nSehr geehrte Damen und Herren,', 'mit großem Interesse …')

    const [salutation] = matchLetterhead(brief, [], null)

    expect(salutation?.previous).toBe('Sehr geehrte Damen und Herren,')
    expect(salutation?.range.from).toBe('  \t\n'.length)
  })
})
