// Diese Datei benutzt `fake-indexeddb` als Testdoppel für IndexedDB (jsdom
// bringt keine Implementierung mit) und läuft deshalb — wie alle Testdateien —
// unter tsconfig.test.json.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application, CachedAnalysis, Draft, MarkAnchor, MarkSet, Settings } from './adapter'
import {
  APPLICATIONS_STORE,
  DEFAULT_SETTINGS,
  DRAFTS_STORE,
  EXPORT_FORMAT_VERSION,
  ANALYSIS_CACHE_STORE,
  MARK_SETS_STORE,
  SETTINGS_STORE,
  STORAGE_DB_NAME,
  createIndexedDbAdapter,
} from './indexeddb'
import { VAULT_DB_NAME, VAULT_STORE_NAME } from './keyVault'

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

/** Liest einen Objektspeicher der Anwendungsdatenbank roh aus — ohne den Adapter. */
async function readRawStore(storeName: string): Promise<unknown[]> {
  const names = (await indexedDB.databases()).map((info) => info.name)
  if (!names.includes(STORAGE_DB_NAME)) return []
  const db = await promisify(indexedDB.open(STORAGE_DB_NAME))
  try {
    if (!db.objectStoreNames.contains(storeName)) return []
    return await promisify(db.transaction(storeName, 'readonly').objectStore(storeName).getAll())
  } finally {
    db.close()
  }
}

/** Öffnet `dbName` und legt `storeName` an, falls er noch fehlt — für Tests, die eine fremde Datenbank ohne deren eigenes Modul befüllen. */
function openWithStore(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putRaw(dbName: string, storeName: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await openWithStore(dbName, storeName)
  try {
    const tx = db.transaction(storeName, 'readwrite')
    if (key === undefined) {
      tx.objectStore(storeName).put(value)
    } else {
      tx.objectStore(storeName).put(value, key)
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

function makeArrayBuffer(bytes: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

/**
 * Deterministisch, aber nicht periodisch innerhalb der Puffergröße
 * (Xorshift32) — anders als etwa `i % 256` deckt das jedes Byte 0–255 ab,
 * ohne mit der 32-KiB-Blockgröße von `arrayBufferToBase64` phasengleich zu
 * sein. So bleibt ein Fehler genau an einer Blockgrenze sichtbar, statt
 * durch ein sich wiederholendes Muster zufällig verdeckt zu werden.
 */
function pseudoRandomBytes(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let state = seed >>> 0
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    bytes[index] = state & 0xff
  }
  return bytes
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 'entwurf-1',
    docxBase: makeArrayBuffer([80, 75, 3, 4, 255, 0, 128]),
    text: 'Sehr geehrte Damen und Herren,',
    savedAt: Date.now(),
    ...overrides,
  }
}

function makeAnchor(text: string, from: number): MarkAnchor {
  return { text, before: 'davor ', after: ' danach', from, to: from + text.length }
}

function makeMarkSet(overrides: Partial<MarkSet> = {}): MarkSet {
  return {
    id: 'abdruck-eins',
    anchors: [makeAnchor('ich bewerbe mich', 31)],
    savedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(async () => {
  await deleteDatabase(STORAGE_DB_NAME)
  await deleteDatabase(VAULT_DB_NAME)
})

afterEach(async () => {
  vi.useRealTimers()
  await deleteDatabase(STORAGE_DB_NAME)
  await deleteDatabase(VAULT_DB_NAME)
})

describe('listApplications / addApplication', () => {
  it('liefert zu Beginn eine leere Liste', async () => {
    const adapter = createIndexedDbAdapter()
    expect(await adapter.listApplications()).toEqual([])
  })

  it('legt eine Bewerbung an, vergibt eine Kennung und sie erscheint in der Liste', async () => {
    const adapter = createIndexedDbAdapter()

    const created = await adapter.addApplication({
      company: 'Beispiel GmbH',
      position: 'Softwareentwicklerin',
      date: '2026-08-11',
    })

    expect(created.id).toEqual(expect.any(String))
    expect(created.id.length).toBeGreaterThan(0)
    expect(created.company).toBe('Beispiel GmbH')

    const list = await adapter.listApplications()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(created)
  })

  it('vergibt unterschiedlichen Bewerbungen unterschiedliche Kennungen', async () => {
    const adapter = createIndexedDbAdapter()
    const a = await adapter.addApplication({ company: 'A', position: 'X', date: '2026-01-01' })
    const b = await adapter.addApplication({ company: 'B', position: 'Y', date: '2026-01-02' })

    expect(a.id).not.toBe(b.id)
    expect(await adapter.listApplications()).toHaveLength(2)
  })

  it('legt die Bewerbung tatsächlich in IndexedDB ab, nicht nur im Arbeitsspeicher', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'Beispiel GmbH', position: 'Werkstudentin', date: '2026-08-11' })

    const raw = (await readRawStore(APPLICATIONS_STORE)) as Application[]
    expect(raw).toHaveLength(1)
    expect(raw[0].company).toBe('Beispiel GmbH')
  })
})

describe('findDuplicate', () => {
  async function seeded(): Promise<ReturnType<typeof createIndexedDbAdapter>> {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'Muster AG', position: 'Produktmanagerin', date: '2026-01-01' })
    return adapter
  }

  it('findet dieselbe Firma und Stelle unabhängig von Groß-/Kleinschreibung', async () => {
    const adapter = await seeded()
    const found = await adapter.findDuplicate('muster ag', 'PRODUKTMANAGERIN')
    expect(found).not.toBeNull()
    expect(found?.company).toBe('Muster AG')
  })

  it('trimmt umgebende Leerzeichen vor dem Vergleich', async () => {
    const adapter = await seeded()
    const found = await adapter.findDuplicate('  Muster AG  ', '\tProduktmanagerin\n')
    expect(found).not.toBeNull()
  })

  it('liefert null, wenn nur die Firma übereinstimmt, aber nicht die Stelle', async () => {
    const adapter = await seeded()
    expect(await adapter.findDuplicate('Muster AG', 'Andere Stelle')).toBeNull()
  })

  it('liefert null, wenn nur die Stelle übereinstimmt, aber nicht die Firma', async () => {
    const adapter = await seeded()
    expect(await adapter.findDuplicate('Andere Firma', 'Produktmanagerin')).toBeNull()
  })

  it('liefert null, wenn nichts passt', async () => {
    const adapter = await seeded()
    expect(await adapter.findDuplicate('Nirgendwo', 'Nichts')).toBeNull()
  })

  it('liefert bei leeren Suchbegriffen null, solange kein Eintrag ebenfalls leer ist', async () => {
    const adapter = await seeded()
    expect(await adapter.findDuplicate('', '')).toBeNull()
  })
})

