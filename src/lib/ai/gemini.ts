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
      // Kein `temperature` (siehe `LlmRequest.temperature` in `provider.ts`,
      // Fix-Runde 1): auf GEMINI_MODEL veraltet, wird heute ignoriert und ist
      // für künftige Modellgenerationen als Fehlerfall dokumentiert.
      maxOutputTokens: req.maxTokens,
      // Nativer, schemafreier JSON-Modus (kein Prompt-Zureden nötig) — siehe
      // Gemini-API-Referenz, `generationConfig.responseMimeType`.
      responseMimeType: req.json ? 'application/json' : undefined,
    },
  }

  const response = await fetchOrNetworkError(
    url,
    {
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
    },
    'gemini',
    'Gemini',
  )

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

/**
 * Nennt dieser Wortlaut ein **Tages**kontingent?
 *
 * Die Fehlerreferenz führt für HTTP 429 zwei Codes: `rate_limit_exceeded`
 * und `quota_exceeded`. Im Betrieb kommt ein aufgebrauchtes Tageskontingent
 * des kostenlosen Tarifs aber als `rate_limit_exceeded` an — nachgestellt an
 * einem echten Schlüssel, dessen Tagesgrenze erreicht war. Der Unterschied
 * steht dann nur im Klartext der Meldung („requests per day",
 * „PerDayPerProject…"), und er ist der wichtigste, den es hier gibt: Eine
 * Minutengrenze ist in einer Minute vorbei, ein Tageskontingent nicht.
 *
 * Deshalb wird zusätzlich der Wortlaut befragt. Eine Heuristik auf fremdem
 * Freitext ist nicht schön, und sie ist bewusst nur eine **Ergänzung**: Sie
 * kann eine Stelle übersehen, aber keine falsch einordnen, die der Code
 * schon richtig hatte. Und weil der Wortlaut jetzt bis in die Oberfläche
 * durchgereicht wird, sieht der Nutzer im Zweifel selbst, was der Anbieter
 * gesagt hat.
 */
function mentionsDailyQuota(text: string | undefined): boolean {
  return text !== undefined && /per\s*-?\s*day|daily|perday/i.test(text)
}

async function buildGeminiError(response: Response): Promise<LlmError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
  const { code, message } = await readGeminiError(response)
  const details = { providerMessage: message }

  if (response.status === 401) {
    return new LlmError(
      'invalid_key',
      'gemini',
      'Gemini: ungültiger oder abgelaufener API-Schlüssel.',
      undefined,
      details,
    )
  }
  if (response.status === 429) {
    if (code === 'quota_exceeded' || mentionsDailyQuota(message)) {
      return new LlmError(
        'quota',
        'gemini',
        'Gemini: Tageskontingent des kostenlosen Tarifs aufgebraucht.',
        retryAfterMs,
        details,
      )
    }
    return new LlmError('rate_limit', 'gemini', 'Gemini: zu viele Anfragen.', retryAfterMs, details)
  }
  return new LlmError(
    'unknown',
    'gemini',
    `Gemini: unerwartete Antwort (HTTP ${response.status}).`,
    undefined,
    details,
  )
}

async function readGeminiError(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await response.json()) as GeminiErrorBody
    return { code: body.error?.code, message: body.error?.message }
  } catch {
    return {}
  }
}

export function createGeminiProvider(sleep: Sleep = realSleep): LlmProvider {
  return {
    id: 'gemini',
    label: 'Google Gemini',
    endpoint: GEMINI_ENDPOINT,
    generate: (req, apiKey, signal) =>
      withSingleRateLimitRetry(() => performGeminiRequest(req, apiKey, signal), sleep, signal),
  }
}
