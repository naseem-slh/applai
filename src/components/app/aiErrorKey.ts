import { LlmError } from '@/lib/ai/errors'
import { ModelResponseError } from '@/lib/ai/modelJson'

/**
 * Die Übersetzung eines Fehlers aus einem Modellaufruf in einen
 * i18next-Schlüssel.
 *
 * Aufgabe 7 hat die Zuordnung `LlmError.kind` → Schlüssel als Tabelle im
 * Doc-Kommentar von `lib/ai/errors.ts` hinterlegt und ausdrücklich der
 * Oberfläche überlassen: `LlmError` ist ein übersetzungsfreier Wert (G8),
 * die Meldung entsteht hier. Diese Datei ist die eine Stelle, an der das
 * geschieht — die Arbeitsfläche (14b), die Seitenspalte (14c) und der
 * Export (15) fragen alle hier.
 *
 * Zwei Fehlerarten, die kein `LlmError` sind und trotzdem hierher gehören:
 *
 * - **`ModelResponseError`** (Aufgabe 9 bis 12) — die Antwort kam an, hielt
 *   aber die Zusagen nicht ein (falsche Anzahl Varianten, Kontext
 *   mitgeliefert, unbelegte Aussage nicht zitierbar). Für den Nutzer ist das
 *   etwas anderes als ein Netzfehler: Der Schlüssel stimmt, das Kontingent
 *   reicht, ein erneuter Versuch hilft meistens. Der ausführliche Text der
 *   Ausnahme ist eine Entwickler-Diagnose und wird bewusst **nicht**
 *   angezeigt.
 * - **Alles Übrige** — ein Programmfehler oder etwas, das keiner der beiden
 *   Klassen entspricht. `ai.errors.unknown` sagt dasselbe wie ein
 *   durchgereichter englischer Ausnahmetext, nur in der Sprache des Nutzers.
 *
 * Ein Abbruch (`AbortError`) hat hier **keinen** Schlüssel: Ihn löst der
 * Nutzer selbst aus, und eine Fehlermeldung für die eigene Handlung wäre
 * eine Belehrung. Die Aufrufer erkennen ihn über {@link isAbortError} und
 * zeigen gar nichts.
 */
export function aiErrorKey(error: unknown): string {
  if (error instanceof VaultLockedError) return 'vault.locked'
  if (error instanceof LlmError) {
    // Die einzige anbieterabhängige Meldung: Bei Gemini ist ein
    // erschöpftes Kontingent fast immer das kostenlose Tageskontingent,
    // und das ist eine andere Auskunft als "Ihr Guthaben ist aufgebraucht".
    if (error.kind === 'quota' && error.provider === 'gemini') return 'ai.errors.quota_gemini'
    return `ai.errors.${error.kind}`
  }
  if (error instanceof ModelResponseError) return 'ai.errors.model_response'
  return 'ai.errors.unknown'
}

/**
 * Hat der Nutzer selbst abgebrochen?
 *
 * `AbortController.abort()` lehnt mit einer `DOMException` namens
 * `AbortError` ab. Geprüft wird der **Name**, nicht die Klasse: In jsdom und
 * in Node ist `DOMException` nicht in jeder Umgebung dieselbe Klasse, und
 * `error.name` ist der Teil, den die Spezifikation festlegt.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Der Schlüssel liegt nicht mehr im Arbeitsspeicher — der Tresor hat sich
 * nach der Untätigkeitsfrist selbst gesperrt (`keyVault.ts`,
 * `DEFAULT_IDLE_TIMEOUT_MS`).
 *
 * **Warum es diese Klasse braucht.** Der Tresor sperrt still: Er meldet die
 * Sperre an niemanden, und React rendert deshalb nicht neu. Eine Ansicht,
 * die den Schlüssel beim Rendern gelesen und in einen Rückruf eingeschlossen
 * hat, hielte ihn danach weiter in der Hand und schickte ihn los, obwohl der
 * Tresor ihn längst vergessen hat — die Untätigkeitssperre wäre für genau
 * den Aufruf wirkungslos, für den sie gedacht ist. Wer den Schlüssel
 * benutzt, liest ihn deshalb **im Augenblick des Aufrufs** aus dem Tresor
 * und wirft diesen Fehler, wenn dort keiner mehr liegt.
 */
export class VaultLockedError extends Error {
  constructor() {
    super('Der Schlüsseltresor ist gesperrt; im Arbeitsspeicher liegt kein Schlüssel.')
    this.name = 'VaultLockedError'
  }
}