describe('saveDraft / loadDraft', () => {
  it('liefert null für einen unbekannten Entwurf', async () => {
    const adapter = createIndexedDbAdapter()
    expect(await adapter.loadDraft('unbekannt')).toBeNull()
  })

  it('speichert und lädt einen Entwurf verlustfrei, auch die Bytes von docxBase', async () => {
    const adapter = createIndexedDbAdapter()
    const draft = makeDraft()

    await adapter.saveDraft(draft)
    const loaded = await adapter.loadDraft(draft.id)

    expect(loaded).not.toBeNull()
    expect(loaded?.text).toBe(draft.text)
    expect(loaded?.savedAt).toBe(draft.savedAt)
    expect(new Uint8Array(loaded!.docxBase)).toEqual(new Uint8Array(draft.docxBase))
    // fake-indexeddb klont strukturell — der gelesene Puffer ist ein echter
    // Klon, keine Referenz auf denselben ArrayBuffer.
    expect(loaded?.docxBase).not.toBe(draft.docxBase)
  })

  it('überschreibt einen Entwurf mit derselben Kennung, statt einen zweiten anzulegen', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveDraft(makeDraft({ text: 'Erster Stand' }))
    await adapter.saveDraft(makeDraft({ text: 'Zweiter Stand' }))

    const loaded = await adapter.loadDraft('entwurf-1')
    expect(loaded?.text).toBe('Zweiter Stand')
    expect(await readRawStore(DRAFTS_STORE)).toHaveLength(1)
  })

  // Schaden 2: die Kennung der Anzeige, für die die selbsttätige
  // Briefkopf-Übernahme zuletzt gelaufen ist — reine Speicherung, ohne
  // Kenntnis, was der Wert bedeutet (das weiß nur `Editor.tsx`).
  it('speichert und lädt die Kennung der bereits übernommenen Anzeige verlustfrei', async () => {
    const adapter = createIndexedDbAdapter()
    const draft = makeDraft({ letterheadAppliedFor: 'fingerabdruck-der-anzeige' })

    await adapter.saveDraft(draft)
    const loaded = await adapter.loadDraft(draft.id)

    expect(loaded?.letterheadAppliedFor).toBe('fingerabdruck-der-anzeige')
  })

  // Ein Entwurf ohne dieses Feld (kein Aufruf hat es je gesetzt) bleibt
  // lesbar — das Feld ist optional, kein Pflichtfeld eines neuen Schemas.
  it('lädt einen Entwurf ohne die Kennung der Anzeige klaglos', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveDraft(makeDraft())

    const loaded = await adapter.loadDraft('entwurf-1')

    expect(loaded?.letterheadAppliedFor).toBeUndefined()
  })
})

