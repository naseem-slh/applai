import type { Application, Draft, Settings, StorageAdapter, TruthMode } from './adapter'
import type { ProviderId } from './keyVault'

/**
 * Die IndexedDB-Umsetzung von `StorageAdapter` (siehe `adapter.ts`) — heute
 * die einzige.
 *
 * Eigene Datenbank statt eines gemeinsamen Speichers: der Name ist für
 * Applai reserviert und unabhängig vom Schlüsseltresor (`keyVault.ts`,
 * Datenbank `applai-key-vault`) versionierbar und löschbar. `clearAll()`
 * dieser Datei rührt den Tresor nicht an — er hat seine eigene `clear()`.
 */
export const STORAGE_DB_NAME = 'applai-storage'
const STORAGE_DB_VERSION = 1

export const APPLICATIONS_STORE = 'applications'
export const DRAFTS_STORE = 'drafts'
export const SETTINGS_STORE = 'settings'

/** Einziger Datensatz des Einstellungs-Speichers. */
const SETTINGS_KEY = 'settings'

/**
 * Vorgaben, bevor je etwas gespeichert wurde — siehe Aufgabenstellung.
 * `uiLanguage` ist bewusst fest `'de'`, nicht aus `navigator.language`
 * abgeleitet: Das ist eine Angelegenheit der Oberfläche (Aufgabe 13), nicht
 * dieser Speicherschicht, die keinen Browser-Kontext kennen soll.
 */
export const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  uiLanguage: 'de',
  anonymize: true,
  truthMode: 'strict',
  theme: 'system',
}

/**
 * Schema-Stand der Sicherungsdatei (`exportAll`/`importAll`), unabhängig von
 * `STORAGE_DB_VERSION`. Ändert sich das Format der Datei, steigt diese Zahl,
 * und `importAll` kann alte Dateien erkennen und migrieren oder ablehnen.
 */
export const EXPORT_FORMAT_VERSION = 1

function isProviderId(value: unknown): value is ProviderId {
  return value === 'gemini' || value === 'openai' || value === 'anthropic'
}

function isTruthMode(value: unknown): value is TruthMode {
  return value === 'strict' || value === 'bridge' || value === 'free'
}

function isApplication(value: unknown): value is Application {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Application>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.company === 'string' &&
    typeof candidate.position === 'string' &&
    typeof candidate.date === 'string'
  )
}

/** Die Entwurfsform innerhalb der Sicherungsdatei: `docxBase` als Base64-Zeichenkette statt als `ArrayBuffer` — JSON kennt keine Binärdaten. */
interface ExportedDraft {
  id: string
  text: string
  savedAt: number
  docxBase: string
}

function isExportedDraft(value: unknown): value is ExportedDraft {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ExportedDraft>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.savedAt === 'number' &&
    typeof candidate.docxBase === 'string'
  )
}

function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Settings>
  return (
    isProviderId(candidate.provider) &&
    (candidate.uiLanguage === 'de' || candidate.uiLanguage === 'en') &&
    typeof candidate.anonymize === 'boolean' &&
    isTruthMode(candidate.truthMode) &&
    (candidate.theme === 'light' || candidate.theme === 'dark' || candidate.theme === 'system')
  )
}

interface ExportPayload {
  formatVersion: number
  exportedAt: string
  applications: Application[]
  drafts: ExportedDraft[]
  settings: Settings
}

/**
 * Prüft eine eingelesene Sicherungsdatei und bringt sie in die erwartete
 * Form, oder wirft mit einer erklärenden Meldung. Läuft vollständig **vor**
 * jedem Schreibzugriff — schlägt die Prüfung fehl, bleibt der bisherige
 * Bestand unangetastet (siehe `importAll`).
 */
function parseExportPayload(value: unknown): ExportPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Die Sicherungsdatei ist beschädigt oder kein gültiges Applai-Backup.')
  }
  const candidate = value as Partial<ExportPayload>
  if (candidate.formatVersion !== EXPORT_FORMAT_VERSION) {
    throw new Error(`Die Sicherungsdatei hat eine unbekannte Version (${String(candidate.formatVersion)}).`)
  }
  if (!Array.isArray(candidate.applications) || !candidate.applications.every(isApplication)) {
    throw new Error('Die Sicherungsdatei ist beschädigt: Die Bewerbungsliste ist ungültig.')
  }
  if (!Array.isArray(candidate.drafts) || !candidate.drafts.every(isExportedDraft)) {
    throw new Error('Die Sicherungsdatei ist beschädigt: Die Entwürfe sind ungültig.')
  }
  if (!isSettings(candidate.settings)) {
    throw new Error('Die Sicherungsdatei ist beschädigt: Die Einstellungen sind ungültig.')
  }
  return {
    formatVersion: candidate.formatVersion,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date(0).toISOString(),
    applications: candidate.applications,
    drafts: candidate.drafts,
    settings: candidate.settings,
  }
}

