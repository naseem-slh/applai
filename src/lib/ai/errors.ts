import type { ProviderId } from '../storage/keyVault'
import { recordRequest } from './usage'

/**
 * Die Fehlerarten, die ein Anbieter-Adapter melden kann. Bewusst ohne
 * formulierten Text: `LlmError` ist ein reiner, übersetzungsfreier Wert
 * (G8) — die tatsächliche Nutzermeldung entsteht erst in der Oberfläche
 * (Aufgabe 13) über i18next. Übergabe an Aufgabe 13 — Schlüssel↔`kind`:
 *
 * | `kind`         | i18n-Schlüssel (`src/lib/i18n/locales/{de,en}.json`) |
 * |----------------|--------------------------------------------------------|
 * | `invalid_key`  | `ai.errors.invalid_key`                                |
 * | `rate_limit`   | `ai.errors.rate_limit`                                 |
 * | `quota`        | `ai.errors.quota` — **außer** `provider === 'gemini'`, |
 * |                | dann `ai.errors.quota_gemini` (nennt ausdrücklich das  |
 * |                | kostenlose Tageskontingent, siehe Aufgabenstellung)    |
 * | `network`      | `ai.errors.network`                                    |
 * | `blocked`      | `ai.errors.blocked`                                    |
 * | `unknown`      | `ai.errors.unknown`                                    |
 *
 * - `invalid_key`  — Schlüssel fehlt, ist ungültig oder abgelaufen (HTTP 401
 *   bei allen drei Anbietern; wird hier auch für einen Schlüssel ohne
 *   ausreichende Berechtigung verwendet, da keiner der übrigen Werte das
 *   genauerträfe).
 * - `rate_limit`   — vorübergehend zu viele Anfragen (HTTP 429). Einzige Art,
 *   die automatisch wiederholt wird, siehe `withSingleRateLimitRetry`.
 * - `quota`        — ein Kontingent ist aufgebraucht, kein vorübergehendes
 *   Zuviel: OpenAIs `error.type === 'insufficient_quota'` oder Geminis
 *   `error.code === 'quota_exceeded'` (bei Gemini ausdrücklich das
 *   kostenlose Tageskontingent, siehe Tabelle oben und Anbieterdatei). Wird
 *   nicht wiederholt — ein erschöpftes Kontingent füllt sich nicht
 *   innerhalb der Wartezeit.
 * - `network`      — `fetch` selbst ist fehlgeschlagen (keine Antwort vom
 *   Server), z. B. offline oder DNS-Fehler. Wird nicht wiederholt, siehe
 *   Begründung bei `withSingleRateLimitRetry`.
 * - `blocked`      — der Anbieter hat den Inhalt aus Sicherheitsgründen
 *   abgelehnt (HTTP 200, aber kein verwertbarer Text: Geminis
 *   `promptFeedback`/`finishReason`, OpenAIs `refusal`-Block, Anthropics
 *   `stop_reason: "refusal"`).
 * - `unknown`      — jede andere, nicht näher unterschiedene Fehlerantwort.
 */
export type LlmErrorKind = 'invalid_key' | 'rate_limit' | 'quota' | 'network' | 'blocked' | 'unknown'

/**
 * Strukturierter Fehler eines KI-Anbieter-Adapters.
 *
 * `provider` steht nicht in der wörtlichen Schnittstelle aus der
 * Aufgabenstellung, ist aber Teil der Vorgabe für diese Aufgabe (siehe
 * task-7-report.md, Abschnitt „Ambiguitäten"): Die Oberfläche muss bei
 * `quota` wissen, ob der Anbieter Gemini war, um die Sonderformulierung mit
 * dem kostenlosen Tageskontingent zu wählen (siehe `LlmErrorKind` oben) —
 * ohne dieses Feld müsste jeder Aufrufer den Anbieter separat mitführen,
 * obwohl der Adapter ihn
 * bereits kennt.
 */
export class LlmError extends Error {
  readonly kind: LlmErrorKind
  readonly provider: ProviderId
  readonly retryAfterMs?: number
  /**
   * Der Wortlaut, den der Anbieter selbst mitgeschickt hat — unübersetzt und
   * unverändert.
   *
   * **Warum das gebraucht wird.** `kind` ist eine grobe Einteilung, und
   * gerade bei HTTP 429 sagt sie das Entscheidende nicht: Ob eine
   * Minutengrenze gerissen wurde (eine Minute warten) oder das
   * Tageskontingent aufgebraucht ist (bis morgen warten), steht **nur** in
   * diesem Text. Applai hat ihn früher an dieser Stelle weggeworfen; damit
   * war der häufigste Fehlerfall des kostenlosen Tarifs für den Nutzer nicht
   * auflösbar, ohne die Entwicklerwerkzeuge zu öffnen.
   *
   * Er gehört nicht in die übersetzte Meldung (G8), sondern daneben, als
   * ausdrücklich gekennzeichnete Auskunft des Anbieters — so wie ein Zitat
   * aus einem fremden Dokument.
   */
  readonly providerMessage?: string

