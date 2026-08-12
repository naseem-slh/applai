import { describe, expect, it } from 'vitest'
import type { JobAd } from './jobAd'
import { findForeignCompanyNames, suggestLetterhead } from './letterhead'

const JOB_AD_MIT_ANSPRECHPARTNER: JobAd = {
  language: 'de',
  company: 'Musterwerk Solutions GmbH',
  position: 'Senior Frontend-Entwicklerin / Senior Frontend-Entwickler (m/w/d)',
  contactPerson: 'Dr. Thomas Weber',
  salutation: 'Sehr geehrter Herr Dr. Weber',
  requirements: [],
  tone: 'sachlich',
}

const JOB_AD_OHNE_ANSPRECHPARTNER: JobAd = {
  language: 'de',
  company: 'Musterwerk Solutions GmbH',
  position: 'Teamleitung Disposition',
  contactPerson: null,
  salutation: null,
  requirements: [],
  tone: 'sachlich',
}

const JOB_AD_LEER: JobAd = {
  language: 'de',
  company: null,
  position: null,
  contactPerson: null,
  salutation: null,
  requirements: [],
  tone: 'sachlich',
}

/** 12. August 2026 (Monat 0-basiert: 7 = August). */
const HEUTE = new Date(2026, 7, 12)

describe('suggestLetterhead — Anrede (Checklisten-Fall)', () => {
  it('erzeugt bei fehlendem Ansprechpartner "Sehr geehrte Damen und Herren" auf Deutsch', () => {
    const brief = suggestLetterhead(JOB_AD_OHNE_ANSPRECHPARTNER, 'de', HEUTE)
    expect(brief.salutation).toBe('Sehr geehrte Damen und Herren')
  })

  it('erzeugt bei fehlendem Ansprechpartner "Dear Hiring Team" auf Englisch', () => {
    const brief = suggestLetterhead(JOB_AD_OHNE_ANSPRECHPARTNER, 'en', HEUTE)
    expect(brief.salutation).toBe('Dear Hiring Team')
  })

  it('übernimmt bei vorhandenem Ansprechpartner die Anrede der Anzeige wörtlich', () => {
    const brief = suggestLetterhead(JOB_AD_MIT_ANSPRECHPARTNER, 'de', HEUTE)
    expect(brief.salutation).toBe('Sehr geehrter Herr Dr. Weber')
  })
})

describe('suggestLetterhead — Empfänger', () => {
  it('setzt Firma und Ansprechpartner in den Empfänger, wenn beide bekannt sind', () => {
    const brief = suggestLetterhead(JOB_AD_MIT_ANSPRECHPARTNER, 'de', HEUTE)
    expect(brief.recipient).toBe('Musterwerk Solutions GmbH\nDr. Thomas Weber')
  })

  it('setzt nur die Firma in den Empfänger, wenn kein Ansprechpartner bekannt ist', () => {
    const brief = suggestLetterhead(JOB_AD_OHNE_ANSPRECHPARTNER, 'de', HEUTE)
    expect(brief.recipient).toBe('Musterwerk Solutions GmbH')
  })

  it('liefert eine leere Zeichenkette, wenn die Firma unbekannt ist, statt einen Namen zu erfinden', () => {
    const brief = suggestLetterhead(JOB_AD_LEER, 'de', HEUTE)
    expect(brief.recipient).toBe('')
  })
})

describe('suggestLetterhead — Betreff', () => {
  it('nennt die Position auf Deutsch, wenn sie bekannt ist', () => {
    const brief = suggestLetterhead(JOB_AD_OHNE_ANSPRECHPARTNER, 'de', HEUTE)
    expect(brief.subject).toBe('Bewerbung als Teamleitung Disposition')
  })

  it('nennt die Position auf Englisch, wenn sie bekannt ist', () => {
    const brief = suggestLetterhead(JOB_AD_OHNE_ANSPRECHPARTNER, 'en', HEUTE)
    expect(brief.subject).toBe('Application for Teamleitung Disposition')
  })

  it('liefert einen allgemeinen Betreff ohne erfundenen Stellentitel, wenn die Position unbekannt ist (Deutsch)', () => {
    const brief = suggestLetterhead(JOB_AD_LEER, 'de', HEUTE)
    expect(brief.subject).toBe('Bewerbung')
  })

  it('liefert einen allgemeinen Betreff ohne erfundenen Stellentitel, wenn die Position unbekannt ist (Englisch)', () => {
    const brief = suggestLetterhead(JOB_AD_LEER, 'en', HEUTE)
    expect(brief.subject).toBe('Application')
  })
})

