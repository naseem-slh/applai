import { useCallback, useEffect, useRef, useState } from 'react'
import type { Range as TextRange } from '@/lib/docx/replace'
import type { MarkAnchor, StorageAdapter } from '@/lib/storage/adapter'
import { letterFingerprint, restoreMarks, toggleMark, type Mark } from './marks'

/**
 * Die vorgemerkten Stellen als Vorgang: vormerken, abhaken, entfernen — und
 * das stille Gedächtnis dahinter.
 *
 * **Der Zustand liegt nicht hier, sondern im Verlauf.** `marks` und
 * `setMarks` kommen von `useDocumentHistory`, damit Strg+Z Text und Stellen
 * zusammen zurückholt (Begründung dort). Dieser Haken besitzt nur, was den
 * Verlauf nichts angeht: die nicht wiedergefundenen Anker, die Auskunft
 * über das Wiederherstellen und den Fingerabdruck des Anschreibens.
 *
 * **Ohne Verwaltung.** Es gibt keine benannten Vorlagen und keine Liste zum
 * Auswählen. Die Stellen werden zum geladenen Anschreiben gemerkt und beim
 * nächsten Mal von selbst wieder gesetzt; sichtbar ist davon eine Zeile,
 * die sagt, was geschehen ist.
 */

/** Wie lange nach der letzten Änderung gewartet wird, bevor gespeichert wird. */
export const MARK_SAVE_DELAY_MS = 1000

/**
 * Wie viele Sätze aufbewahrt werden. Beim Speichern fällt der älteste
 * heraus.
 *
 * Die Zahl steht hier und nicht in der Speicherschicht — dieselbe Trennung
 * wie bei der Frist von `purgeExpiredDrafts`: Wie viel Gedächtnis sinnvoll
 * ist, weiß die Oberfläche, nicht die Ablage. Zehn Grundanschreiben sind
 * für einen Nutzerkreis aus dem Betreiber und Bekannten reichlich, und der
 * Rückfall unten braucht ohnehin nur den jüngsten.
 */
export const MARK_SET_LIMIT = 10

/** Was beim Betreten wiederhergestellt wurde — Grundlage der Statuszeile. */
export interface MarksRestore {
  /** Wie viele Stellen gesetzt wurden. */
  restored: number
  /** Wie viele Anker der Satz enthielt. */
  total: number
  /** Kam der Satz von einem anderen Anschreiben (Rückfall)? */
  fromOtherLetter: boolean
}

export interface MarksOptions {
  storage: StorageAdapter
  /**
   * Der Text des **hochgeladenen** Anschreibens. Er bestimmt den
   * Fingerabdruck — nicht der Arbeitsstand, der sich mit jedem Tastendruck
   * ändert und den Satz sonst bei jeder Eingabe unter einer neuen Kennung
   * ablegen würde.
   */
  letterText: string | null
  /** Der laufende Dokumenttext. Aus ihm entstehen Anker und Vorschau. */
  documentText: string | null
  marks: readonly Mark[]
  setMarks: (marks: readonly Mark[]) => void
}

export interface MarksHandle {
  /** Anker, die im Brief nicht mehr eindeutig auffindbar sind. */
  unresolved: readonly MarkAnchor[]
  /** Was beim Betreten geschah, `null` wenn nichts wiederhergestellt wurde. */
  restore: MarksRestore | null
  /**
   * `false`, solange das Wiederherstellen läuft. Vorher darf nichts
   * gespeichert werden — ein leerer Stand würde den gemerkten Satz löschen,
   * bevor er gelesen ist.
   */
  ready: boolean
  /** Vormerken, aufheben oder ersetzen — siehe `toggleMark`. */
  toggle: (range: TextRange) => void
  remove: (id: string) => void
  clearAll: () => void
  setDone: (id: string, done: boolean) => void
  /** Einen nicht wiedergefundenen Anker aus der Restliste nehmen. */
  dismiss: (anchor: MarkAnchor) => void
}

