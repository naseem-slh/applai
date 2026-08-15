// Lädt eine Fixture per node:fs/promises und läuft deshalb unter
// tsconfig.test.json — siehe die Begründung in parse.test.ts.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseDocx } from '../docx/parse'
import type { DocxDocument } from '../docx/model'
import { replaceRange } from '../docx/replace'
import { buildFileName, downloadDocx, isoDate } from './docx'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures')

let letterBytes: ArrayBuffer

beforeAll(async () => {
  const buffer = await readFile(join(FIXTURES_DIR, 'anschreiben.docx'))
  letterBytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
})

describe('isoDate', () => {
  it('nennt den Kalendertag des Nutzers, nicht den in UTC', () => {
    // 1. Januar, 00:30 Ortszeit in einer Zone östlich von UTC wäre nach UTC
    // noch der 31. Dezember. Gemeint ist immer der Tag, den der Nutzer sieht.
    const local = new Date(2026, 0, 1, 0, 30)
    expect(isoDate(local)).toBe('2026-01-01')
  })

  it('füllt Monat und Tag auf zwei Stellen auf', () => {
    expect(isoDate(new Date(2026, 7, 5))).toBe('2026-08-05')
  })
})

describe('buildFileName', () => {
  const date = new Date(2026, 7, 12)

  it('baut den Namen aus Anschreiben, Firma und Datum', () => {
    expect(buildFileName('Musterwerk Solutions', date)).toBe(
      'Anschreiben_Musterwerk_Solutions_2026-08-12.docx',
    )
  })

  it('lässt die Firma weg, wenn die Anzeige keine nennt, statt einen Platzhalter zu erfinden', () => {
    expect(buildFileName(null, date)).toBe('Anschreiben_2026-08-12.docx')
    expect(buildFileName('   ', date)).toBe('Anschreiben_2026-08-12.docx')
  })

  it('entfernt Zeichen, die ein Dateisystem ablehnt', () => {
    expect(buildFileName('Meier & Co. / Nord', date)).toBe(
      'Anschreiben_Meier_&_Co._Nord_2026-08-12.docx',
    )
    expect(buildFileName('A:B*C?D"E<F>G|H\\I', date)).toBe(
      'Anschreiben_A_B_C_D_E_F_G_H_I_2026-08-12.docx',
    )
  })

  it('behält den Bindestrich, der in Firmennamen üblich und in Dateinamen erlaubt ist', () => {
    expect(buildFileName('Musterwerk-Solutions', date)).toBe(
      'Anschreiben_Musterwerk-Solutions_2026-08-12.docx',
    )
  })

  it('lässt weder einen Punkt noch Leerraum am Rand stehen', () => {
    // Windows schneidet beides stillschweigend ab, ein führender Punkt macht
    // die Datei unter Unix unsichtbar.
    expect(buildFileName('  .Musterwerk.  ', date)).toBe('Anschreiben_Musterwerk_2026-08-12.docx')
  })

  it('kürzt einen sehr langen Firmennamen, ohne einen Rand zu hinterlassen', () => {
    const name = buildFileName(`${'A'.repeat(80)} GmbH`, date)

    expect(name.length).toBeLessThan(100)
    expect(name.startsWith(`Anschreiben_${'A'.repeat(60)}_2026`)).toBe(true)
  })

  it('trägt immer die Endung .docx', () => {
    expect(buildFileName('Firma', date).endsWith('.docx')).toBe(true)
    expect(buildFileName(null, date).endsWith('.docx')).toBe(true)
  })
})

describe('downloadDocx', () => {
  const created: string[] = []
  const revoked: string[] = []

  afterEach(() => {
    created.length = 0
    revoked.length = 0
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function stubObjectUrl(): { blobs: Blob[] } {
    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob)
        const url = `blob:test-${created.length}`
        created.push(url)
        return url
      }),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
    })
    return { blobs }
  }

  it('erzeugt eine Datei mit dem gewünschten Namen und löst den Download aus', async () => {
    stubObjectUrl()
    const docx = await parseDocx(letterBytes)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadDocx(docx, 'Anschreiben_Firma_2026-08-12.docx')

    expect(click).toHaveBeenCalledTimes(1)
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('Anschreiben_Firma_2026-08-12.docx')
    expect(anchor.href).toBe(created[0])
  })

  it('gibt die Objekt-URL frei, aber erst im nächsten Durchlauf der Ereignisschleife', async () => {
    vi.useFakeTimers()
    stubObjectUrl()
    const docx = await parseDocx(letterBytes)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadDocx(docx, 'test.docx')

    // Noch nicht: Mehrere Browser brechen den Download ab, wenn die URL in
    // derselben Aufgabe freigegeben wird.
    expect(revoked).toEqual([])

    vi.runAllTimers()

    expect(revoked).toEqual([created[0]])
  })

  it('packt das geänderte Dokument, nicht das hochgeladene', async () => {
    const { blobs } = stubObjectUrl()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const original = await parseDocx(letterBytes)
    const changed: DocxDocument = replaceRange(original, { from: 0, to: 5 }, 'Hallo')

    await downloadDocx(changed, 'test.docx')

    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer())
    const xml = new TextDecoder().decode(unzipSync(bytes)['word/document.xml']!)
    expect(xml).toContain('Hallo')
    expect(xml).not.toContain('Sehr g')
  })
})