describe('deleteDraft', () => {
  it('löscht genau den angegebenen Entwurf und lässt die anderen unangetastet', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveDraft(makeDraft({ id: 'a', text: 'Entwurf A' }))
    await adapter.saveDraft(makeDraft({ id: 'b', text: 'Entwurf B' }))
    await adapter.saveDraft(makeDraft({ id: 'c', text: 'Entwurf C' }))

    await adapter.deleteDraft('b')

    expect(await adapter.loadDraft('b')).toBeNull()
    expect((await adapter.loadDraft('a'))?.text).toBe('Entwurf A')
    expect((await adapter.loadDraft('c'))?.text).toBe('Entwurf C')
    expect(await readRawStore(DRAFTS_STORE)).toHaveLength(2)
  })

  it('lässt die Bewerbungsliste unangetastet', async () => {
    const adapter = createIndexedDbAdapter()
    const application = await adapter.addApplication({ company: 'Muster AG', position: 'A', date: '2026-01-01' })
    await adapter.saveDraft(makeDraft())

    await adapter.deleteDraft('entwurf-1')

    expect(await adapter.listApplications()).toEqual([application])
  })

  it('löst bei einer unbekannten Kennung nicht — derselbe Aufruf darf gefahrlos wiederholt werden', async () => {
    // Der erwartete Aufrufer (Aufgabe 15) ruft dies unmittelbar nach einem
    // erfolgreichen Export auf; ein zweiter, redundanter Aufruf (etwa aus
    // einem zweiten Tab) soll nicht anders enden als der erste.
    const adapter = createIndexedDbAdapter()
    await adapter.saveDraft(makeDraft())

    await expect(adapter.deleteDraft('unbekannt')).resolves.toBeUndefined()
    await adapter.deleteDraft('entwurf-1')
    await expect(adapter.deleteDraft('entwurf-1')).resolves.toBeUndefined()

    expect(await adapter.loadDraft('entwurf-1')).toBeNull()
  })
})

describe('purgeExpiredDrafts', () => {
  it('löscht nur Entwürfe, die älter als die Frist sind, und zählt korrekt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.now()
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000 // 7 Tage, wie in docs/spec.md — vom Aufrufer übergeben

    const adapter = createIndexedDbAdapter()
    await adapter.saveDraft(makeDraft({ id: 'frisch', savedAt: now }))
    await adapter.saveDraft(makeDraft({ id: 'genau-an-der-grenze', savedAt: now - maxAgeMs }))
    await adapter.saveDraft(makeDraft({ id: 'knapp-abgelaufen', savedAt: now - maxAgeMs - 1 }))
    await adapter.saveDraft(makeDraft({ id: 'lange-abgelaufen', savedAt: now - maxAgeMs - 30 * 24 * 60 * 60 * 1000 }))

    const deletedCount = await adapter.purgeExpiredDrafts(maxAgeMs)

    expect(deletedCount).toBe(2)
    expect(await adapter.loadDraft('frisch')).not.toBeNull()
    // "älter als" — exakt an der Frist gilt noch nicht als abgelaufen.
    expect(await adapter.loadDraft('genau-an-der-grenze')).not.toBeNull()
    expect(await adapter.loadDraft('knapp-abgelaufen')).toBeNull()
    expect(await adapter.loadDraft('lange-abgelaufen')).toBeNull()
  })

  it('liefert 0 und löscht nichts, wenn kein Entwurf abgelaufen ist', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveDraft(makeDraft({ savedAt: Date.now() }))

    expect(await adapter.purgeExpiredDrafts(7 * 24 * 60 * 60 * 1000)).toBe(0)
    expect(await adapter.loadDraft('entwurf-1')).not.toBeNull()
  })
})

