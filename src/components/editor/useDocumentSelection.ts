import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { DocxDocument } from '@/lib/docx/model'
import type { Range as TextRange } from '@/lib/docx/replace'
import {
  createSelection,
  paragraphIndexOf,
  rangeToDomRange,
  selectionToRange,
  type EditorSelection,
} from './documentSelection'

/**
 * Hält die Markierung der Arbeitsfläche nach: die mit der Maus gezogene
 * ebenso wie die über einen Knopf gesetzte („ganzes Dokument", „dieser
 * Absatz").
 *
 * Zwei Regeln, die nicht offensichtlich sind:
 *
 * - **Eine Markierung außerhalb der Dokumentfläche löscht die bestehende
 *   nicht.** Ein Klick auf einen Knopf der Werkzeugleiste legt in den
 *   meisten Browsern eine zusammengefallene Markierung dorthin. Würde das
 *   die Auswahl löschen, wäre sie in genau dem Augenblick weg, in dem etwas
 *   mit ihr geschehen soll. Ein Klick **in** den Text löscht sie dagegen
 *   sehr wohl: Dort ist das Zusammenfallen die Absicht des Nutzers.
 * - **Die fertige Markierung wird eigens gemeldet.** `selectionchange`
 *   feuert beim Ziehen fortwährend; jeder Zwischenstand ist eine
 *   Markierung, aber keine Absicht. Erst das Loslassen der Maustaste oder
 *   der Umschalttaste sagt, dass der Nutzer fertig ist — und nur dann ruft
 *   der Haken {@link DocumentSelectionOptions.onSettled}. Daran hängt das
 *   Vormerken: Ohne diese Unterscheidung entstünde für einen Zug mit der
 *   Maus ein Dutzend Stellen, die einander sofort wieder ersetzen.
 *
 *   Gemeldet wird auch ein **zusammengefallener** Bereich, also ein bloßer
 *   Klick. Er ist die Geste, mit der eine vorgemerkte Stelle wieder
 *   aufgehoben wird; was damit geschieht, entscheidet die Arbeitsfläche.
 * - **Jede Änderung am Dokument löscht die Markierung.** Ihre Offsets
 *   beziehen sich auf einen Text, den es danach nicht mehr gibt; sie
 *   weiterzuführen hieße, auf eine verschobene Stelle zu zeigen.
 */

export interface DocumentSelectionHandle {
  selection: EditorSelection | null
  /**
   * Der Absatz, in dem der Schreibcursor zuletzt stand — die Grundlage für
   * „aktueller Absatz". `null`, solange er in keinem steht.
   */
  caretParagraph: number | null
  /**
   * Setzt eine Markierung von außen und hebt sie im Browser sichtbar
   * hervor. Wirkt auch dann, wenn die Maus-Markierung abgeschaltet ist
   * (schmale Bildschirme, „ganzes Dokument").
   */
  select: (range: TextRange) => void
  clear: () => void
}

export interface DocumentSelectionOptions {
  /** Die Fläche, die die Absätze trägt. */
  rootRef: RefObject<HTMLElement | null>
  document: DocxDocument | null
  /** Der Maus-Markierung folgen? Auf schmalen Bildschirmen nicht. */
  trackPointerSelection?: boolean
  /**
   * Die **fertige** Markierung, sobald Maustaste oder Umschalttaste
   * losgelassen wurden. `null`, wenn sich kein Bereich zuordnen ließ; ein
   * zusammengefallener Bereich (`from === to`) ist ein Klick.
   */
  onSettled?: (range: TextRange | null) => void
}

export function useDocumentSelection({
  rootRef,
  // Umbenannt, damit `document` weiterhin das Browser-Dokument meint.
  document: docx,
  trackPointerSelection = true,
  onSettled,
}: DocumentSelectionOptions): DocumentSelectionHandle {
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [caretParagraph, setCaretParagraph] = useState<number | null>(null)

  const settled = useRef(onSettled)
  settled.current = onSettled

  useEffect(() => {
    setSelection(null)
  }, [docx])

  useEffect(() => {
    if (docx === null) return

    const handle = () => {
      const root = rootRef.current
      if (root === null) return
      const domSelection = window.getSelection()
      const anchor = domSelection?.anchorNode ?? null
      if (domSelection === null || anchor === null || !root.contains(anchor)) return

      // **Der Absatz wird immer nachgehalten, auch ohne Feinmarkierung.**
      // Mit dem Finger gibt es keine gezogene Markierung, aber sehr wohl
      // einen Schreibcursor: Ein Tippen setzt ihn, und daraus wird „dieser
      // Absatz". Ohne das bliebe unterwegs nur „ganzes Dokument" — und
      // genau das darf ein Lebenslauf nicht anbieten, weil eine
      // Umformulierung am Stück seine Gliederung einebnet.
      setCaretParagraph(paragraphIndexOf(domSelection.focusNode))
      if (!trackPointerSelection) return

      const range = selectionToRange(root, domSelection)
      if (range === null) return
      setSelection(range.to > range.from ? createSelection(docx, range) : null)
    }

    document.addEventListener('selectionchange', handle)
    return () => document.removeEventListener('selectionchange', handle)
  }, [docx, rootRef, trackPointerSelection])

  useEffect(() => {
    const root = rootRef.current
    if (root === null || docx === null) return

    // Die Markierung wird hier **frisch gelesen**, nicht aus einem beim
    // `selectionchange` gemerkten Wert. Das Ereignis feuert verzögert: Beim
    // Klick in einen anderen Absatz steht im gemerkten Wert noch die vorige
    // Markierung, und die würde dann als „dieselbe noch einmal markiert"
    // gelten und die Vormerkung aufheben. Nachgestellt im Browser, nicht
    // hergeleitet. Der DOM-Zustand ist zum Zeitpunkt des Loslassens bereits
    // richtig, nur die Benachrichtigung darüber hinkt hinterher.
    const finish = () => {
      const domSelection = window.getSelection()
      const anchor = domSelection?.anchorNode ?? null
      if (domSelection === null || anchor === null || !root.contains(anchor)) return
      settled.current?.(selectionToRange(root, domSelection))
    }
    // Nur das Loslassen der Umschalttaste: Jeder andere Tastendruck im
    // Brief ist Tippen, und Tippen ist keine fertige Markierung.
    const finishKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Shift') finish()
    }

    root.addEventListener('pointerup', finish)
    root.addEventListener('keyup', finishKeyboard)
    return () => {
      root.removeEventListener('pointerup', finish)
      root.removeEventListener('keyup', finishKeyboard)
    }
  }, [docx, rootRef])

  const select = useCallback(
    (range: TextRange) => {
      if (docx === null) return
      const next = createSelection(docx, range)
      setSelection(next)

      const root = rootRef.current
      if (root === null || next === null) return
      const domRange = rangeToDomRange(root, next.range)
      const domSelection = window.getSelection()
      if (domRange === null || domSelection === null) return
      domSelection.removeAllRanges()
      domSelection.addRange(domRange)
    },
    [docx, rootRef],
  )

  const clear = useCallback(() => setSelection(null), [])

  return useMemo(
    () => ({ selection, caretParagraph, select, clear }),
    [selection, caretParagraph, select, clear],
  )
}
