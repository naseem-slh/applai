import { describe, expect, it } from 'vitest'
import { escapeRegExp, findWholeWordOccurrences } from './wholeWord'

describe('findWholeWordOccurrences', () => {
  it('findet ein einzelnes Vorkommen mit korrektem Index und korrekter Länge', () => {
    const text = 'Ich habe bei Bosch gearbeitet.'
    const treffer = findWholeWordOccurrences(text, 'Bosch', false)
    expect(treffer).toEqual([{ index: text.indexOf('Bosch'), length: 'Bosch'.length }])
  })

  it('findet "Bosch" nicht als Teilstring von "Boschmann"', () => {
    const treffer = findWholeWordOccurrences('Herr Boschmann war mein Vorgesetzter.', 'Bosch', false)
    expect(treffer).toEqual([])
  })

  /**
   * Der Regressionsfall, der `\b` (ASCII-beschränkte Wortgrenze) von der
   * hier verwendeten Unicode-Grenzprüfung unterscheidet: Zwischen "o" und
   * "Ö" läge mit `\b` fälschlich eine Wortgrenze (`Ö` ist kein `\w`), eine
   * Suche nach "Ökotech" träfe deshalb einen Fehlalarm mitten in
   * "BioÖkotech". Mit `\p{L}` ist "Ö" ein Buchstabe wie jeder andere —
   * korrekt kein Treffer. Alle zehn Fälle in `letterhead.test.ts` bleiben
   * mit `\b` zufällig grün; dieser hier nicht (siehe Fix-Runde 1, task-12
   * -report.md).
   */
  it('behandelt Umlaute korrekt als Wortzeichen — kein Fehlalarm mitten in "BioÖkotech"', () => {
    const treffer = findWholeWordOccurrences('Wir liefern an BioÖkotech GmbH.', 'Ökotech', true)
    expect(treffer).toEqual([])
  })

  it('findet eine mit "Ö" beginnende Phrase korrekt, wenn sie tatsächlich als eigenes Wort steht', () => {
    const text = 'Wir liefern an die Ökotech GmbH.'
    const treffer = findWholeWordOccurrences(text, 'Ökotech', true)
    expect(treffer).toEqual([{ index: text.indexOf('Ökotech'), length: 'Ökotech'.length }])
  })

  it('ist bei caseInsensitive: true unabhängig von Groß-/Kleinschreibung', () => {
    const treffer = findWholeWordOccurrences('Ich habe bei BOSCH gearbeitet.', 'Bosch', true)
    expect(treffer).toHaveLength(1)
  })

  it('ist bei caseInsensitive: false auf die exakte Schreibweise beschränkt', () => {
    expect(findWholeWordOccurrences('Ich habe bei bosch gearbeitet.', 'Bosch', false)).toEqual([])
    expect(findWholeWordOccurrences('Ich habe bei Bosch gearbeitet.', 'Bosch', false)).toHaveLength(1)
  })

  it('behandelt Regex-Sonderzeichen in der Phrase als literale Zeichen, ohne abzustürzen', () => {
    const text = 'Zuvor bei S&P Global und davor bei Müller + Partner GmbH tätig.'
    expect(findWholeWordOccurrences(text, 'S&P Global', true)).toEqual([
      { index: text.indexOf('S&P Global'), length: 'S&P Global'.length },
    ])
    expect(findWholeWordOccurrences(text, 'Müller + Partner GmbH', true)).toEqual([
      { index: text.indexOf('Müller + Partner GmbH'), length: 'Müller + Partner GmbH'.length },
    ])
  })

  it('erkennt einen Treffer trotz umgebender Satzzeichen', () => {
    expect(findWholeWordOccurrences('(Bosch), ein früherer Arbeitgeber.', 'Bosch', false)).toHaveLength(1)
  })

  it('liefert mehrere Treffer in Fundreihenfolge', () => {
    const text = 'Erst Bosch, dann Continental, zuletzt wieder Bosch.'
    const treffer = findWholeWordOccurrences(text, 'Bosch', false)
    expect(treffer).toEqual([
      { index: text.indexOf('Bosch'), length: 5 },
      { index: text.lastIndexOf('Bosch'), length: 5 },
    ])
  })

  it('liefert [] für eine leere oder nur aus Leerraum bestehende Phrase', () => {
    expect(findWholeWordOccurrences('irgendein Text', '', true)).toEqual([])
    expect(findWholeWordOccurrences('irgendein Text', '   ', true)).toEqual([])
  })
})

describe('escapeRegExp', () => {
  it('maskiert Regex-Sonderzeichen, sodass sie als literale Zeichen interpretiert werden', () => {
    const pattern = new RegExp(escapeRegExp('3+ Jahre (Vollzeit)?'))
    expect(pattern.test('3+ Jahre (Vollzeit)?')).toBe(true)
    // Ohne Maskierung wäre dies ein ungültiger oder falsch interpretierter Ausdruck.
    expect(pattern.test('3 Jahre Vollzeit')).toBe(false)
  })

  it('lässt gewöhnliche Buchstaben und Ziffern unverändert', () => {
    expect(escapeRegExp('Bosch GmbH 123')).toBe('Bosch GmbH 123')
  })
})
