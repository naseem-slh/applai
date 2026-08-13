// Lädt die mitgelieferten Schriftdateien per node:fs von der Platte und läuft
// deshalb unter tsconfig.test.json — siehe src/lib/docx/parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { subsetFont } from './subset'
import { readTrueType, type TrueTypeFont } from './truetype'

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../public/fonts/pdf')

async function loadFont(fileName = 'Carlito-Regular.ttf'): Promise<TrueTypeFont> {
  return readTrueType(new Uint8Array(await readFile(join(FONT_DIR, fileName))))
}

/** Die Glyphen eines Textes, wie der Schreiber sie sammelt: Glyphe → Zeichen. */
function usedGlyphs(font: TrueTypeFont, text: string): Map<number, number> {
  const used = new Map<number, number>()
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    used.set(font.glyphId(codePoint), codePoint)
  }
  return used
}

describe('subsetFont', () => {
  it('behält die Vorschubbreiten der ausgewählten Glyphen', async () => {
    const font = await loadFont()
    const used = usedGlyphs(font, 'Sehr geehrte Damen und Herren')

    const subset = subsetFont(font, used)
    const reread = readTrueType(subset.bytes)

    for (const original of used.keys()) {
      const replacement = subset.glyphIds.get(original)
      expect(replacement).toBeDefined()
      expect(reread.advance(replacement ?? 0)).toBe(font.advance(original))
    }
  })

  it('setzt .notdef an den Anfang', async () => {
    const font = await loadFont()

    const subset = subsetFont(font, usedGlyphs(font, 'Hallo'))

    expect(subset.glyphIds.get(0)).toBe(0)
  })

  /**
   * „ä" ist in aller Regel keine eigene Zeichnung, sondern „a" mit einem
   * darübergesetzten Trema — eine zusammengesetzte Glyphe, die auf zwei
   * andere Nummern verweist. Wer nur die zusammengesetzte mitnimmt, bekommt
   * einen Umriss, der ins Leere zeigt.
   */
  it('nimmt die Bestandteile zusammengesetzter Glyphen mit', async () => {
    const font = await loadFont()
    const used = usedGlyphs(font, 'ä')

    const subset = subsetFont(font, used)

    // .notdef, das „ä" selbst und mindestens ein Bestandteil.
    expect(subset.glyphIds.size).toBeGreaterThan(used.size + 1)
  })

  it('schreibt die Verweise zusammengesetzter Glyphen auf die neuen Nummern um', async () => {
    const font = await loadFont()

    const subset = subsetFont(font, usedGlyphs(font, 'ä'))
    const reread = readTrueType(subset.bytes)

    // Jeder Verweis muss innerhalb der neuen, sehr viel kleineren Datei
    // liegen — vorher zeigte er auf eine Nummer im Tausenderbereich.
    const glyf = reread.bytes
    expect(reread.numGlyphs).toBeLessThan(20)
    const [start, end] = reread.glyphRange(reread.glyphId(0x00e4))
    expect(end).toBeGreaterThan(start)
    expect(glyf.length).toBeGreaterThan(0)
    for (let glyphId = 0; glyphId < reread.numGlyphs; glyphId += 1) {
      expect(reread.advance(glyphId)).toBeGreaterThanOrEqual(0)
    }
  })

  it('bildet die benutzten Zeichen wieder auf ihre Glyphen ab', async () => {
    const font = await loadFont()
    const text = 'Grüße, Bewerbung 2026!'

    const subset = subsetFont(font, usedGlyphs(font, text))
    const reread = readTrueType(subset.bytes)

    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0
      expect(reread.glyphId(codePoint)).toBe(subset.glyphIds.get(font.glyphId(codePoint)))
    }
  })

  /** Der ganze Zweck: Aus 280 kB werden wenige Kilobyte im fertigen PDF. */
  it('macht aus der vollen Datei ein Bruchteil ihrer Größe', async () => {
    const font = await loadFont()

    const subset = subsetFont(font, usedGlyphs(font, 'Sehr geehrte Damen und Herren, ich bewerbe mich.'))

    expect(subset.bytes.length).toBeLessThan(font.bytes.length / 10)
  })
})