/**
 * Macht aus einem `ArrayBuffer` eine Base64-Zeichenkette, in Stücken statt in
 * einem Aufruf: `String.fromCharCode(...bytes)` sprengt bei einem größeren
 * `.docx` (mehrere hunderttausend Byte) die Argumentgrenze der Aufrufkette.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function storageError(cause: DOMException | null): Error {
  return new Error(`Auf den Anwendungsspeicher konnte nicht zugegriffen werden${cause ? ` (${cause.name})` : ''}.`)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, STORAGE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(APPLICATIONS_STORE)) {
        db.createObjectStore(APPLICATIONS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(storageError(request.error))
    request.onblocked = () => reject(storageError(null))
  })
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(storageError(request.error))
  })
}

/**
 * Öffnet die Datenbank, führt `run` innerhalb einer einzigen Transaktion über
 * `storeNames` aus und schließt die Verbindung danach wieder — dasselbe
 * Muster wie in `keyVault.ts` (dort für genau einen Speicher), hier auf
 * mehrere Speicher verallgemeinert, weil `exportAll`, `importAll` und
 * `clearAll` mehr als einen Objektspeicher in einem Zug anfassen müssen.
 *
 * Bewusst ohne dauerhaft offene Verbindung, obwohl dieser Adapter — anders
 * als der seltene genutzte Tresor — bei jeder Interaktion mit der
 * Arbeitsfläche aufgerufen werden kann: Das Öffnen einer bereits
 * existierenden Datenbank auf derselben Version ist in der Praxis günstig,
 * und der Gewinn einer gehaltenen Verbindung (kein Verbindungsaufbau je
 * Aufruf) wird durch ihre Kosten aufgewogen — Versionswechsel-Behandlung,
 * das Risiko einer über Seitenwechsel hinweg vergessenen offenen Verbindung.
 * Sollte sich das an einer konkreten Stelle (z. B. sehr häufiges
 * `saveDraft` während des Tippens) als Engpass erweisen, lässt sich das
 * hinter derselben `StorageAdapter`-Schnittstelle ändern, ohne dass
 * aufrufender Code etwas davon merkt.
 *
 * `run` muss alle Anfragen ausschließlich über Promise-Mikrotasks
 * verketten (kein `setTimeout` dazwischen) — sonst könnte die Transaktion
 * laut Spezifikation automatisch abgeschlossen werden, bevor `run` fertig
 * ist.
 */
async function withTransaction<T>(
  storeNames: readonly string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeNames as string[], mode)
      let settled = false
      let value: T
      tx.oncomplete = () => {
        if (!settled) {
          settled = true
          resolve(value)
        }
      }
      tx.onerror = () => {
        if (!settled) {
          settled = true
          reject(storageError(tx.error))
        }
      }
      tx.onabort = () => {
        if (!settled) {
          settled = true
          reject(storageError(tx.error))
        }
      }
      run(tx)
        .then((result) => {
          value = result
        })
        .catch((error: unknown) => {
          if (!settled) {
            settled = true
            reject(error instanceof Error ? error : storageError(null))
          }
          try {
            tx.abort()
          } catch {
            /* Transaktion ist bereits beendet — nichts zu tun. */
          }
        })
    })
  } finally {
    db.close()
  }
}

/** Groß-/Kleinschreibung und umgebende Leerzeichen spielen bei `findDuplicate` keine Rolle. */
function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase()
}

async function listApplications(): Promise<Application[]> {
  return withTransaction([APPLICATIONS_STORE], 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(APPLICATIONS_STORE).getAll()),
  )
}

async function addApplication(input: Omit<Application, 'id'>): Promise<Application> {
  const application: Application = { id: crypto.randomUUID(), ...input }
  await withTransaction([APPLICATIONS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(APPLICATIONS_STORE).add(application))
  })
  return application
}

async function findDuplicate(company: string, position: string): Promise<Application | null> {
  const normalizedCompany = normalizeForComparison(company)
  const normalizedPosition = normalizeForComparison(position)
  const applications = await listApplications()
  const match = applications.find(
    (application) =>
      normalizeForComparison(application.company) === normalizedCompany &&
      normalizeForComparison(application.position) === normalizedPosition,
  )
  return match ?? null
}

