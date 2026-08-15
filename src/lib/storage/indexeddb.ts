import type {
  Application,
  CachedAnalysis,
  Draft,
  MarkAnchor,
  MarkSet,
  Settings,
  StorageAdapter,
  TruthMode,
} from './adapter'
import { isProviderId, type ProviderId } from './keyVault'

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
/**
 * Fassung 3: `markSets` (vorgemerkte Stellen) und `analysisCache`
 * (Auswertungsspeicher) sind nacheinander dazugekommen. `onupgradeneeded` legt jeden Speicher nur an, wenn er fehlt —
 * eine im Browser stehende Datenbank der Fassung 1 wächst also mit, ohne
 * ihren Bestand zu verlieren.
 */
const STORAGE_DB_VERSION = 3

export const APPLICATIONS_STORE = 'applications'
export const DRAFTS_STORE = 'drafts'
export const SETTINGS_STORE = 'settings'
export const MARK_SETS_STORE = 'markSets'
export const ANALYSIS_CACHE_STORE = 'analysisCache'

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
  zoom: 100,
}

/**
 * Schema-Stand der Sicherungsdatei (`exportAll`/`importAll`), unabhängig von
 * `STORAGE_DB_VERSION`. Ändert sich das Format der Datei, steigt diese Zahl,
 * und `importAll` kann alte Dateien erkennen und migrieren oder ablehnen.
 */
export const EXPORT_FORMAT_VERSION = 2

/**
 * Welche Fassungen `importAll` annimmt. Fassung 1 kannte die vorgemerkten
 * Stellen noch nicht; eine solche Datei bleibt lesbar und liefert schlicht
 * keine. Eine alte Sicherung abzulehnen, wäre der schlechteste Zeitpunkt
 * dafür — sie wird gelesen, wenn sonst nichts mehr da ist.
 */
const SUPPORTED_EXPORT_VERSIONS: readonly number[] = [1, EXPORT_FORMAT_VERSION]

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
  /** Optional wie in `Draft` selbst — siehe dort für die Bedeutung eines fehlenden Werts. */
  letterheadAppliedFor?: string
}

/**
 * Prüft, ob `value` sich mit `atob()` decodieren lässt — dieselbe Funktion,
 * die `base64ToArrayBuffer` beim tatsächlichen Import verwendet. Ohne diese
 * Prüfung würde ein unstimmiges `docxBase` erst beim Schreiben auffallen,
 * innerhalb der Transaktion in `importAll` — die Transaktion würde zwar
 * automatisch zurückgerollt, aber die Zusicherung „vollständig geprüft, bevor
 * geschrieben wird" (siehe `parseExportPayload`) wäre für dieses Feld nicht
 * eingehalten.
 */
function isWellFormedBase64(value: string): boolean {
  try {
    atob(value)
    return true
  } catch {
    return false
  }
}

function isExportedDraft(value: unknown): value is ExportedDraft {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ExportedDraft>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.savedAt === 'number' &&
    typeof candidate.docxBase === 'string' &&
    isWellFormedBase64(candidate.docxBase) &&
    // Fehlt in jeder Sicherungsdatei von vor dieser Fixrunde — kein Mangel,
    // siehe `Draft.letterheadAppliedFor`.
    (candidate.letterheadAppliedFor === undefined || typeof candidate.letterheadAppliedFor === 'string')
  )
}

/**
 * `models` fehlt in jedem Datensatz, der vor der Modellauswahl gespeichert
 * wurde. Das ist kein Mangel: Ohne Eintrag gilt das voreingestellte Modell.
 * Steht etwas da, muss es die Form haben.
 */
function isModelSelection(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).every(([key, model]) => isProviderId(key) && typeof model === 'string')
}

function isModelChain(value: unknown): boolean {
  if (value === undefined) return true
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).every(
    ([key, chain]) =>
      isProviderId(key) && Array.isArray(chain) && chain.every((entry) => typeof entry === 'string'),
  )
}

function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Settings>
  return (
    (candidate.paidKey === undefined || typeof candidate.paidKey === 'boolean') &&
    (candidate.keepMarks === undefined || typeof candidate.keepMarks === 'boolean') &&
    isModelSelection(candidate.models) &&
    isModelChain(candidate.modelChain) &&
    isProviderId(candidate.provider) &&
    (candidate.uiLanguage === 'de' || candidate.uiLanguage === 'en') &&
    typeof candidate.anonymize === 'boolean' &&
    isTruthMode(candidate.truthMode) &&
    (candidate.theme === 'light' || candidate.theme === 'dark' || candidate.theme === 'system')
  )
}

function isMarkAnchor(value: unknown): value is MarkAnchor {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<MarkAnchor>
  return (
    typeof candidate.text === 'string' &&
    typeof candidate.before === 'string' &&
    typeof candidate.after === 'string' &&
    Number.isInteger(candidate.from) &&
    Number.isInteger(candidate.to)
  )
}

