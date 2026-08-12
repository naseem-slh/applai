import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type {
  Application,
  CachedAnalysis,
  Draft,
  MarkSet,
  Settings,
  StorageAdapter,
} from '@/lib/storage/adapter'
import { DEFAULT_SETTINGS } from '@/lib/storage/indexeddb'
import type { KeyVault } from '@/lib/storage/keyVault'
import type { KeyVaultHandle, KeyVaultStatus } from '@/components/onboarding/useKeyVault'
import { AppContext, type AppContextValue, type StartSession } from './appContext'

/**
 * Testdoppel für Speicher, Tresor und Anwendungskontext.
 *
 * Liegt neben dem Code statt in einem Testverzeichnis (Konvention aus
 * `CLAUDE.md`) und wird von den Tests der Einstiegsseite, der Einstellungen
 * und des Anbieters gemeinsam benutzt — drei eigene Attrappen wären drei
 * Gelegenheiten, dass eine davon still von der Schnittstelle abweicht.
 *
 * Die Attrappe des Speichers hält ihren Bestand im Arbeitsspeicher, statt
 * jede Methode einzeln zu verstellen: Ein Test, der etwas speichert und es
 * danach wieder liest, prüft damit den Weg und nicht die Attrappe.
 */

export interface FakeStorage extends StorageAdapter {
  /** Der gehaltene Bestand — für Zusicherungen im Test. */
  state: {
    applications: Application[]
    drafts: Map<string, Draft>
    settings: Settings | null
    markSets: Map<string, MarkSet>
    analyses: Map<string, CachedAnalysis>
  }
}

export function createFakeStorage(initial: Partial<FakeStorage['state']> = {}): FakeStorage {
  const state: FakeStorage['state'] = {
    applications: initial.applications ?? [],
    drafts: initial.drafts ?? new Map(),
    settings: initial.settings ?? null,
    markSets: initial.markSets ?? new Map(),
    analyses: initial.analyses ?? new Map(),
  }

  const storage: FakeStorage = {
    state,
    listApplications: vi.fn(() => Promise.resolve([...state.applications])),
    addApplication: vi.fn((input) => {
      const created: Application = { id: `id-${state.applications.length}`, ...input }
      state.applications.push(created)
      return Promise.resolve(created)
    }),
    findDuplicate: vi.fn(() => Promise.resolve(null)),
    saveDraft: vi.fn((draft: Draft) => {
      state.drafts.set(draft.id, draft)
      return Promise.resolve()
    }),
    loadDraft: vi.fn((id: string) => Promise.resolve(state.drafts.get(id) ?? null)),
    deleteDraft: vi.fn((id: string) => {
      state.drafts.delete(id)
      return Promise.resolve()
    }),
    purgeExpiredDrafts: vi.fn(() => Promise.resolve(0)),
    listCachedAnalyses: vi.fn(() => Promise.resolve([...state.analyses.values()])),
    loadCachedAnalysis: vi.fn((key: string) => Promise.resolve(state.analyses.get(key) ?? null)),
    saveCachedAnalysis: vi.fn((entry: CachedAnalysis) => {
      state.analyses.set(entry.key, entry)
      return Promise.resolve()
    }),
    deleteCachedAnalysis: vi.fn((key: string) => {
      state.analyses.delete(key)
      return Promise.resolve()
    }),
    listMarkSets: vi.fn(() => Promise.resolve([...state.markSets.values()])),
    loadMarkSet: vi.fn((id: string) => Promise.resolve(state.markSets.get(id) ?? null)),
    saveMarkSet: vi.fn((set: MarkSet) => {
      state.markSets.set(set.id, set)
      return Promise.resolve()
    }),
    deleteMarkSet: vi.fn((id: string) => {
      state.markSets.delete(id)
      return Promise.resolve()
    }),
    getSettings: vi.fn(() => Promise.resolve(state.settings ?? { ...DEFAULT_SETTINGS })),
    hasSettings: vi.fn(() => Promise.resolve(state.settings !== null)),
    saveSettings: vi.fn((settings: Settings) => {
      state.settings = settings
      return Promise.resolve()
    }),
    exportAll: vi.fn(() => Promise.resolve(new Blob(['{}'], { type: 'application/json' }))),
    importAll: vi.fn(() => Promise.resolve()),
    clearAll: vi.fn(() => {
      state.applications = []
      state.drafts.clear()
      state.settings = null
      state.markSets.clear()
      state.analyses.clear()
      return Promise.resolve()
    }),
  }
  return storage
}