export function useMarks({
  storage,
  letterText,
  documentText,
  marks,
  setMarks,
}: MarksOptions): MarksHandle {
  const [unresolved, setUnresolved] = useState<readonly MarkAnchor[]>([])
  const [restore, setRestore] = useState<MarksRestore | null>(null)
  const [ready, setReady] = useState(false)
  const fingerprint = useRef<string | null>(null)

  // `setMarks` wechselt bei jedem Rendern die Identität (es kommt aus einem
  // `useMemo` über dem Verlaufszustand). In der Abhängigkeitsliste des
  // Wiederherstellens würde es den Effekt endlos neu starten; gebraucht wird
  // aber immer nur die jeweils letzte Fassung.
  const apply = useRef(setMarks)
  apply.current = setMarks

  useEffect(() => {
    if (letterText === null || letterText.trim() === '') return
    let cancelled = false

    void (async () => {
      try {
        const id = await letterFingerprint(letterText)
        if (cancelled) return
        fingerprint.current = id

        const own = await storage.loadMarkSet(id)
        if (cancelled) return

        const chosen = own ?? (await mostRecentOtherSet(storage, id))
        if (cancelled) return

        if (chosen !== null) {
          const found = restoreMarks(letterText, chosen.anchors, (index) => `mark-${index}`)
          const fromOtherLetter = chosen.id !== id
          // Ein fremder Satz wird nur übernommen, wenn er erkennbar zu
          // diesem Brief gehört: mehr als die Hälfte seiner Stellen muss
          // wiederzufinden sein. Das unterscheidet „dasselbe Anschreiben,
          // überarbeitet" von „ein anderes Anschreiben, in dem zufällig ein
          // Satz gleich lautet".
          const fits = !fromOtherLetter || found.marks.length * 2 > chosen.anchors.length
          if (fits) {
            // Auch ein Satz, von dem **nichts** wiedergefunden wurde, wird
            // berichtet: „0 von 5 wiedergefunden" samt Restliste ist die
            // Auskunft, die der Nutzer braucht — schweigen hieße, die
            // Vormerkungen wären nie da gewesen.
            if (found.marks.length > 0) apply.current(found.marks)
            setUnresolved(found.unresolved)
            setRestore({
              restored: found.marks.length,
              total: chosen.anchors.length,
              fromOtherLetter,
            })
          }
        }
      } catch {
        // Ein nicht erreichbarer Speicher ist bereits über
        // `storageUnavailable` sichtbar (siehe `AppProvider`). Ohne
        // Gedächtnis funktioniert das Vormerken innerhalb der Sitzung
        // weiter — das ist der bessere Ausgang als eine zweite Meldung.
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [storage, letterText])

  useEffect(() => {
    const id = fingerprint.current
    if (!ready || id === null) return

    const timer = setTimeout(() => {
      void persist(storage, id, marks)
    }, MARK_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [ready, marks, storage])

  const toggle = useCallback(
    (range: TextRange) => {
      if (documentText === null) return
      setMarks(toggleMark(marks, documentText, range, crypto.randomUUID()))
    },
    [documentText, marks, setMarks],
  )

  const remove = useCallback(
    (id: string) => setMarks(marks.filter((mark) => mark.id !== id)),
    [marks, setMarks],
  )

  const clearAll = useCallback(() => {
    setMarks([])
    setUnresolved([])
    setRestore(null)
  }, [setMarks])

  const setDone = useCallback(
    (id: string, done: boolean) =>
      setMarks(marks.map((mark) => (mark.id === id ? { ...mark, done } : mark))),
    [marks, setMarks],
  )

  const dismiss = useCallback(
    (anchor: MarkAnchor) => setUnresolved((current) => current.filter((entry) => entry !== anchor)),
    [],
  )

  return { unresolved, restore, ready, toggle, remove, clearAll, setDone, dismiss }
}

/** Der zuletzt gespeicherte Satz eines **anderen** Anschreibens. */
async function mostRecentOtherSet(storage: StorageAdapter, ownId: string) {
  const sets = await storage.listMarkSets()
  return (
    sets
      .filter((set) => set.id !== ownId && set.anchors.length > 0)
      .sort((a, b) => b.savedAt - a.savedAt)[0] ?? null
  )
}

async function persist(storage: StorageAdapter, id: string, marks: readonly Mark[]): Promise<void> {
  try {
    if (marks.length === 0) {
      await storage.deleteMarkSet(id)
      return
    }
    await storage.saveMarkSet({
      id,
      anchors: marks.map((mark) => mark.anchor),
      savedAt: Date.now(),
    })
    const sets = await storage.listMarkSets()
    if (sets.length <= MARK_SET_LIMIT) return
    const surplus = [...sets].sort((a, b) => b.savedAt - a.savedAt).slice(MARK_SET_LIMIT)
    for (const set of surplus) {
      await storage.deleteMarkSet(set.id)
    }
  } catch {
    // Siehe oben: ohne Gedächtnis wird weitergearbeitet, nicht gemeldet.
  }
}
