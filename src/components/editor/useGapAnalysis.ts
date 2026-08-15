import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from '@/components/app/aiErrorKey'
import type { LlmProvider } from '@/lib/ai/provider'
import { withSignal } from '@/lib/ai/provider'
import { analyzeGaps, type GapEntry } from '@/lib/domain/gaps'
import type { JobAd } from '@/lib/domain/jobAd'
import type { AnonymizationSettings } from '@/lib/privacy/withAnonymization'

/**
 * Der Abgleich zwischen den Anforderungen der Anzeige und den eigenen
 * Unterlagen (Aufgabe 12).
 *
 * **Auf Anforderung, nicht beim Betreten.** Die Arbeitsfläche stellt schon
 * zwei Fragen an das Modell, sobald sie sich öffnet (Anzeige, Stilprofil).
 * Eine dritte dazuzunehmen, die niemand angefordert hat, wäre bei einem
 * knappen kostenlosen Kontingent die Frage, die den Umformulierungen fehlt.
 * Sichtbar ist der Zwischenschritt trotzdem von Anfang an: Die
 * Anforderungen selbst stehen bereits in `jobAd` und kosten keinen weiteren
 * Aufruf (`docs/spec.md`: „Anforderungsanalyse | Sichtbarer Zwischenschritt:
 * die aus der Anzeige gezogenen Anforderungen sind einsehbar"). Erst die
 * Bewertung „gedeckt / teilweise / fehlt" braucht das Modell.
 *
 * **Der Abgleich veraltet nicht mit jedem Tastendruck.** `facts` ist die
 * hochgeladene Unterlage, nicht der Arbeitsstand (siehe `rewriteRequest.ts`)
 * — was der Nutzer gerade in den Brief schreibt, ändert nicht, was er kann.
 * Der Abgleich bleibt deshalb stehen, bis er erneut angefordert wird.
 */

export type GapAnalysisStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface GapAnalysisOptions {
  jobAd: JobAd | null
  facts: string
  provider: LlmProvider | null
  apiKey: string | null
  privacy: AnonymizationSettings
}

export interface GapAnalysisHandle {
  status: GapAnalysisStatus
  entries: GapEntry[]
  error: unknown
  /** Anfordern oder wiederholen. Ein laufender Aufruf wird dabei abgebrochen. */
  run: () => void
}

export function useGapAnalysis({
  jobAd,
  facts,
  provider,
  apiKey,
  privacy,
}: GapAnalysisOptions): GapAnalysisHandle {
  const [status, setStatus] = useState<GapAnalysisStatus>('idle')
  const [entries, setEntries] = useState<GapEntry[]>([])
  const [error, setError] = useState<unknown>(null)
  const running = useRef<AbortController | null>(null)

  // Der Auftrag liegt in einem Ref, damit `run` seine Identität behält:
  // Sonst bekäme jede Änderung an `facts` oder an der Einstellung einen
  // neuen Rückruf, und jede Komponente, die ihn in einer Abhängigkeitsliste
  // führt, liefe erneut.
  const input = useRef({ jobAd, facts, provider, apiKey, privacy })
  input.current = { jobAd, facts, provider, apiKey, privacy }

  const stop = useCallback(() => {
    running.current?.abort()
    running.current = null
  }, [])

  useEffect(() => stop, [stop])

  const run = useCallback(() => {
    const current = input.current
    if (current.jobAd === null || current.provider === null || current.apiKey === null) return

    stop()
    const controller = new AbortController()
    running.current = controller
    setStatus('loading')
    setError(null)

    void (async () => {
      try {
        const result = await analyzeGaps(
          current.jobAd!,
          current.facts,
          withSignal(current.provider!, controller.signal),
          current.apiKey!,
          current.privacy,
        )
        if (controller.signal.aborted) return
        setEntries(result)
        setStatus('ready')
      } catch (caught) {
        if (controller.signal.aborted || isAbortError(caught)) return
        setError(caught)
        setStatus('failed')
      } finally {
        if (running.current === controller) running.current = null
      }
    })()
  }, [stop])

  return { status, entries, error, run }
}
