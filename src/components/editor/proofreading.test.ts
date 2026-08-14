import { describe, expect, it } from 'vitest'
import type { DocxDocument } from '@/lib/docx/model'
import type { Paragraph } from '@/lib/docx/model'
import { findProofreadingIssues, type ProofreadingRule } from './proofreading'

/**
 * Derselbe Helfer wie in `foreignCompanies.test.ts` und
 * `unbackedClaims.test.ts`: Absätze mit `\n` verbunden, das Trennzeichen
 * gehört zu keinem der beiden Nachbarn.
 */
function fakeDocument(texts: string[]): DocxDocument {
  let offset = 0
  const paragraphs: Paragraph[] = texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return {
      index,
      node: null as unknown as Element,
      text,
      runs: [],
      start,
      end: start + text.length,
    }
  })
  return { zip: {}, doc: null as unknown as XMLDocument, paragraphs, text: texts.join('\n') }
}

/** Kurzform: Regel, gefundener Wortlaut und Vorschlag je Befund. */
function summarize(texts: string[], language: 'de' | 'en' = 'de') {
  const docx = fakeDocument(texts)
  return findProofreadingIssues(docx, language).map((finding) => ({
    rule: finding.rule,
    found: finding.found,
    suggestion: finding.suggestion,
    paragraph: finding.paragraph,
  }))
}

function rules(texts: string[], language: 'de' | 'en' = 'de'): ProofreadingRule[] {
  return summarize(texts, language).map((finding) => finding.rule)
}

