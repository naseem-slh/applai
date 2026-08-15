/**
 * Wie aus einem fortlaufenden Brief Seiten werden.
 *
 * Reine Rechnung über Zahlen, ohne DOM und ohne React, damit die Fälle
 * einzeln prüfbar sind: die zu hohe Seite, der übergroße Absatz, der Brief
 * ohne Absätze.
 */

/**
 * Teilt Absätze auf Seiten auf, gemessen an ihren tatsächlichen Höhen.
 *
 * **Getrennt wird nur zwischen Absätzen, nie in einem.** Der Absatztext im
 * DOM muss zeichengleich mit `Paragraph.text` bleiben (siehe
 * `documentSelection.ts`); ein über zwei Seitenkästen verteilter Absatz
 * wäre zwei Elemente, und jede Markierung zeigte danach auf die falsche
 * Stelle.
 *
 * Daraus folgt der eine Fall, in dem eine Seite ihr Maß überschreitet: ein
 * Absatz, der allein höher ist als eine Seite. Er wird **nicht** auf ein
 * frisches Blatt geschoben, sondern bleibt, wo er anfällt, und lässt seine
 * Seite wachsen. Die erste Fassung tat das Gegenteil, und das Ergebnis war
 * eine fast leere Seite davor — gemeldet als „warum ist der Text schon auf
 * Seite 2, da ist doch noch Platz". Überlaufen muss er so oder so; dann
 * lieber ohne verschenkten Platz.
 *
 * `pageHeight` ist die Höhe, die für Text zur Verfügung steht, also die
 * Seitenhöhe ohne Ränder. `gap` ist der Abstand zwischen zwei Absätzen; er
 * fällt nur zwischen ihnen an, nicht hinter dem letzten. Ist sie 0 — vor der ersten Messung —, kommt alles
 * auf eine Seite: Ohne Maß darf nicht getrennt werden, sonst bekäme jeder
 * Absatz sein eigenes Blatt.
 */
export function splitIntoPages(
  heights: readonly number[],
  pageHeight: number,
  gap = 0,
): number[][] {
  if (heights.length === 0) return [[]]
  if (pageHeight <= 0) return [heights.map((_, index) => index)]

  const pages: number[][] = []
  let current: number[] = []
  let used = 0

  for (const [index, height] of heights.entries()) {
    // Der Abstand fällt nur **zwischen** zwei Absätzen an, nicht hinter dem
    // letzten. Ihn jedem Absatz zuzuschlagen verschenkte je Seite einen
    // Abstand.
    const needed = (current.length > 0 ? gap : 0) + height
    const fits = used + needed <= pageHeight
    // Ein Absatz, der auch allein auf keine Seite passt, gewinnt durch ein
    // frisches Blatt nichts — er liefe dort genauso über und ließe hier
    // eine Lücke.
    const fitsOnItsOwnPage = height <= pageHeight
    if (!fits && current.length > 0 && fitsOnItsOwnPage) {
      pages.push(current)
      current = []
      used = 0
    }
    // Nach einem Umbruch steht der Absatz am Kopf der neuen Seite und
    // kostet den Abstand nicht mehr — deshalb wird hier erneut gefragt und
    // nicht `needed` weiterverwendet.
    const cost = (current.length > 0 ? gap : 0) + height
    current.push(index)
    used += cost
  }

  pages.push(current)
  return pages
}
