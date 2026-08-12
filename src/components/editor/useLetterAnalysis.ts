import { useCallback, useEffect, useRef, useState } from 'react'
import { analysisCacheKey, type AnalysisKind } from '@/lib/ai/analysisCache'
import type { LlmProvider } from '@/lib/ai/provider'
import { withSignal } from '@/lib/ai/provider'
import { analyzeJobAd, JobAdSchema, type JobAd } from '@/lib/domain/jobAd'
import {
  deriveStyleProfile,
  StyleProfileSchema,
  type StyleProfile,
} from '@/lib/domain/styleProfile'
import type { StorageAdapter } from '@/lib/storage/adapter'
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
 * **Jede nur einmal.** Beide Ergebnisse hängen ausschließlich von ihrem
 * Eingabetext ab und werden deshalb abgelegt (`lib/ai/analysisCache.ts`).
 * Ohne diesen Speicher kostete jedes Neuladen der Seite zwei Anfragen, in
 * der Entwicklung wegen React StrictMode sogar vier — auf einem Tarif, der
 * Anfragen am Tag zählt, der teuerste Posten der ganzen Anwendung, und er
 * kaufte nichts. Das Stilprofil trifft es besonders: Es hängt am
 * Anschreiben, das über zehn Bewerbungen dasselbe bleibt, und wurde
 * trotzdem zehnmal abgeleitet.
 *
 * Was aus dem Speicher kommt, wird gegen sein Schema geprüft, bevor es
 * benutzt wird. Ein Eintrag, der die Form nicht mehr hält, wird ignoriert
 * und neu gefragt — nicht zum Fehler gemacht.
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
  /** Für den Auswertungsspeicher. Ohne ihn liefe alles, nur teurer. */
  storage: StorageAdapter
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
  storage,
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

  // Der Speicher steht **nicht** in der Abhängigkeitsliste: Er ist ein
  // Werkzeug, keine Eingabe. Ein Aufrufer, der ihn beim Rendern neu
  // zusammenbaut, würde die Auswertung sonst endlos neu anstoßen — und
  // ausgerechnet der Speicher, der Anfragen sparen soll, wäre die Ursache
  // einer Anfrageschleife. Gebraucht wird ohnehin immer nur die jeweils
  // letzte Fassung.
  const store = useRef(storage)
  store.current = storage

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
          cached(store.current, 'jobAd', provider.model, jobAdText, JobAdSchema, () =>
            analyzeJobAd(jobAdText, bound, apiKey),
          ),
          cached(store.current, 'style', provider.model, letterText, StyleProfileSchema, () =>
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

/**
 * Erst nachsehen, dann fragen, dann ablegen.
 *
 * Ein unlesbarer oder nicht mehr passender Eintrag wird stillschweigend
 * übergangen: Der Speicher ist eine Ersparnis, kein Bestand. Genauso ein
 * fehlgeschlagenes Ablegen — die Antwort ist da, und sie deswegen zu
 * verwerfen wäre die teuerste denkbare Reaktion.
 */
async function cached<T>(
  storage: StorageAdapter,
  kind: AnalysisKind,
  model: string,
  input: string,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  compute: () => Promise<T>,
): Promise<T> {
  const key = await analysisCacheKey(kind, model, input)

  try {
    const entry = await storage.loadCachedAnalysis(key)
    if (entry !== null) {
      const parsed = schema.safeParse(entry.value)
      if (parsed.success && parsed.data !== undefined) return parsed.data
    }
  } catch {
    // Kein Speicher, kein Problem: dann eben fragen.
  }

  const value = await compute()
  try {
    await storage.saveCachedAnalysis({ key, value, savedAt: Date.now() })
  } catch {
    // Siehe oben.
  }
  return value
}
