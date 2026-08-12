import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { KeyVaultStatus } from './useKeyVault'
import { usePrivacyNotice } from './usePrivacyNotice'

describe('usePrivacyNotice', () => {
  it('zeigt den Hinweis, solange kein Schlüssel hinterlegt ist', () => {
    const { result } = renderHook(() => usePrivacyNotice('empty'))

    expect(result.current.visible).toBe(true)
  })

  it('zeigt nichts, solange der Tresor noch lädt', () => {
    const { result } = renderHook(() => usePrivacyNotice('loading'))

    expect(result.current.visible).toBe(false)
  })

  it('zeigt nichts, wenn schon ein Schlüssel da ist', () => {
    for (const status of ['locked', 'unlocked', 'corrupted'] as KeyVaultStatus[]) {
      const { result } = renderHook(() => usePrivacyNotice(status))
      expect(result.current.visible).toBe(false)
    }
  })

  it('verschwindet nach der Kenntnisnahme, obwohl der Tresor weiterhin leer ist', () => {
    // Genau der Fall, für den der Sitzungszustand da ist: `onAccept` kann den
    // Zustand des Tresors nicht ändern, der Knopf wäre sonst wirkungslos.
    const { result } = renderHook(() => usePrivacyNotice('empty'))
    expect(result.current.visible).toBe(true)

    act(() => {
      result.current.accept()
    })

    expect(result.current.visible).toBe(false)
  })

  it('nimmt eine zweite Kenntnisnahme klaglos hin', () => {
    const { result } = renderHook(() => usePrivacyNotice('empty'))

    act(() => {
      result.current.accept()
      result.current.accept()
    })

    expect(result.current.visible).toBe(false)
  })
})
