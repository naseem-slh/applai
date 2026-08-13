import { unzlibSync } from 'fflate'
import type { DocumentImage } from '../../docx/format'

/**
 * Bereitet ein Bild aus dem Word-Archiv so auf, dass es als XObject in ein
 * PDF geschrieben werden kann.
 *
 * **JPEG geht unverändert durch.** Ein PDF kann einen JPEG-Datenstrom direkt
 * aufnehmen (`/DCTDecode`). Ihn zu entpacken und neu zu packen kostete
 * Rechenzeit und Bildgüte für nichts.
 *
 * **PNG muss ausgepackt werden.** PDF kennt das Format nicht. Die Bildzeilen
 * sind zlib-gepackt und zusätzlich zeilenweise vorhergesagt (die
 * „Filter" des PNG-Formats); beides wird hier rückgängig gemacht, die reinen
 * Bildpunkte gehen dann gepackt ins PDF. Eine Alphastufe wird abgetrennt und
 * als `/SMask` gesetzt — ein Logo mit durchsichtigem Grund bleibt so
 * durchsichtig.
 *
 * **Was nicht geht**, kommt gar nicht erst ins PDF, statt es zu zerstören:
 * verschachtelte PNG (Adam7), sowie EMF und WMF — die Vektorformate, in
 * denen ältere Word-Fassungen eingefügte Zeichnungen ablegen. Sie sind
 * eigene Seitenbeschreibungssprachen; sie umzusetzen wäre ein eigenes
 * Vorhaben. `null` heißt für den Schreiber: Stelle frei lassen.
 */

export interface PdfImage {
  widthPx: number
  heightPx: number
  bitsPerComponent: number
  /** Fertiger PDF-Ausdruck, z. B. `/DeviceRGB` oder ein `/Indexed`-Feld. */
  colorSpace: string
  /** Gesetzt, wenn die Daten schon gepackt sind (JPEG); sonst packt der Schreiber. */
  filter: string | null
  data: Uint8Array
  /** Die Alphastufe als eigenes Graustufenbild. */
  softMask: { data: Uint8Array; bitsPerComponent: number } | null
}

export function readImage(image: DocumentImage): PdfImage | null {
  const bytes = image.bytes
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return readPng(bytes)
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes)
  return null
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

/** Die Blockarten, die Maße und Kanalzahl nennen (Baseline bis verlustlos). */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

function readJpeg(bytes: Uint8Array): PdfImage | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 2

  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1
      continue
    }
    const marker = bytes[at + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    const length = view.getUint16(at + 2)
    if (JPEG_FRAME_MARKERS.has(marker)) {
      const components = bytes[at + 9]
      const colorSpace =
        components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK' : '/DeviceRGB'
      return {
        heightPx: view.getUint16(at + 5),
        widthPx: view.getUint16(at + 7),
        bitsPerComponent: bytes[at + 4],
        colorSpace,
        filter: '/DCTDecode',
        data: bytes,
        softMask: null,
      }
    }
    at += 2 + length
  }
  return null
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

interface PngHeader {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

/** Kanäle je Bildpunkt nach PNG-Farbtyp: Grau, RGB, Palette, Grau+Alpha, RGBA. */
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function readPng(bytes: Uint8Array): PdfImage | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let header: PngHeader | null = null
  let palette: Uint8Array | null = null
  let transparency: Uint8Array | null = null
  const dataChunks: Uint8Array[] = []

  let at = 8 // hinter der Signatur
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const content = bytes.subarray(at + 8, at + 8 + length)

    if (type === 'IHDR') {
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        bitDepth: bytes[at + 16],
        colorType: bytes[at + 17],
        interlace: bytes[at + 20],
      }
    } else if (type === 'PLTE') palette = content
    else if (type === 'tRNS') transparency = content
    else if (type === 'IDAT') dataChunks.push(content)
    else if (type === 'IEND') break

    at += 12 + length // Länge, Art, Inhalt, Prüfsumme
  }

  if (!header || dataChunks.length === 0) return null
  // Verschachtelte Bilder bestehen aus sieben ineinandergelegten Rastern und
  // müssten erst zusammengesetzt werden; sie kommen aus Word nicht.
  if (header.interlace !== 0) return null
  const channels = PNG_CHANNELS[header.colorType]
  if (channels === undefined) return null

  const raw = unzlibSync(concat(dataChunks))
  const samples = unfilter(raw, header, channels)
  if (!samples) return null

  if (header.colorType === 3) {
    if (!palette) return null
    return {
      widthPx: header.width,
      heightPx: header.height,
      bitsPerComponent: header.bitDepth,
      colorSpace: `[/Indexed /DeviceRGB ${palette.length / 3 - 1} <${hex(palette)}>]`,
      filter: null,
      data: samples,
      softMask: paletteMask(samples, header, transparency),
    }
  }

  const hasAlpha = header.colorType === 4 || header.colorType === 6
  const colorChannels = hasAlpha ? channels - 1 : channels
  const split = hasAlpha ? splitAlpha(samples, header, channels) : { color: samples, alpha: null }

  return {
    widthPx: header.width,
    heightPx: header.height,
    bitsPerComponent: header.bitDepth,
    colorSpace: colorChannels === 1 ? '/DeviceGray' : '/DeviceRGB',
    filter: null,
    data: split.color,
    softMask: split.alpha ? { data: split.alpha, bitsPerComponent: header.bitDepth } : null,
  }
}

