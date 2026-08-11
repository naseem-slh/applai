import {
  LlmError,
  type Sleep,
  isAbortError,
  parseRetryAfterMs,
  realSleep,
  withSingleRateLimitRetry,
} from './errors'
import type { LlmProvider, LlmRequest } from './provider'

/**
 * Modellwahl: aktuelles Flash-Modell — bestes Verhältnis aus Geschwindigkeit
 * und Qualität seiner Generation und ausdrücklich im kostenlosen Tarif
 * nutzbar (siehe `ai.google.dev/gemini-api/docs/pricing`, "Free of charge").
 * Das deckt sich mit der Anbieter-Entscheidung in `docs/spec.md`: Gemini ist
 * der Standardanbieter genau wegen des kostenlosen Tarifs.
 */
export const GEMINI_MODEL = 'gemini-3.6-flash'

/** Muss Zeichen für Zeichen einem CSP-`connect-src`-Ziel entsprechen (G3). */
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com'

interface GeminiPart {
  text?: string
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

interface GeminiResponseBody {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
}

interface GeminiErrorBody {
  error?: { code?: string; message?: string }
}

/**
 * `finishReason`-Werte, die eine Ablehnung durch Geminis Sicherheitsfilter
 * anzeigen statt eines gewöhnlichen Endes (`STOP`, `MAX_TOKENS`). Siehe
 * Gemini-API-Referenz, `Candidate.finishReason`.
 */
const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'])

async function performGeminiRequest(req: LlmRequest, apiKey: string, signal: AbortSignal | undefined): Promise<string> {
  const url = `${GEMINI_ENDPOINT}/v1beta/models/${GEMINI_MODEL}:generateContent`
  const body = {
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    systemInstruction: { parts: [{ text: req.system }] },
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.maxTokens,
      // Nativer, schemafreier JSON-Modus (kein Prompt-Zureden nötig) — siehe
      // Gemini-API-Referenz, `generationConfig.responseMimeType`.
      responseMimeType: req.json ? 'application/json' : undefined,
    },
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Header statt `?key=`-Query-Parameter: der Schlüssel landet damit
        // nicht in der URL (Chronik, Referrer, Server-Zugriffslogs) — siehe
        // Gemini-API-Referenz, `x-goog-api-key`.
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new LlmError('network', 'gemini', 'Gemini: Netzwerkfehler beim Aufruf der API.')
  }

  if (!response.ok) {
    throw await buildGeminiError(response)
  }

  const data = (await response.json()) as GeminiResponseBody

  if (data.promptFeedback?.blockReason) {
    throw new LlmError(
      'blocked',
      'gemini',
      `Gemini: Anfrage durch Sicherheitsfilter blockiert (${data.promptFeedback.blockReason}).`,
    )
  }

  const candidate = data.candidates?.[0]
  if (candidate?.finishReason && BLOCKED_FINISH_REASONS.has(candidate.finishReason)) {
    throw new LlmError('blocked', 'gemini', `Gemini: Antwort durch Sicherheitsfilter blockiert (${candidate.finishReason}).`)
  }

  return candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
}

async function buildGeminiError(response: Response): Promise<LlmError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
  const errorCode = await readGeminiErrorCode(response)

  if (response.status === 401) {
    return new LlmError('invalid_key', 'gemini', 'Gemini: ungültiger oder abgelaufener API-Schlüssel.')
  }
  if (response.status === 429) {
    // Gemini unterscheidet im Fehlercode selbst zwischen vorübergehender
    // Ratenbegrenzung und aufgebrauchtem Tageskontingent (siehe
    // Gemini-API-Referenz, `error.code`) — das erlaubt genau hier die
    // in der Aufgabenstellung geforderte Unterscheidung, ohne den
    // HTTP-Status allein deuten zu müssen.
    if (errorCode === 'quota_exceeded') {
      return new LlmError(
        'quota',
        'gemini',
        'Gemini: Tageskontingent des kostenlosen Tarifs aufgebraucht.',
        retryAfterMs,
      )
    }
    return new LlmError('rate_limit', 'gemini', 'Gemini: zu viele Anfragen.', retryAfterMs)
  }
  return new LlmError('unknown', 'gemini', `Gemini: unerwartete Antwort (HTTP ${response.status}).`)
}

async function readGeminiErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as GeminiErrorBody
    return body.error?.code
  } catch {
    return undefined
  }
}

export function createGeminiProvider(sleep: Sleep = realSleep): LlmProvider {
  return {
    id: 'gemini',
    label: 'Google Gemini',
    endpoint: GEMINI_ENDPOINT,
    generate: (req, apiKey, signal) => withSingleRateLimitRetry(() => performGeminiRequest(req, apiKey, signal), sleep),
  }
}
