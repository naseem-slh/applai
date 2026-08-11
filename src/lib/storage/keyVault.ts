import {
  type Bytes,
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  decryptString,
  deriveKeyFromPassphrase,
  encryptString,
  generateDeviceKey,
  randomBytes,
} from './crypto'

/**
 * Der Schlüsseltresor: verschlüsselte Ablage des API-Schlüssels und sein
 * Lebenszyklus im Arbeitsspeicher.
 *
 * Zwei Stufen, wie in `docs/spec.md` festgelegt:
 *
 * 1. **Ohne Passwort (Vorgabe).** Der Schlüssel wird mit einem
 *    Geräteschlüssel verschlüsselt, den WebCrypto mit `extractable: false`
 *    erzeugt; dieses Schlüsselobjekt liegt neben dem Chiffrat in IndexedDB.
 *    Wer die Entwicklerwerkzeuge öffnet, findet Chiffrat und ein
 *    undurchsichtiges Schlüsselobjekt, aber keine lesbare Zeichenfolge.
 *    Die Grenze ehrlich benannt: Code, der auf dieser Seite läuft, kann den
 *    Browser weiterhin um Entschlüsselung bitten. Stufe 1 schützt gegen
 *    beiläufiges Nachsehen und einen geteilten Rechner, nicht gegen aktiven
 *    Schadcode in der Seite.
 * 2. **Mit Passwort (Pflicht bei kostenpflichtigem Schlüssel).** Der
 *    Schlüssel liegt unter PBKDF2 + AES-GCM; ohne das Passwort des Nutzers
 *    existiert das Entschlüsselungsmaterial nirgends — auch nicht neben dem
 *    Chiffrat. Der entschlüsselte Schlüssel lebt nur im Arbeitsspeicher und
 *    wird nach Untätigkeit gelöscht.
 */

export type ProviderId = 'gemini' | 'openai' | 'anthropic'

/**
 * Eigene Datenbank statt eines gemeinsamen Speichers: der Name ist für
 * Applai reserviert, kollidiert damit nicht mit anderen Anwendungen
 * derselben Herkunft, und die Schlüsselablage kann unabhängig von den
 * Entwürfen (Aufgabe 6) versioniert und gelöscht werden.
 */
export const VAULT_DB_NAME = 'applai-key-vault'

/** Einziger Objektspeicher der Tresor-Datenbank. */
export const VAULT_STORE_NAME = 'secrets'

const VAULT_DB_VERSION = 1

/** Es gibt genau einen Datensatz — ein Schlüssel je Installation. */
const RECORD_KEY = 'apiKey'

/** Schema-Stand des Datensatzes, für spätere Migrationen. */
const RECORD_VERSION = 1

/** Vorgabe der Untätigkeitssperre: 30 Minuten. */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Mindestlänge des Passworts. PBKDF2 verlangsamt das Durchprobieren, ersetzt
 * aber kein Passwort mit etwas Substanz — ein vierstelliges wäre auch mit
 * 600 000 Runden in Minuten geraten.
 */
export const MIN_PASSPHRASE_LENGTH = 8

/**
 * Präfixe, an denen ein immer abrechnungspflichtiger Schlüssel erkennbar
 * ist. `sk-` deckt `sk-proj-` (OpenAI) und `sk-ant-` (Anthropic) mit ab.
 */
const PAID_KEY_PREFIXES = ['sk-']

/**
 * Ereignisse, die als Nutzeraktivität zählen und die Untätigkeitsfrist
 * zurücksetzen. Bewusst knapp gehalten: Tippen, Klicken, Scrollen und
 * Berühren decken jede echte Nutzung ab; `pointermove` fehlt absichtlich,
 * weil eine Mausbewegung ohne jede weitere Handlung binnen 30 Minuten kein
 * belastbares Lebenszeichen ist.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** Wie der gespeicherte Datensatz geschützt ist. */
type Protection = 'device' | 'passphrase'

