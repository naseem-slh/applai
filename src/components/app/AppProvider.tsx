import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import i18n, { detectBrowserLanguage } from '@/lib/i18n/i18n'
import type { Settings, StorageAdapter } from '@/lib/storage/adapter'
import { createIndexedDbAdapter, DEFAULT_SETTINGS } from '@/lib/storage/indexeddb'
import { createKeyVault, type KeyVault } from '@/lib/storage/keyVault'
import { useKeyVault } from '@/components/onboarding/useKeyVault'
import {
  AppContext,
  DRAFT_MAX_AGE_MS,
  type AppContextValue,
  type StartSession,
} from './appContext'

/**
 * Was die Anwendung genau einmal beim Start tut, an einer Stelle.
 *
 * 1. **Einstellungen lesen und anwenden** — Erscheinungsbild an das
 *    Wurzelelement, Sprache an i18next.
 * 2. **Sprache vorauswählen**, solange nie etwas gespeichert wurde
 *    (Übergabe 3). Die Speicherschicht liefert fest `'de'`; die
 *    Browsersprache ist eine Sache der Oberfläche.
 * 3. **Abgelaufene Entwürfe löschen** (Übergabe 4). `purgeExpiredDrafts`
 *    gibt es seit Aufgabe 6 und hatte bis heute keinen Aufrufer — damit war
 *    die Zusage aus dem Datenschutzhinweis („spätestens nach sieben Tagen")
 *    nicht eingelöst.
 * 4. **Den Schlüsseltresor erzeugen** und über den Kontext beiden Ansichten
 *    zur Verfügung stellen (13b: „wer ihn an mehreren Stellen braucht, legt
 *    einen Context um das Ergebnis").
 *
 * Der Anbieter **sperrt die Anwendung nicht**, solange er liest. Die
 * Einstellungen starten mit den Vorgaben und werden ersetzt, sobald der
 * Speicher geantwortet hat; das Erscheinungsbild beginnt damit auf
 * „Systemeinstellung", also genau dort, wo der Browser ohnehin steht.
 * Ein Ladeschirm über der ganzen Anwendung wäre für eine einzige Lesung
 * aus IndexedDB unruhiger als der spätere Wechsel.
 */

/** Erscheinungsbild an `<html>`: eine ausdrückliche Wahl setzt das Attribut, die Systemeinstellung nimmt es weg (siehe design.css). */
function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  if (theme === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }
}

/** Sprache an i18next **und** an `<html lang>` — Letzteres brauchen Vorlesesoftware und Silbentrennung. */
function applyLanguage(language: Settings['uiLanguage']): void {
  if (i18n.resolvedLanguage !== language) {
    void i18n.changeLanguage(language)
  }
  document.documentElement.lang = language
}

function applySettings(settings: Settings): void {
  applyTheme(settings.theme)
  applyLanguage(settings.uiLanguage)
}

export interface AppProviderProps {
  children: ReactNode
  /** Austauschbar für Tests. Vorgabe ist die IndexedDB-Umsetzung. */
  storage?: StorageAdapter
  /** Wird an `useKeyVault` durchgereicht — siehe dort. */
  createVault?: () => KeyVault
}

