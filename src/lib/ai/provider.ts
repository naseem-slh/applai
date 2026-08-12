import type { ProviderId } from '../storage/keyVault'
import { createAnthropicProvider } from './anthropic'
import { realSleep, type Sleep } from './errors'
import { withModelFallback } from './fallback'
import { createGeminiProvider } from './gemini'
import { createOpenAiProvider } from './openai'

/**
 * Der austauschbare Anbieter-Adapter (Aufgabe 7). Jeder Aufrufer (ab
 * Aufgabe 9) spricht ausschließlich gegen diese beiden Typen und `PROVIDERS`
 * — nie gegen `fetch` oder ein anbieterspezifisches SDK direkt. Das hält die
 * drei Anbieter (Gemini, OpenAI, Anthropic; siehe `docs/spec.md`, „fest
 * verdrahtete Auswahl hinter einem gemeinsamen Adapter") hinter einer
 * einzigen Schnittstelle austauschbar.
 */
/** Ein Modell zur Auswahl, so wie die Oberfläche es anzeigt. */
export interface ModelChoice {
  /** Die Kennung für den Aufruf, z. B. `gemini-2.5-flash`. */
  id: string
  /** Lesbarer Name des Anbieters. */
  label: string
  description?: string
}

export interface LlmRequest {
  system: string
  user: string
  /**
   * **Fix-Runde 1 — auf den aktuell fest verdrahteten Standardmodellen alle
   * drei Anbieter wirkungslos oder schädlich, deshalb von keiner
   * Anbieterdatei gesendet:**
   *
   * - Gemini (`gemini-3.6-flash`): laut `ai.google.dev/gemini-api/docs/models`
   *   sind `temperature`/`top_p`/`top_k` auf dieser und neueren Generationen
   *   veraltet — die API ignoriert sie heute stillschweigend und ist für
   *   künftige Modellgenerationen als Fehlerfall dokumentiert.
   * - OpenAI (`gpt-5.6-terra`): ein Schlussfolgerungsmodell der GPT-5.6-Reihe.
   *   Bei den GPT-5.x-Schlussfolgerungsmodellen wird `temperature` nur bei
   *   `reasoning.effort: "none"` akzeptiert; mit jeder anderen (auch der
   *   Standard-)Schlussfolgerungsstufe liefert die Anfrage einen Fehler,
   *   siehe die OpenAI-Foren-Diskussion "Temperature in GPT-5 models" und
   *   `developers.openai.com/api/docs/guides/reasoning`. `openai.ts` setzt
   *   `reasoning.effort` nicht, `temperature` würde also fehlschlagen.
   * - Anthropic (`claude-sonnet-5`): laut der aktuellen Anthropic-Dokumentation
   *   liefert ein von der Vorgabe abweichender `temperature`-Wert einen
   *   HTTP-400-Fehler ("Sampling parameters rejected").
   *
   * Das Feld bleibt Teil der Schnittstelle (wörtliche Vorgabe aus der
   * Aufgabenstellung) und wird an keine der drei Anbieterdateien
   * weitergereicht — siehe `gemini.ts`, `openai.ts`, `anthropic.ts`. **Für
   * die Aufgaben 10/11 (Stilregler „förmlich↔locker", „kurz↔ausführlich"):
   * `temperature` ist dafür auf keinem der drei fest verdrahteten
   * Standardmodelle ein brauchbarer Hebel — die Regler müssen über den
   * Systemprompt/Nutzertext gesteuert werden, nicht über diesen Parameter.**
   */
  temperature?: number
  maxTokens?: number
  /**
   * Der Aufrufer möchte eine auswertbare JSON-Antwort (Aufgaben 9–12 prüfen
   * sie anschließend mit Zod). Trägt bewusst kein Schema — die
   * Anbieterdateien nutzen dafür jeweils den nativsten verfügbaren
   * Mechanismus; wo keiner ohne Schema existiert (Anthropic), ist das in der
   * jeweiligen Datei dokumentiert.
   */
  json?: boolean
}

export interface LlmProvider {
  id: ProviderId
  label: string
  /**
   * Genau der Origin, gegen den `generate()` Anfragen stellt — muss
   * Zeichen für Zeichen einem der drei Ziele in der CSP `connect-src`
   * (`public/_headers`, G3) entsprechen. `provider.test.ts` prüft das
   * gegen die tatsächliche Datei, damit beide nie auseinanderlaufen.
   */
  endpoint: string
  /**
   * Das angefragte Modell, ausgeschrieben. Steht hier, weil der
   * Auswertungsspeicher es braucht: Ein anderes Modell antwortet anders,
   * und ein Eintrag des einen darf dem anderen nicht untergeschoben werden
   * (siehe `analysisCache.ts`). Ohne dieses Feld müsste jeder Aufrufer die
   * Modellkonstante der Anbieterdatei kennen.
   */
  model: string
  generate(req: LlmRequest, apiKey: string, signal?: AbortSignal): Promise<string>
  /**
   * Welche Modelle dieser Schlüssel aufrufen darf.
   *
   * Optional, weil es nicht jeder Anbieter anbietet — fehlt es, kommt in
   * der Oberfläche kein Knopf zum Laden, und das Modell wird von Hand
   * eingetragen.
   *
   * **Was die Liste nicht sagt:** ob ein Modell im kostenlosen Tarif
   * enthalten ist. Nachgesehen in der Modellreferenz — das Modell-Objekt
   * trägt Name, Beschreibung, Token-Grenzen und unterstützte Methoden, aber
   * kein Feld zu Tarif, Kontingent oder Preis. Ein Modell kann hier stehen
   * und trotzdem ein Freikontingent von null haben. Die Oberfläche sagt das
   * ausdrücklich dazu, statt eine Gewissheit vorzutäuschen, die es nicht
   * gibt.
   */
  listModels?: (apiKey: string, signal?: AbortSignal) => Promise<ModelChoice[]>
}