describe('getSettings / saveSettings', () => {
  it('liefert sinnvolle Vorgaben, bevor je etwas gespeichert wurde', async () => {
    const adapter = createIndexedDbAdapter()
    const settings = await adapter.getSettings()

    expect(settings).toEqual({
      provider: 'gemini',
      uiLanguage: 'de',
      anonymize: true,
      truthMode: 'strict',
      theme: 'system',
      zoom: 100,
    })
    expect(settings).toEqual(DEFAULT_SETTINGS)
    // Das bloße Lesen legt nichts an — reiner Lesezugriff ohne Nebenwirkung.
    expect(await readRawStore(SETTINGS_STORE)).toHaveLength(0)
  })

  it('speichert und liest Einstellungen verlustfrei', async () => {
    const adapter = createIndexedDbAdapter()
    const custom: Settings = {
      provider: 'openai',
      uiLanguage: 'en',
      anonymize: false,
      truthMode: 'bridge',
      theme: 'dark',
    }

    await adapter.saveSettings(custom)

    expect(await adapter.getSettings()).toEqual(custom)
  })

  it('überschreibt vorhandene Einstellungen, statt einen zweiten Datensatz anzulegen', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })
    await adapter.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' })

    expect((await adapter.getSettings()).theme).toBe('light')
    expect(await readRawStore(SETTINGS_STORE)).toHaveLength(1)
  })
})

describe('hasSettings', () => {
  it('meldet vor dem ersten Speichern false und danach true', async () => {
    const adapter = createIndexedDbAdapter()

    expect(await adapter.hasSettings()).toBe(false)
    await adapter.saveSettings({ ...DEFAULT_SETTINGS })
    expect(await adapter.hasSettings()).toBe(true)
  })

  it('unterscheidet einen Datensatz mit den Vorgabewerten von gar keinem Datensatz', async () => {
    // Genau darauf beruht die Sprachvorauswahl der Oberfläche: Wer im
    // englischen Browser bewusst Deutsch einstellt, speichert exakt
    // DEFAULT_SETTINGS — getSettings() allein könnte das nicht von einem
    // leeren Speicher unterscheiden.
    const adapter = createIndexedDbAdapter()
    await adapter.saveSettings({ ...DEFAULT_SETTINGS })

    expect(await adapter.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(await adapter.hasSettings()).toBe(true)
  })

  it('meldet nach dem Löschen wieder false', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })

    await adapter.clearAll()

    expect(await adapter.hasSettings()).toBe(false)
  })

  it('meldet nach einem Import true', async () => {
    const adapter = createIndexedDbAdapter()
    const backup = await adapter.exportAll()

    await adapter.importAll(new File([await backup.text()], 'sicherung.json', { type: 'application/json' }))

    expect(await adapter.hasSettings()).toBe(true)
  })
})

describe('Vormerkungen', () => {
  it('legt einen Satz an und liest ihn zurück', async () => {
    const adapter = createIndexedDbAdapter()
    const set = makeMarkSet()

    await adapter.saveMarkSet(set)

    expect(await adapter.loadMarkSet('abdruck-eins')).toEqual(set)
  })

  it('gibt null zurück, wenn zu diesem Anschreiben nichts gemerkt ist', async () => {
    const adapter = createIndexedDbAdapter()
    expect(await adapter.loadMarkSet('nie-gesehen')).toBeNull()
  })

  it('überschreibt den Satz desselben Anschreibens, statt einen zweiten anzulegen', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveMarkSet(makeMarkSet())

    await adapter.saveMarkSet(makeMarkSet({ anchors: [makeAnchor('als Entwickler', 62)] }))

    const sets = await adapter.listMarkSets()
    expect(sets).toHaveLength(1)
    expect(sets[0]?.anchors[0]?.text).toBe('als Entwickler')
  })

  it('löscht einen Satz', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveMarkSet(makeMarkSet())

    await adapter.deleteMarkSet('abdruck-eins')

    expect(await adapter.loadMarkSet('abdruck-eins')).toBeNull()
  })

  it('löst nicht, wenn ein unbekannter Satz gelöscht wird', async () => {
    const adapter = createIndexedDbAdapter()
    await expect(adapter.deleteMarkSet('nie-gesehen')).resolves.toBeUndefined()
  })

  it('listet die Sätze mehrerer Anschreiben', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveMarkSet(makeMarkSet({ id: 'abdruck-eins' }))
    await adapter.saveMarkSet(makeMarkSet({ id: 'abdruck-zwei' }))

    const ids = (await adapter.listMarkSets()).map((set) => set.id).sort()
    expect(ids).toEqual(['abdruck-eins', 'abdruck-zwei'])
  })
})