/**
 * Der in IndexedDB abgelegte Datensatz. Er enthält an keiner Stelle den
 * API-Schlüssel im Klartext — nur Chiffrat, IV und (je nach Stufe) Salz und
 * Rundenzahl beziehungsweise das nicht auslesbare Geräteschlüssel-Objekt.
 */
interface StoredRecord {
  version: number
  provider: ProviderId
  protection: Protection
  iv: Bytes
  ciphertext: Bytes
  /** Nur bei `protection: 'passphrase'`. */
  salt?: Bytes
  /** Nur bei `protection: 'passphrase'` — siehe PBKDF2_ITERATIONS. */
  iterations?: number
  /** Nur bei `protection: 'device'`; nicht extrahierbar. */
  deviceKey?: CryptoKey
}

/** Zusatzangaben beim Speichern. */
export interface SaveOptions {
  /** Passwort für Stufe 2. Pflicht bei kostenpflichtigen Schlüsseln. */
  passphrase?: string
  /**
   * Von der Oberfläche gemeldet: Der Nutzer bestätigt, dass für diesen
   * Schlüssel Abrechnung aktiv ist. Nötig, weil ein Google-Schlüssel das
   * nicht verrät (siehe `isPaidKey`).
   */
  treatAsPaid?: boolean
}

export interface KeyVault {
  /**
   * Einmal beim Start der Anwendung aufrufen. Lädt den gespeicherten
   * Datensatz und entsperrt den Tresor, wenn er ohne Passwort abgelegt wurde
   * (Stufe 1). Bei Stufe 2 bleibt der Tresor gesperrt — dann ist `unlock()`
   * mit dem Passwort des Nutzers nötig. Notwendig, weil `getKey()` bewusst
   * synchron ist und nie auf den Speicher zugreift: ohne diesen Aufruf sähe
   * ein gespeicherter Schlüssel aus wie gar kein Schlüssel.
   */
  initialize(): Promise<void>
  save(provider: ProviderId, apiKey: string, options?: SaveOptions): Promise<void>
  /** `true`, wenn ein Schlüssel gespeichert ist, aber nicht im Arbeitsspeicher liegt. */
  isLocked(): Promise<boolean>
  unlock(passphrase: string): Promise<void>
  lock(): void
  /** Nur aus dem Arbeitsspeicher, nie synchron aus dem Speicher. */
  getKey(): string | null
  /** Der zuletzt geladene oder gespeicherte Anbieter; kein Geheimnis. */
  getProvider(): ProviderId | null
  clear(): Promise<void>
  /**
   * Gibt die Ereignis-Zuhörer und den Zeitgeber frei und löscht den
   * Arbeitsspeicher. Für Tests und für den Fall, dass die Oberfläche einen
   * Tresor verwirft. Danach ist der Tresor nicht weiterzuverwenden — ein
   * neuer entsteht über `createKeyVault()`.
   */
  destroy(): void
}

/**
 * Entscheidet, ob für diesen Schlüssel ein Passwort Pflicht ist.
 *
 * OpenAI und Anthropic rechnen jede Anfrage ab — dort ist jeder Schlüssel
 * kostenpflichtig, unabhängig von seiner Zeichenfolge. Umgekehrt gilt die
 * Erkennung auch beim „falschen“ Anbieter: Wer einen `sk-…`-Schlüssel in das
 * Gemini-Feld einfügt, soll trotzdem ein Passwort setzen müssen.
 *
 * Ein Google-Schlüssel (`AIza…`) sieht mit und ohne aktivierte Abrechnung
 * identisch aus. Hier wird deshalb `false` gemeldet und nichts erfunden —
 * die Oberfläche fragt den Nutzer und meldet das Ergebnis über
 * `SaveOptions.treatAsPaid`.
 */
