import { describe, expect, it } from 'vitest'

import type { CharacterFormat } from '@/lib/docx/format'
import type { TrueTypeFont } from '@/lib/fonts/truetype'
import {
  FALLBACK_LINE_RATIO,
  faceDescriptor,
  naturalLineHeightFrom,
} from './documentFonts'

const CHARACTER: CharacterFormat = {
  fontFamily: 'Calibri',
  sizePt: 12,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: null,
  caps: false,
  smallCaps: false,
  vertAlign: 'baseline',
}

/** Nur die Metriken, mehr liest die Zeilenhöhe nicht aus der Datei. */
function font(metrics: {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
}): TrueTypeFont {
  return { metrics } as unknown as TrueTypeFont
}

/** Carlitos wirkliche Werte — Calibri 11 pt ergibt damit Words 13,4 pt. */
const CARLITO = font({ unitsPerEm: 2048, ascent: 1950, descent: -550, lineGap: 0 })

describe('faceDescriptor — Dateiname zu CSS-Angaben', () => {
  it('trennt Familie und Schnitt', () => {
    expect(faceDescriptor('Carlito-Regular')).toEqual({
      family: 'Carlito',
      weight: 400,
      style: 'normal',
    })
    expect(faceDescriptor('LiberationSerif-BoldItalic')).toEqual({
      family: 'LiberationSerif',
      weight: 700,
      style: 'italic',
    })
    expect(faceDescriptor('LiberationSans-Italic').style).toBe('italic')
    expect(faceDescriptor('LiberationMono-Bold').weight).toBe(700)
  })
})

describe('naturalLineHeightFrom — Zeilenhöhe aus den Schriftmetriken', () => {
  /**
   * `ascent - descent + lineGap` aus der `hhea`-Tabelle, auf den Grad
   * gerechnet — dieselbe Rechnung, mit der Word „einzeilig" bemisst und mit
   * der `export/pdf/layout.ts` setzt.
   */
  it('rechnet wie Word und wie der PDF-Satz', () => {
    const natural = naturalLineHeightFrom(new Map([['Carlito-Regular', CARLITO]]))

    // (1950 + 550 + 0) / 2048 × 11 pt = 13,43 pt
    expect(natural({ ...CHARACTER, sizePt: 11 })).toBeCloseTo(13.43, 2)
  })

  it('wählt den Schnitt nach Fettung und Neigung', () => {
    const bold = font({ unitsPerEm: 1000, ascent: 900, descent: -200, lineGap: 0 })
    const natural = naturalLineHeightFrom(
      new Map([
        ['Carlito-Regular', CARLITO],
        ['Carlito-Bold', bold],
      ]),
    )

    expect(natural({ ...CHARACTER, sizePt: 10, bold: true })).toBeCloseTo(11, 5)
  })

  /**
   * Vor dem ersten Laden gibt es keine Metriken. Ein Schätzwert ist dann
   * besser als ein Absturz oder eine Höhe von null: Der Brief steht sofort,
   * und sobald die Datei da ist, setzt er sich auf das genaue Maß.
   */
  it('schätzt, solange die Datei noch nicht geladen ist', () => {
    const natural = naturalLineHeightFrom(new Map())

    expect(natural({ ...CHARACTER, sizePt: 12 })).toBeCloseTo(12 * FALLBACK_LINE_RATIO, 5)
  })

  it('fällt auf den geraden Schnitt zurück, wenn der Schnitt fehlt', () => {
    const natural = naturalLineHeightFrom(new Map([['Carlito-Regular', CARLITO]]))

    expect(natural({ ...CHARACTER, sizePt: 11, bold: true, italic: true })).toBeCloseTo(13.43, 2)
  })
})