  constructor(
    kind: LlmErrorKind,
    provider: ProviderId,
    message: string,
    retryAfterMs?: number,
    options: { providerMessage?: string } = {},
  ) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
    this.provider = provider
    this.retryAfterMs = retryAfterMs
    this.providerMessage = options.providerMessage
  }
}

/**
 * Obergrenze für die aus `Retry-After` gelesene Wartezeit.
 *
 * Ein böswilliger oder schlicht falscher Header könnte sonst eine beliebig
 * lange Wartezeit erzwingen und die Oberfläche effektiv einfrieren lassen
 * ("hängen", siehe Aufgabenstellung). 60 Sekunden sind lang genug für
 * reguläre Anbieter-Ratenbegrenzungen (die meisten liegen im
 * Sekunden-bis-wenige-Zehnersekunden-Bereich) und kurz genug, dass ein
 * einzelner Wiederholungsversuch nie länger als eine Minute blockiert.
 */
export const RETRY_AFTER_CAP_MS = 60_000

/**
 * Parst den `Retry-After`-Header (RFC 9110, zwei Formen):
 *
 * 1. `delta-seconds` — eine nichtnegative Ganzzahl, z. B. `"120"`.
 * 2. `HTTP-date` — ein absoluter Zeitpunkt, z. B.
 *    `"Wed, 21 Oct 2015 07:28:00 GMT"`.
 *
 * Ein nicht auswertbarer Wert (weder Ganzzahl noch gültiges Datum) liefert
 * `undefined` — **nicht** `0`: ein unbekannter Wert ist etwas anderes als
 * "sofort erneut versuchen" (siehe Aufgabenstellung). Ein gültiges, aber in
 * der Vergangenheit liegendes Datum ist dagegen erfolgreich geparst und wird
 * auf `0` abgebildet (der Server sagt "ab sofort wieder möglich"). Das
 * Ergebnis ist immer auf `[0, RETRY_AFTER_CAP_MS]` begrenzt.
 */
export function parseRetryAfterMs(headerValue: string | null, nowMs: number = Date.now()): number | undefined {
  if (headerValue === null) return undefined
  const trimmed = headerValue.trim()
  if (trimmed === '') return undefined

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed)
    return clampRetryAfter(seconds * 1000)
  }

  const parsedDateMs = Date.parse(trimmed)
  if (Number.isNaN(parsedDateMs)) return undefined
  return clampRetryAfter(parsedDateMs - nowMs)
}

function clampRetryAfter(ms: number): number {
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS)
}

/**
 * Injizierbare Wartefunktion — siehe `withSingleRateLimitRetry`. Nimmt ein
 * optionales `AbortSignal` entgegen: **Fix-Runde 1, Important 1** — vorher
 * kannte nur `fetch` selbst das Signal, ein Abbruch während der Wartezeit
 * vor dem Wiederholungsversuch blieb bis zu `RETRY_AFTER_CAP_MS`
 * (60 Sekunden) lang unbemerkt. `realSleep` unten wettet jetzt Timer gegen
 * Abbruch-Ereignis.
 */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>

/**
 * Die echte Wartefunktion für den produktiven Betrieb. Löst nach `ms`
 * Millisekunden auf — außer `signal` bricht vorher ab: dann lehnt sie
 * sofort ab (kein Warten auf den Rest der Zeit), mit dem Abbruchgrund des
 * Signals (`signal.reason`, oder ersatzweise einer neu erzeugten
 * `AbortError`-`DOMException`, falls die Umgebung `reason` nicht setzt).
 * Bereits abgebrochene Signale (`signal.aborted` beim Aufruf schon wahr)
 * lehnen ohne jeden Timer ab.
 */
export const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError(signal))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(toAbortError(signal))
      },
      { once: true },
    )
  })

function toAbortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Abgebrochen', 'AbortError')
}