export function isPaidKey(provider: ProviderId, key: string): boolean {
  if (provider === 'openai' || provider === 'anthropic') return true
  const trimmed = key.trim()
  return PAID_KEY_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

/**
 * Fehler beim Zugriff auf IndexedDB. Übernommen wird nur der Fehlername, nie
 * Nutzdaten — Fehlermeldungen landen erfahrungsgemäß in Protokollen.
 */
function storageError(cause: DOMException | null): Error {
  return new Error(`Auf den Schlüsselspeicher konnte nicht zugegriffen werden${cause ? ` (${cause.name})` : ''}.`)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
        db.createObjectStore(VAULT_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(storageError(request.error))
    request.onblocked = () => reject(storageError(null))
  })
}

/**
 * Führt eine einzelne Speicheroperation aus und schließt die Verbindung
 * danach wieder. Bewusst ohne dauerhaft offene Verbindung: Tresor-Zugriffe
 * sind selten (Speichern, Entsperren, Löschen), dafür entfällt jede Frage
 * nach veralteten Verbindungen, etwa nach `deleteDatabase`.
 */
async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(VAULT_STORE_NAME, mode)
      const request = run(transaction.objectStore(VAULT_STORE_NAME))
      // Erst nach `complete` steht fest, dass ein Schreibvorgang wirklich
      // dauerhaft ist; das Ergebnis der Anfrage liegt dann längst vor.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(storageError(transaction.error))
      transaction.onabort = () => reject(storageError(transaction.error))
    })
  } finally {
    db.close()
  }
}

function isProviderId(value: unknown): value is ProviderId {
  return value === 'gemini' || value === 'openai' || value === 'anthropic'
}

/**
 * Macht aus einem Byte-Feld ein `Uint8Array` dieser Umgebung.
 *
 * IndexedDB liefert strukturell geklonte Werte zurück. Im Browser stammen sie
 * aus demselben Realm, in der Testumgebung (Node-`structuredClone` unter
 * jsdom) nicht — dann schlägt `instanceof Uint8Array` fehl, obwohl der Wert
 * einwandfrei ist. `ArrayBuffer.isView` prüft dagegen den internen Typ und
 * gilt über Realm-Grenzen hinweg. Die Kopie (wenige Dutzend Byte) löst den
 * Wert zugleich von einem womöglich geteilten Puffer.
 */
function toBytes(value: unknown): Bytes | null {
  if (!ArrayBuffer.isView(value)) return null
  const copy = new Uint8Array(value.byteLength)
  copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  return copy
}

/**
 * Prüft den gelesenen Datensatz und bringt ihn in die erwartete Form. Gibt
 * `null` zurück, wenn er nicht dem Schema entspricht — dann ist der Speicher
 * beschädigt oder von fremder Hand beschrieben worden.
 */
function normalizeRecord(value: unknown): StoredRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<StoredRecord>
  const iv = toBytes(candidate.iv)
  const ciphertext = toBytes(candidate.ciphertext)
  if (iv === null || ciphertext === null) return null
  if (candidate.protection !== 'device' && candidate.protection !== 'passphrase') return null
  if (!isProviderId(candidate.provider)) return null
  return {
    version: typeof candidate.version === 'number' ? candidate.version : RECORD_VERSION,
    provider: candidate.provider,
    protection: candidate.protection,
    iv,
    ciphertext,
    salt: toBytes(candidate.salt) ?? undefined,
    iterations: typeof candidate.iterations === 'number' ? candidate.iterations : undefined,
    deviceKey: candidate.deviceKey,
  }
}

async function readRecord(): Promise<StoredRecord | undefined> {
  const value: unknown = await withStore<unknown>('readonly', (store) => store.get(RECORD_KEY))
  if (value === undefined) return undefined
  const record = normalizeRecord(value)
  if (record === null) {
    throw new Error('Der gespeicherte API-Schlüssel ist beschädigt. Bitte in den Einstellungen neu hinterlegen.')
  }
  return record
}

/**
 * Erzeugt einen Tresor. `idleTimeoutMs` ist für Tests einstellbar; die
 * Anwendung benutzt die Vorgabe von 30 Minuten.
 *
 * Der gesamte Zustand liegt in dieser Funktion (Closure) und ist von außen
 * nicht erreichbar: `JSON.stringify(vault)` liefert `{}`, und keine
 * Eigenschaft des zurückgegebenen Objekts trägt den Schlüssel.
 */
