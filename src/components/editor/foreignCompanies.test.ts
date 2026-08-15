import { describe, expect, it } from 'vitest'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import { findForeignCompanies } from './foreignCompanies'

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

const DOCX = fakeDocument([
  'Sehr geehrte Damen und Herren,',
  'meine Zeit bei Bosch hat mich geprägt.',
  'Deshalb bewerbe ich mich bei Siemens.',
])

describe('findForeignCompanies', () => {
  it('findet den Namen einer früheren Bewerbung und nennt seinen Absatz', () => {
    const result = findForeignCompanies(DOCX, 'Siemens', ['Bosch', 'Siemens'])

    expect(result.hits).toEqual([{ name: 'Bosch', index: 46, paragraph: 1 }])
    expect(result.paragraphs).toEqual([1])
  })

  it('meldet die aktuelle Firma nicht, auch wenn sie in der Liste steht', () => {
    const result = findForeignCompanies(DOCX, 'Siemens', ['Siemens'])

    expect(result.hits).toEqual([])
    expect(result.paragraphs).toEqual([])
  })

  it('meldet nichts ohne bisherige Bewerbungen und nichts ohne Dokument', () => {
    expect(findForeignCompanies(DOCX, 'Siemens', [])).toEqual({ hits: [], paragraphs: [] })
    expect(findForeignCompanies(null, 'Siemens', ['Bosch'])).toEqual({ hits: [], paragraphs: [] })
  })

  it('führt jeden Absatz nur einmal, auch bei mehreren Treffern darin', () => {
    const docx = fakeDocument(['Bei Bosch und wieder bei Bosch.', 'Nichts hier.'])

    const result = findForeignCompanies(docx, null, ['Bosch'])

    expect(result.hits).toHaveLength(2)
    expect(result.paragraphs).toEqual([0])
  })

  it('nennt die Absätze in Dokumentreihenfolge', () => {
    const docx = fakeDocument(['Zuerst Siemens.', 'Dann Bosch.', 'Und Bosch nochmal.'])

    const result = findForeignCompanies(docx, null, ['Bosch', 'Siemens'])

    expect(result.paragraphs).toEqual([0, 1, 2])
  })
})
