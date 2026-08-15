import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocxDocument } from '@/lib/docx/model'
import { serializeDocx } from '@/lib/docx/serialize'
import type { StorageAdapter } from '@/lib/storage/adapter'

/**
 * Der automatische Zwischenstand: alle 20 Sekunden über `saveDraft`, und
 * nur dann, wenn sich seit dem letzten erfolgreichen Sichern etwas geändert
 * hat.
 *
 * **Die Anzeige darf nicht lügen.** „Zwischenstand gesichert vor …" erscheint
 * ausschließlich, nachdem `saveDraft` tatsächlich zurückgekehrt ist — nicht,
 * wenn der Versuch begonnen hat. Scheitert das Sichern (gesperrter Speicher,
 * privater Modus, voller Datenträger), tritt an die Stelle der Zeitangabe
 * eine Meldung, dass der Zwischenstand nicht gesichert werden konnte. Eine
 * relative Zeit, die weiterzählt, während das Sichern seit Minuten
 * fehlschlägt, wäre die gefährlichste Anzeige der ganzen Anwendung: Sie
 * verspricht genau das, was gerade nicht passiert.
 *
 * **G5:** Der Dokumentinhalt geht ausschließlich in IndexedDB, über
 * `StorageAdapter.saveDraft`. Diese Aufgabe ist der größte Erzeuger genau
 * der Daten, die G5 regelt; ein `localStorage`-Zugriff kommt hier nirgends
 * vor.
 */

export const AUTOSAVE_INTERVAL_MS = 20_000

export type DraftSaveState =
  /** Seit dem Laden hat sich nichts geändert, es wurde noch nichts gesichert. */
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; at: number }
  | { status: 'failed' }

export interface DraftAutosaveOptions {
  storage: StorageAdapter
  /** Kennung des Entwurfs, siehe `appContext.ts` (`LETTER_DRAFT_ID`). */
  draftId: string
  document: DocxDocument | null
  /** Abschalten, solange nichts zu sichern ist (Ladevorgang, Fehlerzustand). */
  enabled?: boolean
  /**
   * Kennung der Stellenanzeige, für die die selbsttätige
   * Briefkopf-Übernahme (`Editor.tsx`) zuletzt gelaufen ist
   * (`Draft.letterheadAppliedFor`) — wird bei jedem Sichern mitgeführt,
   * UNABHÄNGIG davon, ob sich zugleich der Dokumentinhalt geändert hat
   * (siehe `save()` unten): Lief die Übernahme, fand aber nichts zu
   * ersetzen, ändert sich das Dokument nicht, wohl aber diese Kennung —
   * und genau dieser Fall muss trotzdem gesichert werden, sonst bliebe die
   * Sperre über Sitzungen hinweg (Schaden 2) für ihn wirkungslos.
   *
   * `null`/`undefined`, solange noch keine Übernahme lief oder dieser
   * Entwurf sie nicht braucht (Lebenslauf).
   */
  letterheadAppliedFor?: string | null
}

export function useDraftAutosave({
  storage,
  draftId,
  document,
  enabled = true,
  letterheadAppliedFor = null,
}: DraftAutosaveOptions): DraftSaveState {
  const [state, setState] = useState<DraftSaveState>({ status: 'idle' })

  const currentRef = useRef<DocxDocument | null>(null)
  /**
   * Der zuletzt erfolgreich gesicherte Stand — als Referenz, nicht als
   * Inhaltsvergleich. `replaceRange` liefert bei jeder Änderung ein neues
   * Objekt, und ein „Rückgängig" bis zum Anfang stellt genau dasselbe
   * Objekt wieder her; die Identität ist deshalb die genaue Antwort auf
   * „hat sich etwas geändert".
   */
  const savedRef = useRef<DocxDocument | null>(null)
  /**
   * Dieselbe Zusicherung wie `savedRef`, nur für `letterheadAppliedFor`.
   * Beide starten auf demselben Anfangswert (analog zur Bootstrap-Regel für
   * `savedRef` unten): Eine Kennung, die schon beim Laden mitgegeben wurde
   * — aus einem fortgesetzten Entwurf —, gilt als bereits gesichert und
   * löst keinen unnötigen Schreibzugriff aus.
   */
  const appliedForRef = useRef<string | null>(letterheadAppliedFor)
  const savedAppliedForRef = useRef<string | null>(letterheadAppliedFor)
  const savingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    currentRef.current = document
    // Das erste geladene Dokument gilt als gesichert: Die Einstiegsseite hat
    // es beim Weitergehen bereits abgelegt. Ohne diesen Anfangsstand
    // schriebe die Arbeitsfläche nach 20 Sekunden unveränderte Bytes und
    // meldete einen Fortschritt, den es nicht gab.
    if (document !== null && savedRef.current === null) savedRef.current = document
  }, [document])

  useEffect(() => {
    appliedForRef.current = letterheadAppliedFor
  }, [letterheadAppliedFor])

  const save = useCallback(async () => {
    const current = currentRef.current
    const appliedFor = appliedForRef.current
    // Gesichert wird, wenn sich SEIT DEM LETZTEN SICHERN eines von beiden
    // geändert hat — Dokumentinhalt ODER die Kennung der übernommenen
    // Anzeige (siehe die Doc-Kommentare an `letterheadAppliedFor` oben).
    const unchanged = current === savedRef.current && appliedFor === savedAppliedForRef.current
    if (current === null || savingRef.current || unchanged) return

    savingRef.current = true
    if (mountedRef.current) setState({ status: 'saving' })
    try {
      const blob = await serializeDocx(current)
      const savedAt = Date.now()
      await storage.saveDraft({
        id: draftId,
        docxBase: await blob.arrayBuffer(),
        text: current.text,
        savedAt,
        letterheadAppliedFor: appliedFor ?? undefined,
      })
      savedRef.current = current
      savedAppliedForRef.current = appliedFor
      if (mountedRef.current) setState({ status: 'saved', at: savedAt })
    } catch {
      // Der Grund ist für den Nutzer nicht handlungsleitend (er kann einen
      // gesperrten Speicher nicht von hier aus öffnen); dass es nicht
      // geklappt hat, schon.
      if (mountedRef.current) setState({ status: 'failed' })
    } finally {
      savingRef.current = false
    }
  }, [storage, draftId])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => void save(), AUTOSAVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, save])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Beim Verlassen der Arbeitsfläche noch einmal sichern: bis zu
      // zwanzig Sekunden Arbeit zu verlieren, nur weil der Nutzer zurück
      // zur Einstiegsseite geht, wäre der teuerste Nebeneffekt eines
      // Zeitgebers. Das Ergebnis lässt sich nicht mehr anzeigen — die
      // Ansicht ist weg —, deshalb steht hier bewusst keine Zusage.
      void save()
    }
  }, [save])

  return state
}
