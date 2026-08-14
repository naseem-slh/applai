import { readTrueType, type TrueTypeFont } from './truetype'

/**
 * Holt die mitgelieferten Schriftdateien aus `public/fonts/pdf/`.
 *
 * **Same-Origin**, also von der CSP über `connect-src 'self'` gedeckt — es
 * kommt nichts von einem fremden Rechner (G2).
 *
 * **Geladen wird erst, wenn ein Dokument offen ist.** Die Dateien wiegen
 * zusammen mehrere Megabyte; sie gehören nicht in den Startbedarf einer
 * Seite, auf der man zuerst etwas hochlädt. Geholt werden genau die
 * Schnitte, die im Dokument vorkommen.
 *
 * **Ein Abruf, zwei Verwendungen.** `TrueTypeFont` behält die ganze Datei
 * (`truetype.ts`, Feld `bytes`). Derselbe Eintrag bedient deshalb den
 * PDF-Satz, der Vorschubbreiten und Umrisse braucht, und die Arbeitsfläche,
 * die daraus eine `FontFace` für den Browser baut. Ein zweiter Abruf für die
 * Darstellung wäre dieselben 286 kB noch einmal.
 */

/** Bereits geladene Dateien, damit der zweite Aufruf nichts mehr holt. */
const cache = new Map<string, TrueTypeFont>()

export async function loadBundledFonts(
  keys: Iterable<string>,
): Promise<ReadonlyMap<string, TrueTypeFont>> {
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

  return cache
}
