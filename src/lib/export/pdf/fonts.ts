import { readTrueType, type TrueTypeFont } from './truetype'

/**
 * Ordnet die Schriften aus dem Word-Dokument den Dateien zu, die dieses
 * Projekt mitbringt — und lädt sie.
 *
 * **Warum überhaupt zugeordnet wird.** Calibri, Arial und Times New Roman
 * sind lizenziert; sie liegen nicht im Repository und dürfen es nicht. Zu
 * jeder gibt es aber einen Nachbau unter der SIL Open Font License mit
 * **denselben Vorschubbreiten**: Carlito, Liberation Sans, Liberation Serif,
 * Liberation Mono. Gleiche Breiten heißt gleicher Zeilenumbruch — der Brief
 * bricht im PDF an denselben Stellen um wie in Word, und die Seitenzahl
 * stimmt.
 *
 * **Was das nicht heißt.** Für eine Schrift ohne Nachbau (Garamond, Verdana,
 * Bahnschrift …) gibt es hier nur die nächstbeste Gattung. Der Brief bleibt
 * lesbar und ordentlich gesetzt, sieht aber nicht aus wie das Original. Das
 * offen zu haben ist besser, als eine Treue zu behaupten, die nicht besteht.
 *
 * **Geladen wird erst beim Export.** Die Dateien wiegen zusammen mehrere
 * Megabyte; sie gehören nicht in den Startbedarf einer Seite, auf der man
 * zuerst ein Dokument hochlädt. `loadFonts` holt genau die Schnitte, die im
 * Brief vorkommen, und behält sie für weitere Ausfuhren.
 */

/** Eine geladene Schriftdatei samt dem Namen, unter dem sie im PDF steht. */
export interface FontFace {
  /** Dateiname ohne Endung, z. B. `Carlito-Bold` — im PDF der Basisname. */
  key: string
  font: TrueTypeFont
}

export interface FontProvider {
  face(fontFamily: string, bold: boolean, italic: boolean): FontFace
}

/** Die vier mitgelieferten Familien. */
export type BundledFamily = 'Carlito' | 'LiberationSans' | 'LiberationSerif' | 'LiberationMono'

const FALLBACK_FAMILY: BundledFamily = 'LiberationSans'

/**
 * Word-Schriftname → mitgelieferte Familie.
 *
 * Die erste Gruppe sind echte Metrikgleichheiten — dort stimmen die Breiten
 * auf die Einheit. Die zweite Gruppe ist Ersatz nach Gattung: Georgia und
 * Garamond sind Serifenschriften, also Liberation Serif, auch wenn sie
 * anders aussehen und anders breit sind.
 */
const FAMILY_BY_NAME = new Map<string, BundledFamily>([
  // Metrikgleich
  ['calibri', 'Carlito'],
  ['calibrilight', 'Carlito'],
  ['carlito', 'Carlito'],
  ['arial', 'LiberationSans'],
  ['arialmt', 'LiberationSans'],
  ['helvetica', 'LiberationSans'],
  ['liberationsans', 'LiberationSans'],
  ['arimo', 'LiberationSans'],
  ['timesnewroman', 'LiberationSerif'],
  ['timesnewromanpsmt', 'LiberationSerif'],
  ['times', 'LiberationSerif'],
  ['liberationserif', 'LiberationSerif'],
  ['tinos', 'LiberationSerif'],
  ['couriernew', 'LiberationMono'],
  ['courier', 'LiberationMono'],
  ['liberationmono', 'LiberationMono'],
  ['cousine', 'LiberationMono'],

  // Ersatz nach Gattung
  ['cambria', 'LiberationSerif'],
  ['georgia', 'LiberationSerif'],
  ['garamond', 'LiberationSerif'],
  ['bookantiqua', 'LiberationSerif'],
  ['palatinolinotype', 'LiberationSerif'],
  ['constantia', 'LiberationSerif'],
  ['segoeui', 'LiberationSans'],
  ['tahoma', 'LiberationSans'],
  ['verdana', 'LiberationSans'],
  ['trebuchetms', 'LiberationSans'],
  ['candara', 'LiberationSans'],
  ['corbel', 'LiberationSans'],
  ['centurygothic', 'LiberationSans'],
  ['consolas', 'LiberationMono'],
  ['lucidaconsole', 'LiberationMono'],
])

/** Vergleichsform eines Schriftnamens: ohne Leerzeichen, ohne Groß/Klein. */
function normalize(fontFamily: string): string {
  return fontFamily.toLowerCase().replace(/[\s-]/g, '')
}

export function bundledFamily(fontFamily: string): BundledFamily {
  const normalized = normalize(fontFamily)
  const direct = FAMILY_BY_NAME.get(normalized)
  if (direct) return direct

  // Unbekannter Name: nach dem entscheiden, was er über sich sagt. Word
  // schreibt zusammengesetzte Namen wie „Frutiger LT Std 45 Light".
  if (normalized.includes('mono') || normalized.includes('courier')) return 'LiberationMono'
  if (normalized.includes('serif') && !normalized.includes('sansserif')) return 'LiberationSerif'
  return FALLBACK_FAMILY
}

/** Der Dateiname einer Familie im gewünschten Schnitt, ohne Endung. */
export function fontFileKey(fontFamily: string, bold: boolean, italic: boolean): string {
  const style = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'
  return `${bundledFamily(fontFamily)}-${style}`
}

/**
 * Ein Anbieter über bereits geladene Dateien.
 *
 * Getrennt vom Laden, damit der Satz ohne Netz und ohne Browser prüfbar ist:
 * Die Tests reichen die Dateien von der Platte herein.
 */
export function createFontProvider(faces: ReadonlyMap<string, TrueTypeFont>): FontProvider {
  return {
    face(fontFamily, bold, italic) {
      const key = fontFileKey(fontFamily, bold, italic)
      const font = faces.get(key)
      if (font) return { key, font }

      // Fehlt der Schnitt, ist der gerade Schnitt derselben Familie immer
      // noch näher am Original als eine fremde Familie. Fett und kursiv
      // gehen dabei verloren — sichtbar, aber harmlos.
      const regular = `${bundledFamily(fontFamily)}-Regular`
      const fallback = faces.get(regular)
      if (fallback) return { key: regular, font: fallback }

      throw new Error(`Die Schriftdatei "${key}" wurde nicht geladen.`)
    },
  }
}

/** Bereits geladene Dateien, damit der zweite Export nichts mehr holt. */
const cache = new Map<string, TrueTypeFont>()

/**
 * Lädt die angeforderten Schnitte aus `public/fonts/pdf/`.
 *
 * Same-Origin, also von der CSP über `connect-src 'self'` gedeckt — es kommt
 * nichts von einem fremden Rechner (G2).
 */
export async function loadFonts(keys: Iterable<string>): Promise<FontProvider> {
  const missing = [...new Set(keys)].filter((key) => !cache.has(key))

  await Promise.all(
    missing.map(async (key) => {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/pdf/${key}.ttf`)
      if (!response.ok) {
        throw new Error(`Die Schriftdatei "${key}.ttf" ließ sich nicht laden (${response.status}).`)
      }
      cache.set(key, readTrueType(new Uint8Array(await response.arrayBuffer())))
    }),
  )

  return createFontProvider(cache)
}
