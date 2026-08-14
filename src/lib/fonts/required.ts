import type { CharacterFormat, DocumentFormat, FormattedParagraph } from '../docx/format'
import { fontFileKey } from './bundled'

/**
 * Sammelt die Schnitte, die ein Dokument braucht — damit der Aufrufer sie
 * laden kann, bevor gesetzt oder gezeigt wird.
 *
 * Beide Seiten brauchen dieselbe Liste: Der PDF-Satz greift nie ins Netz,
 * und die Arbeitsfläche meldet genau diese Dateien als `FontFace` an. Liefe
 * die eine Seite auf einer anderen Liste, zeigte der Bildschirm eine andere
 * Schrift als die Datei, die der Nutzer verschickt.
 */
export function requiredFontKeys(format: DocumentFormat): string[] {
  const keys = new Set<string>()
  const collect = (paragraphs: FormattedParagraph[] | null): void => {
    for (const paragraph of paragraphs ?? []) {
      keys.add(fontKeyOf(paragraph.markFormat))
      for (const item of paragraph.items) keys.add(fontKeyOf(item.format))
    }
  }

  collect(format.paragraphs)
  // Auch die Absätze in Textfeldern — sonst fehlt beim Setzen die Datei.
  for (const float of format.floats) {
    if (float.content.kind === 'textbox') collect(float.content.paragraphs)
  }
  for (const parts of [format.header, format.footer]) {
    collect(parts.default)
    collect(parts.first)
    collect(parts.even)
  }
  return [...keys]
}

// Dieselbe Herleitung, die `bundled.ts` beim Nachschlagen benutzt — sonst
// lädt der Aufrufer andere Dateien, als der Satz später verlangt.
function fontKeyOf(format: CharacterFormat): string {
  return fontFileKey(format.fontFamily, format.bold, format.italic)
}
