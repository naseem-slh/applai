// Diese Datei benutzt `fake-indexeddb` als Testdoppel für IndexedDB (jsdom
// bringt keine Implementierung mit) und läuft deshalb — wie alle Testdateien —
// unter tsconfig.test.json.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  MIN_PASSPHRASE_LENGTH,
  VAULT_DB_NAME,
  VAULT_STORE_NAME,
  createKeyVault,
  isPaidKey,
  type KeyVault,
} from './keyVault'

// Bewusst erkennbar erfundene Werte: im Repository darf nie ein echter
// Schlüssel liegen (G4).
const GEMINI_KEY = 'AIzaSy-BEISPIEL-kein-echter-Schluessel'
const OPENAI_KEY = 'sk-proj-BEISPIEL-kein-echter-Schluessel'
const ANTHROPIC_KEY = 'sk-ant-BEISPIEL-kein-echter-Schluessel'
const PASSPHRASE = 'ein-gutes-Passwort'

const openVaults: KeyVault[] = []

function newVault(idleTimeoutMs?: number): KeyVault {
  const vault = createKeyVault(idleTimeoutMs)
  openVaults.push(vault)
  return vault
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/** Liest alle Datensätze des Tresor-Speichers roh aus — ohne den Tresor. */
async function readAllRecords(): Promise<unknown[]> {
  const names = (await indexedDB.databases()).map((info) => info.name)
  if (!names.includes(VAULT_DB_NAME)) return []
  const db = await promisify(indexedDB.open(VAULT_DB_NAME))
  try {
    if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) return []
    return await promisify(db.transaction(VAULT_STORE_NAME, 'readonly').objectStore(VAULT_STORE_NAME).getAll())
  } finally {
    db.close()
  }
}

async function putRawRecord(key: string, value: unknown): Promise<void> {
  const db = await promisify(indexedDB.open(VAULT_DB_NAME))
  try {
    const tx = db.transaction(VAULT_STORE_NAME, 'readwrite')
    tx.objectStore(VAULT_STORE_NAME).put(value, key)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Dekodiert Bytes auf mehreren Wegen, damit die Suche keine Kodierung übersieht. */
function decodeEveryWay(bytes: Uint8Array): string {
  let latin1 = ''
  for (const byte of bytes) latin1 += String.fromCharCode(byte)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const utf16 = new TextDecoder('utf-16le').decode(bytes)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return `${latin1}\n${utf8}\n${utf16}\n${hex}`
}

async function collect(value: unknown, sink: string[]): Promise<void> {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    sink.push(value)
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    sink.push(String(value))
    return
  }
  if (value instanceof ArrayBuffer) {
    sink.push(decodeEveryWay(new Uint8Array(value)))
    return
  }
  if (ArrayBuffer.isView(value)) {
    sink.push(decodeEveryWay(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)))
    return
  }
  if (value instanceof CryptoKey) {
    sink.push(JSON.stringify({ type: value.type, extractable: value.extractable, algorithm: value.algorithm, usages: value.usages }))
    // Ehrlicher Ausleseversuch: gelänge er, stünden die Rohbytes im Dump.
    try {
      sink.push(decodeEveryWay(new Uint8Array(await crypto.subtle.exportKey('raw', value))))
    } catch {
      /* erwartet — nicht extrahierbar */
    }
    try {
      sink.push(JSON.stringify(await crypto.subtle.exportKey('jwk', value)))
    } catch {
      /* erwartet — nicht extrahierbar */
    }
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) await collect(entry, sink)
    return
  }
  if (value instanceof Date) {
    sink.push(value.toISOString())
    return
  }
  if (typeof value === 'object') {
    for (const [name, entry] of Object.entries(value)) {
      sink.push(name)
      await collect(entry, sink)
    }
    return
  }
  sink.push(String(value))
}

/**
 * Liest **jede** Datenbank, **jeden** Speicher, **jeden** Schlüssel und
 * **jeden** Wert in IndexedDB aus und macht daraus eine durchsuchbare
 * Zeichenkette. Absichtlich nicht auf ein bekanntes Feld beschränkt: der
 * Test soll den tatsächlich abgelegten Bytes nachgehen.
 */