export function AppProvider({ children, storage, createVault = createKeyVault }: AppProviderProps) {
  // Ohne useMemo entstünde bei jedem Rendern ein neuer Adapter, und jeder
  // Effekt, der ihn in seiner Abhängigkeitsliste führt, liefe erneut.
  const adapter = useMemo(() => storage ?? createIndexedDbAdapter(), [storage])
  const keyVault = useKeyVault(createVault)

  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    uiLanguage: detectBrowserLanguage(),
  }))
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  // `null`, bis die Einstiegsseite etwas übergibt. Es gibt keinen leeren
  // Übergabestand: Ein `StartSession` mit leerem `userName` wäre genau der
  // Zustand, den Übergabe 1 verbietet (siehe `appContext.ts`).
  const [session, setSession] = useState<StartSession | null>(null)

  // Der jeweils gültige Stand für `updateSettings`. Ohne Ref müsste
  // `settings` in der Abhängigkeitsliste stehen, und der Rückruf bekäme bei
  // jeder Änderung eine neue Identität — was jede Ansicht, die ihn in
  // einem eigenen Effekt führt, unnötig neu laufen ließe.
  const current = useRef(settings)

  const readSettings = useCallback(async (): Promise<void> => {
    try {
      const [stored, exists] = await Promise.all([adapter.getSettings(), adapter.hasSettings()])
      // Wurde nie etwas gespeichert, bleibt die Sprache stehen, die gerade
      // gilt. Beim ersten Start ist das die Browsersprache, denn genau damit
      // ist der Anfangsstand vorbelegt (Übergabe 3) — nach „Alle Daten
      // löschen" ist es die zuletzt gewählte. Gelöscht werden Daten, nicht
      // die Sprache, in der jemand gerade liest; ein Sprung ins Englische
      // mitten in der Sitzung wäre für den Nutzer ein zweiter, unverlangter
      // Effekt des Knopfes. Über das Neuladen hinaus überlebt sie nicht, und
      // das ist richtig: Dafür bräuchte es einen gespeicherten Datensatz.
      // Eine ausdrücklich gespeicherte Wahl gewinnt ohnehin immer (siehe
      // `hasSettings` in adapter.ts).
      const resolved: Settings = exists
        ? stored
        : { ...stored, uiLanguage: current.current.uiLanguage }
      current.current = resolved
      setSettings(resolved)
      applySettings(resolved)
      setStorageUnavailable(false)
    } catch {
      // Kein durchgereichter `error.message` (G8). Die Anwendung läuft mit
      // den Vorgaben weiter — sonst wäre bei gesperrtem Speicher nicht
      // einmal mehr „Alle Daten löschen" erreichbar. Angewandt werden sie
      // trotzdem: Sonst bliebe `<html lang>` auf dem Wert aus `index.html`
      // stehen, während die Oberfläche in der Browsersprache dasteht.
      applySettings(current.current)
      setStorageUnavailable(true)
    }
  }, [adapter])

  const [storageReady, setStorageReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await readSettings()
      try {
        // Übergabe 4 — die Frist gehört der aufrufenden Seite (adapter.ts).
        await adapter.purgeExpiredDrafts(DRAFT_MAX_AGE_MS)
      } catch {
        // Ein nicht erreichbarer Speicher ist bereits über
        // `storageUnavailable` sichtbar; hier gibt es nichts zu melden,
        // was der Nutzer tun könnte.
      }
      // Erst danach dürfen Ansichten Entwürfe lesen — sonst böte die
      // Einstiegsseite einen Entwurf an, der im selben Moment abläuft.
      if (!cancelled) setStorageReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [adapter, readSettings])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>): Promise<void> => {
      const previous = current.current
      const next: Settings = { ...previous, ...patch }
      current.current = next
      setSettings(next)
      applySettings(next)
      try {
        await adapter.saveSettings(next)
      } catch (error) {
        // Zurück auf den vorigen Stand: Eine Einstellung, die sichtbar
        // umspringt, aber nicht gespeichert ist, wäre schlimmer als eine,
        // die sich nicht ändern lässt.
        current.current = previous
        setSettings(previous)
        applySettings(previous)
        throw error
      }
    },
    [adapter],
  )

  const value: AppContextValue = useMemo(
    () => ({
      storage: adapter,
      keyVault,
      settings,
      updateSettings,
      reloadSettings: readSettings,
      session,
      setSession,
      storageReady,
      storageUnavailable,
    }),
    [adapter, keyVault, settings, updateSettings, readSettings, session, storageReady, storageUnavailable],
  )

  return <AppContext value={value}>{children}</AppContext>
}