export function createFakeVault(overrides: Partial<KeyVault> = {}): KeyVault {
  return {
    initialize: vi.fn(() => Promise.resolve()),
    save: vi.fn(() => Promise.resolve()),
    isLocked: vi.fn(() => Promise.resolve(false)),
    unlock: vi.fn(() => Promise.resolve()),
    lock: vi.fn(),
    getKey: vi.fn(() => null),
    getProvider: vi.fn(() => null),
    clear: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    ...overrides,
  }
}

/**
 * Grundwerte, damit ein Test eine Sitzung stückweise angeben kann
 * (`session: { letter: … }`). Bewusst **nur hier**: In der Anwendung gibt es
 * keinen leeren Übergabestand, weil ein `StartSession` mit leerem `userName`
 * genau der Zustand wäre, den Übergabe 1 verbietet (siehe `appContext.ts`).
 * Wer im Test gar keine Sitzung angibt, bekommt `null` — den Normalfall vor
 * dem ersten Weitergehen.
 */
const BLANK_SESSION: StartSession = { letter: null, cv: null, jobAdText: '', userName: '' }

export interface HarnessOptions {
  storage?: FakeStorage
  vault?: KeyVault
  status?: KeyVaultStatus
  settings?: Partial<Settings>
  session?: Partial<StartSession>
  storageReady?: boolean
  storageUnavailable?: boolean
  updateSettings?: AppContextValue['updateSettings']
  reloadSettings?: AppContextValue['reloadSettings']
  setSession?: AppContextValue['setSession']
  refresh?: KeyVaultHandle['refresh']
}

export interface Harness {
  value: AppContextValue
  storage: FakeStorage
  vault: KeyVault
  /** Dieselben Attrappen wie in `value`, nur direkt greifbar für Zusicherungen. */
  setSession: AppContextValue['setSession']
  updateSettings: AppContextValue['updateSettings']
  reloadSettings: AppContextValue['reloadSettings']
  refresh: KeyVaultHandle['refresh']
  wrapper: (props: { children: ReactNode }) => ReactNode
}

/**
 * Ein vollständiger Anwendungskontext ohne `AppProvider` — die Ansicht wird
 * damit für sich geprüft, nicht zusammen mit dem Startvorgang. Wer den
 * Startvorgang selbst prüfen will, nimmt `AppProvider` (siehe
 * `AppProvider.test.tsx`).
 */
export function createHarness(options: HarnessOptions = {}): Harness {
  const storage = options.storage ?? createFakeStorage()
  const vault = options.vault ?? createFakeVault()

  const value: AppContextValue = {
    storage,
    keyVault: {
      vault,
      status: options.status ?? 'unlocked',
      refresh: options.refresh ?? vi.fn(),
    },
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    updateSettings: options.updateSettings ?? vi.fn(() => Promise.resolve()),
    reloadSettings: options.reloadSettings ?? vi.fn(() => Promise.resolve()),
    session: options.session === undefined ? null : { ...BLANK_SESSION, ...options.session },
    setSession: options.setSession ?? vi.fn(),
    storageReady: options.storageReady ?? true,
    storageUnavailable: options.storageUnavailable ?? false,
  }

  function wrapper({ children }: { children: ReactNode }) {
    return <AppContext value={value}>{children}</AppContext>
  }

  return {
    value,
    storage,
    vault,
    setSession: value.setSession,
    updateSettings: value.updateSettings,
    reloadSettings: value.reloadSettings,
    refresh: value.keyVault.refresh,
    wrapper,
  }
}