function isMarkSet(value: unknown): value is MarkSet {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<MarkSet>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.savedAt === 'number' &&
    Array.isArray(candidate.anchors) &&
    candidate.anchors.every(isMarkAnchor)
  )
}

interface ExportPayload {
  formatVersion: number
  exportedAt: string
  applications: Application[]
  drafts: ExportedDraft[]
  settings: Settings
  markSets: MarkSet[]
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
  if (
    typeof candidate.formatVersion !== 'number' ||
    !SUPPORTED_EXPORT_VERSIONS.includes(candidate.formatVersion)
  ) {
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
  // Fehlt in einer Datei der Fassung 1 und ist dort auch kein Mangel.
  const markSets = candidate.markSets ?? []
  if (!Array.isArray(markSets) || !markSets.every(isMarkSet)) {
    throw new Error('Die Sicherungsdatei ist beschädigt: Die vorgemerkten Stellen sind ungültig.')
  }
  return {
    formatVersion: candidate.formatVersion,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date(0).toISOString(),
    applications: candidate.applications,
    drafts: candidate.drafts,
    settings: candidate.settings,
    markSets,
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
      if (!db.objectStoreNames.contains(MARK_SETS_STORE)) {
        db.createObjectStore(MARK_SETS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ANALYSIS_CACHE_STORE)) {
        db.createObjectStore(ANALYSIS_CACHE_STORE, { keyPath: 'key' })
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

async function deleteDraft(id: string): Promise<void> {
  // IDBObjectStore.delete() selbst löst schon nicht, wenn der Schlüssel
  // fehlt — das reicht hier unverändert durch (siehe Begründung in
  // adapter.ts).
  await withTransaction([DRAFTS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(DRAFTS_STORE).delete(id))
  })
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

async function listMarkSets(): Promise<MarkSet[]> {
  return withTransaction([MARK_SETS_STORE], 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(MARK_SETS_STORE).getAll()),
  )
}

async function loadMarkSet(id: string): Promise<MarkSet | null> {
  const set = await withTransaction([MARK_SETS_STORE], 'readonly', (tx) =>
    promisifyRequest<MarkSet | undefined>(tx.objectStore(MARK_SETS_STORE).get(id)),
  )
  return set ?? null
}

async function saveMarkSet(set: MarkSet): Promise<void> {
  await withTransaction([MARK_SETS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(MARK_SETS_STORE).put(set))
  })
}

async function deleteMarkSet(id: string): Promise<void> {
  await withTransaction([MARK_SETS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(MARK_SETS_STORE).delete(id))
  })
}

async function listCachedAnalyses(): Promise<CachedAnalysis[]> {
  return withTransaction([ANALYSIS_CACHE_STORE], 'readonly', (tx) =>
    promisifyRequest(tx.objectStore(ANALYSIS_CACHE_STORE).getAll()),
  )
}

async function loadCachedAnalysis(key: string): Promise<CachedAnalysis | null> {
  const entry = await withTransaction([ANALYSIS_CACHE_STORE], 'readonly', (tx) =>
    promisifyRequest<CachedAnalysis | undefined>(tx.objectStore(ANALYSIS_CACHE_STORE).get(key)),
  )
  return entry ?? null
}

async function saveCachedAnalysis(entry: CachedAnalysis): Promise<void> {
  await withTransaction([ANALYSIS_CACHE_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(ANALYSIS_CACHE_STORE).put(entry))
  })
}

async function deleteCachedAnalysis(key: string): Promise<void> {
  await withTransaction([ANALYSIS_CACHE_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(ANALYSIS_CACHE_STORE).delete(key))
  })
}

async function getSettings(): Promise<Settings> {
  const stored = await withTransaction([SETTINGS_STORE], 'readonly', (tx) =>
    promisifyRequest<Settings | undefined>(tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY)),
  )
  return stored === undefined ? { ...DEFAULT_SETTINGS } : withMigratedModels(stored)
}

/**
 * Übernimmt eine früher gespeicherte Einzelwahl (`models`) in die
 * Modellkette. Genau eine Stelle, an der das geschieht — der Rest der
 * Anwendung sieht nur `modelChain`.
 */
function withMigratedModels(stored: Settings): Settings {
  const legacy = stored.models
  if (legacy === undefined || stored.modelChain !== undefined) return stored

  const migrated: Partial<Record<ProviderId, string[]>> = {}
  for (const [provider, model] of Object.entries(legacy)) {
    if (isProviderId(provider) && typeof model === 'string' && model.trim() !== '') {
      migrated[provider] = [model]
    }
  }
  return { ...stored, modelChain: migrated }
}

/**
 * Ob überhaupt ein Einstellungs-Datensatz existiert (siehe `adapter.ts`).
 * Bewusst getrennt von `getSettings()`, das weiterhin immer sinnvolle
 * Vorgaben liefert — der Unterschied „nie gespeichert" gegenüber
 * „gespeichert, sieht aber aus wie die Vorgabe" ist von außen sonst nicht
 * zu sehen.
 */
