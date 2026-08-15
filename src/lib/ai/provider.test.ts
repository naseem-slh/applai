import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROVIDER_IDS } from '../storage/keyVault'
import { mockFetchResponse } from './mockFetchResponse'
import { PROVIDERS } from './provider'

// Repository-Wurzel: von src/lib/ai/ drei Ebenen hoch.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

describe('PROVIDERS', () => {
  it('ist über PROVIDER_IDS vollständig — Laufzeitbeweis zusätzlich zur Typprüfung durch Record<ProviderId, LlmProvider>', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...PROVIDER_IDS].sort())
  })

  it('jeder Anbieter meldet seine eigene id passend zum Schlüssel', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].id).toBe(id)
    }
  })

  it('jeder Anbieter hat eine nicht-leere, menschenlesbare Beschriftung', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].label.length).toBeGreaterThan(0)
    }
  })

  it('jeder Anbieter-Endpunkt liegt Zeichen für Zeichen auf einem der drei CSP-connect-src-Ziele aus public/_headers (G3)', async () => {
    const headers = await readFile(join(REPO_ROOT, 'public/_headers'), 'utf-8')
    const connectSrcMatch = /connect-src ([^;]+);/.exec(headers)
    expect(connectSrcMatch, 'connect-src-Direktive in public/_headers nicht gefunden').not.toBeNull()
    const connectSrcSources = connectSrcMatch![1].split(' ')

    for (const id of PROVIDER_IDS) {
      const endpoint = PROVIDERS[id].endpoint
      expect(endpoint.startsWith('https://')).toBe(true)
      expect(
        connectSrcSources,
        `Endpunkt "${endpoint}" von "${id}" steht nicht Zeichen für Zeichen in der CSP connect-src (public/_headers)`,
      ).toContain(endpoint)
    }
  })

  it('jeder Anbieter-Endpunkt ist genau der Origin ohne Pfad (kein Restanteil nach dem Host)', () => {
    for (const id of PROVIDER_IDS) {
      const url = new URL(PROVIDERS[id].endpoint)
      expect(PROVIDERS[id].endpoint).toBe(url.origin)
    }
  })
})

describe('kein API-Schlüssel leckt aus einem Fehler (G4) — für jeden Anbieter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const SECRET_KEY = 'sk-super-geheimer-testschluessel-9f8e7d6c5b4a'

  it('bei einem Netzfehler taucht der Schlüssel weder in message noch in stack noch im JSON-Abbild auf', async () => {
    for (const id of PROVIDER_IDS) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      )

      const error = await PROVIDERS[id]
        .generate({ system: 'System', user: 'Nutzertext' }, SECRET_KEY)
        .then(
          () => null,
          (reason: unknown) => reason as Error,
        )

      expect(error).not.toBeNull()
      expect(error!.message).not.toContain(SECRET_KEY)
      expect(error!.stack ?? '').not.toContain(SECRET_KEY)
      expect(JSON.stringify(error)).not.toContain(SECRET_KEY)
    }
  })

  it('bei HTTP 401 taucht der Schlüssel weder in message noch in stack auf', async () => {
    for (const id of PROVIDER_IDS) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse(401, { error: { message: 'ungültig', code: 'authentication' } })),
      )

      const error = await PROVIDERS[id]
        .generate({ system: 'System', user: 'Nutzertext' }, SECRET_KEY)
        .then(
          () => null,
          (reason: unknown) => reason as Error,
        )

      expect(error).not.toBeNull()
      expect(error!.message).not.toContain(SECRET_KEY)
      expect(error!.stack ?? '').not.toContain(SECRET_KEY)
    }
  })
})

describe('AbortSignal (für jeden Anbieter)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ein Abbruch während eines laufenden Aufrufs wird unverändert und ohne Wiederholungsversuch durchgereicht', async () => {
    for (const id of PROVIDER_IDS) {
      const abortError = new DOMException('Abgebrochen', 'AbortError')
      const fetchMock = vi.fn().mockRejectedValue(abortError)
      vi.stubGlobal('fetch', fetchMock)

      const controller = new AbortController()
      controller.abort()

      await expect(
        PROVIDERS[id].generate({ system: 'System', user: 'Nutzertext' }, 'irgendein-schluessel', controller.signal),
      ).rejects.toBe(abortError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })
})