/**
 * Genau ein Wiederholungsversuch bei `rate_limit` — **aber nur, wenn der
 * Anbieter gesagt hat, wann.**
 *
 * Ursprünglich wurde ohne `Retry-After` blind nach zwei Sekunden wiederholt.
 * Das war nachweislich schädlich: Geminis kostenloser Tarif erlaubt fünf
 * Anfragen je Minute, und Applai setzt beim Betreten der Arbeitsfläche zwei
 * gleichzeitig ab. Der Wiederholungsversuch fiel damit in dasselbe
 * geschlossene Minutenfenster — er konnte nicht gelingen und machte aus zwei
 * verbrauchten Anfragen vier. Wer daraufhin auf „erneut versuchen" drückte,
 * verbrauchte vier weitere. Das Kontingent war schneller leer, als der
 * Nutzer lesen konnte, woran es liegt.
 *
 * Ohne genannte Wartezeit wird deshalb sofort gemeldet statt geraten. Die
 * Oberfläche sagt dem Nutzer dann, wie lange er warten soll, und sperrt
 * ihren Knopf so lange — das ist ehrlicher und kostet die Hälfte.
 *
 * - `invalid_key`, `quota`, `blocked`: ein zweiter Versuch kann nicht
 *   gelingen — der Schlüssel bleibt ungültig, das Kontingent bleibt leer,
 *   der Inhalt bleibt blockiert. Wiederholen würde nur unnötig Zeit
 *   kosten.
 * - `network`: **wird ebenfalls nicht wiederholt.** Anders als bei
 *   `rate_limit` gibt es kein Signal für eine sinnvolle Wartezeit (kein
 *   `Retry-After`) — ein sofortiger zweiter Versuch nach einem echten
 *   Netzfehler (Verbindungsabbruch, DNS-Fehler, Gerät offline) schlägt in
 *   aller Regel genauso fehl und verzögert nur die Fehlermeldung an die
 *   Oberfläche, ohne realistische Erfolgsaussicht.
 * - Fehler, die keine `LlmError` sind (insbesondere ein Abbruch über
 *   `AbortSignal`, siehe `isAbortError`), werden unverändert durchgereicht
 *   und ebenfalls nicht wiederholt.
 *
 * `sleep` ist injizierbar, damit Tests nie wirklich warten (siehe
 * Aufgabenstellung) — Vorgabe ist `realSleep`, Tests übergeben eine
 * synchron auflösende Ersatzfunktion. Schlägt auch der zweite Versuch mit
 * `rate_limit` fehl, wird **nicht** noch einmal gewartet — `attempt()` wird
 * hier nur noch einmal aufgerufen, dessen Fehlschlag propagiert ungefangen:
 * genau ein Versuch mehr, nie eine Schleife.
 *
 * `signal` wird an `sleep` durchgereicht (Fix-Runde 1, Important 1): bricht
 * der Aufrufer während der Wartezeit ab, lehnt der Aufruf sofort ab, statt
 * bis zu `RETRY_AFTER_CAP_MS` lang zu hängen — wichtig für Aufgabe 13s
 * Abbrechen-Knopf.
 */
export async function withSingleRateLimitRetry<T>(
  attempt: () => Promise<T>,
  sleep: Sleep = realSleep,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await attempt()
  } catch (error) {
    const waitMs = error instanceof LlmError && error.kind === 'rate_limit' ? error.retryAfterMs : undefined
    // `0` ist keine Wartezeit, sondern die Aussage „ab sofort wieder
    // möglich" — und ein sofortiger zweiter Versuch ist genau das, was hier
    // vermieden werden soll.
    if (waitMs !== undefined && waitMs > 0) {
      await sleep(waitMs, signal)
      return await attempt()
    }
    throw error
  }
}

/**
 * Erkennt einen Abbruch über `AbortSignal` (Name `"AbortError"`), egal ob
 * als `DOMException` (Standardverhalten von `fetch`) oder als einfaches
 * `Error`-Objekt mit demselben Namen. Duck-Typing auf `.name` statt
 * `instanceof DOMException`, weil `DOMException` nicht in jeder Umgebung
 * zuverlässig realm-übergreifend erkannt wird.
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { name?: unknown }).name === 'AbortError'
}

/**
 * Führt `fetch` aus und übersetzt einen echten Netzfehler in
 * `LlmError('network', ...)`. Ein Abbruch über `AbortSignal` wird
 * unverändert durchgereicht (siehe `isAbortError`) statt verpackt — kein
 * Wiederholungsversuch, keine übersetzte Fehlermeldung, der Aufrufer
 * erkennt ihn am Standard-JS-Muster `error.name === 'AbortError'`.
 *
 * Prüft bewusst **nicht** `response.ok` — das bleibt Sache der aufrufenden
 * Anbieterdatei, weil die HTTP-Fehlerklassifizierung (401/429/…) je
 * Anbieter unterschiedliche Fehlerkörper auswertet (siehe `gemini.ts`,
 * `openai.ts`, `anthropic.ts`).
 *
 * Fix-Runde 1, Important 2: vorher war dieser try/catch-Block in allen drei
 * Anbieterdateien Zeile für Zeile identisch, nur mit anderem `provider`/
 * `label` — jetzt eine einzige Stelle.
 */
export async function fetchOrNetworkError(
  url: string,
  init: RequestInit,
  provider: ProviderId,
  label: string,
): Promise<Response> {
  // Gezählt wird **vor** dem Absenden: Auch eine Anfrage, die mit einem
  // Fehler zurückkommt oder abgebrochen wird, hat den Anbieter erreicht und
  // zählt dort gegen das Kontingent (siehe `usage.ts`).
  recordRequest()
  try {
    return await fetch(url, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new LlmError('network', provider, `${label}: Netzwerkfehler beim Aufruf der API.`)
  }
}