async function dumpIndexedDb(): Promise<string> {
  const sink: string[] = []
  for (const info of await indexedDB.databases()) {
    if (info.name === undefined) continue
    sink.push(info.name)
    const db = await promisify(indexedDB.open(info.name))
    try {
      const storeNames = Array.from(db.objectStoreNames)
      if (storeNames.length === 0) continue
      for (const storeName of storeNames) {
        sink.push(storeName)
        const store = db.transaction(storeName, 'readonly').objectStore(storeName)
        await collect(await promisify(store.getAllKeys()), sink)
        await collect(await promisify(store.getAll()), sink)
      }
    } finally {
      db.close()
    }
  }
  return sink.join('\n')
}

beforeEach(async () => {
  await deleteDatabase(VAULT_DB_NAME)
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(async () => {
  vi.useRealTimers()
  while (openVaults.length > 0) openVaults.pop()?.destroy()
  await deleteDatabase(VAULT_DB_NAME)
})

describe('isPaidKey', () => {
  it('erkennt OpenAI- und Anthropic-Schlüssel als kostenpflichtig', () => {
    expect(isPaidKey('openai', OPENAI_KEY)).toBe(true)
    expect(isPaidKey('openai', 'sk-BEISPIEL')).toBe(true)
    expect(isPaidKey('anthropic', ANTHROPIC_KEY)).toBe(true)
  })

  it('erkennt einen fremden kostenpflichtigen Schlüssel auch beim falschen Anbieter', () => {
    // Wer einen OpenAI-Schlüssel ins Gemini-Feld einfügt, soll trotzdem ein
    // Passwort setzen müssen.
    expect(isPaidKey('gemini', OPENAI_KEY)).toBe(true)
    expect(isPaidKey('gemini', ANTHROPIC_KEY)).toBe(true)
  })

  it('behauptet bei einem Google-Schlüssel nichts, was es nicht wissen kann', () => {
    // Ein AIza…-Schlüssel sieht mit und ohne Abrechnung identisch aus.
    expect(isPaidKey('gemini', GEMINI_KEY)).toBe(false)
  })
})

describe('KeyVault ohne Passwort', () => {
  it('speichert und liest den Schlüssel wieder', async () => {
    const vault = newVault()
    await vault.save('gemini', GEMINI_KEY)

    expect(vault.getKey()).toBe(GEMINI_KEY)
    expect(vault.getProvider()).toBe('gemini')
    expect(await vault.isLocked()).toBe(false)
  })

  it('stellt den Schlüssel in einer neuen Sitzung erst nach initialize() bereit', async () => {
    await newVault().save('gemini', GEMINI_KEY)

    const restored = newVault()
    // Vor initialize() ist der Arbeitsspeicher leer — getKey() greift nie auf
    // den Speicher zu.
    expect(restored.getKey()).toBeNull()

    await restored.initialize()

    expect(restored.getKey()).toBe(GEMINI_KEY)
    expect(restored.getProvider()).toBe('gemini')
    expect(await restored.isLocked()).toBe(false)
  })

  it('meldet ohne gespeicherten Schlüssel weder gesperrt noch entsperrt etwas Falsches', async () => {
    const vault = newVault()
    await vault.initialize()

    expect(vault.getKey()).toBeNull()
    expect(await vault.isLocked()).toBe(false)
    await expect(vault.unlock(PASSPHRASE)).rejects.toThrow(/kein API-Schlüssel/i)
  })
})

describe('KeyVault mit Passwort', () => {
  it('bleibt in einer neuen Sitzung gesperrt und öffnet erst mit dem richtigen Passwort', async () => {
    await newVault().save('openai', OPENAI_KEY, { passphrase: PASSPHRASE })

    const restored = newVault()
    await restored.initialize()

    expect(restored.getKey()).toBeNull()
    expect(await restored.isLocked()).toBe(true)

    await restored.unlock(PASSPHRASE)

    expect(restored.getKey()).toBe(OPENAI_KEY)
    expect(await restored.isLocked()).toBe(false)
  })

  it('wirft bei falschem Passwort und bleibt gesperrt', async () => {
    await newVault().save('openai', OPENAI_KEY, { passphrase: PASSPHRASE })

    const restored = newVault()
    await restored.initialize()

    const error = await restored.unlock('falsches-Passwort').then(
      () => null,
      (reason: unknown) => reason as Error,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toMatch(/Passwort/i)
    // Kein Schlüssel und kein Passwort in der Fehlermeldung.
    const dump = `${error?.message} ${error?.stack ?? ''} ${JSON.stringify(error)}`
    expect(dump).not.toContain(OPENAI_KEY)
    expect(dump).not.toContain(PASSPHRASE)
    expect(restored.getKey()).toBeNull()
    expect(await restored.isLocked()).toBe(true)
  })

  it('verlangt ein Mindestmaß an Passwortlänge', async () => {
    const vault = newVault()

    await expect(vault.save('openai', OPENAI_KEY, { passphrase: 'kurz' })).rejects.toThrow(
      new RegExp(String(MIN_PASSPHRASE_LENGTH)),
    )
    expect(await readAllRecords()).toHaveLength(0)
  })
})

describe('Passwortpflicht bei kostenpflichtigen Schlüsseln', () => {
  it('wirft, wenn ein OpenAI-Schlüssel ohne Passwort gespeichert werden soll', async () => {
    const vault = newVault()

    const error = await vault.save('openai', OPENAI_KEY).then(
      () => null,
      (reason: unknown) => reason as Error,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toMatch(/Passwort/i)
    expect(`${error?.message} ${error?.stack ?? ''} ${JSON.stringify(error)}`).not.toContain(OPENAI_KEY)
    expect(vault.getKey()).toBeNull()
    // Nichts darf angefangen worden sein.
    expect(await readAllRecords()).toHaveLength(0)
  })

  it('wirft auch bei einem Anthropic-Schlüssel ohne Passwort', async () => {
    await expect(newVault().save('anthropic', ANTHROPIC_KEY)).rejects.toThrow(/Passwort/i)
  })

  it('wirft bei Gemini nur, wenn die Oberfläche treatAsPaid meldet', async () => {
    const vault = newVault()

    // Ohne Hinweis darf ein Gemini-Schlüssel ohne Passwort gespeichert werden.
    await expect(vault.save('gemini', GEMINI_KEY)).resolves.toBeUndefined()
    await vault.clear()

    await expect(vault.save('gemini', GEMINI_KEY, { treatAsPaid: true })).rejects.toThrow(/Passwort/i)
    expect(await readAllRecords()).toHaveLength(0)

    await expect(
      vault.save('gemini', GEMINI_KEY, { treatAsPaid: true, passphrase: PASSPHRASE }),
    ).resolves.toBeUndefined()
    expect(vault.getKey()).toBe(GEMINI_KEY)
  })

  it('weist einen leeren Schlüssel zurück', async () => {
    await expect(newVault().save('gemini', '   ')).rejects.toThrow(/Schlüssel/i)
  })
})

describe('lock, clear und Arbeitsspeicher', () => {
  it('liefert nach lock() null und lässt sich erneut entsperren', async () => {
    const vault = newVault()
    await vault.save('openai', OPENAI_KEY, { passphrase: PASSPHRASE })
    expect(vault.getKey()).toBe(OPENAI_KEY)

    vault.lock()

    expect(vault.getKey()).toBeNull()
    expect(await vault.isLocked()).toBe(true)

    await vault.unlock(PASSPHRASE)
    expect(vault.getKey()).toBe(OPENAI_KEY)
  })

  it('löscht mit clear() Chiffrat, Salz, Geräteschlüssel und Arbeitsspeicher', async () => {
    const vault = newVault()
    await vault.save('gemini', GEMINI_KEY)

    await vault.clear()

    expect(vault.getKey()).toBeNull()
    expect(vault.getProvider()).toBeNull()
    expect(await vault.isLocked()).toBe(false)
    expect(await readAllRecords()).toHaveLength(0)
    expect(await dumpIndexedDb()).not.toContain(GEMINI_KEY)
  })

  it('gibt den Schlüssel nicht über JSON.stringify des Tresors preis', async () => {
    const vault = newVault()
    await vault.save('gemini', GEMINI_KEY)

    expect(JSON.stringify(vault)).not.toContain(GEMINI_KEY)
    expect(Object.values(vault).join('\n')).not.toContain(GEMINI_KEY)
  })
})

describe('IndexedDB-Inhalt', () => {
  it('enthält die Schlüssel-Zeichenfolge an keiner Stelle im Klartext (ohne Passwort)', async () => {
    const vault = newVault()
    await vault.save('gemini', GEMINI_KEY)

    const dump = await dumpIndexedDb()

    expect(dump).not.toContain(GEMINI_KEY)
    // Auch Teilstücke dürfen nicht auftauchen.
    expect(dump).not.toContain(GEMINI_KEY.slice(0, 12))
    // Gegenprobe, dass wirklich Daten gelesen wurden.
    expect(dump).toContain(VAULT_STORE_NAME)
    expect(await readAllRecords()).toHaveLength(1)
  })

  it('enthält die Schlüssel-Zeichenfolge an keiner Stelle im Klartext (mit Passwort)', async () => {
    const vault = newVault()
    await vault.save('anthropic', ANTHROPIC_KEY, { passphrase: PASSPHRASE })

    const dump = await dumpIndexedDb()

    expect(dump).not.toContain(ANTHROPIC_KEY)
    expect(dump).not.toContain(ANTHROPIC_KEY.slice(0, 12))
    // Das Passwort selbst darf ebenfalls nirgends stehen.
    expect(dump).not.toContain(PASSPHRASE)
  })

  it('legt nichts Geheimes in localStorage oder sessionStorage ab', async () => {
    const vault = newVault()
    await vault.save('openai', OPENAI_KEY, { passphrase: PASSPHRASE })

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('Gegenprobe: der Suchlauf findet Klartext, wenn welcher dastünde', async () => {
    // Beweist, dass der Test oben etwas taugt — dieselbe Suche über einen
    // absichtlich im Klartext abgelegten Datensatz muss anschlagen.
    await newVault().save('gemini', GEMINI_KEY)
    await putRawRecord('lockvogel', {
      version: 1,
      provider: 'gemini',
      apiKey: GEMINI_KEY,
      ciphertext: new TextEncoder().encode(GEMINI_KEY),
    })

    expect(await dumpIndexedDb()).toContain(GEMINI_KEY)
  })
})

describe('Untätigkeitssperre', () => {
  it('benutzt 30 Minuten als Vorgabe', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
  })

  it('sperrt nach Ablauf der Untätigkeitsfrist', async () => {
    const vault = newVault(25)
    await vault.save('gemini', GEMINI_KEY)
    expect(vault.getKey()).toBe(GEMINI_KEY)

    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(vault.getKey()).toBeNull()
    // Gesperrt, nicht gelöscht.
    expect(await vault.isLocked()).toBe(true)
  })

  it('setzt die Frist bei Nutzeraktivität zurück und sperrt nach verborgener Zeit', async () => {
    // Nur die Uhr wird gefälscht — die echten Zeitgeber (und damit
    // fake-indexeddb) bleiben unangetastet.
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.now()
    const vault = newVault(DEFAULT_IDLE_TIMEOUT_MS)
    await vault.save('gemini', GEMINI_KEY)

    vi.setSystemTime(start + 20 * 60 * 1000)
    window.dispatchEvent(new Event('keydown'))

    // 35 Minuten nach dem Speichern, aber nur 15 nach der letzten Eingabe.
    vi.setSystemTime(start + 35 * 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vault.getKey()).toBe(GEMINI_KEY)

    // Seite lag danach über die Frist hinaus im Hintergrund.
    vi.setSystemTime(start + 60 * 60 * 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vault.getKey()).toBeNull()
  })

  it('meldet nach destroy() keine Ereignisse mehr an', async () => {
    const vault = newVault(25)
    await vault.save('gemini', GEMINI_KEY)
    vault.destroy()

    expect(vault.getKey()).toBeNull()
    window.dispatchEvent(new Event('keydown'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
})