/**
 * Macht die zeilenweise Vorhersage rückgängig.
 *
 * PNG stellt jeder Bildzeile ein Byte voran, das sagt, wie ihre Werte aus den
 * Nachbarn links und oben hergeleitet wurden. Das spart Platz, muss aber
 * rückgerechnet werden, bevor die Bildpunkte lesbar sind.
 */
function unfilter(raw: Uint8Array, header: PngHeader, channels: number): Uint8Array | null {
  const bitsPerPixel = header.bitDepth * channels
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3)
  const rowBytes = Math.ceil((header.width * bitsPerPixel) / 8)
  if (raw.length < header.height * (rowBytes + 1)) return null

  const out = new Uint8Array(header.height * rowBytes)
  for (let row = 0; row < header.height; row += 1) {
    const filter = raw[row * (rowBytes + 1)]
    const from = row * (rowBytes + 1) + 1
    const to = row * rowBytes
    const above = to - rowBytes

    for (let index = 0; index < rowBytes; index += 1) {
      const value = raw[from + index]
      const left = index >= bytesPerPixel ? out[to + index - bytesPerPixel] : 0
      const up = row > 0 ? out[above + index] : 0
      const upLeft = row > 0 && index >= bytesPerPixel ? out[above + index - bytesPerPixel] : 0

      switch (filter) {
        case 1:
          out[to + index] = (value + left) & 0xff
          break
        case 2:
          out[to + index] = (value + up) & 0xff
          break
        case 3:
          out[to + index] = (value + ((left + up) >> 1)) & 0xff
          break
        case 4:
          out[to + index] = (value + paeth(left, up, upLeft)) & 0xff
          break
        default:
          out[to + index] = value
      }
    }
  }
  return out
}

/** Der Paeth-Schätzer: der Nachbar, der dem linear vorhergesagten Wert am nächsten liegt. */
function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left
  return distanceUp <= distanceUpLeft ? up : upLeft
}

/** Trennt die Alphastufe von den Farbwerten. */
function splitAlpha(
  samples: Uint8Array,
  header: PngHeader,
  channels: number,
): { color: Uint8Array; alpha: Uint8Array } {
  const step = header.bitDepth >> 3 // 1 oder 2 Byte je Kanal
  const colorChannels = channels - 1
  const pixels = header.width * header.height
  const color = new Uint8Array(pixels * colorChannels * step)
  const alpha = new Uint8Array(pixels * step)

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const from = pixel * channels * step
    color.set(samples.subarray(from, from + colorChannels * step), pixel * colorChannels * step)
    alpha.set(
      samples.subarray(from + colorChannels * step, from + channels * step),
      pixel * step,
    )
  }
  return { color, alpha }
}

/**
 * Die Durchsichtigkeit einer Palette: `tRNS` nennt je Palettenplatz eine
 * Alphastufe. Daraus wird ein Graustufenbild in voller Auflösung.
 */
function paletteMask(
  samples: Uint8Array,
  header: PngHeader,
  transparency: Uint8Array | null,
): { data: Uint8Array; bitsPerComponent: number } | null {
  if (!transparency || transparency.length === 0) return null
  if (header.bitDepth !== 8) return null // andere Tiefen kommen aus Word nicht

  const alpha = new Uint8Array(header.width * header.height)
  const rowBytes = header.width
  for (let row = 0; row < header.height; row += 1) {
    for (let column = 0; column < header.width; column += 1) {
      const index = samples[row * rowBytes + column]
      // Plätze ohne Eintrag in `tRNS` sind vollständig deckend.
      alpha[row * header.width + column] = index < transparency.length ? transparency[index] : 255
    }
  }
  return { data: alpha, bitsPerComponent: 8 }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}
