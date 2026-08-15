import { useEffect, useState } from 'react'

import type { CharacterFormat, DocumentFormat } from '@/lib/docx/format'
import { bundledFamily, fontFileKey } from '@/lib/fonts/bundled'
import { loadBundledFonts } from '@/lib/fonts/load'
import { requiredFontKeys } from '@/lib/fonts/required'
import type { TrueTypeFont } from '@/lib/fonts/truetype'
import type { NaturalLineHeight } from './documentStyle'

/**
 * Meldet die mitgelieferten Schriften beim Browser an und liefert die
 * Zeilenhöhen, mit denen die Arbeitsfläche rechnet.
 *
 * **Ein Abruf, zwei Verwendungen.** Dieselbe Datei beantwortet beide Fragen,
 * die die Fläche an eine Schrift hat: *Wie sieht sie aus?* (als `FontFace`
 * angemeldet, damit CSS sie benutzen kann) und *wie hoch ist eine Zeile
 * darin?* (aus der `hhea`-Tabelle). Die Zeilenhöhe ließe sich nicht aus dem
 * Browser erfragen — sein `line-height: normal` ist nicht Words „einzeilig",
 * und ein Vielfaches davon lässt sich in CSS gar nicht ausdrücken.
 *
 * **Angemeldet wird je Familie, nicht je Datei.** Carlito-Bold kommt als
 * `Carlito` mit `weight: 700` herein. Damit wählt der Browser den Schnitt
 * selbst, und wo ein Schnitt fehlt, greift sein eigener Ersatz statt eines
 * Fehlers.
 */

/**
 * Womit gerechnet wird, solange die Dateien noch unterwegs sind.
 *
 * Zwischen Carlito (1,22) und Liberation Sans (1,15). Der Brief steht damit
 * sofort und setzt sich, sobald die Metriken da sind — besser als ein leerer
 * Bereich, und deutlich besser als eine Zeilenhöhe von null.
 */
export const FALLBACK_LINE_RATIO = 1.2

/** `Carlito-BoldItalic` → wie CSS die Datei ansprechen soll. */
export function faceDescriptor(key: string): {
  family: string
  weight: number
  style: string
} {
  const separator = key.lastIndexOf('-')
  const family = separator === -1 ? key : key.slice(0, separator)
  const cut = separator === -1 ? '' : key.slice(separator + 1)
  return {
    family,
    weight: cut.includes('Bold') ? 700 : 400,
    style: cut.includes('Italic') ? 'italic' : 'normal',
  }
}

/**
 * Die natürliche Zeilenhöhe einer Schrift in Punkt: `ascent - descent +
 * lineGap` aus der `hhea`-Tabelle, auf den Grad gerechnet.
 *
 * Dieselbe Rechnung, mit der Word „einzeilig" bemisst und mit der
 * `export/pdf/layout.ts` setzt — Calibri 11 pt ergibt so 13,4 pt. Liefe die
 * Fläche auf einer anderen Formel, stünde der Brief auf dem Schirm anders
 * umbrochen als in der Datei, die der Nutzer verschickt.
 */
export function naturalLineHeightFrom(
  fonts: ReadonlyMap<string, TrueTypeFont>,
): NaturalLineHeight {
  return (format: CharacterFormat): number => {
    const font =
      fonts.get(fontFileKey(format.fontFamily, format.bold, format.italic)) ??
      // Fehlt der Schnitt, ist der gerade derselben Familie näher als nichts
      // — dieselbe Regel wie beim PDF-Satz (`export/pdf/fonts.ts`).
      fonts.get(`${bundledFamily(format.fontFamily)}-Regular`)
    if (font === undefined) return format.sizePt * FALLBACK_LINE_RATIO

    const { unitsPerEm, ascent, descent, lineGap } = font.metrics
    return ((ascent - descent + lineGap) * format.sizePt) / unitsPerEm
  }
}

/** Schon angemeldete Dateien — `document.fonts` ist für das ganze Fenster. */
const registered = new Set<string>()

function register(key: string, font: TrueTypeFont): void {
  if (registered.has(key)) return
  // In jsdom gibt es weder `FontFace` noch `document.fonts`; die Tests der
  // Fläche laufen trotzdem, sie messen ohnehin keine Glyphen.
  if (typeof FontFace !== 'function' || !document.fonts) return

  const { family, weight, style } = faceDescriptor(key)
  const face = new FontFace(family, font.bytes as BufferSource, {
    weight: String(weight),
    style,
  })
  registered.add(key)
  void face.load().then(
    (loaded) => document.fonts.add(loaded),
    () => {
      // Eine Datei, die sich nicht auswerten lässt, darf den Brief nicht
      // aufhalten: Der Browser setzt ihn dann in seiner Ersatzschrift.
      registered.delete(key)
    },
  )
}

/**
 * Lädt die Schnitte, die das Dokument braucht, und gibt die Zeilenhöhen
 * dazu zurück.
 *
 * Vor dem Laden gilt {@link FALLBACK_LINE_RATIO}; wenn die Dateien da sind,
 * rechnet dieselbe Funktion genau, und die Fläche setzt sich neu.
 */
export function useDocumentFonts(format: DocumentFormat | null): NaturalLineHeight {
  const [fonts, setFonts] = useState<ReadonlyMap<string, TrueTypeFont>>(() => new Map())

  useEffect(() => {
    if (format === null) return
    let cancelled = false

    void loadBundledFonts(requiredFontKeys(format)).then(
      (loaded) => {
        if (cancelled) return
        for (const [key, font] of loaded) register(key, font)
        // Eine neue Zuordnung, damit React den Wechsel bemerkt:
        // `loadBundledFonts` gibt seinen Zwischenspeicher selbst zurück.
        setFonts(new Map(loaded))
      },
      () => {
        // Ohne die Dateien bleibt es beim Schätzwert. Der Brief ist dann in
        // der Ersatzschrift des Browsers gesetzt, aber er ist da.
      },
    )

    return () => {
      cancelled = true
    }
  }, [format])

  return naturalLineHeightFrom(fonts)
}
