import { isAbortError, LlmError, type LlmErrorKind } from './errors'
import type { LlmProvider } from './provider'

/**
 * Eine Kette von Modellen: Antwortet das erste nicht, geht dieselbe Anfrage
 * an das nächste.
 *
 * **Warum das der richtige Weg ist und nicht das Messen.** Naheliegend wäre,
 * den Verbrauch je Modell abzufragen und vorher auszuweichen. Das geht
 * nicht: Es gibt keinen öffentlichen Endpunkt, der einem API-Schlüssel
 * seinen Verbrauch nennt, die Kontingente hängen am Projekt, und die
 * Cloud-Schnittstellen dafür verlangen OAuth und andere Hosts — was Applai
 * sich selbst verbietet (G1, G3). Gebraucht wird die Zahl aber gar nicht:
 * Die Erschöpfung meldet der Anbieter selbst, als HTTP 429. Auf das Signal
 * zu reagieren ist billiger und genauer als es vorherzusagen.
 *
 * **Nicht bei jedem Fehler wird weitergegangen.** Ein ungültiger Schlüssel
 * bleibt bei jedem Modell ungültig, eine fehlende Verbindung bleibt fehlend,
 * und einen Sicherheitsfilter zu umgehen, indem man das Modell wechselt,
 * wäre eine Entscheidung über Inhalte, die dieser Schicht nicht zusteht. In
 * all diesen Fällen kostete die Kette je eine Anfrage und verzögerte die
 * Meldung, die der Nutzer braucht. Weitergegangen wird deshalb nur bei dem,
 * was ein anderes Modell plausibel beheben kann.
 *
 * **`unknown` gehört dazu.** Ein Modellname, den es nicht gibt, kommt als
 * HTTP 404 zurück und landet dort — und genau dann ist das nächste Modell
 * die richtige Antwort.
 */

/** Fehlerarten, bei denen ein anderes Modell eine Aussicht hat. */
const WORTH_ANOTHER_MODEL: ReadonlySet<LlmErrorKind> = new Set<LlmErrorKind>([
  'rate_limit',
  'quota',
  'unknown',
])

/**
 * Setzt die Anbieter zu einer Kette zusammen. Ein einzelner wird unverändert
 * zurückgegeben — eine Hülle um nichts wäre nur eine Stelle mehr, an der
 * etwas schiefgehen kann.
 */
export function withModelFallback(chain: readonly LlmProvider[]): LlmProvider {
  const [first, ...rest] = chain
  if (first === undefined) throw new Error('Eine Modellkette braucht mindestens ein Modell.')
  if (rest.length === 0) return first

  return {
    ...first,
    generate: async (req, apiKey, signal) => {
      let last: unknown
      for (const provider of chain) {
        try {
          return await provider.generate(req, apiKey, signal)
        } catch (error) {
          if (isAbortError(error)) throw error
          if (!(error instanceof LlmError) || !WORTH_ANOTHER_MODEL.has(error.kind)) throw error
          last = error
        }
      }
      // Der Fehler des **letzten** Versuchs: Er beschreibt, woran es zuletzt
      // lag, statt an einem längst überholten Modell.
      throw last
    },
  }
}