describe('findProofreadingIssues', () => {
  it('meldet nichts ohne Dokument', () => {
    expect(findProofreadingIssues(null, 'de')).toEqual([])
  })

  it('meldet nichts an einem sauberen Brief', () => {
    expect(summarize(['Sehr geehrte Damen und Herren,', 'ich bewerbe mich bei Ihnen.'])).toEqual([])
  })

  it('nennt zu jedem Befund seinen Absatz', () => {
    const found = summarize(['Sauber.', 'Hier steht das das doppelt.'])
    expect(found).toHaveLength(1)
    expect(found[0]?.paragraph).toBe(1)
  })

  it('gibt die Befunde in Dokumentreihenfolge', () => {
    const docx = fakeDocument(['Ein  Fehler und noch ein ,Fehler'])
    const found = findProofreadingIssues(docx, 'de')
    const starts = found.map((finding) => finding.range.from)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('liefert bei zweimaligem Suchen dasselbe Ergebnis', () => {
    // Die Muster stehen auf Modulebene und tragen `lastIndex` mit sich. Ohne
    // das Zurücksetzen fände der zweite Lauf weniger als der erste — und das
    // fiele in der Oberfläche als sprunghaft verschwindende Wellenlinie auf,
    // nicht als Fehler.
    const docx = fakeDocument(['Ich habe habe dort seid 2024 gearbeitet ,ja.'])
    const erster = findProofreadingIssues(docx, 'de')
    const zweiter = findProofreadingIssues(docx, 'de')
    expect(erster.length).toBeGreaterThan(1)
    expect(zweiter).toEqual(erster)
  })

  it('trifft mit dem Bereich genau den gemeldeten Wortlaut', () => {
    const docx = fakeDocument(['Ich arbeite seid 2024 dort.'])
    const [finding] = findProofreadingIssues(docx, 'de')
    expect(finding).toBeDefined()
    expect(docx.text.slice(finding!.range.from, finding!.range.to)).toBe(finding!.found)
  })
})

describe('doppelte Wörter', () => {
  it('findet ein versehentlich verdoppeltes Wort', () => {
    expect(summarize(['Ich habe habe dort gearbeitet.'])).toEqual([
      { rule: 'doubledWord', found: 'habe habe', suggestion: 'habe', paragraph: 0 },
    ])
  })

  it('findet es auch bei unterschiedlicher Schreibung am Satzanfang', () => {
    expect(rules(['Die die Software entwickeln, sind erfahren.'])).toContain('doubledWord')
  })

  it('meldet ein Relativpronomen nach einem Komma nicht', () => {
    // „die Kollegen, die die Software entwickeln" ist richtiges Deutsch.
    expect(summarize(['Ich schätze die Kollegen, die die Software entwickeln.'])).toEqual([])
  })

  it('meldet dasselbe Pronomen ohne Komma davor sehr wohl', () => {
    expect(rules(['Ich kenne die die Software.'])).toContain('doubledWord')
  })

  it('greift nicht über den Absatzumbruch hinweg', () => {
    // Ohne die Beschränkung auf Leerzeichen und Tabulator fände `\s+` hier
    // ein doppeltes Wort über zwei Absätze hinweg.
    expect(summarize(['Wir entwickeln', 'entwickeln Software.'])).toEqual([])
  })
})

describe('Zeichensetzung', () => {
  it('findet ein Leerzeichen vor dem Komma', () => {
    expect(summarize(['Berlin , den 14.08.2026'])).toEqual([
      { rule: 'spaceBeforePunctuation', found: ' ,', suggestion: ',', paragraph: 0 },
    ])
  })

  it('lässt die Auslassungspunkte in Ruhe', () => {
    expect(summarize(['Und so weiter ...'])).toEqual([])
  })

  it('findet ein fehlendes Leerzeichen nach dem Komma', () => {
    expect(summarize(['Java,TypeScript und Go'])).toEqual([
      { rule: 'missingSpaceAfterComma', found: ',', suggestion: ', ', paragraph: 0 },
    ])
  })

  it('hält eine Dezimalzahl nicht für einen Fehler', () => {
    expect(summarize(['Das Projekt lief 1,5 Jahre.'])).toEqual([])
  })

  it('rührt den Punkt nicht an, damit Abkürzungen ungeschoren bleiben', () => {
    // `z.B.`, `1.234` und `applai.pages.dev` wären mit Punktregel Treffer.
    expect(summarize(['Wir nutzen z.B. Java, siehe applai.pages.dev'])).toEqual([])
  })

  it('findet genau zwei Leerzeichen zwischen Wörtern', () => {
    expect(summarize(['Ein  Fehler'])).toEqual([
      { rule: 'doubleSpace', found: '  ', suggestion: ' ', paragraph: 0 },
    ])
  })

  it('lässt eine Ausrichtung aus drei und mehr Leerzeichen stehen', () => {
    expect(summarize(['Anrede:   Herr'])).toEqual([])
  })

  it('meldet beim doppelten Wort mit zwei Leerzeichen nur das Wort', () => {
    // Beide Regeln greifen; der Vorrang entscheidet.
    expect(rules(['Ich habe  habe geschrieben.'])).toEqual(['doubledWord'])
  })
})

describe('deutsche Typografie', () => {
  it('schlägt für gerade Anführungszeichen das Paar vor', () => {
    expect(summarize(['Man nannte es "agil" im Team.'])).toEqual([
      { rule: 'straightQuote', found: '"', suggestion: '„', paragraph: 0 },
      { rule: 'straightQuote', found: '"', suggestion: '“', paragraph: 0 },
    ])
  })

  it('zählt die Anführungszeichen je Absatz neu', () => {
    const found = summarize(['Er sagte "ja".', 'Sie sagte "nein".'])
    expect(found.map((finding) => finding.suggestion)).toEqual(['„', '“', '„', '“'])
  })

  it('macht aus dem geraden Hochstrich einen Apostroph', () => {
    expect(summarize(["Wie's gemeint war"])).toEqual([
      { rule: 'straightQuote', found: "'", suggestion: '’', paragraph: 0 },
    ])
  })

  it('setzt zwischen Wörtern den Gedankenstrich', () => {
    expect(summarize(['Berlin - Mitte'])).toEqual([
      { rule: 'hyphenAsDash', found: ' - ', suggestion: ' – ', paragraph: 0 },
    ])
  })

  it('lässt den Bindestrich im Wort unangetastet', () => {
    expect(summarize(['Meine E-Mail-Adresse'])).toEqual([])
  })
})

describe('seit und seid', () => {
  it('hält „seid" für „seit"', () => {
    expect(summarize(['Ich arbeite seid 2024 dort.'])).toEqual([
      { rule: 'seidForSeit', found: 'seid', suggestion: 'seit', paragraph: 0 },
    ])
  })

  it('behält die Großschreibung am Satzanfang', () => {
    expect(summarize(['Seid drei Jahren arbeite ich dort.'])).toEqual([
      { rule: 'seidForSeit', found: 'Seid', suggestion: 'Seit', paragraph: 0 },
    ])
  })

  it('meldet nichts, wenn „ihr" davorsteht', () => {
    expect(summarize(['Ich weiß, dass ihr seid, wer ihr seid.'])).toEqual([])
  })

  it('erkennt „ihr" auch mit einem Wort dazwischen', () => {
    expect(summarize(['Da ihr alle seid.'])).toEqual([])
  })
})

describe('Sprachgrenze', () => {
  it('prüft an einem englischen Brief nur die sprachneutralen Regeln', () => {
    const texts = ['I worked  there and and liked it , a lot']
    expect(rules(texts, 'en').sort()).toEqual(
      ['doubleSpace', 'doubledWord', 'spaceBeforePunctuation'].sort(),
    )
  })

  it('erklärt englische Anführungszeichen nicht für falsch', () => {
    expect(summarize(['He called it "agile" work.'], 'en')).toEqual([])
  })

  it('lässt englisches „seid" in Ruhe, weil es dort kein Wort ist', () => {
    expect(rules(['They seid nothing.'], 'en')).toEqual([])
  })
})