/**
 * Die drei fest verdrahteten Anbieter, ein Eintrag pro `ProviderId`.
 * `Record<ProviderId, LlmProvider>` erzwingt bereits bei der Typprüfung,
 * dass hier weder ein Eintrag fehlt noch einer zu viel ist — `PROVIDER_IDS`
 * (aus `keyVault.ts`) ist die einzige Quelle von `ProviderId`, siehe dort.
 * `provider.test.ts` führt denselben Vollständigkeitsbeweis zusätzlich zur
 * Laufzeit.
 */
export const PROVIDERS: Record<ProviderId, LlmProvider> = {
  gemini: createGeminiProvider(),
  openai: createOpenAiProvider(),
  anthropic: createAnthropicProvider(),
}

/**
 * Ein Anbieter mit der gewählten Modellkette — oder mit seinem
 * voreingestellten Modell, wenn keine gewählt ist.
 *
 * **Warum die Auswahl dem Nutzer gehört.** Die kostenlosen Tarife
 * unterscheiden sich je Modell erheblich, bis hin zu „für dieses Modell gar
 * kein Freikontingent". Ein fest verdrahtetes Modell macht die Anwendung
 * dann unbenutzbar, ohne dass jemand etwas dagegen tun könnte.
 *
 * **Warum eine Kette und nicht ein Modell.** Die Kontingente zählen je
 * Modell. Ist das erste erschöpft, führt das zweite die Arbeit weiter, statt
 * den Nutzer bis zum nächsten Tag stehen zu lassen (siehe `fallback.ts`,
 * auch dazu, bei welchen Fehlern **nicht** weitergegangen wird).
 *
 * Leere Einträge fallen weg, und eine leere Kette gilt als „nicht gewählt":
 * So kann ein versehentlich geleertes Eingabefeld die Anwendung nicht
 * lahmlegen.
 */
export function providerFor(id: ProviderId, models?: readonly string[]): LlmProvider {
  const chain = (models ?? []).map((model) => model.trim()).filter((model) => model !== '')
  if (chain.length === 0) return PROVIDERS[id]
  return withModelFallback(chain.map((model) => FACTORIES[id](realSleep, model)))
}

const FACTORIES: Record<ProviderId, (sleep: Sleep, model: string) => LlmProvider> = {
  gemini: createGeminiProvider,
  openai: createOpenAiProvider,
  anthropic: createAnthropicProvider,
}

/**
 * Bindet einen Anbieter an ein Abbruchsignal.
 *
 * Die Domänenfunktionen der Aufgaben 9 bis 12 (`analyzeJobAd`,
 * `deriveStyleProfile`, `rewriteSelection`, `analyzeGaps`) nehmen kein
 * `AbortSignal` entgegen — sie reichen `provider` und `apiKey` durch und
 * bestimmen selbst, wie viele Modellaufrufe daraus werden (beim Umschreiben
 * mit abweichender Zielsprache sind es zwei). Die Oberfläche muss einen
 * laufenden Aufruf trotzdem abbrechen können; Aufgabe 14 verlangt
 * ausdrücklich einen „Ladezustand mit Abbrechen-Möglichkeit
 * (`AbortSignal`)".
 *
 * Der Weg dorthin führt über den Anbieter, nicht über eine zusätzliche
 * Parameterreihe: `generate` trägt das Signal seit Aufgabe 7 an dritter
 * Stelle. Diese Hülle setzt es ein, ohne dass eine der vier
 * Domänenfunktionen ihre Schnittstelle ändern muss — und sie gilt
 * automatisch für **jeden** Aufruf, den die Domänenfunktion intern macht,
 * auch für den zweiten.
 *
 * `id`, `label`, `model` und `endpoint` werden unverändert übernommen: Die
 * Hülle ist derselbe Anbieter, nur abbrechbar. Insbesondere bleibt
 * `endpoint` die geprüfte CSP-Zusage (G3, siehe oben) und `model` der
 * Schlüsselbestandteil des Auswertungsspeichers.
 */
export function withSignal(provider: LlmProvider, signal: AbortSignal): LlmProvider {
  return {
    id: provider.id,
    label: provider.label,
    model: provider.model,
    endpoint: provider.endpoint,
    listModels: provider.listModels,
    // Ein vom Aufrufer mitgegebenes Signal gewinnt — heute gibt es keinen
    // solchen Aufrufer, und ein stillschweigend verworfenes Signal wäre der
    // schlechtere Vorgabewert.
    generate: (req, apiKey, ownSignal) => provider.generate(req, apiKey, ownSignal ?? signal),
  }
}
