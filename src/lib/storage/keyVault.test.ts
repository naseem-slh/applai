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

/**
 * Der abgelegte Datensatz, so wie ihn ein Angreifer in den
 * Entwicklerwerkzeugen sähe — ohne die Typen des Tresors.
 */
interface RawRecord {
  version?: unknown
  provider?: unknown
  protection?: unknown
  iv?: unknown
  ciphertext?: unknown
  salt?: unknown
  iterations?: unknown
  deviceKey?: CryptoKey
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

/** Der einzige Datensatz des Tresors, roh. */
async function readRawRecord(): Promise<RawRecord | undefined> {
  const records = (await readAllRecords()) as RawRecord[]
  return records[0]
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

/**
 * Kopiert ein Byte-Feld des rohen Datensatzes in ein `Uint8Array` dieser
 * Umgebung — IndexedDB gibt strukturell geklonte Werte aus einem anderen
 * Realm zurück.
 */
function toLocalBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (!ArrayBuffer.isView(value)) throw new Error('Kein Byte-Feld im Datensatz')
  const copy = new Uint8Array(value.byteLength)
  copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  return copy
}

/** Erzeugt UTF-16LE-Bytes — die Kodierung, die latin1 und UTF-8 nicht finden. */
function encodeUtf16Le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < text.length; index += 1) {
    view.setUint16(index * 2, text.charCodeAt(index), true)
  }
  return bytes
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

  it('verlangt ein Passwort, das einem Offline-Angriff standhält', () => {
    // Dieses Passwort wird offline angegriffen: Salz, IV, Chiffrat und
    // Rundenzahl liegen dem Angreifer vor, es gibt keine Sperre nach
    // Fehlversuchen und keine Prüfung gegen Leak-Listen. Acht Zeichen aus
    // menschlicher Hand wären gegen eine GPU zu wenig.
    expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(12)
  })

  it('weist ein Passwort knapp unter der Grenze zurück und nimmt eines auf der Grenze an', async () => {
    const vault = newVault()
    const einsZuKurz = 'Nebelkraehe'
    const geradeLang = 'Nebelkraehe7'
    expect(einsZuKurz).toHaveLength(MIN_PASSPHRASE_LENGTH - 1)
    expect(geradeLang).toHaveLength(MIN_PASSPHRASE_LENGTH)

    await expect(vault.save('openai', OPENAI_KEY, { passphrase: einsZuKurz })).rejects.toThrow(
      new RegExp(String(MIN_PASSPHRASE_LENGTH)),
    )
    expect(await readAllRecords()).toHaveLength(0)

    // Die Grenze selbst muss durchgehen — sonst belegt der Test nur, dass
    // irgendetwas abgelehnt wird.
    await vault.save('openai', OPENAI_KEY, { passphrase: geradeLang })
    expect(vault.getKey()).toBe(OPENAI_KEY)
  })

  it('weist ein Passwort aus einem einzigen wiederholten Zeichen zurück', async () => {
    const vault = newVault()

    // Bewusst länger als MIN_PASSPHRASE_LENGTH: sonst schlüge nur die
    // Längenprüfung an und der Test bewiese nichts über diesen Sonderfall.
    // Aus demselben Grund ist die Meldung genauer geprüft als mit /Zeichen/ —
    // das Wort steht auch in der Längenmeldung.
    const nurEinZeichen = 'aaaaaaaaaaaaaaaa'
    expect(nurEinZeichen.length).toBeGreaterThan(MIN_PASSPHRASE_LENGTH)

    await expect(vault.save('openai', OPENAI_KEY, { passphrase: nurEinZeichen })).rejects.toThrow(
      /verschiedene Zeichen/i,
    )
    expect(await readAllRecords()).toHaveLength(0)
  })

  it('weist ein Passwort zurück, das im API-Schlüssel selbst steht', async () => {
    const vault = newVault()
    // Ein Passwort aus dem Schlüssel selbst ist kein zweites Geheimnis: Wer
    // den Schlüssel je zu Gesicht bekommt, hat damit auch das Passwort.
    const partOfKey = OPENAI_KEY.slice(8, 28)

    await expect(vault.save('openai', OPENAI_KEY, { passphrase: partOfKey })).rejects.toThrow(/API-Schlüssel/i)
    expect(await readAllRecords()).toHaveLength(0)
  })

  it('weist ein Passwort auch bei abweichender Groß- und Kleinschreibung zurück', async () => {
    const vault = newVault()

    await expect(
      vault.save('openai', OPENAI_KEY, { passphrase: OPENAI_KEY.slice(8, 28).toUpperCase() }),
    ).rejects.toThrow(/API-Schlüssel/i)
    expect(await readAllRecords()).toHaveLength(0)
  })
})