async function hasSettings(): Promise<boolean> {
  const stored = await withTransaction([SETTINGS_STORE], 'readonly', (tx) =>
    promisifyRequest<Settings | undefined>(tx.objectStore(SETTINGS_STORE).get(SETTINGS_KEY)),
  )
  return stored !== undefined
}

async function saveSettings(settings: Settings): Promise<void> {
  await withTransaction([SETTINGS_STORE], 'readwrite', async (tx) => {
    await promisifyRequest(tx.objectStore(SETTINGS_STORE).put(settings, SETTINGS_KEY))
  })
}

async function exportAll(): Promise<Blob> {
  const [applications, drafts, settings, markSets] = await Promise.all([
    listApplications(),
    withTransaction([DRAFTS_STORE], 'readonly', (tx) => promisifyRequest<Draft[]>(tx.objectStore(DRAFTS_STORE).getAll())),
    getSettings(),
    listMarkSets(),
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
      letterheadAppliedFor: draft.letterheadAppliedFor,
    })),
    settings,
    markSets,
  }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

async function importAll(file: File): Promise<void> {
  // Erst vollständig lesen und prüfen, dann schreiben: schlägt die Prüfung
  // fehl, bleibt der bisherige Bestand vollständig unangetastet.
  const raw: unknown = JSON.parse(await file.text())
  const payload = parseExportPayload(raw)

  await withTransaction([APPLICATIONS_STORE, DRAFTS_STORE, SETTINGS_STORE, MARK_SETS_STORE], 'readwrite', async (tx) => {
    const applicationsStore = tx.objectStore(APPLICATIONS_STORE)
    const draftsStore = tx.objectStore(DRAFTS_STORE)
    const settingsStore = tx.objectStore(SETTINGS_STORE)
    const markSetsStore = tx.objectStore(MARK_SETS_STORE)

    // importAll stellt eine Sicherung wieder her — es führt nicht mit dem
    // aktuellen Bestand zusammen, sondern ersetzt ihn vollständig. Alles
    // andere wäre für eine Wiederherstellung überraschend.
    await promisifyRequest(applicationsStore.clear())
    await promisifyRequest(draftsStore.clear())
    await promisifyRequest(markSetsStore.clear())

    for (const application of payload.applications) {
      await promisifyRequest(applicationsStore.put(application))
    }
    for (const draft of payload.drafts) {
      const restored: Draft = {
        id: draft.id,
        text: draft.text,
        savedAt: draft.savedAt,
        docxBase: base64ToArrayBuffer(draft.docxBase),
        letterheadAppliedFor: draft.letterheadAppliedFor,
      }
      await promisifyRequest(draftsStore.put(restored))
    }
    for (const set of payload.markSets) {
      await promisifyRequest(markSetsStore.put(set))
    }
    await promisifyRequest(settingsStore.put(payload.settings, SETTINGS_KEY))
  })
}

async function clearAll(): Promise<void> {
  // Eine gemeinsame Transaktion über alle vier Speicher: entweder wird
  // vollständig geleert oder gar nicht. Die Datenbank des Schlüsseltresors
  // (`applai-key-vault`) ist eine andere Datenbank und kommt hier nicht vor.
  await withTransaction(
    [APPLICATIONS_STORE, DRAFTS_STORE, SETTINGS_STORE, MARK_SETS_STORE, ANALYSIS_CACHE_STORE],
    'readwrite',
    async (tx) => {
      await promisifyRequest(tx.objectStore(APPLICATIONS_STORE).clear())
      await promisifyRequest(tx.objectStore(DRAFTS_STORE).clear())
      await promisifyRequest(tx.objectStore(SETTINGS_STORE).clear())
      await promisifyRequest(tx.objectStore(MARK_SETS_STORE).clear())
      // „Alle Daten löschen" heißt alle: Der Auswertungsspeicher enthält
      // Modellantworten zu den Unterlagen des Nutzers und bleibt nicht
      // stehen, nur weil er wiederherstellbar wäre.
      await promisifyRequest(tx.objectStore(ANALYSIS_CACHE_STORE).clear())
    },
  )
}

export function createIndexedDbAdapter(): StorageAdapter {
  return {
    listApplications,
    addApplication,
    findDuplicate,
    saveDraft,
    loadDraft,
    deleteDraft,
    purgeExpiredDrafts,
    listCachedAnalyses,
    loadCachedAnalysis,
    saveCachedAnalysis,
    deleteCachedAnalysis,
    listMarkSets,
    loadMarkSet,
    saveMarkSet,
    deleteMarkSet,
    getSettings,
    hasSettings,
    saveSettings,
    exportAll,
    importAll,
    clearAll,
  }
}