describe('exportAll / importAll', () => {
  it('exportiert eine Blob-Datei mit Versionsfeld', async () => {
    const adapter = createIndexedDbAdapter()
    const blob = await adapter.exportAll()

    expect(blob).toBeInstanceOf(Blob)
    const payload = JSON.parse(await blob.text()) as { formatVersion: number }
    expect(payload.formatVersion).toBe(EXPORT_FORMAT_VERSION)
  })

  it('rundet Bewerbungen, Entwürfe (inklusive docxBase-Bytes) und Einstellungen verlustfrei', async () => {
    const adapter = createIndexedDbAdapter()
    const application = await adapter.addApplication({
      company: 'Muster AG',
      position: 'Entwicklerin',
      date: '2026-08-11',
    })
    const draft = makeDraft({ docxBase: makeArrayBuffer([80, 75, 3, 4, 0, 255, 17, 200]) })
    await adapter.saveDraft(draft)
    const settings: Settings = {
      provider: 'anthropic',
      uiLanguage: 'en',
      anonymize: false,
      truthMode: 'free',
      theme: 'dark',
    }
    await adapter.saveSettings(settings)

    const blob = await adapter.exportAll()
    const file = new File([blob], 'applai-sicherung.json', { type: 'application/json' })

    await adapter.clearAll()
    expect(await adapter.listApplications()).toEqual([])

    await adapter.importAll(file)

    const restoredApplications = await adapter.listApplications()
    expect(restoredApplications).toEqual([application])

    const restoredDraft = await adapter.loadDraft(draft.id)
    expect(restoredDraft?.text).toBe(draft.text)
    expect(restoredDraft?.savedAt).toBe(draft.savedAt)
    expect(new Uint8Array(restoredDraft!.docxBase)).toEqual(new Uint8Array(draft.docxBase))

    expect(await adapter.getSettings()).toEqual(settings)
  })

  // Schaden 2: Die Kennung der bereits übernommenen Anzeige gehört zum
  // Entwurf und muss deshalb dieselbe Sicherung/Wiederherstellung
  // durchlaufen wie Text und `docxBase`.
  it('rundet die Kennung der bereits übernommenen Anzeige eines Entwurfs verlustfrei', async () => {
    const adapter = createIndexedDbAdapter()
    const draft = makeDraft({ letterheadAppliedFor: 'fingerabdruck-der-anzeige' })
    await adapter.saveDraft(draft)

    const blob = await adapter.exportAll()
    const file = new File([blob], 'sicherung.json', { type: 'application/json' })
    await adapter.clearAll()
    await adapter.importAll(file)

    const restored = await adapter.loadDraft(draft.id)
    expect(restored?.letterheadAppliedFor).toBe('fingerabdruck-der-anzeige')
  })

  // Verträglichkeit mit einer Sicherungsdatei, die das Feld noch nicht
  // kannte (vor dieser Fixrunde exportiert): Sie bleibt lesbar, und der
  // wiederhergestellte Entwurf trägt das Feld einfach nicht — „noch nie
  // übernommen" ist die sichere Lesart eines fehlenden Werts (siehe
  // `adapter.ts`, `Draft.letterheadAppliedFor`).
  it('liest eine Sicherungsdatei ohne die Kennung der Anzeige klaglos ein', async () => {
    const adapter = createIndexedDbAdapter()
    const datei = new File(
      [
        JSON.stringify({
          formatVersion: EXPORT_FORMAT_VERSION,
          applications: [],
          drafts: [{ id: 'alter-entwurf', text: 'Text', savedAt: Date.now(), docxBase: 'AAA=' }],
          settings: DEFAULT_SETTINGS,
        }),
      ],
      'alte-sicherung.json',
      { type: 'application/json' },
    )

    await adapter.importAll(datei)

    const restored = await adapter.loadDraft('alter-entwurf')
    expect(restored).not.toBeNull()
    expect(restored?.letterheadAppliedFor).toBeUndefined()
  })

  it('rundet ein großes docxBase über mehrere Base64-Blöcke verlustfrei (arrayBufferToBase64 chunkt in 32-KiB-Schritten)', async () => {
    const adapter = createIndexedDbAdapter()
    // 98 441 Byte: drei volle 32-KiB-Blöcke plus ein unvollständiger vierter
    // (98 441 = 3 × 32 768 + 137) — genau der Fall, den die Blockbildung in
    // arrayBufferToBase64/base64ToArrayBuffer beherrschen muss und den ein
    // einzelner kleiner Testpuffer (ein Schleifendurchlauf) nicht prüft.
    const bytes = pseudoRandomBytes(98_441, 0x5eed)
    const draft = makeDraft({ id: 'grosser-entwurf', docxBase: bytes.buffer })

    await adapter.saveDraft(draft)
    const blob = await adapter.exportAll()
    const file = new File([blob], 'grosse-sicherung.json', { type: 'application/json' })

    await adapter.clearAll()
    await adapter.importAll(file)

    const restored = await adapter.loadDraft('grosser-entwurf')
    expect(restored).not.toBeNull()
    expect(restored!.docxBase.byteLength).toBe(bytes.length)
    expect(new Uint8Array(restored!.docxBase)).toEqual(bytes)
  })

  it('ersetzt den Bestand bei importAll, statt ihn zusammenzuführen', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'Wird gesichert', position: 'A', date: '2026-01-01' })
    const blob = await adapter.exportAll()
    const file = new File([blob], 'sicherung.json', { type: 'application/json' })

    // Nach der Sicherung kommt eine weitere Bewerbung hinzu — sie gehört
    // nicht zur Sicherungsdatei und darf die Wiederherstellung nicht überleben.
    await adapter.addApplication({ company: 'Nach der Sicherung hinzugefügt', position: 'B', date: '2026-01-02' })
    expect(await adapter.listApplications()).toHaveLength(2)

    await adapter.importAll(file)

    const list = await adapter.listApplications()
    expect(list).toHaveLength(1)
    expect(list[0].company).toBe('Wird gesichert')
  })

  it('weist eine beschädigte Sicherungsdatei zurück und lässt den Bestand unangetastet', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'Bleibt erhalten', position: 'A', date: '2026-01-01' })

    const kaputteDatei = new File(['{ das ist kein gueltiges JSON'], 'kaputt.json', { type: 'application/json' })
    await expect(adapter.importAll(kaputteDatei)).rejects.toThrow()

    expect(await adapter.listApplications()).toHaveLength(1)
  })

  it('weist eine Sicherungsdatei mit unbekannter Version zurück', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'Bleibt erhalten', position: 'A', date: '2026-01-01' })

    const zukunftsDatei = new File(
      [JSON.stringify({ formatVersion: 999, applications: [], drafts: [], settings: DEFAULT_SETTINGS })],
      'zukunft.json',
      { type: 'application/json' },
    )
    await expect(adapter.importAll(zukunftsDatei)).rejects.toThrow(/Version/)

    expect(await adapter.listApplications()).toHaveLength(1)
  })

  it('weist eine Sicherungsdatei mit unstimmiger Bewerbungsliste zurück', async () => {
    const adapter = createIndexedDbAdapter()
    const datei = new File(
      [
        JSON.stringify({
          formatVersion: EXPORT_FORMAT_VERSION,
          applications: [{ id: 'x', company: 'Nur Firma' }],
          drafts: [],
          settings: DEFAULT_SETTINGS,
        }),
      ],
      'unstimmig.json',
      { type: 'application/json' },
    )
    await expect(adapter.importAll(datei)).rejects.toThrow()
  })

  it('weist eine Sicherungsdatei mit ungültigem Base64 in docxBase zurück, bevor irgendetwas geschrieben wird', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'Bleibt erhalten', position: 'A', date: '2026-01-01' })
    await adapter.saveDraft(makeDraft({ id: 'bleibt-auch-erhalten' }))

    const datei = new File(
      [
        JSON.stringify({
          formatVersion: EXPORT_FORMAT_VERSION,
          applications: [],
          drafts: [{ id: 'x', text: 'Text', savedAt: Date.now(), docxBase: '!!!kein-gueltiges-base64!!!' }],
          settings: DEFAULT_SETTINGS,
        }),
      ],
      'ungueltiges-base64.json',
      { type: 'application/json' },
    )

    await expect(adapter.importAll(datei)).rejects.toThrow()

    // Die Prüfung lief vollständig, bevor die Transaktion überhaupt
    // eröffnet wurde — der vorherige Bestand ist unangetastet, nicht nur
    // per Transaktions-Rollback wiederhergestellt.
    expect(await adapter.listApplications()).toHaveLength(1)
    expect(await adapter.loadDraft('bleibt-auch-erhalten')).not.toBeNull()
  })
})

