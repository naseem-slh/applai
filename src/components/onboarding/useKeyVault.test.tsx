import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { KeyVault } from '@/lib/storage/keyVault'
import { useKeyVault } from './useKeyVault'

interface StubOptions {
  initialize?: () => Promise<void>
  isLocked?: () => Promise<boolean>
  getKey?: () => string | null
}

function stubVault(options: StubOptions = {}) {
  const vault: KeyVault = {
    initialize: vi.fn(options.initialize ?? (() => Promise.resolve())),
    save: vi.fn(() => Promise.resolve()),
    isLocked: vi.fn(options.isLocked ?? (() => Promise.resolve(false))),
    unlock: vi.fn(() => Promise.resolve()),
    lock: vi.fn(),
    getKey: vi.fn(options.getKey ?? (() => null)),
    getProvider: vi.fn(() => null),
    clear: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
  }
  return { vault, create: () => vault }
}

describe('useKeyVault', () => {
  it('richtet den Tresor genau einmal ein und meldet „leer", wenn nichts hinterlegt ist', async () => {
    const { vault, create } = stubVault()

    const { result } = renderHook(() => useKeyVault(create))

    await waitFor(() => {
      expect(result.current.status).toBe('empty')
    })
    expect(vault.initialize).toHaveBeenCalledTimes(1)
    expect(result.current.vault).toBe(vault)
  })

  it('meldet „entsperrt", sobald ein Schlüssel im Arbeitsspeicher liegt', async () => {
    const { create } = stubVault({ getKey: () => 'AIzaSy-BEISPIEL' })

    const { result } = renderHook(() => useKeyVault(create))

    await waitFor(() => {
      expect(result.current.status).toBe('unlocked')
    })
  })

  it('meldet „gesperrt" bei einem passwortgeschützten Schlüssel', async () => {
    const { create } = stubVault({ isLocked: () => Promise.resolve(true) })

    const { result } = renderHook(() => useKeyVault(create))

    await waitFor(() => {
      expect(result.current.status).toBe('locked')
    })
  })

  it('wartet auf initialize(), bevor es den Zustand feststellt', async () => {
    // Ohne das Warten meldete ein ohne Passwort abgelegter Schlüssel
    // „gesperrt", weil die Entschlüsselung noch läuft.
    let unlockKey = false
    const { create, vault } = stubVault({
      initialize: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            unlockKey = true
            resolve()
          }, 0),
        ),
      getKey: () => (unlockKey ? 'AIzaSy-BEISPIEL' : null),
      isLocked: () => Promise.resolve(!unlockKey),
    })

    const { result } = renderHook(() => useKeyVault(create))

    await waitFor(() => {
      expect(result.current.status).toBe('unlocked')
    })
    expect(vault.isLocked).not.toHaveBeenCalled()
  })

  it('meldet „beschädigt", wenn der gespeicherte Datensatz nicht dem Schema entspricht', async () => {
    const { create } = stubVault({
      initialize: () => Promise.reject(new Error('Der gespeicherte API-Schlüssel ist beschädigt.')),
    })

    const { result } = renderHook(() => useKeyVault(create))

    await waitFor(() => {
      expect(result.current.status).toBe('corrupted')
    })
  })

  it('erzeugt den Tresor auch dann einmal, wenn die Fabrik bei jedem Rendern neu entsteht', async () => {
    // Der beworbene Aufruf ist `useKeyVault(() => createKeyVault(frist))` —
    // eine Pfeilfunktion mit neuer Identität je Rendern. Stünde sie in der
    // Abhängigkeitsliste, liefe der Effekt endlos: Aufräumen und Neuaufbau
    // lösen je ein Rendern aus, und jeder Durchlauf öffnete eine weitere
    // IndexedDB-Verbindung.
    const created: KeyVault[] = []
    const { result, rerender } = renderHook(() =>
      useKeyVault(() => {
        const { vault } = stubVault()
        created.push(vault)
        return vault
      }),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('empty')
    })
    rerender()
    rerender()
    await waitFor(() => {
      expect(result.current.status).toBe('empty')
    })

    expect(created).toHaveLength(1)
    expect(created[0].initialize).toHaveBeenCalledTimes(1)
    expect(created[0].destroy).not.toHaveBeenCalled()
  })

  it('gibt Zuhörer und Zeitgeber beim Abbau wieder frei', async () => {
    const { vault, create } = stubVault()

    const { result, unmount } = renderHook(() => useKeyVault(create))
    await waitFor(() => {
      expect(result.current.status).toBe('empty')
    })

    unmount()

    expect(vault.destroy).toHaveBeenCalledTimes(1)
  })

  it('liest den Zustand auf Anforderung neu, ohne den Tresor neu zu erzeugen', async () => {
    let stored = false
    const vault: KeyVault = {
      initialize: vi.fn(() => Promise.resolve()),
      save: vi.fn(() => Promise.resolve()),
      isLocked: vi.fn(() => Promise.resolve(false)),
      unlock: vi.fn(() => Promise.resolve()),
      lock: vi.fn(),
      getKey: vi.fn(() => (stored ? 'AIzaSy-BEISPIEL' : null)),
      getProvider: vi.fn(() => null),
      clear: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    }
    const create = () => vault

    const { result } = renderHook(() => useKeyVault(create))
    await waitFor(() => {
      expect(result.current.status).toBe('empty')
    })

    stored = true
    result.current.refresh()

    await waitFor(() => {
      expect(result.current.status).toBe('unlocked')
    })
    expect(vault.initialize).toHaveBeenCalledTimes(1)
    expect(vault.destroy).not.toHaveBeenCalled()
  })
})
