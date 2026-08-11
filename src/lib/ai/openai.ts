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
 * Modellwahl: die ausgewogene Mittelstufe der aktuellen GPT-5.6-Familie —
 * spürbar günstiger als die Premiumstufe, ohne die Qualitätseinbußen der
 * reinen Sparstufe, die für die Stilnähe beim Formulieren eines Anschreibens
 * eher riskant wäre (siehe `developers.openai.com/api/docs/pricing`).
 */
export const OPENAI_MODEL = 'gpt-5.6-terra'

/** Muss Zeichen für Zeichen einem CSP-`connect-src`-Ziel entsprechen (G3). */
export const OPENAI_ENDPOINT = 'https://api.openai.com'

interface OpenAiOutputTextItem {
  type: 'output_text'
  text: string
}

interface OpenAiRefusalItem {
  type: 'refusal'
  refusal: string
}

interface OpenAiMessageItem {
  type: 'message'
  content?: (OpenAiOutputTextItem | OpenAiRefusalItem | { type: string })[]
}

interface OpenAiResponseBody {
  output?: (OpenAiMessageItem | { type: string })[]
  incomplete_details?: { reason?: string }
}

interface OpenAiErrorBody {
  error?: { type?: string; code?: string; message?: string }
}

async function performOpenAiRequest(req: LlmRequest, apiKey: string, signal: AbortSignal | undefined): Promise<string> {
  const url = `${OPENAI_ENDPOINT}/v1/responses`
  const body = {
    model: OPENAI_MODEL,
    input: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    // Kein `temperature` (siehe `LlmRequest.temperature` in `provider.ts`,
    // Fix-Runde 1): OPENAI_MODEL ist ein Schlussfolgerungsmodell der
    // GPT-5.6-Reihe, das `temperature` nur bei `reasoning.effort: "none"`
    // akzeptiert — mit jeder anderen (auch der Standard-)
    // Schlussfolgerungsstufe liefert die Anfrage sonst einen Fehler.
    max_output_tokens: req.maxTokens,
    // Nativer, schemafreier JSON-Modus (kein Prompt-Zureden nötig) — siehe
    // OpenAI-Dokumentation, "Structured model outputs" → `text.format`.
    text: req.json ? { format: { type: 'json_object' } } : undefined,
  }

  const response = await fetchOrNetworkError(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    },
    'openai',
    'OpenAI',
  )

  if (!response.ok) {
    throw await buildOpenAiError(response)
  }

  const data = (await response.json()) as OpenAiResponseBody

  if (data.incomplete_details?.reason === 'content_filter') {
    throw new LlmError('blocked', 'openai', 'OpenAI: Antwort durch Inhaltsfilter abgebrochen.')
  }

  const textParts: string[] = []
  let hasRefusal = false
  for (const item of data.output ?? []) {
    if (item.type !== 'message') continue
    for (const content of (item as OpenAiMessageItem).content ?? []) {
      if (content.type === 'output_text') textParts.push((content as OpenAiOutputTextItem).text)
      if (content.type === 'refusal') hasRefusal = true
    }
  }

  if (hasRefusal && textParts.length === 0) {
    throw new LlmError('blocked', 'openai', 'OpenAI: Antwort abgelehnt (refusal).')
  }

  return textParts.join('')
}

async function buildOpenAiError(response: Response): Promise<LlmError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
  const errorType = await readOpenAiErrorType(response)

  if (response.status === 401) {
    return new LlmError('invalid_key', 'openai', 'OpenAI: ungültiger oder fehlender API-Schlüssel.')
  }
  if (response.status === 429) {
    // OpenAI unterscheidet `error.type === 'insufficient_quota'`
    // (aufgebrauchtes Guthaben/Limit) von einer gewöhnlichen, vorübergehenden
    // Ratenbegrenzung — siehe OpenAI-Dokumentation, "Error codes".
    if (errorType === 'insufficient_quota') {
      return new LlmError('quota', 'openai', 'OpenAI: Kontingent aufgebraucht.', retryAfterMs)
    }
    return new LlmError('rate_limit', 'openai', 'OpenAI: zu viele Anfragen.', retryAfterMs)
  }
  return new LlmError('unknown', 'openai', `OpenAI: unerwartete Antwort (HTTP ${response.status}).`)
}

async function readOpenAiErrorType(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as OpenAiErrorBody
    return body.error?.type
  } catch {
    return undefined
  }
}

export function createOpenAiProvider(sleep: Sleep = realSleep): LlmProvider {
  return {
    id: 'openai',
    label: 'OpenAI',
    endpoint: OPENAI_ENDPOINT,
    generate: (req, apiKey, signal) =>
      withSingleRateLimitRetry(() => performOpenAiRequest(req, apiKey, signal), sleep, signal),
  }
}
