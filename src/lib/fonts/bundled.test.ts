import { describe, expect, it } from 'vitest'

import { bundledFamily, fontFileKey } from './bundled'

describe('bundledFamily — Word-Name zu mitgelieferter Familie', () => {
  it('bildet die metrikgleichen Nachbauten ab', () => {
    expect(bundledFamily('Calibri')).toBe('Carlito')
    expect(bundledFamily('Arial')).toBe('LiberationSans')
    expect(bundledFamily('Times New Roman')).toBe('LiberationSerif')
    expect(bundledFamily('Courier New')).toBe('LiberationMono')
  })

  it('erkennt den Namen ohne Rücksicht auf Leerzeichen und Groß', () => {
    expect(bundledFamily('CALIBRI LIGHT')).toBe('Carlito')
    expect(bundledFamily('times-new-roman')).toBe('LiberationSerif')
  })

  it('setzt eine Schrift ohne Nachbau nach ihrer Gattung', () => {
    expect(bundledFamily('Garamond')).toBe('LiberationSerif')
    expect(bundledFamily('Verdana')).toBe('LiberationSans')
  })

  it('deutet einen unbekannten Namen nach dem, was er über sich sagt', () => {
    expect(bundledFamily('Frutiger LT Std 45 Light')).toBe('LiberationSans')
    expect(bundledFamily('PT Mono Special')).toBe('LiberationMono')
    expect(bundledFamily('Noto Serif Display')).toBe('LiberationSerif')
  })

  it('nimmt „Sans Serif" nicht für eine Serifenschrift', () => {
    expect(bundledFamily('Fira Sans Serif')).toBe('LiberationSans')
  })
})

describe('fontFileKey — Dateiname des Schnitts', () => {
  it('setzt den Schnitt an den Familiennamen', () => {
    expect(fontFileKey('Calibri', false, false)).toBe('Carlito-Regular')
    expect(fontFileKey('Calibri', true, false)).toBe('Carlito-Bold')
    expect(fontFileKey('Calibri', false, true)).toBe('Carlito-Italic')
    expect(fontFileKey('Calibri', true, true)).toBe('Carlito-BoldItalic')
  })
})
