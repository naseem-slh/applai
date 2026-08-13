import { zlibSync } from 'fflate'

import { readImage, type PdfImage } from './image'
import type { DrawnText, LaidOutDocument } from './layout'
import { subsetFont, type FontSubset } from './subset'
import type { TrueTypeFont } from './truetype'

/**
 * Schreibt die gesetzten Seiten als PDF-Datei.
 *
 * **Warum von Hand und nicht mit einer Bibliothek.** Gebraucht wird ein
 * schmaler Ausschnitt des Formats: Seiten, Textzeilen, Flächen, Bilder,
 * eingebettete Schriften. Die verbreiteten Bibliotheken bringen dafür
 * mehrere hundert Kilobyte JavaScript mit, das zu neunzig Prozent aus
 * Formularfeldern, Verschlüsselung und Anmerkungen besteht — Dinge, die ein
 * Anschreiben nie braucht (G9). Gepackt wird mit `fflate`, das für die
 * `.docx`-Dateien ohnehin schon da ist.
 *
 * **Wie der Text im PDF steht.** Als `Type0`-Zeichensatz mit `Identity-H`:
 * Jedes Zeichen wird als zwei Byte lange Glyphennummer geschrieben. Das ist
 * aufwendiger als die einfache Kodierung nach Windows-1252, aber die einzige,
 * die jedes Zeichen tragen kann — ein Bewerbungswerkzeug darf an einem Namen
 * wie „Nguyễn" oder „Łukasz" nicht scheitern. Damit Text trotzdem kopierbar
 * und für Bewerbungsportale lesbar bleibt, bekommt jeder Zeichensatz eine
 * `ToUnicode`-Tabelle, die den Weg zurückweist.
 *
 * **Die Schriften werden eingedampft** (`subset.ts`): Eingebettet wird nur,
 * was im Brief vorkommt — aus 280 kB werden wenige.
 */

export interface PdfOptions {
  /** Steht als Erstellungszeitpunkt in der Datei. Übergeben, damit Tests feste Bytes bekommen. */
  created: Date
}

