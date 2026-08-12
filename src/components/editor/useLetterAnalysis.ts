import { useCallback, useEffect, useState } from 'react'
import type { LlmProvider } from '@/lib/ai/provider'
import { withSignal } from '@/lib/ai/provider'
import { analyzeJobAd, type JobAd } from '@/lib/domain/jobAd'
import { deriveStyleProfile, type StyleProfile } from '@/lib/domain/styleProfile'
import { withAnonymization, type AnonymizationSettings } from '@/lib/privacy/withAnonymization'
import { isAbortError } from '@/components/app/aiErrorKey'

/**
 * Die beiden Auswertungen, ohne die sich nichts umformulieren lässt:
 * die Stellenanzeige (Aufgabe 9) und das Stilprofil des vorhandenen
 * Anschreibens (Aufgabe 10).
 *
 * `rewriteSelection` verlangt beide als Pflichtfelder (`RewriteRequest.jobAd`,
 * `RewriteRequest.style`), und beide entstehen aus je einem Modellaufruf.
 * Sie gehören deshalb nicht in den Variantenvorschlag, sondern davor: Sonst
 * kostete die erste Umformulierung drei Aufrufe statt einem, und die beiden
 * Ergebnisse müssten trotzdem irgendwo liegenbleiben.
 *
 * **Warum beim Betreten der Arbeitsfläche und nicht erst auf Anforderung.**
 * Der Plan zeigt in derselben Ansicht die Anforderungsliste, die Lückenliste
 * und das Stilprofil (Aufgabe 14c) — sie sind Teil dessen, was die
 * Arbeitsfläche ist, nicht eine Nebenwirkung des ersten Umformulierens. Die
 * beiden Aufrufe laufen deshalb einmal beim Laden, nicht bei jeder
 * Markierung.
 *
 * **Beide gleichzeitig.** Sie hängen nicht voneinander ab, und der Nutzer
 * wartet auf die langsamere von beiden statt auf ihre Summe. Der Preis sind
 * zwei gleichzeitige Anfragen an denselben Anbieter; das ist auch bei einem
 * knappen kostenlosen Kontingent unbedenklich, weil die Ratenbegrenzung mit
 * einem Wiederholungsversuch abgefangen wird (Aufgabe 7,
 * `withSingleRateLimitRetry`).
 *
 * **Die Anonymisierung liegt hier, nicht in `deriveStyleProfile`.** Aufgabe
 * 10 hat sie ausdrücklich offengelassen (siehe dort und
 * `privacy/withAnonymization.ts`, Abschnitt "SO RUFEN DIE ANDEREN AUFGABEN
 * AUF"); das Anschreiben ist der Text mit dem Briefkopf darin, also mit
 * Name, Anschrift und Telefonnummer. Die Stellenanzeige läuft bewusst
 * **nicht** durch die Klammer: Sie ist das öffentliche Dokument der Firma,
 * und die Anonymisierung würde genau die Firmen- und
 * Ansprechpartnerangaben entfernen, die die Auswertung herausziehen soll
 * (Begründung in `domain/jobAd.ts`).
 */

export type LetterAnalysisStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface LetterAnalysisOptions {
  /** Der eingefügte Text der Stellenausschreibung. */
  jobAdText: string
  /**
   * Das Anschreiben, wie es hochgeladen wurde — **nicht** der laufende
   * Bearbeitungsstand. Das Stilprofil beschreibt den Ton des Nutzers, und
   * der steht im Original; ein während der Sitzung eingefügter
   * Modellvorschlag würde sonst zum Maßstab für den nächsten.
   */
  letterText: string
  /** `null`, solange der Tresor keinen Anbieter kennt. Dann läuft nichts. */
  provider: LlmProvider | null
  /** `null`, solange der Tresor gesperrt ist. Dann läuft nichts. */
  apiKey: string | null
  privacy: AnonymizationSettings
}

export interface LetterAnalysisHandle {
  status: LetterAnalysisStatus
  jobAd: JobAd | null
  style: StyleProfile | null
  /** Der aufgetretene Fehler, für `aiErrorKey`. `null`, solange keiner auftrat. */
  error: unknown
  /** Noch einmal versuchen. Ein laufender Versuch wird dabei abgebrochen. */
  retry: () => void
}

export function useLetterAnalysis({
  jobAdText,
  letterText,
  provider,
  apiKey,
  privacy,
}: LetterAnalysisOptions): LetterAnalysisHandle {
  const [status, setStatus] = useState<LetterAnalysisStatus>('idle')
  const [jobAd, setJobAd] = useState<JobAd | null>(null)
  const [style, setStyle] = useState<StyleProfile | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  // Die Einstellung wird über ihre Felder in die Abhängigkeitsliste
  // aufgenommen, nicht als Objekt: Der Aufrufer baut sie beim Rendern
  // zusammen, ein Objektvergleich würde die Auswertung bei jedem Rendern
  // erneut auslösen.
  const anonymizeEnabled = privacy.enabled
  const userName = privacy.userName

  useEffect(() => {
    // Ohne Schlüssel oder Anbieter gibt es nichts zu fragen. Das ist kein
    // Fehler: Der Tresor kann noch laden oder gesperrt sein, und dann steht
    // in der Ansicht die Aufforderung zum Entsperren, nicht eine Meldung
    // über einen fehlgeschlagenen Modellaufruf.
    if (provider === null || apiKey === null) {
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    const bound = withSignal(provider, controller.signal)
    setStatus('loading')
    setError(null)

    void (async () => {
      try {
        const [ad, profile] = await Promise.all([
          analyzeJobAd(jobAdText, bound, apiKey),
          withAnonymization(
            { letterText },
            { enabled: anonymizeEnabled, userName },
            (fields) => deriveStyleProfile(fields.letterText, bound, apiKey),
            (result, restore) => ({
              ...result,
              sample: restore(result.sample),
              traits: result.traits.map(restore),
            }),
          ),
        ])
        if (controller.signal.aborted) return
        setJobAd(ad)
        setStyle(profile)
        setStatus('ready')
      } catch (caught) {
        // Ein Abbruch kommt nur vom Aufräumen dieses Effekts (Ansicht
        // verlassen, erneuter Versuch). Er darf den Zustand nicht mehr
        // anfassen: Der Nachfolger hat ihn bereits auf `loading` gesetzt.
        if (controller.signal.aborted || isAbortError(caught)) return
        setError(caught)
        setStatus('failed')
      }
    })()

    return () => controller.abort()
  }, [jobAdText, letterText, provider, apiKey, anonymizeEnabled, userName, attempt])

  return { status, jobAd, style, error, retry }
}