describe('Aufwertung von Stufe 1 auf Stufe 2', () => {
  it('entfernt beim Nachrüsten eines Passworts den Geräteschlüssel restlos', async () => {
    // Der wichtigste Zustandswechsel der Datei: Bliebe der Geräteschlüssel
    // liegen, wäre der kostenpflichtige Schlüssel weiterhin ohne Passwort zu
    // entschlüsseln — die Passwortpflicht wäre nur noch Fassade.
    const vault = newVault()
    await vault.save('gemini', GEMINI_KEY)

    const before = await readRawRecord()
    expect(before?.protection).toBe('device')
    const alterGeraeteschluessel = before?.deviceKey
    if (alterGeraeteschluessel === undefined) throw new Error('Kein Geräteschlüssel im Datensatz')

    await vault.save('gemini', GEMINI_KEY, { treatAsPaid: true, passphrase: PASSPHRASE })

    const after = await readRawRecord()
    expect(await readAllRecords()).toHaveLength(1)
    expect(after?.protection).toBe('passphrase')
    expect(after?.deviceKey).toBeUndefined()
    // Nicht nur "undefined", sondern gar nicht mehr vorhanden.
    expect(Object.keys(after ?? {})).not.toContain('deviceKey')
    expect(after?.salt).toBeDefined()
    // Der schärfere Nachweis: Selbst wer den alten Geräteschlüssel noch in
    // der Hand hält, kommt an das neue Chiffrat nicht mehr heran.
    await expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toLocalBytes(after?.iv) },
        alterGeraeteschluessel,
        toLocalBytes(after?.ciphertext),
      ),
    ).rejects.toThrow()

    const restored = newVault()
    await restored.initialize()

    expect(restored.getKey()).toBeNull()
    expect(await restored.isLocked()).toBe(true)
    // Ohne Passwort fuehrt kein Weg mehr hinein.
    await expect(restored.unlock()).rejects.toThrow(/Passwort/i)
    expect(restored.getKey()).toBeNull()

    await restored.unlock(PASSPHRASE)
    expect(restored.getKey()).toBe(GEMINI_KEY)
  })

  it('entfernt beim Zurückstufen auf Stufe 1 Salz und Rundenzahl', async () => {
    const vault = newVault()
    await vault.save('gemini', GEMINI_KEY, { treatAsPaid: true, passphrase: PASSPHRASE })

    await vault.save('gemini', GEMINI_KEY)

    const after = await readRawRecord()
    expect(after?.protection).toBe('device')
    expect(Object.keys(after ?? {})).not.toContain('salt')
    expect(Object.keys(after ?? {})).not.toContain('iterations')
  })
})

describe('Geräteschlüssel in der Ablage', () => {
  it('liegt als nicht auslesbares Schlüsselobjekt in IndexedDB', async () => {
    await newVault().save('gemini', GEMINI_KEY)

    const record = await readRawRecord()
    const deviceKey = record?.deviceKey
    if (deviceKey === undefined) throw new Error('Kein Geräteschlüssel im Datensatz')

    // Der Kern von Stufe 1, direkt am abgelegten Objekt geprüft — nicht nur
    // daran, dass im Dump keine Zeichenfolge auftaucht.
    expect(deviceKey.extractable).toBe(false)
    expect(deviceKey.algorithm.name).toBe('AES-GCM')
    await expect(crypto.subtle.exportKey('raw', deviceKey)).rejects.toThrow()
    await expect(crypto.subtle.exportKey('jwk', deviceKey)).rejects.toThrow()
  })
})