export function writePdf(document: LaidOutDocument, options: PdfOptions): Uint8Array<ArrayBuffer> {
  const fonts = collectFonts(document)
  const images = collectImages(document)
  const builder = new PdfBuilder()

  const catalog = builder.reserve()
  const pages = builder.reserve()

  const fontResources: string[] = []
  for (const [index, entry] of fonts.entries()) {
    fontResources.push(`/F${index} ${writeFont(builder, entry)} 0 R`)
  }

  const imageResources: string[] = []
  for (const [index, entry] of images.entries()) {
    imageResources.push(`/Im${index} ${writeImage(builder, entry.pdf)} 0 R`)
  }

  const resources = builder.add(
    `<< /Font << ${fontResources.join(' ')} >> /XObject << ${imageResources.join(' ')} >> ` +
      `/ProcSet [/PDF /Text /ImageB /ImageC /ImageI] >>`,
  )

  const pageIds = document.pages.map((page) => {
    const content = builder.stream(
      '',
      new TextEncoder().encode(contentStream(page, document.page.heightPt, fonts, images)),
    )
    return builder.add(
      `<< /Type /Page /Parent ${pages} 0 R /Resources ${resources} 0 R ` +
        `/MediaBox [0 0 ${number(document.page.widthPt)} ${number(document.page.heightPt)}] ` +
        `/Contents ${content} 0 R >>`,
    )
  })

  builder.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`)
  builder.set(
    pages,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  )

  const info = builder.add(
    `<< /Producer (Applai) /Creator (Applai) /CreationDate (${pdfDate(options.created)}) >>`,
  )
  return builder.build(catalog, info)
}

// ---------------------------------------------------------------------------
// Einsammeln, was in die Datei muss
// ---------------------------------------------------------------------------

interface FontEntry {
  key: string
  font: TrueTypeFont
  /** Glyphennummer → Zeichen, für die Auswahl und die ToUnicode-Tabelle. */
  used: Map<number, number>
  subset: FontSubset
}

function collectFonts(document: LaidOutDocument): FontEntry[] {
  const used = new Map<string, { font: TrueTypeFont; glyphs: Map<number, number> }>()

  for (const page of document.pages) {
    for (const item of page.items) {
      if (item.kind !== 'text') continue
      const entry =
        used.get(item.face.key) ??
        (() => {
          const fresh = { font: item.face.font, glyphs: new Map<number, number>() }
          used.set(item.face.key, fresh)
          return fresh
        })()

      for (const character of item.text) {
        const codePoint = character.codePointAt(0) ?? 0
        entry.glyphs.set(entry.font.glyphId(codePoint), codePoint)
      }
    }
  }

  return [...used.entries()].map(([key, entry]) => ({
    key,
    font: entry.font,
    used: entry.glyphs,
    subset: subsetFont(entry.font, entry.glyphs),
  }))
}

interface ImageEntry {
  path: string
  pdf: PdfImage
}

function collectImages(document: LaidOutDocument): ImageEntry[] {
  const byPath = new Map<string, ImageEntry>()
  for (const page of document.pages) {
    for (const item of page.items) {
      if (item.kind !== 'image' || byPath.has(item.image.path)) continue
      const pdf = readImage(item.image)
      // Ein Format, das hier nicht ankommt (EMF, WMF, verschachteltes PNG),
      // lässt seine Stelle frei — siehe `image.ts`.
      if (pdf) byPath.set(item.image.path, { path: item.image.path, pdf })
    }
  }
  return [...byPath.values()]
}

// ---------------------------------------------------------------------------
// Inhaltsstrom einer Seite
// ---------------------------------------------------------------------------

function contentStream(
  page: LaidOutDocument['pages'][number],
  heightPt: number,
  fonts: FontEntry[],
  images: ImageEntry[],
): string {
  const parts: string[] = []
  let currentColor: string | null = null

  const setColor = (color: string | null): void => {
    const wanted = color ?? '000000'
    if (wanted === currentColor) return
    currentColor = wanted
    const [red, green, blue] = rgb(wanted)
    parts.push(`${number(red)} ${number(green)} ${number(blue)} rg`)
  }

  for (const item of page.items) {
    // PDF misst von unten, das Satzmodell von oben.
    if (item.kind === 'text') {
      const fontIndex = fonts.findIndex((entry) => entry.key === item.face.key)
      if (fontIndex < 0) continue
      setColor(item.color)
      parts.push(
        `BT /F${fontIndex} ${number(item.sizePt)} Tf ` +
          `1 0 0 1 ${number(item.xPt)} ${number(heightPt - item.yPt)} Tm ` +
          `<${glyphHex(item, fonts[fontIndex])}> Tj ET`,
      )
      continue
    }

    if (item.kind === 'rect') {
      setColor(item.color)
      parts.push(
        `${number(item.xPt)} ${number(heightPt - item.yPt - item.heightPt)} ` +
          `${number(item.widthPt)} ${number(item.heightPt)} re f`,
      )
      continue
    }

    const imageIndex = images.findIndex((entry) => entry.path === item.image.path)
    if (imageIndex < 0) continue
    // Die Einheitsmatrix eines Bildes ist ein Quadrat von einer Einheit; die
    // Verzerrung auf die gewünschte Größe macht `cm`.
    parts.push(
      `q ${number(item.widthPt)} 0 0 ${number(item.heightPt)} ` +
        `${number(item.xPt)} ${number(heightPt - item.yPt - item.heightPt)} cm /Im${imageIndex} Do Q`,
    )
  }

  return parts.join('\n')
}

/** Der Text als Folge zweistelliger Glyphennummern der eingedampften Schrift. */
function glyphHex(item: DrawnText, entry: FontEntry): string {
  let out = ''
  for (const character of item.text) {
    const original = entry.font.glyphId(character.codePointAt(0) ?? 0)
    const glyphId = entry.subset.glyphIds.get(original) ?? 0
    out += glyphId.toString(16).padStart(4, '0')
  }
  return out
}

function rgb(color: string): [number, number, number] {
  const value = Number.parseInt(color, 16)
  if (!Number.isFinite(value)) return [0, 0, 0]
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]
}

// ---------------------------------------------------------------------------
// Zeichensätze
// ---------------------------------------------------------------------------

function writeFont(builder: PdfBuilder, entry: FontEntry): number {
  const { font, subset } = entry
  const scale = 1000 / font.metrics.unitsPerEm
  const name = `${subsetTag(entry)}+${entry.key}`

  const file = builder.stream(`/Length1 ${subset.bytes.length}`, subset.bytes)
  const descriptor = builder.add(
    `<< /Type /FontDescriptor /FontName /${name} /Flags ${font.metrics.flags} ` +
      `/FontBBox [${font.metrics.bbox.map((value) => Math.round(value * scale)).join(' ')}] ` +
      `/ItalicAngle ${number(font.metrics.italicAngle)} ` +
      `/Ascent ${Math.round(font.metrics.ascent * scale)} ` +
      `/Descent ${Math.round(font.metrics.descent * scale)} ` +
      `/CapHeight ${Math.round(font.metrics.capHeight * scale)} ` +
      `/StemV ${font.metrics.stemV} /FontFile2 ${file} 0 R >>`,
  )

  // Alle Glyphennummern liegen lückenlos ab 0, also genügt ein einziger
  // Abschnitt im Breitenfeld.
  const widths = subset.advances.map((advance) => Math.round(advance * scale)).join(' ')
  const descendant = builder.add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} ` +
      `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptor} 0 R /DW 1000 /W [0 [${widths}]] /CIDToGIDMap /Identity >>`,
  )

  const toUnicode = builder.stream('', new TextEncoder().encode(toUnicodeCMap(entry)))
  return builder.add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H ` +
      `/DescendantFonts [${descendant} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
  )
}