describe('Auswertungsspeicher', () => {
  const entry: CachedAnalysis = { key: 'jobAd:1:modell:abc', value: { company: 'Beispiel' }, savedAt: 5 }

  it('legt eine Auswertung ab und liest sie zurück', async () => {
    const adapter = createIndexedDbAdapter()

    await adapter.saveCachedAnalysis(entry)

    expect(await adapter.loadCachedAnalysis(entry.key)).toEqual(entry)
  })

  it('gibt null zurück, wenn zu diesem Schlüssel nichts abgelegt ist', async () => {
    expect(await createIndexedDbAdapter().loadCachedAnalysis('nie-gesehen')).toBeNull()
  })

  it('überschreibt denselben Schlüssel, statt einen zweiten Eintrag anzulegen', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveCachedAnalysis(entry)

    await adapter.saveCachedAnalysis({ ...entry, value: { company: 'Anders' }, savedAt: 9 })

    const all = await adapter.listCachedAnalyses()
    expect(all).toHaveLength(1)
    expect(all[0]?.value).toEqual({ company: 'Anders' })
  })

  it('löscht einen Eintrag und löst bei unbekanntem Schlüssel nicht', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveCachedAnalysis(entry)

    await adapter.deleteCachedAnalysis(entry.key)
    await expect(adapter.deleteCachedAnalysis('nie-gesehen')).resolves.toBeUndefined()

    expect(await adapter.loadCachedAnalysis(entry.key)).toBeNull()
  })

  // Der Speicher ist reine Ersparnis und aus den Eingaben jederzeit neu
  // herstellbar. In die Sicherungsdatei gehört er deshalb nicht: Er würde
  // sie aufblähen, ohne etwas zu sichern, was verloren gehen könnte.
  it('wandert nicht in die Sicherungsdatei', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveCachedAnalysis(entry)

    const payload = JSON.parse(await (await adapter.exportAll()).text()) as Record<string, unknown>

    expect(payload).not.toHaveProperty('analysisCache')
  })

  // Die Schlüssel sind Inhalts-Fingerabdrücke: Ein Eintrag aus der Zeit vor
  // dem Import bleibt entweder ungenutzt liegen oder passt genau. Ihn zu
  // löschen kostete nur Anfragen beim Anbieter.
  it('übersteht einen Import unangetastet', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.saveCachedAnalysis(entry)
    const backup = await adapter.exportAll()

    await adapter.importAll(new File([await backup.text()], 'sicherung.json'))

    expect(await adapter.loadCachedAnalysis(entry.key)).toEqual(entry)
  })
})

