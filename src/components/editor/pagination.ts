import type { Paragraph } from '@/lib/docx/model'

/**
 * Wie aus einem fortlaufenden Brief Seiten werden — und wie viel Leerraum
 * die Ansicht davon zeigt.
 *
 * Beides ist reine Rechnung über Zahlen und Texte, ohne DOM und ohne React,
 * damit die Fälle einzeln prüfbar sind: die zu hohe Seite, der übergroße
 * Absatz, der Brief ohne Absätze, der Lauf aus sieben Leerzeilen.
 */

/**
 * Teilt Absätze auf Seiten auf, gemessen an ihren tatsächlichen Höhen.
 *
 * **Getrennt wird nur zwischen Absätzen, nie in einem.** Der Absatztext im
 * DOM muss zeichengleich mit `Paragraph.text` bleiben (siehe
 * `documentSelection.ts`); ein über zwei Seitenkästen verteilter Absatz
 * wäre zwei Elemente, und jede Markierung zeigte danach auf die falsche
 * Stelle. Der Preis: Ein Absatz, der allein höher ist als eine Seite,
 * bekommt eine eigene Seite, die mitwächst. Lieber eine zu hohe Seite als
 * abgeschnittener Text — der Nutzer soll seinen Brief sehen.
 *
 * `pageHeight` ist die Höhe, die für Text zur Verfügung steht, also die
 * Seitenhöhe ohne Ränder. Ist sie 0 — vor der ersten Messung —, kommt alles
 * auf eine Seite: Ohne Maß darf nicht getrennt werden, sonst bekäme jeder
 * Absatz sein eigenes Blatt.
 */
export function splitIntoPages(heights: readonly number[], pageHeight: number): number[][] {
  if (heights.length === 0) return [[]]
  if (pageHeight <= 0) return [heights.map((_, index) => index)]

  const pages: number[][] = []
  let current: number[] = []
  let used = 0

  for (const [index, height] of heights.entries()) {
    const fits = used + height <= pageHeight
    if (!fits && current.length > 0) {
      pages.push(current)
      current = []
      used = 0
    }
    current.push(index)
    used += height
  }

  pages.push(current)
  return pages
}

/**
 * Wie viele leere Zeilen hintereinander stehen bleiben, bevor der Rest
 * zusammenfällt.
 *
 * Zwei, weil eine Leerzeile im Brief ein Absatzabstand ist und zwei eine
 * bewusste Lücke. Alles darüber ist Formatierung, die beim Schreiben
 * entstanden ist und in der Ansicht nur Platz kostet.
 */
export const VISIBLE_EMPTY_RUN = 2

/**
 * Die Absätze, deren Höhe die Ansicht zusammenfallen lässt: jede leere
 * Zeile eines Laufs ab der dritten.
 *
 * **Nur die Ansicht.** Die Absätze bleiben im Dokument, im DOM und im
 * Export — sie werden lediglich flach dargestellt. Sie aus dem DOM zu
 * nehmen hieße, ihre Offsets zu verlieren und sie unanklickbar zu machen;
 * sie aus dem Modell zu nehmen hieße, das Layout der Word-Datei zu ändern,
 * und genau das darf Applai nicht (siehe `docs/spec.md`, „Das Original mit
 * gepatchten Textstellen").
 *
 * Ein Absatz aus reinem Leerraum zählt als leer: Im Brief sieht er aus wie
 * eine Leerzeile, und der Nutzer unterscheidet die beiden nicht.
 */
export function collapsedEmptyParagraphs(paragraphs: readonly Paragraph[]): Set<number> {
  const collapsed = new Set<number>()
  let run = 0

  for (const paragraph of paragraphs) {
    if (paragraph.text.trim() === '') {
      run += 1
      if (run > VISIBLE_EMPTY_RUN) collapsed.add(paragraph.index)
    } else {
      run = 0
    }
  }

  return collapsed
}