async function saveDraft(draft: Draft): Promise<void> {
  await withTransaction([DRAFTS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(DRAFTS_STORE).put(draft))
  })
}

async function loadDraft(id: string): Promise<Draft | null> {
  const draft = await withTransaction([DRAFTS_STORE], 'readonly', (tx) =>
    promisifyRequest<Draft | undefined>(tx.objectStore(DRAFTS_STORE).get(id)),
  )
  return draft ?? null
}

async function purgeExpiredDrafts(maxAgeMs: number): Promise<number> {
  const now = Date.now()
  return withTransaction([DRAFTS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(DRAFTS_STORE)
    const drafts = await promisifyRequest<Draft[]>(store.getAll())
    // "älter als die Frist": das Alter muss die Frist echt überschreiten,
    // exakt an der Grenze gilt ein Entwurf noch nicht als abgelaufen.
    const expired = drafts.filter((draft) => now - draft.savedAt > maxAgeMs)
    for (const draft of expired) {
      await promisifyRequest(store.delete(draft.id))
    }
    return expired.length
  })
}

async function getSettings(): Promise<Settings> {
  const stored = await withTransaction([SETTINGS_STORE], 'readonly', (tx) =>
    promisifyRequest<Settings | undefined>(tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY)),
  )
  return stored ?? { ...DEFAULT_SETTINGS }
}

async function saveSettings(settings: Settings): Promise<void> {
  await withTransaction([SETTINGS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(SETTINGS_STORE).put(settings, SETTINGS_KEY))
  })
}

async function exportAll(): Promise<Blob> {
  const [applications, drafts, settings] = await Promise.all([
    listApplications(),
    withTransaction([DRAFTS_STORE], 'readonly', (tx) => promisifyRequest<Draft[]>(tx.objectStore(DRAFTS_STORE).getAll())),
    getSettings(),
  ])
  const payload: ExportPayload = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    applications,
    drafts: drafts.map((draft) => ({
      id: draft.id,
      text: draft.text,
      savedAt: draft.savedAt,
      docxBase: arrayBufferToBase64(draft.docxBase),
    })),
    settings,
  }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

async function importAll(file: File): Promise<void> {
  // Erst vollständig lesen und prüfen, dann schreiben: schlägt die Prüfung
  // fehl, bleibt der bisherige Bestand vollständig unangetastet.
  const raw: unknown = JSON.parse(await file.text())
  const payload = parseExportPayload(raw)

  await withTransaction([APPLICATIONS_STORE, DRAFTS_STORE, SETTINGS_STORE], 'readwrite', async (tx) => {
    const applicationsStore = tx.objectStore(APPLICATIONS_STORE)
    const draftsStore = tx.objectStore(DRAFTS_STORE)
    const settingsStore = tx.objectStore(SETTINGS_STORE)

    // importAll stellt eine Sicherung wieder her — es führt nicht mit dem
    // aktuellen Bestand zusammen, sondern ersetzt ihn vollständig. Alles
    // andere wäre für eine Wiederherstellung überraschend.
    await promisifyRequest(applicationsStore.clear())
    await promisifyRequest(draftsStore.clear())

    for (const application of payload.applications) {
      await promisifyRequest(applicationsStore.put(application))
    }
    for (const draft of payload.drafts) {
      const restored: Draft = {
        id: draft.id,
        text: draft.text,
        savedAt: draft.savedAt,
        docxBase: base64ToArrayBuffer(draft.docxBase),
      }
      await promisifyRequest(draftsStore.put(restored))
    }
    await promisifyRequest(settingsStore.put(payload.settings, SETTINGS_KEY))
  })
}

async function clearAll(): Promise<void> {
  // Eine gemeinsame Transaktion über alle drei Speicher: entweder wird
  // vollständig geleert oder gar nicht. Die Datenbank des Schlüsseltresors
  // (`applai-key-vault`) ist eine andere Datenbank und kommt hier nicht vor.
  await withTransaction([APPLICATIONS_STORE, DRAFTS_STORE, SETTINGS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(APPLICATIONS_STORE).clear())
    await promisifyRequest(tx.objectStore(DRAFTS_STORE).clear())
    await promisifyRequest(tx.objectStore(SETTINGS_STORE).clear())
  })
}

export function createIndexedDbAdapter(): StorageAdapter {
  return {
    listApplications,
    addApplication,
    findDuplicate,
    saveDraft,
    loadDraft,
    purgeExpiredDrafts,
    getSettings,
    saveSettings,
    exportAll,
    importAll,
    clearAll,
  }
}
