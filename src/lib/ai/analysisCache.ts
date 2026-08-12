import { textFingerprint } from '@/lib/text/fingerprint'

/**
 * Der Schlüssel, unter dem eine Auswertung abgelegt wird.
 *
 * **Warum es diesen Speicher gibt.** Die Auswertung der Stellenanzeige und
 * das Stilprofil hängen ausschließlich von ihrem Eingabetext ab. Applai
 * fragte sie trotzdem bei jedem Betreten der Arbeitsfläche neu an — auch
 * beim bloßen Neuladen der Seite, und in der Entwicklung wegen React
 * StrictMode sogar doppelt. Auf Geminis kostenlosem Tarif, der die Anfragen
 * am Tag zählt und nicht die Zeichen, war das der teuerste Posten der
 * ganzen Anwendung, und er kaufte nichts.
 *
 * **Was im Schlüssel steht und warum jedes Stück.**
 *
 * - **Art** (`jobAd`, `style`) — beide lesen Text und geben etwas völlig
 *   anderes zurück. Ohne Trennung bekäme das Stilprofil die Anzeigenanalyse
 *   untergeschoben, wenn zufällig derselbe Text vorliegt.
 * - **Fassung** — Ändern sich Prompt, Schema oder Auswertung, wird sie
 *   erhöht. Alle alten Einträge sind damit unerreichbar, ohne dass jemand
 *   aufräumen muss. Das ist die wichtigste Zeile hier: Ein Speicher, der
 *   nach einer Prompt-Änderung veraltete Antworten ausliefert, ist
 *   schlimmer als gar keiner.
 * - **Modell** — ein anderes Modell antwortet anders.
 * - **Fingerabdruck der Eingabe** — normalisiert, damit ein anders
 *   umbrochener, sonst gleicher Text nicht neu bezahlt wird.
 */

/** Erhöhen, sobald sich Prompt, Antwortschema oder Auswertung ändern. */
export const ANALYSIS_CACHE_VERSION = 1

export type AnalysisKind = 'jobAd' | 'style'

export async function analysisCacheKey(
  kind: AnalysisKind,
  model: string,
  input: string,
): Promise<string> {
  return `${kind}:${ANALYSIS_CACHE_VERSION}:${model}:${await textFingerprint(input)}`
}
