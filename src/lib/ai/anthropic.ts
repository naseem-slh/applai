import {
  LlmError,
  type Sleep,
  fetchOrNetworkError,
  parseRetryAfterMs,
  realSleep,
  withSingleRateLimitRetry,
} from './errors'
import type { LlmProvider, LlmRequest } from './provider'

/**
 * Modellwahl: die aktuelle Sonnet-Generation — gutes Preis-Leistungs-
 * Verhältnis für reine Textaufgaben ohne Werkzeugnutzung, ohne den Aufpreis
 * der Opus-Stufe für Fähigkeiten (tiefe Agenten-Arbeit), die diese App nicht
 * braucht (siehe `platform.claude.com/docs/en/about-claude/models/overview`).
 */
export const ANTHROPIC_MODEL = 'claude-sonnet-5'

/** Muss Zeichen für Zeichen einem CSP-`connect-src`-Ziel entsprechen (G3). */
export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com'

export const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Anthropic verlangt `max_tokens` als Pflichtfeld (anders als Gemini/OpenAI,
 * wo eine fehlende Obergrenze auf einen Anbieter-Standard zurückfällt) —
 * dieser Wert greift, wenn `LlmRequest.maxTokens` fehlt.
 */
const DEFAULT_MAX_TOKENS = 4096

/**
 * Anthropics natives strukturiertes JSON (`output_config.format`) verlangt
 * zwingend ein konkretes JSON-Schema (siehe Anthropic-Dokumentation,
 * "Structured outputs") — `LlmRequest.json` ist aber nur ein Schalter ohne
 * Schema (das Schema kommt erst in den Aufgaben 9–12 dazu, dort validiert
 * per Zod). Ohne Schema bietet Anthropic keinen schemafreien JSON-Modus wie
 * Gemini (`responseMimeType`) oder OpenAI (`text.format: {type:
 * "json_object"}`), und ein Antwort-Prefill (der frühere Behelf) liefert auf
 * Sonnet 5 einen 400-Fehler. Deshalb bleibt hier nur die Anweisung im
 * Systemprompt — dokumentierte Einschränkung, kein Versehen.
 */
const JSON_ONLY_INSTRUCTION =
  'Antworte ausschließlich mit einem gültigen JSON-Wert – kein Fließtext davor oder danach, kein Markdown-Codeblock.'

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicResponseBody {
  content?: (AnthropicTextBlock | { type: string })[]
  stop_reason?: string
}

async function performAnthropicRequest(
  req: LlmRequest,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const url = `${ANTHROPIC_ENDPOINT}/v1/messages`
  const system = req.json ? `${req.system}\n\n${JSON_ONLY_INSTRUCTION}` : req.system
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    system,
    // Kein `temperature` (siehe `LlmRequest.temperature` in `provider.ts`,
    // Fix-Runde 1): ein von der Vorgabe abweichender Wert liefert auf
    // ANTHROPIC_MODEL laut aktueller Anthropic-Dokumentation einen
    // HTTP-400-Fehler ("Sampling parameters rejected").
    messages: [{ role: 'user', content: req.user }],
  }

  const response = await fetchOrNetworkError(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Direkter Browserzugriff: beim Bauen gegen die aktuelle
        // Anthropic-Dokumentation geprüft (siehe task-7-report.md) — wird
        // weiterhin unterstützt und ist mit genau diesem Header und Wert
        // dokumentiert. Ohne ihn lehnt Anthropic CORS-Anfragen direkt aus
        // dem Browser ab.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    },
    'anthropic',
    'Anthropic',
  )

  if (!response.ok) {
    throw await buildAnthropicError(response)
  }

  const data = (await response.json()) as AnthropicResponseBody

  if (data.stop_reason === 'refusal') {
    throw new LlmError('blocked', 'anthropic', 'Anthropic: Antwort abgelehnt (refusal).')
  }

  return (data.content ?? [])
    .filter((block): block is AnthropicTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

async function buildAnthropicError(response: Response): Promise<LlmError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))

  if (response.status === 401) {
    return new LlmError('invalid_key', 'anthropic', 'Anthropic: ungültiger oder fehlender API-Schlüssel.')
  }
  if (response.status === 429) {
    return new LlmError('rate_limit', 'anthropic', 'Anthropic: zu viele Anfragen.', retryAfterMs)
  }
  return new LlmError('unknown', 'anthropic', `Anthropic: unerwartete Antwort (HTTP ${response.status}).`)
}

export function createAnthropicProvider(sleep: Sleep = realSleep): LlmProvider {
  return {
    id: 'anthropic',
    label: 'Anthropic',
    endpoint: ANTHROPIC_ENDPOINT,
    generate: (req, apiKey, signal) =>
      withSingleRateLimitRetry(() => performAnthropicRequest(req, apiKey, signal), sleep, signal),
  }
}