describe('beschädigte oder manipulierte Datensätze', () => {
  async function putRecordWithIterations(iterations: unknown): Promise<void> {
    await newVault().save('openai', OPENAI_KEY, { passphrase: PASSPHRASE })
    const record = await readRawRecord()
    await putRawRecord('apiKey', { ...record, iterations })
  }

  it('lehnt eine unsinnige Rundenzahl ab, statt sie zu benutzen', async () => {
    // NaN fuehrte sonst zu "Passwort falsch", obwohl das Passwort stimmt.
    await putRecordWithIterations(Number.NaN)

    const vault = newVault()
    await expect(vault.unlock(PASSPHRASE)).rejects.toThrow(/beschädigt/i)
  })

  it('lehnt eine absurd hohe Rundenzahl ab, statt den Browser anzuhalten', async () => {
    await putRecordWithIterations(1e12)

    const vault = newVault()
    await expect(vault.unlock(PASSPHRASE)).rejects.toThrow(/beschädigt/i)
  })

  it('lehnt eine zu niedrige Rundenzahl ab', async () => {
    await putRecordWithIterations(1000)

    const vault = newVault()
    await expect(vault.unlock(PASSPHRASE)).rejects.toThrow(/beschädigt/i)
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

  it('weist eingebettete Steuerzeichen zurück', async () => {
    // Ein eingefügter Zeilenumbruch mitten im Schlüssel fiele sonst erst
    // beim Aufruf des Anbieters auf (Aufgabe 7) — als Kopfzeilen-Fehler oder,
    // schlimmer, als eingeschmuggelte Kopfzeile.
    const vault = newVault()
    const withNewline = 'AIzaSy-Teil\r\nZweiterTeil'
    const withDelete = `AIzaSy-Teil${String.fromCharCode(0x7f)}ZweiterTeil`
    const withVerticalTab = `AIzaSy-Teil${String.fromCharCode(0x0b)}ZweiterTeil`

    await expect(vault.save('gemini', withNewline)).rejects.toThrow(/Steuerzeichen/i)
    await expect(vault.save('gemini', withDelete)).rejects.toThrow(/Steuerzeichen/i)
    await expect(vault.save('gemini', withVerticalTab)).rejects.toThrow(/Steuerzeichen/i)
    expect(await readAllRecords()).toHaveLength(0)
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

  it('Gegenprobe 1: der Suchlauf findet Klartext in einem Zeichenketten-Feld', async () => {
    await newVault().save('gemini', GEMINI_KEY)
    await putRawRecord('lockvogel-text', { version: 1, provider: 'gemini', apiKey: GEMINI_KEY })

    expect(await dumpIndexedDb()).toContain(GEMINI_KEY)
  })

  it('Gegenprobe 2: der Suchlauf findet Klartext in UTF-8-Bytes', async () => {
    await newVault().save('gemini', GEMINI_KEY)
    await putRawRecord('lockvogel-utf8', { version: 1, ciphertext: new TextEncoder().encode(GEMINI_KEY) })

    expect(await dumpIndexedDb()).toContain(GEMINI_KEY)
  })

  it('Gegenprobe 3: der Suchlauf findet Klartext in UTF-16LE-Bytes', async () => {
    // Diese Form fände weder der latin1- noch der UTF-8-Weg — sie belegt,
    // dass der UTF-16-Dekodierer im Suchlauf tatsächlich etwas beiträgt.
    const utf16 = encodeUtf16Le(GEMINI_KEY)
    expect(new TextDecoder('utf-8').decode(utf16)).not.toContain(GEMINI_KEY)

    await newVault().save('gemini', GEMINI_KEY)
    await putRawRecord('lockvogel-utf16', { version: 1, ciphertext: utf16 })

    expect(await dumpIndexedDb()).toContain(GEMINI_KEY)
  })
})

describe('unsichere Herkunft', () => {
  it('deutet fehlendes WebCrypto nicht als falsches Passwort um', async () => {
    await newVault().save('openai', OPENAI_KEY, { passphrase: PASSPHRASE })
    const vault = newVault()

    // Auf einer http-Seite (ohne localhost) stellt der Browser
    // crypto.subtle nicht bereit.
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array) => array })

    await expect(vault.unlock(PASSPHRASE)).rejects.toThrow(/HTTPS/)
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

  it('meldet bei destroy() jeden angemeldeten Zuhörer wieder ab', async () => {
    const windowAdd = vi.spyOn(window, 'addEventListener')
    const windowRemove = vi.spyOn(window, 'removeEventListener')
    const documentAdd = vi.spyOn(document, 'addEventListener')
    const documentRemove = vi.spyOn(document, 'removeEventListener')

    const vault = newVault(25)
    const addedOnWindow = [...windowAdd.mock.calls]
    const addedOnDocument = [...documentAdd.mock.calls]
    expect(addedOnWindow.length).toBeGreaterThan(0)
    expect(addedOnDocument.some(([type]) => type === 'visibilitychange')).toBe(true)

    await vault.save('gemini', GEMINI_KEY)
    vault.destroy()

    expect(vault.getKey()).toBeNull()
    // Jeder Zuhörer wird mit derselben Funktionsreferenz wieder abgemeldet —
    // sonst bliebe er hängen, ohne dass ein Test es merkte.
    for (const [type, listener] of addedOnWindow) {
      expect(windowRemove.mock.calls.some(([other, fn]) => other === type && fn === listener)).toBe(true)
    }
    for (const [type, listener] of addedOnDocument) {
      expect(documentRemove.mock.calls.some(([other, fn]) => other === type && fn === listener)).toBe(true)
    }
    // Und die Ereignisse selbst laufen danach ins Leere.
    window.dispatchEvent(new Event('keydown'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vault.getKey()).toBeNull()
  })
})