/**
 * Das sechsstellige Kürzel vor dem Schriftnamen.
 *
 * Es sagt Betrachtern: „Das ist nur ein Ausschnitt dieser Schrift, setze
 * fehlende Zeichen nicht daraus." Es muss nur eindeutig sein, nicht schön —
 * hergeleitet aus Name und Auswahl, damit derselbe Brief dieselbe Datei
 * ergibt.
 */
function subsetTag(entry: FontEntry): string {
  let hash = 0x811c9dc5
  for (const character of `${entry.key}:${[...entry.used.keys()].join(',')}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0
  }
  let tag = ''
  for (let index = 0; index < 6; index += 1) {
    tag += String.fromCharCode(65 + (hash % 26))
    hash = Math.floor(hash / 26)
  }
  return tag
}

function toUnicodeCMap(entry: FontEntry): string {
  const mappings = [...entry.used.entries()]
    .map(([original, codePoint]) => ({
      glyphId: entry.subset.glyphIds.get(original) ?? 0,
      codePoint,
    }))
    .sort((first, second) => first.glyphId - second.glyphId)

  const lines: string[] = []
  // Die Spezifikation begrenzt einen Block auf hundert Einträge.
  for (let at = 0; at < mappings.length; at += 100) {
    const block = mappings.slice(at, at + 100)
    lines.push(`${block.length} beginbfchar`)
    for (const mapping of block) {
      lines.push(`<${hex4(mapping.glyphId)}> <${utf16Hex(mapping.codePoint)}>`)
    }
    lines.push('endbfchar')
  }

  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...lines,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n')
}

function hex4(value: number): string {
  return value.toString(16).padStart(4, '0').toUpperCase()
}

/** Ein Zeichen als UTF-16, wie es die ToUnicode-Tabelle verlangt. */
function utf16Hex(codePoint: number): string {
  let out = ''
  for (let index = 0; index < String.fromCodePoint(codePoint).length; index += 1) {
    out += hex4(String.fromCodePoint(codePoint).charCodeAt(index))
  }
  return out
}

// ---------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------

function writeImage(builder: PdfBuilder, image: PdfImage): number {
  const mask =
    image.softMask === null
      ? ''
      : `/SMask ${builder.stream(
          `/Type /XObject /Subtype /Image /Width ${image.widthPx} /Height ${image.heightPx} ` +
            `/ColorSpace /DeviceGray /BitsPerComponent ${image.softMask.bitsPerComponent}`,
          image.softMask.data,
        )} 0 R`

  return builder.stream(
    `/Type /XObject /Subtype /Image /Width ${image.widthPx} /Height ${image.heightPx} ` +
      `/ColorSpace ${image.colorSpace} /BitsPerComponent ${image.bitsPerComponent} ${mask}`,
    image.data,
    image.filter,
  )
}

// ---------------------------------------------------------------------------
// Die Datei zusammensetzen
// ---------------------------------------------------------------------------

/**
 * Sammelt die Objekte der Datei und schreibt am Ende Verzeichnis und Anhang.
 *
 * Ein PDF verweist über Objektnummern aufeinander, und manche Verweise
 * zeigen nach vorn (der Katalog auf die Seitenliste, die Seiten auf ihre
 * Eltern). `reserve` gibt deshalb eine Nummer heraus, bevor der Inhalt
 * feststeht, und `set` reicht ihn nach.
 */
class PdfBuilder {
  private readonly objects: (Uint8Array | null)[] = []
  private readonly encoder = new TextEncoder()

  reserve(): number {
    this.objects.push(null)
    return this.objects.length
  }

  set(id: number, content: string): void {
    this.objects[id - 1] = this.encoder.encode(content)
  }

  add(content: string): number {
    const id = this.reserve()
    this.set(id, content)
    return id
  }

  /**
   * Ein Datenstrom. Ohne eigenen Filter wird gepackt — bei Text und
   * Bildpunkten bringt das den Löwenanteil der Ersparnis; JPEG ist schon
   * gepackt und bringt seinen Filter selbst mit.
   *
   * `zlibSync` und nicht `deflateSync`: Was PDF `/FlateDecode` nennt, ist
   * zlib (RFC 1950) mit seinen zwei Kopfbytes und der Prüfsumme am Ende,
   * nicht der nackte Deflate-Strom. Ohne die Hülle liest kein Betrachter den
   * Inhalt — und meldet je nach Programm nicht einmal einen Fehler, sondern
   * zeigt einfach eine leere Seite.
   */
  stream(dictionary: string, data: Uint8Array, filter: string | null = null): number {
    const packed = filter === null ? zlibSync(data, { level: 9 }) : data
    const head = this.encoder.encode(
      `<< ${dictionary} /Length ${packed.length} /Filter ${filter ?? '/FlateDecode'} >>\nstream\n`,
    )
    const tail = this.encoder.encode('\nendstream')

    const bytes = new Uint8Array(head.length + packed.length + tail.length)
    bytes.set(head, 0)
    bytes.set(packed, head.length)
    bytes.set(tail, head.length + packed.length)

    const id = this.reserve()
    this.objects[id - 1] = bytes
    return id
  }

  // Der Puffertyp steht ausdrücklich dabei: Ohne ihn gilt der allgemeinere
  // `ArrayBufferLike`, und ein `Blob` nimmt den nicht an.
  build(catalog: number, info: number): Uint8Array<ArrayBuffer> {
    const parts: Uint8Array[] = []
    const offsets: number[] = []
    let at = 0

    const push = (bytes: Uint8Array): void => {
      parts.push(bytes)
      at += bytes.length
    }

    // Der zweite Kommentar mit hohen Bytes sagt Werkzeugen, dass die Datei
    // binär ist und nicht zeilenweise umkodiert werden darf.
    push(this.encoder.encode('%PDF-1.7\n'))
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

    this.objects.forEach((content, index) => {
      offsets[index] = at
      push(this.encoder.encode(`${index + 1} 0 obj\n`))
      push(content ?? this.encoder.encode('null'))
      push(this.encoder.encode('\nendobj\n'))
    })

    const startxref = at
    const identifier = fileIdentifier(parts)
    const table = [
      `xref`,
      `0 ${this.objects.length + 1}`,
      // Jeder Eintrag ist auf das Byte genau zwanzig Zeichen lang.
      `0000000000 65535 f `,
      ...offsets.map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `),
      `trailer`,
      `<< /Size ${this.objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R ` +
        `/ID [<${identifier}> <${identifier}>] >>`,
      `startxref`,
      `${startxref}`,
      `%%EOF`,
      ``,
    ].join('\n')
    push(this.encoder.encode(table))

    const file = new Uint8Array(at)
    let position = 0
    for (const part of parts) {
      file.set(part, position)
      position += part.length
    }
    return file
  }
}

/**
 * Die Kennung der Datei.
 *
 * Sie soll zwei Fassungen desselben Dokuments unterscheidbar machen. Hier
 * aus dem Inhalt gebildet und nicht aus Zufall oder Uhrzeit: Derselbe Brief
 * ergibt dieselbe Datei, was Tests überhaupt erst prüfbar macht.
 */
function fileIdentifier(parts: Uint8Array[]): string {
  let hash = 0x811c9dc5
  for (const part of parts) {
    for (const byte of part) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').repeat(4).toUpperCase()
}

/** Ein Zeitpunkt in der Schreibweise, die PDF dafür vorsieht. */
function pdfDate(date: Date): string {
  const pad = (value: number): string => `${value}`.padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  return (
    `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}'${pad(Math.abs(offset) % 60)}'`
  )
}

/** Zahlen kurz halten: PDF liest Dezimalzahlen, aber jede Stelle kostet Platz. */
function number(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : `${rounded}`
}