describe('suggestLetterhead — Datum', () => {
  it('formatiert das Datum auf Deutsch als TT.MM.JJJJ', () => {
    const brief = suggestLetterhead(JOB_AD_LEER, 'de', new Date(2026, 7, 12))
    expect(brief.date).toBe('12.08.2026')
  })

  it('formatiert das Datum auf Deutsch mit führenden Nullen bei einstelligem Tag/Monat', () => {
    const brief = suggestLetterhead(JOB_AD_LEER, 'de', new Date(2026, 0, 5))
    expect(brief.date).toBe('05.01.2026')
  })

  it('formatiert das Datum auf Englisch in einer für einen Geschäftsbrief natürlichen Form', () => {
    const brief = suggestLetterhead(JOB_AD_LEER, 'en', new Date(2026, 7, 12))
    expect(brief.date).toBe('August 12, 2026')
  })

  it('leitet das Datum ausschließlich aus dem übergebenen "today"-Parameter ab', () => {
    const brief1 = suggestLetterhead(JOB_AD_LEER, 'de', new Date(2020, 0, 1))
    const brief2 = suggestLetterhead(JOB_AD_LEER, 'de', new Date(2030, 11, 31))
    expect(brief1.date).toBe('01.01.2020')
    expect(brief2.date).toBe('31.12.2030')
  })
})

describe('findForeignCompanyNames', () => {
  it('findet "Bosch" in einem Text, dessen aktuelle Firma "Siemens" ist', () => {
    const text = 'Von 2018 bis 2021 war ich bei Bosch als Ingenieurin tätig.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Siemens', 'Bosch'])
    expect(treffer).toEqual([{ name: 'Bosch', index: text.indexOf('Bosch') }])
  })

  it('meldet nichts, wenn nur die aktuelle Firma im Text vorkommt', () => {
    const text = 'Ich bewerbe mich bei Siemens, weil mich Siemens seit Jahren begeistert.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Siemens'])
    expect(treffer).toEqual([])
  })

  it('findet "Bosch" nicht als Teilstring von "Boschmann"', () => {
    const text = 'Herr Boschmann war mein damaliger Vorgesetzter.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Bosch'])
    expect(treffer).toEqual([])
  })

  it('erkennt einen Treffer unabhängig von Groß-/Kleinschreibung', () => {
    const text = 'Ich habe bei BOSCH gearbeitet.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Bosch'])
    expect(treffer).toHaveLength(1)
    expect(treffer[0]?.name).toBe('Bosch')
  })

  it('erkennt einen Treffer trotz umgebender Satzzeichen', () => {
    const text = '(Bosch), ein früherer Arbeitgeber.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Bosch'])
    expect(treffer).toHaveLength(1)
  })

  it('behandelt Firmennamen mit Regex-Sonderzeichen korrekt, ohne abzustürzen', () => {
    const text = 'Zuvor war ich bei S&P Global und davor bei Müller + Partner GmbH tätig.'
    const treffer = findForeignCompanyNames(text, null, ['S&P Global', 'Müller + Partner GmbH'])
    expect(treffer.map((t) => t.name).sort()).toEqual(['Müller + Partner GmbH', 'S&P Global'])
  })

  it('schließt die aktuelle Firma aus, auch wenn sie in der bekannten Liste steht (Groß-/Kleinschreibung unabhängig)', () => {
    const text = 'Ich arbeite aktuell bei siemens.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Siemens', 'Bosch'])
    expect(treffer).toEqual([])
  })

  it('liefert mehrere Treffer sortiert nach Position im Text', () => {
    const text = 'Erst Bosch, dann Continental, zuletzt wieder Bosch.'
    const treffer = findForeignCompanyNames(text, 'Siemens', ['Bosch', 'Continental'])
    expect(treffer).toEqual([
      { name: 'Bosch', index: text.indexOf('Bosch') },
      { name: 'Continental', index: text.indexOf('Continental') },
      { name: 'Bosch', index: text.lastIndexOf('Bosch') },
    ])
  })

  it('liefert eine leere Liste ohne bekannte Firmen', () => {
    expect(findForeignCompanyNames('Text ohne jeden Firmenbezug.', 'Siemens', [])).toEqual([])
  })

  it('funktioniert ohne aktuelle Firma (null) und findet dann jede bekannte Firma', () => {
    const text = 'Ich war bei Bosch tätig.'
    const treffer = findForeignCompanyNames(text, null, ['Bosch'])
    expect(treffer).toHaveLength(1)
  })
})
