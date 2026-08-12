import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
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
}

export function useDocumentSelection({
  rootRef,
  // Umbenannt, damit `document` weiterhin das Browser-Dokument meint.
  document: docx,
  trackPointerSelection = true,
}: DocumentSelectionOptions): DocumentSelectionHandle {
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [caretParagraph, setCaretParagraph] = useState<number | null>(null)

  useEffect(() => {
    setSelection(null)
  }, [docx])

  useEffect(() => {
    if (!trackPointerSelection || docx === null) return

    const handle = () => {
      const root = rootRef.current
      if (root === null) return
      const domSelection = window.getSelection()
      const anchor = domSelection?.anchorNode ?? null
      if (domSelection === null || anchor === null || !root.contains(anchor)) return

      setCaretParagraph(paragraphIndexOf(domSelection.focusNode))
      const range = selectionToRange(root, domSelection)
      if (range === null) return
      setSelection(range.to > range.from ? createSelection(docx, range) : null)
    }

    document.addEventListener('selectionchange', handle)
    return () => document.removeEventListener('selectionchange', handle)
  }, [docx, rootRef, trackPointerSelection])

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