describe('Sicherung mit Vormerkungen', () => {
  it('nimmt die vorgemerkten Stellen mit und stellt sie wieder her', async () => {
    const adapter = createIndexedDbAdapter()
    const set = makeMarkSet()
    await adapter.saveMarkSet(set)
    const blob = await adapter.exportAll()
    const file = new File([await blob.text()], 'sicherung.json', { type: 'application/json' })

    await adapter.clearAll()
    await adapter.importAll(file)

    expect(await adapter.loadMarkSet('abdruck-eins')).toEqual(set)
  })

  it('nimmt eine Sicherungsdatei der Fassung 1 ohne Vormerkungen an', async () => {
    const adapter = createIndexedDbAdapter()
    const alteDatei = new File(
      [
        JSON.stringify({
          formatVersion: 1,
          exportedAt: '2026-08-01T00:00:00.000Z',
          applications: [{ id: 'a1', company: 'A', position: 'B', date: '2026-01-01' }],
          drafts: [],
          settings: DEFAULT_SETTINGS,
        }),
      ],
      'alt.json',
      { type: 'application/json' },
    )

    await adapter.importAll(alteDatei)

    expect(await adapter.listApplications()).toHaveLength(1)
    expect(await adapter.listMarkSets()).toEqual([])
  })
})

