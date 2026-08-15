// Von layout.test.ts und write.test.ts gemeinsam benutzt: Die Tests laufen in
// Node, wo `loadFonts` mangels Server nicht holen kann. Die Dateien kommen
// deshalb von der Platte — dieselben, die der Browser später abruft.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocx } from '../../docx/parse'
import { readDocumentFormat, type DocumentFormat } from '../../docx/format'
import { createFontProvider, type FontProvider } from './fonts'
import { requiredFontKeys } from '../../fonts/required'
import { readTrueType, type TrueTypeFont } from '../../fonts/truetype'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

/**
 * Einmal gelesene Schriften bleiben liegen.
 *
 * Eine Schriftdatei zu lesen und ihre Tabellen aufzuschlüsseln kostet
 * spürbar Zeit, und die Tests brauchen immer wieder dieselben vier Schnitte.
 * Ohne diesen Zwischenspeicher wuchs allein dieser Ordner den ganzen
 * Testlauf so weit, dass zwei ohnehin langsame Tests anderswo (Schlüssel
 * ableiten, ein Fixture ersetzen) über ihre Frist liefen. Die Dateien sind
 * unveränderlich; sie mehrfach zu lesen bringt nichts.
 */
const faceCache = new Map<string, TrueTypeFont>()
const formatCache = new Map<string, Promise<{ format: DocumentFormat; fonts: FontProvider }>>()

export async function loadFontProvider(keys: Iterable<string>): Promise<FontProvider> {
  for (const key of new Set(keys)) {
    if (faceCache.has(key)) continue
    const bytes = await readFile(join(ROOT, 'public/fonts/pdf', `${key}.ttf`))
    faceCache.set(key, readTrueType(new Uint8Array(bytes)))
  }
  return createFontProvider(faceCache)
}

/** Eine Fixture-Datei bis zum fertigen Formatmodell samt geladener Schriften. */
export function loadFixtureFormat(
  fileName: string,
): Promise<{ format: DocumentFormat; fonts: FontProvider }> {
  const cached = formatCache.get(fileName)
  if (cached) return cached

  const loading = (async () => {
    const buffer = await readFile(join(ROOT, 'tests/fixtures', fileName))
    const docx = await parseDocx(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    )
    const format = readDocumentFormat(docx)
    return { format, fonts: await loadFontProvider(requiredFontKeys(format)) }
  })()
  formatCache.set(fileName, loading)
  return loading
}
