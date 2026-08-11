import type { ProviderId } from '../storage/keyVault'
import { createAnthropicProvider } from './anthropic'
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
export interface LlmRequest {
  system: string
  user: string
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
  generate(req: LlmRequest, apiKey: string, signal?: AbortSignal): Promise<string>
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
