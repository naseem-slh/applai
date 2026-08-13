// Lädt die mitgelieferten Schriftdateien per node:fs von der Platte und läuft
// deshalb unter tsconfig.test.json — siehe die Begründung in
// src/lib/docx/parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readTrueType, type TrueTypeFont } from './truetype'

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../public/fonts/pdf')

async function loadFont(fileName: string): Promise<TrueTypeFont> {
  return readTrueType(new Uint8Array(await readFile(join(FONT_DIR, fileName))))
}

function width(font: TrueTypeFont, character: string): number {
  return font.advance(font.glyphId(character.codePointAt(0) ?? 0))
}

describe('readTrueType', () => {
  it('liest die Kennzahlen aus head, hhea und OS/2', async () => {
    const font = await loadFont('Carlito-Regular.ttf')

    expect(font.metrics.unitsPerEm).toBe(2048)
    expect(font.metrics.ascent).toBeGreaterThan(0)
    expect(font.metrics.descent).toBeLessThan(0)
    expect(font.metrics.capHeight).toBeGreaterThan(0)
    expect(font.numGlyphs).toBeGreaterThan(100)
  })

  /**
   * Der eigentliche Grund für die drei mitgelieferten Schriften: Sie haben
   * dieselben Vorschubbreiten wie die Schriften, die im Original stehen.
   * Nur deshalb bricht der Satz an denselben Stellen um wie in Word.
   *
   * Die Vergleichswerte sind die bekannten Breiten der Originale in
   * Font-Einheiten bei 2048 Einheiten je Geviert. Bricht ein Austausch der
   * Dateien diese Zusage, schlägt dieser Test fehl — und nicht erst der
   * Brief beim Bewerber.
   */
  it('hält die Vorschubbreiten der nachgebauten Originale ein', async () => {
    const carlito = await loadFont('Carlito-Regular.ttf')
    expect(width(carlito, 'A')).toBe(1185) // Calibri
    expect(width(carlito, ' ')).toBe(463)

    const sans = await loadFont('LiberationSans-Regular.ttf')
    expect(width(sans, 'A')).toBe(1366) // Arial
    expect(width(sans, ' ')).toBe(569)

    const serif = await loadFont('LiberationSerif-Regular.ttf')
    expect(width(serif, 'A')).toBe(1479) // Times New Roman
    expect(width(serif, ' ')).toBe(512)
  })

  it('findet die Zeichen, die ein deutsches Anschreiben braucht', async () => {
    const font = await loadFont('Carlito-Regular.ttf')

    for (const character of ['A', 'ä', 'ö', 'ü', 'ß', '€', '–', '„', '"']) {
      expect(font.glyphId(character.codePointAt(0) ?? 0)).not.toBe(0)
    }
  })

  /**
   * Was die vorbereitete Datei **nicht** kann, muss sie auch sagen: Die
   * `cmap` wird beim Eindampfen auf die behaltenen Zeichen neu gebaut
   * (`scripts/build-pdf-fonts.mjs`), damit ein fehlendes Zeichen auf Glyphe 0
   * fällt statt auf eine geleerte Glyphe. Sonst verschwände es im Brief
   * spurlos, statt sichtbar zu fehlen.
   */
  it('meldet ein nicht enthaltenes Zeichen als Glyphe 0', async () => {
    const font = await loadFont('Carlito-Regular.ttf')

    expect(font.glyphId(0x4e2d)).toBe(0) // 中
  })

  it('erkennt Serifen an der PANOSE-Kennung', async () => {
    const serif = await loadFont('LiberationSerif-Regular.ttf')
    const sans = await loadFont('LiberationSans-Regular.ttf')

    expect(serif.metrics.flags & 2).toBe(2)
    expect(sans.metrics.flags & 2).toBe(0)
  })

  it('gibt fetten Schnitten eine größere geschätzte Strichstärke', async () => {
    const regular = await loadFont('LiberationSans-Regular.ttf')
    const bold = await loadFont('LiberationSans-Bold.ttf')

    expect(bold.metrics.stemV).toBeGreaterThan(regular.metrics.stemV)
  })
})
