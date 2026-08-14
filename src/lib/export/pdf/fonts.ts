import { bundledFamily, fontFileKey } from '../../fonts/bundled'
import { loadBundledFonts } from '../../fonts/load'
import type { TrueTypeFont } from '../../fonts/truetype'

/**
 * Wählt für eine Schriftangabe aus dem Dokument die geladene Datei aus, mit
 * der das PDF sie setzt.
 *
 * Welche Datei zu welchem Word-Namen gehört, steht in `lib/fonts/bundled.ts`
 * — dort, weil die Arbeitsfläche dieselbe Zuordnung braucht und Bildschirm
 * und Ausfuhr niemals verschiedene Schriften zeigen dürfen. Geholt werden die
 * Dateien von `lib/fonts/load.ts`. Hier bleibt nur, was den PDF-Satz angeht:
 * der Rückfall auf den geraden Schnitt und die Kennung, unter der die Schrift
 * im PDF steht.
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

/** Lädt die angeforderten Schnitte und gibt einen Anbieter darüber zurück. */
export async function loadFonts(keys: Iterable<string>): Promise<FontProvider> {
  return createFontProvider(await loadBundledFonts(keys))
}
