import { zlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { DocumentImage } from '../../docx/format'
import { readImage } from './image'

/** Baut ein PNG aus rohen Bildzeilen — wie `tests/fixtures/build-fixtures.mjs`. */
function png(options: {
  width: number
  height: number
  colorType: number
  bitDepth?: number
  rows: number[][]
  palette?: number[]
  transparency?: number[]
}): Uint8Array {
  const bitDepth = options.bitDepth ?? 8
  const raw: number[] = []
  for (const row of options.rows) raw.push(0, ...row) // Filter „None"

  const header = new Uint8Array(13)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, options.width)
  headerView.setUint32(4, options.height)
  header[8] = bitDepth
  header[9] = options.colorType

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...(options.palette ? [chunk('PLTE', new Uint8Array(options.palette))] : []),
    ...(options.transparency ? [chunk('tRNS', new Uint8Array(options.transparency))] : []),
    chunk('IDAT', zlibSync(new Uint8Array(raw))),
    chunk('IEND', new Uint8Array(0)),
  ]
  return concat(parts)
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(12 + data.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, data.length)
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index)
  bytes.set(data, 8)
  return bytes // Prüfsumme bleibt null: gelesen wird sie hier nicht
}

function concat(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

function documentImage(bytes: Uint8Array): DocumentImage {
  return { path: 'word/media/test', bytes, widthPt: 10, heightPt: 10 }
}

describe('readImage — PNG', () => {
  it('liest ein Echtfarbenbild', () => {
    const image = readImage(
      documentImage(png({ width: 2, height: 1, colorType: 2, rows: [[255, 0, 0, 0, 0, 255]] })),
    )

    expect(image).toMatchObject({ widthPx: 2, heightPx: 1, colorSpace: '/DeviceRGB', filter: null })
    expect([...(image?.data ?? [])]).toEqual([255, 0, 0, 0, 0, 255])
  })

  /**
   * Ein Logo mit durchsichtigem Grund: Die Alphastufe muss abgetrennt und als
   * `/SMask` gesetzt werden — sonst stünde das Logo auf einem schwarzen
   * Kasten.
   */
  it('trennt die Alphastufe ab', () => {
    const image = readImage(
      documentImage(
        png({ width: 2, height: 1, colorType: 6, rows: [[255, 0, 0, 128, 0, 0, 255, 255]] }),
      ),
    )

    expect(image?.colorSpace).toBe('/DeviceRGB')
    expect([...(image?.data ?? [])]).toEqual([255, 0, 0, 0, 0, 255])
    expect([...(image?.softMask?.data ?? [])]).toEqual([128, 255])
  })

  it('liest ein Bild mit Farbtafel als /Indexed', () => {
    const image = readImage(
      documentImage(
        png({ width: 2, height: 1, colorType: 3, rows: [[0, 1]], palette: [255, 0, 0, 0, 0, 255] }),
      ),
    )

    expect(image?.colorSpace).toBe('[/Indexed /DeviceRGB 1 <ff00000000ff>]')
    expect([...(image?.data ?? [])]).toEqual([0, 1])
  })

  it('macht die zeilenweise Vorhersage rückgängig', () => {
    // Zweite Zeile mit Filter „Up": Werte sind Unterschiede zur Zeile darüber.
    const raw = [0, 10, 20, 30, 2, 5, 5, 5]
    const header = new Uint8Array(13)
    const view = new DataView(header.buffer)
    view.setUint32(0, 1)
    view.setUint32(4, 2)
    header[8] = 8
    header[9] = 2
    const bytes = concat([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', zlibSync(new Uint8Array(raw))),
      chunk('IEND', new Uint8Array(0)),
    ])

    const image = readImage(documentImage(bytes))

    expect([...(image?.data ?? [])]).toEqual([10, 20, 30, 15, 25, 35])
  })
})

describe('readImage — JPEG', () => {
  it('reicht den Datenstrom unverändert weiter', () => {
    // Kopf, dann ein SOF0-Block mit Maßen und drei Kanälen.
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x60, 0x03, 0, 0, 0, 0, 0, 0, 0,
    ])

    const image = readImage(documentImage(bytes))

    expect(image).toMatchObject({
      widthPx: 0x60,
      heightPx: 0x40,
      bitsPerComponent: 8,
      colorSpace: '/DeviceRGB',
      filter: '/DCTDecode',
    })
    expect(image?.data).toBe(bytes)
  })
})

/**
 * EMF und WMF stecken in vielen geerbten Briefköpfen. Sie sind eigene
 * Seitenbeschreibungssprachen; sie hier umzusetzen wäre ein eigenes Vorhaben.
 * `null` heißt: Stelle frei lassen, statt den Export scheitern zu lassen.
 */
describe('readImage — unbekanntes Format', () => {
  it('gibt null zurück, statt zu scheitern', () => {
    expect(readImage(documentImage(new Uint8Array([0x01, 0x00, 0x00, 0x00])))).toBeNull()
  })
})
