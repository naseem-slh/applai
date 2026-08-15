import { describe, expect, it } from 'vitest'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import type { JobAd } from '@/lib/domain/jobAd'
import type { StyleProfile } from '@/lib/domain/styleProfile'
import { createSelection } from './documentSelection'
import {
  buildRewriteRequest,
  defaultSliders,
  factsFrom,
  SLIDER_STEP_COUNT,
  sliderStep,
  stepToSlider,
} from './rewriteRequest'

function fakeDocument(texts: string[]): DocxDocument {
  const xml = new DOMParser().parseFromString(
    `<w:document xmlns:w="http://x">${texts.map(() => '<w:p/>').join('')}</w:document>`,
    'application/xml',
  )
  const nodes = [...xml.getElementsByTagName('w:p')]
  let offset = 0
  const paragraphs: Paragraph[] = texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return { index, node: nodes[index]!, text, runs: [], start, end: start + text.length }
  })
  return { zip: {}, doc: xml, paragraphs, text: texts.join('\n') }
}

const JOB_AD: JobAd = {
  language: 'de',
  company: 'Musterwerk',
  position: 'Entwicklerin',
  contactPerson: null,
  salutation: null,
  requirements: [{ text: 'TypeScript', kind: 'skill' }],
  tone: 'sachlich',
}

const STYLE: StyleProfile = {
  formality: 72,
  sentenceLength: 14,
  address: 'sie',
  traits: ['knapp'],
  sample: 'Ich schreibe Ihnen.',
}

describe('defaultSliders', () => {
  it('beginnt bei der gemessenen Förmlichkeit, damit „unverändert" ausdrückbar ist', () => {
    expect(defaultSliders(STYLE)).toEqual({ formality: 72, length: 50 })
  })
})

// Die Übersetzung zwischen der Zahl, die Aufgabe 11 erwartet (0 bis 100),
// und den benannten Stufen, die das Regler-Primitiv kennt (DESIGN.md).
describe('sliderStep / stepToSlider', () => {
  it('legt die Enden und die Mitte genau aufeinander', () => {
    expect(sliderStep(0)).toBe(0)
    expect(sliderStep(50)).toBe(2)
    expect(sliderStep(100)).toBe(SLIDER_STEP_COUNT - 1)
    expect(stepToSlider(0)).toBe(0)
    expect(stepToSlider(2)).toBe(50)
    expect(stepToSlider(SLIDER_STEP_COUNT - 1)).toBe(100)
  })

  it('rundet einen gemessenen Zwischenwert auf die nächste Stufe', () => {
    expect(sliderStep(72)).toBe(3)
    expect(sliderStep(60)).toBe(2)
  })

  it('bleibt in den Grenzen, egal was hereinkommt', () => {
    expect(sliderStep(-40)).toBe(0)
    expect(sliderStep(1000)).toBe(SLIDER_STEP_COUNT - 1)
    expect(sliderStep(Number.NaN)).toBe(2)
    expect(stepToSlider(-3)).toBe(0)
    expect(stepToSlider(99)).toBe(100)
  })

  it('bildet jede Stufe verlustfrei auf sich selbst ab', () => {
    for (let step = 0; step < SLIDER_STEP_COUNT; step++) {
      expect(sliderStep(stepToSlider(step))).toBe(step)
    }
  })
})

describe('factsFrom', () => {
  it('setzt Lebenslauf und Anschreiben zusammen, Lebenslauf zuerst', () => {
    expect(factsFrom({ cv: 'Lebenslauf', letter: 'Anschreiben' })).toBe('Lebenslauf\n\nAnschreiben')
  })

  it('lässt ein fehlendes oder leeres Dokument ganz weg, statt eine leere Stelle zu senden', () => {
    expect(factsFrom({ cv: null, letter: 'Anschreiben' })).toBe('Anschreiben')
    expect(factsFrom({ cv: '   ', letter: 'Anschreiben' })).toBe('Anschreiben')
    expect(factsFrom({ cv: null, letter: null })).toBe('')
  })
})

describe('buildRewriteRequest', () => {
  const docx = fakeDocument([
    'Sehr geehrte Damen und Herren,',
    'Ich bewerbe mich auf die Stelle.',
    'Mit freundlichen Grüßen',
  ])

  it('übernimmt Text und Kontext unverändert aus der Markierung, statt sie neu zu schneiden', () => {
    const selection = createSelection(docx, { from: 31, to: 63 })!

    const request = buildRewriteRequest({
      selection,
      jobAd: JOB_AD,
      document: { kind: 'letter', style: STYLE },
      facts: 'Lebenslauf',
      truthMode: 'strict',
      targetLanguage: 'de',
      sliders: defaultSliders(STYLE),
    })

    expect(request.selection).toBe('Ich bewerbe mich auf die Stelle.')
    expect(request.contextBefore).toBe(selection.contextBefore)
    expect(request.contextAfter).toBe(selection.contextAfter)
  })

  it('reicht Modus, Zielsprache und Regler durch', () => {
    const request = buildRewriteRequest({
      selection: createSelection(docx, { from: 31, to: 63 })!,
      jobAd: JOB_AD,
      document: { kind: 'letter', style: STYLE },
      facts: 'Lebenslauf',
      truthMode: 'free',
      targetLanguage: 'en',
      sliders: { formality: 20, length: 80 },
    })

    expect(request.truthMode).toBe('free')
    expect(request.targetLanguage).toBe('en')
    expect(request.sliders).toEqual({ formality: 20, length: 80 })
    expect(request.jobAd).toBe(JOB_AD)
    expect(request.document).toEqual({ kind: 'letter', style: STYLE })
  })
})