export function createKeyVault(idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS): KeyVault {
  let apiKey: string | null = null
  let provider: ProviderId | null = null
  let lastActivity = Date.now()
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function stopIdleTimer(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function startIdleTimer(delayMs: number): void {
    stopIdleTimer()
    idleTimer = setTimeout(checkIdle, delayMs)
  }

  function lock(): void {
    // JavaScript-Zeichenketten lassen sich nicht überschreiben; mehr als die
    // Referenz freizugeben ist nicht möglich. Danach ist der Klartext nur
    // noch für den Garbage Collector erreichbar.
    apiKey = null
    stopIdleTimer()
  }

  function noteActivity(): void {
    lastActivity = Date.now()
  }

  /**
   * Prüft, ob die Untätigkeitsfrist abgelaufen ist. Wird vom Zeitgeber
   * aufgerufen und zusätzlich bei jedem Sichtbarkeitswechsel: Zeitgeber im
   * Hintergrund werden von Browsern stark gedrosselt, eine Seite kann also
   * lange verborgen liegen, ohne dass der Zeitgeber pünktlich feuert. Beim
   * Zurückkehren wird deshalb an der Uhr nachgerechnet.
   */
  function checkIdle(): void {
    if (apiKey === null) {
      stopIdleTimer()
      return
    }
    const idleFor = Date.now() - lastActivity
    if (idleFor >= idleTimeoutMs) {
      lock()
      return
    }
    startIdleTimer(idleTimeoutMs - idleFor)
  }

  function holdInMemory(key: string, keyProvider: ProviderId): void {
    apiKey = key
    provider = keyProvider
    noteActivity()
    startIdleTimer(idleTimeoutMs)
  }

  for (const eventName of ACTIVITY_EVENTS) {
    window.addEventListener(eventName, noteActivity, { passive: true })
  }
  document.addEventListener('visibilitychange', checkIdle)

  async function decryptIntoMemory(record: StoredRecord, passphrase: string | undefined): Promise<void> {
    let key: CryptoKey
    if (record.protection === 'passphrase') {
      if (passphrase === undefined || passphrase.length === 0) {
        throw new Error('Dieser API-Schlüssel ist mit einem Passwort geschützt. Bitte das Passwort eingeben.')
      }
      if (record.salt === undefined) {
        throw new Error('Der gespeicherte API-Schlüssel ist beschädigt. Bitte in den Einstellungen neu hinterlegen.')
      }
      key = await deriveKeyFromPassphrase(passphrase, record.salt, record.iterations ?? PBKDF2_ITERATIONS)
    } else {
      // Ein ohne Passwort abgelegter Schlüssel hat nichts, wogegen ein
      // eingegebenes Passwort geprüft werden könnte — es wird hier deshalb
      // schlicht nicht gebraucht. Die Oberfläche fragt in diesem Fall auch
      // keines ab (nach `initialize()` meldet `isLocked()` bereits `false`).
      if (record.deviceKey === undefined) {
        throw new Error('Der gespeicherte API-Schlüssel ist beschädigt. Bitte in den Einstellungen neu hinterlegen.')
      }
      key = record.deviceKey
    }
    let plaintext: string
    try {
      plaintext = await decryptString(key, { iv: record.iv, ciphertext: record.ciphertext })
    } catch {
      // AES-GCM kann „falsches Passwort“ und „verändertes Chiffrat“ nicht
      // unterscheiden — beides ist derselbe Prüfsummenfehler. Gemeldet wird
      // deshalb der bei weitem häufigere Fall, und zwar ohne Ursache im
      // Fehlerobjekt.
      throw new Error(
        record.protection === 'passphrase'
          ? 'Das Passwort ist falsch — der API-Schlüssel konnte nicht entschlüsselt werden.'
          : 'Der gespeicherte API-Schlüssel konnte nicht entschlüsselt werden. Bitte in den Einstellungen neu hinterlegen.',
      )
    }
    holdInMemory(plaintext, record.provider)
  }

  async function buildRecord(
    keyProvider: ProviderId,
    apiKeyToStore: string,
    passphrase: string | undefined,
  ): Promise<StoredRecord> {
    if (passphrase === undefined) {
      const deviceKey = await generateDeviceKey()
      const { iv, ciphertext } = await encryptString(deviceKey, apiKeyToStore)
      return { version: RECORD_VERSION, provider: keyProvider, protection: 'device', iv, ciphertext, deviceKey }
    }
    const salt = randomBytes(SALT_LENGTH)
    const derivedKey = await deriveKeyFromPassphrase(passphrase, salt)
    const { iv, ciphertext } = await encryptString(derivedKey, apiKeyToStore)
    return {
      version: RECORD_VERSION,
      provider: keyProvider,
      protection: 'passphrase',
      iv,
      ciphertext,
      salt,
      iterations: PBKDF2_ITERATIONS,
    }
  }

  return {
    async initialize(): Promise<void> {
      const record = await readRecord()
      if (record === undefined) return
      // Der Anbieter ist kein Geheimnis und darf auch im gesperrten Zustand
      // bekannt sein — die Oberfläche zeigt ihn an, bevor entsperrt wird.
      provider = record.provider
      if (record.protection === 'passphrase') return
      await decryptIntoMemory(record, undefined)
    },

    async save(keyProvider: ProviderId, key: string, options?: SaveOptions): Promise<void> {
      const trimmedKey = key.trim()
      if (trimmedKey.length === 0) {
        throw new Error('Es wurde kein API-Schlüssel eingegeben.')
      }
      const passphrase = options?.passphrase
      // Die harte Regel: kostenpflichtiger Schlüssel nur mit Passwort. Ohne
      // Passwort läge das Entschlüsselungsmaterial neben dem Chiffrat.
      if (isPaidKey(keyProvider, trimmedKey) || options?.treatAsPaid === true) {
        if (passphrase === undefined || passphrase.length === 0) {
          throw new Error(
            'Für einen kostenpflichtigen API-Schlüssel ist ein Passwort Pflicht. Bitte ein Passwort vergeben.',
          )
        }
      }
      if (passphrase !== undefined && passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Das Passwort muss mindestens ${MIN_PASSPHRASE_LENGTH} Zeichen lang sein.`)
      }
      // Erst prüfen, dann verschlüsseln, dann schreiben: bei einem Verstoß
      // gegen die Passwortpflicht darf nichts im Speicher zurückbleiben.
      const record = await buildRecord(keyProvider, trimmedKey, passphrase)
      await withStore('readwrite', (store) => store.put(record, RECORD_KEY))
      holdInMemory(trimmedKey, keyProvider)
    },

    async isLocked(): Promise<boolean> {
      if (apiKey !== null) return false
      // Ohne gespeicherten Schlüssel gibt es nichts zu entsperren. Die
      // Oberfläche unterscheidet „gesperrt“ von „nichts hinterlegt“ über
      // diesen Wert zusammen mit `getKey()`.
      return (await readRecord()) !== undefined
    },

    async unlock(passphrase: string): Promise<void> {
      const record = await readRecord()
      if (record === undefined) {
        throw new Error('Es ist kein API-Schlüssel gespeichert.')
      }
      await decryptIntoMemory(record, passphrase)
    },

    lock,

    getKey(): string | null {
      return apiKey
    },

    getProvider(): ProviderId | null {
      return provider
    },

    async clear(): Promise<void> {
      lock()
      provider = null
      // Löscht Chiffrat, Salz und Geräteschlüssel in einem Zug — der
      // Objektspeicher gehört ausschließlich dem Tresor.
      await withStore('readwrite', (store) => store.clear())
    },

    destroy(): void {
      if (destroyed) return
      destroyed = true
      lock()
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, noteActivity)
      }
      document.removeEventListener('visibilitychange', checkIdle)
    },
  }
}
