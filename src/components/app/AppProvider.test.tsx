import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { DEFAULT_SETTINGS } from '@/lib/storage/indexeddb'
import type { Settings } from '@/lib/storage/adapter'
import { AppProvider } from './AppProvider'
import { DRAFT_MAX_AGE_MS, useApp } from './appContext'
import { createFakeStorage, createFakeVault, type FakeStorage } from './appContext.testutils'

/** Zeigt die Werte, um die es geht, damit der Test sie ablesen kann. */
function Probe() {
  const { settings, storageReady, storageUnavailable, updateSettings } = useApp()
  return (
    <div>
      <span data-testid="language">{settings.uiLanguage}</span>
      <span data-testid="theme">{settings.theme}</span>
      <span data-testid="ready">{String(storageReady)}</span>
      <span data-testid="unavailable">{String(storageUnavailable)}</span>
      <button type="button" onClick={() => void updateSettings({ theme: 'dark' }).catch(() => {})}>
        dunkel
      </button>
    </div>
  )
}

function renderProvider(storage: FakeStorage) {
  return render(
    <AppProvider storage={storage} createVault={() => createFakeVault()}>
      <Probe />
    </AppProvider>,
  )
}

function stored(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
})

describe('AppProvider — Sprache (Übergabe 3)', () => {
  it('wählt beim ersten Start die Browsersprache vor, obwohl die Speicherschicht „de" liefert', async () => {
    // jsdom meldet `navigator.language` als 'en-US'; die Speicherschicht
    // liefert fest 'de' (DEFAULT_SETTINGS). Ohne die Vorauswahl in der
    // Oberfläche stünde die Anwendung für eine englische Nutzerin auf
    // Deutsch.
    expect(DEFAULT_SETTINGS.uiLanguage).toBe('de')
    const storage = createFakeStorage()

    renderProvider(storage)

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('language')).toHaveTextContent('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('lässt eine ausdrücklich gespeicherte Wahl gewinnen — auch wenn sie wie die Vorgabe aussieht', async () => {
    // Der Fall, an dem jede Heuristik scheitern würde: Wer im englischen
    // Browser bewusst Deutsch einstellt, speichert genau
    // DEFAULT_SETTINGS. Genau dafür gibt es `hasSettings()`.
    const storage = createFakeStorage({ settings: stored({ uiLanguage: 'de' }) })

    renderProvider(storage)

    await waitFor(() => expect(screen.getByTestId('language')).toHaveTextContent('de'))
    expect(storage.hasSettings).toHaveBeenCalled()
  })

  it('schreibt beim ersten Start nichts in den Speicher', async () => {
    // Die Vorauswahl ist idempotent: Solange nichts gespeichert ist, wird
    // sie bei jedem Start neu getroffen. Ein vorsorglicher Schreibvorgang
    // legte einen Datensatz an, den der Nutzer nie angefordert hat.
    const storage = createFakeStorage()

    renderProvider(storage)

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(storage.saveSettings).not.toHaveBeenCalled()
    expect(storage.state.settings).toBeNull()
  })
})

describe('AppProvider — Erscheinungsbild', () => {
  it('setzt eine ausdrückliche Wahl als data-theme an das Wurzelelement', async () => {
    const storage = createFakeStorage({ settings: stored({ theme: 'dark' }) })

    renderProvider(storage)

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
  })

  it('nimmt das Attribut für die Systemeinstellung wieder weg', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const storage = createFakeStorage({ settings: stored({ theme: 'system' }) })

    renderProvider(storage)

    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false))
  })
})

describe('AppProvider — Entwürfe aufräumen (Übergabe 4)', () => {
  it('löscht beim Start abgelaufene Entwürfe mit der Frist aus der Spezifikation', async () => {
    const storage = createFakeStorage()

    renderProvider(storage)

    await waitFor(() => expect(storage.purgeExpiredDrafts).toHaveBeenCalledWith(DRAFT_MAX_AGE_MS))
    expect(DRAFT_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('meldet erst dann bereit, wenn das Aufräumen durch ist', async () => {
    let release: (() => void) | null = null
    const storage = createFakeStorage()
    storage.purgeExpiredDrafts = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0)
        }),
    )

    renderProvider(storage)

    await waitFor(() => expect(release).not.toBeNull())
    expect(screen.getByTestId('ready')).toHaveTextContent('false')

    release!()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  })

  it('läuft weiter, wenn das Aufräumen scheitert', async () => {
    const storage = createFakeStorage()
    storage.purgeExpiredDrafts = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))

    renderProvider(storage)

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
  })
})

describe('AppProvider — Einstellungen speichern', () => {
  it('speichert eine Änderung und wendet sie an', async () => {
    const storage = createFakeStorage({ settings: stored() })

    renderProvider(storage)
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))

    screen.getByRole('button', { name: 'dunkel' }).click()

    await waitFor(() => expect(storage.state.settings?.theme).toBe('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('dreht den sichtbaren Stand zurück, wenn das Speichern scheitert', async () => {
    // Eine Einstellung, die umspringt, aber nicht gespeichert ist, wäre
    // schlimmer als eine, die sich nicht ändern lässt.
    const storage = createFakeStorage({ settings: stored({ theme: 'light' }) })
    storage.saveSettings = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))

    renderProvider(storage)
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'))

    screen.getByRole('button', { name: 'dunkel' }).click()

    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('läuft mit den Vorgaben weiter, wenn der Speicher nicht antwortet', async () => {
    const storage = createFakeStorage()
    storage.getSettings = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))

    renderProvider(storage)

    await waitFor(() => expect(screen.getByTestId('unavailable')).toHaveTextContent('true'))
    // Und zwar bedienbar: Sonst käme man nicht einmal mehr an „Alle Daten
    // löschen".
    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    expect(screen.getByTestId('theme')).toHaveTextContent(DEFAULT_SETTINGS.theme)
  })
})

describe('useApp', () => {
  it('sagt deutlich, wenn eine Ansicht außerhalb des Anbieters gerendert wird', () => {
    const failure = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AppProvider/)
    failure.mockRestore()
  })
})

describe('i18n', () => {
  it('setzt die Sprache von i18next auf den gespeicherten Wert', async () => {
    const storage = createFakeStorage({ settings: stored({ uiLanguage: 'de' }) })

    renderProvider(storage)

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('de'))
  })
})
