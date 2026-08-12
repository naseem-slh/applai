/**
 * Das Kopierfeld: der Reintext des Anschreibens in der Zwischenablage, für
 * Online-Formulare (`docs/spec.md`).
 *
 * **Warum eine eigene Datei für drei Zeilen.** Weil es nicht drei Zeilen
 * sind: Die Zwischenablage ist eine der wenigen Browser-Schnittstellen, die
 * an einer sicheren Herkunft, an einer Berechtigung und an einer
 * Nutzergeste zugleich hängt. Sie kann also aus mehreren Gründen scheitern,
 * und die Oberfläche muss das melden statt so zu tun, als sei kopiert
 * worden. Genau dafür gibt es hier einen Rückgabewert statt einer stillen
 * Ausnahme.
 */

/**
 * Der Reintext, so wie er in ein Formularfeld gehört.
 *
 * `DocxDocument.text` verbindet die Absätze mit einem einfachen `\n`. In
 * einem Formularfeld stünden sie dadurch ohne Leerzeile untereinander, was
 * einen Brief unleserlich macht. Zwischen den Absätzen steht deshalb eine
 * Leerzeile, und die leeren Absätze des Word-Originals (die Abstände vor der
 * Unterschrift) fallen weg — im Reintext sind sie genau diese Leerzeile.
 *
 * **Der Preis, benannt statt versteckt:** Zeilen, die im Brief eng
 * zusammengehören („Mit freundlichen Grüßen" und der Name darunter), stehen
 * danach ebenfalls mit einer Leerzeile dazwischen. Reintext kennt den
 * Unterschied zwischen Absatz und Zeilenumbruch nicht mehr, und für ein
 * Formularfeld ist die durchgehende Regel die verlässlichere als eine
 * Heuristik, die bei der Grußformel raten müsste.
 */
export function toPlainText(documentText: string): string {
  return documentText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n\n')
}

export type CopyResult = 'copied' | 'failed'

/**
 * Schreibt den Text in die Zwischenablage.
 *
 * Kein Rückfall auf `document.execCommand('copy')`: Der ist überall als
 * veraltet gekennzeichnet, verlangt ein sichtbares Hilfselement im DOM und
 * scheitert in denselben Fällen, in denen auch die moderne Schnittstelle
 * scheitert (unsichere Herkunft, verweigerte Berechtigung). Ein zweiter Weg,
 * der dieselben Fälle nicht abdeckt, wäre nur ein zweiter Codeweg.
 *
 * Der Aufrufer bekommt statt einer Ausnahme ein Ergebnis: „kopiert" oder
 * „nicht kopiert" ist alles, was die Oberfläche daraus machen kann, und ein
 * `try`/`catch` an jeder Aufrufstelle wäre dieselbe Unterscheidung noch
 * einmal.
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return 'failed'
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