describe('clearAll', () => {
  it('leert Bewerbungen, Entwürfe und Einstellungen restlos', async () => {
    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'A', position: 'B', date: '2026-01-01' })
    await adapter.saveDraft(makeDraft())
    await adapter.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })
    await adapter.saveMarkSet(makeMarkSet())
    await adapter.saveCachedAnalysis({ key: 'jobAd:1:m:x', value: 1, savedAt: 1 })

    await adapter.clearAll()

    expect(await adapter.listApplications()).toEqual([])
    expect(await adapter.loadDraft('entwurf-1')).toBeNull()
    expect(await adapter.listMarkSets()).toEqual([])
    expect(await readRawStore(MARK_SETS_STORE)).toHaveLength(0)
    expect(await adapter.listCachedAnalyses()).toEqual([])
    // Nach dem Löschen gelten wieder die Vorgaben, weil nichts mehr abgelegt ist.
    expect(await adapter.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(await readRawStore(APPLICATIONS_STORE)).toHaveLength(0)
    expect(await readRawStore(DRAFTS_STORE)).toHaveLength(0)
    expect(await readRawStore(SETTINGS_STORE)).toHaveLength(0)
  })

  it('lässt eine eigene, vom Schlüsseltresor unabhängige Datenbank unangetastet', async () => {
    // Der Tresor (Aufgabe 5) hat eine eigene Datenbank; clearAll() dieses
    // Adapters darf sie nicht berühren — dafür ist KeyVault.clear() da.
    await putRaw(VAULT_DB_NAME, VAULT_STORE_NAME, { markierung: 'gehört dem Tresor' }, 'apiKey')

    const adapter = createIndexedDbAdapter()
    await adapter.addApplication({ company: 'A', position: 'B', date: '2026-01-01' })

    await adapter.clearAll()

    const vaultDb = await promisify(indexedDB.open(VAULT_DB_NAME))
    let vaultRecord: unknown
    try {
      vaultRecord = await promisify(vaultDb.transaction(VAULT_STORE_NAME, 'readonly').objectStore(VAULT_STORE_NAME).get('apiKey'))
    } finally {
      vaultDb.close()
    }
    expect(vaultRecord).toEqual({ markierung: 'gehört dem Tresor' })
  })
})

describe('eigene, vom Schlüsseltresor getrennte Datenbank', () => {
  it('benutzt einen anderen Datenbanknamen als der Schlüsseltresor', () => {
    expect(STORAGE_DB_NAME).not.toBe(VAULT_DB_NAME)
  })

  it('legt die fünf erwarteten Objektspeicher an', async () => {
    await createIndexedDbAdapter().listApplications()

    const db = await promisify(indexedDB.open(STORAGE_DB_NAME))
    try {
      expect(Array.from(db.objectStoreNames).sort()).toEqual(
        [ANALYSIS_CACHE_STORE, APPLICATIONS_STORE, DRAFTS_STORE, MARK_SETS_STORE, SETTINGS_STORE].sort(),
      )
    } finally {
      db.close()
    }
  })

  it('rüstet eine Datenbank der Fassung 1 um, ohne ihren Bestand zu verlieren', async () => {
    // Eine Datenbank, wie sie vor den Vormerkungen aussah: Fassung 1, drei
    // Speicher, ein Datensatz darin. Der Nutzer hat sie im Browser stehen.
    const alteDatenbank = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(STORAGE_DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(APPLICATIONS_STORE, { keyPath: 'id' })
        request.result.createObjectStore(DRAFTS_STORE, { keyPath: 'id' })
        request.result.createObjectStore(SETTINGS_STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const bestand: Application = { id: 'a1', company: 'Alt GmbH', position: 'Stelle', date: '2026-01-01' }
    const tx = alteDatenbank.transaction(APPLICATIONS_STORE, 'readwrite')
    tx.objectStore(APPLICATIONS_STORE).put(bestand)
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve()
    })
    alteDatenbank.close()

    const adapter = createIndexedDbAdapter()

    expect(await adapter.listApplications()).toEqual([bestand])
    expect(await adapter.listMarkSets()).toEqual([])
  })
})
