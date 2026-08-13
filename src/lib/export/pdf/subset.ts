import { tableBytes, type TrueTypeFont } from './truetype'

/**
 * Dampft eine Schriftdatei auf die Glyphen ein, die im Brief tatsächlich
 * vorkommen, und schreibt sie neu.
 *
 * **Warum das sein muss.** Ein PDF trägt jede eingebettete Schrift vollständig
 * mit sich. Carlito wiegt auch nach der Vorbereitung
 * (`scripts/build-pdf-fonts.mjs`) noch rund 280 kB; ein Anschreiben in normal
 * und fett käme damit auf über ein halbes Megabyte — für einen einseitigen
 * Brief, der an ein Bewerbungsportal mit Anhangsgrenze geht. Ein Brief
 * benutzt aber selten mehr als achtzig verschiedene Zeichen. Eingedampft
 * bleiben je Schnitt wenige Kilobyte.
 *
 * **Was hier anders läuft als beim Vorbereiten der Dateien.** Dort bleiben
 * die Glyphennummern, wo sie sind, und nicht benötigte Umrisse werden nur
 * geleert — das ist die vorsichtige Variante für eine Datei, die später noch
 * beliebig benutzt wird. Hier wird wirklich neu nummeriert: Die Datei landet
 * im PDF, wo ausschließlich über Glyphennummern zugegriffen wird, und die
 * Zuordnung dorthin bestimmt dieser Code selbst. Zusammengesetzte Glyphen
 * („ä" aus „a" und Trema) verweisen auf andere Nummern; diese Verweise
 * werden mit umgeschrieben.
 */

export interface FontSubset {
  /** Die eingedampfte Datei, fertig für `FontFile2`. */
  bytes: Uint8Array
  /** Ursprüngliche Glyphennummer → Nummer in der eingedampften Datei. */
  glyphIds: Map<number, number>
  /** Vorschubbreiten in Font-Einheiten, nach neuer Nummer geordnet. */
  advances: number[]
}

/**
 * Tabellen, die in die eingedampfte Datei kommen.
 *
 * `cvt `, `fpgm` und `prep` sind die Anweisungen, mit denen die Schrift sich
 * in kleinen Graden auf das Pixelraster legt. Sie hängen nicht an einzelnen
 * Glyphen und bleiben deshalb unverändert erhalten — sie kosten wenige
 * Kilobyte und machen die Darstellung am Bildschirm merklich sauberer.
 */
const COPIED_TABLES = ['cvt ', 'fpgm', 'prep'] as const

export function subsetFont(font: TrueTypeFont, usedGlyphs: ReadonlyMap<number, number>): FontSubset {
  const glyf = tableBytes(font.bytes, font.tables, 'glyf')

  // Glyphe 0 (`.notdef`) muss die erste bleiben: Auf sie fällt jeder
  // Betrachter zurück, dem eine Nummer fehlt.
  const kept = new Set<number>([0, ...usedGlyphs.keys()])
  for (const glyphId of [...kept]) collectComponents(font, glyf, glyphId, kept)

  const ordered = [...kept].sort((a, b) => a - b)
  const glyphIds = new Map<number, number>()
  ordered.forEach((original, index) => glyphIds.set(original, index))

  const { glyfBytes, locaBytes } = buildGlyphData(font, glyf, ordered, glyphIds)
  const advances = ordered.map((original) => font.advance(original))

  const tables = new Map<string, Uint8Array>()
  tables.set('glyf', glyfBytes)
  tables.set('loca', locaBytes)
  tables.set('head', buildHead(font))
  tables.set('hhea', buildHhea(font, ordered.length))
  tables.set('hmtx', buildHmtx(font, ordered))
  tables.set('maxp', buildMaxp(font, ordered.length))
  tables.set('cmap', buildCmap(usedGlyphs, glyphIds))
  for (const tag of COPIED_TABLES) {
    if (font.tables.has(tag)) tables.set(tag, tableBytes(font.bytes, font.tables, tag).slice())
  }

  return { bytes: assemble(tables), glyphIds, advances }
}

const MORE_COMPONENTS = 0x0020
const ARG_1_AND_2_ARE_WORDS = 0x0001
const WE_HAVE_A_SCALE = 0x0008
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040
const WE_HAVE_A_TWO_BY_TWO = 0x0080

/**
 * Läuft über die Bestandteile einer zusammengesetzten Glyphe und nimmt sie
 * in die Auswahl auf — rekursiv, denn ein Bestandteil kann selbst
 * zusammengesetzt sein.
 */
function collectComponents(
  font: TrueTypeFont,
  glyf: Uint8Array,
  glyphId: number,
  kept: Set<number>,
): void {
  for (const component of componentOffsets(font, glyf, glyphId)) {
    if (kept.has(component.glyphId)) continue
    kept.add(component.glyphId)
    collectComponents(font, glyf, component.glyphId, kept)
  }
}

/**
 * Die Bestandteile einer zusammengesetzten Glyphe samt der Stelle, an der
 * ihre Nummer steht — dieselbe Wanderung dient dem Einsammeln und später dem
 * Umschreiben.
 */
function componentOffsets(
  font: TrueTypeFont,
  glyf: Uint8Array,
  glyphId: number,
): { glyphId: number; at: number }[] {
  const [start, end] = font.glyphRange(glyphId)
  if (end <= start) return []

  const view = new DataView(glyf.buffer, glyf.byteOffset + start, end - start)
  if (view.getInt16(0) >= 0) return [] // einfache Glyphe

  const components: { glyphId: number; at: number }[] = []
  let at = 10 // hinter numberOfContours und dem umgebenden Rechteck
  for (;;) {
    const flags = view.getUint16(at)
    components.push({ glyphId: view.getUint16(at + 2), at: at + 2 })
    at += 4
    at += flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2
    if (flags & WE_HAVE_A_SCALE) at += 2
    else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) at += 4
    else if (flags & WE_HAVE_A_TWO_BY_TWO) at += 8
    if (!(flags & MORE_COMPONENTS)) break
  }
  return components
}

function buildGlyphData(
  font: TrueTypeFont,
  glyf: Uint8Array,
  ordered: number[],
  glyphIds: ReadonlyMap<number, number>,
): { glyfBytes: Uint8Array; locaBytes: Uint8Array } {
  const pieces: Uint8Array[] = []
  const offsets = new Uint32Array(ordered.length + 1)
  let position = 0

  ordered.forEach((original, index) => {
    offsets[index] = position
    const [start, end] = font.glyphRange(original)
    if (end <= start) return

    // Auf ein Vielfaches von vier aufgefüllt, wie es die Spezifikation für
    // Glyphengrenzen verlangt.
    const piece = new Uint8Array((end - start + 3) & ~3)
    piece.set(glyf.subarray(start, end))

    const view = new DataView(piece.buffer)
    for (const component of componentOffsets(font, glyf, original)) {
      const replacement = glyphIds.get(component.glyphId)
      if (replacement === undefined) {
        throw new Error(`Bestandteil ${component.glyphId} fehlt in der Auswahl.`)
      }
      view.setUint16(component.at, replacement)
    }

    pieces.push(piece)
    position += piece.length
  })
  offsets[ordered.length] = position

  const glyfBytes = new Uint8Array(position)
  let at = 0
  for (const piece of pieces) {
    glyfBytes.set(piece, at)
    at += piece.length
  }

  // Immer das lange `loca`-Format: Das kurze speichert halbe Offsets und
  // verlangt gerade Adressen. Vier Byte je Glyphe sind bei achtzig Glyphen
  // nichts, und eine Fehlerquelle weniger.
  const locaBytes = new Uint8Array((ordered.length + 1) * 4)
  const locaView = new DataView(locaBytes.buffer)
  offsets.forEach((offset, index) => locaView.setUint32(index * 4, offset))

  return { glyfBytes, locaBytes }
}

function buildHead(font: TrueTypeFont): Uint8Array {
  const head = tableBytes(font.bytes, font.tables, 'head').slice()
  // `indexToLocFormat` muss zum langen `loca` oben passen.
  new DataView(head.buffer, head.byteOffset, head.byteLength).setInt16(50, 1)
  return head
}

function buildHhea(font: TrueTypeFont, numGlyphs: number): Uint8Array {
  const hhea = tableBytes(font.bytes, font.tables, 'hhea').slice()
  // Alle Glyphen bekommen einen vollständigen Eintrag in `hmtx`; die
  // Sparform mit nachlaufenden Seitenlagern lohnt bei dieser Menge nicht.
  new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength).setUint16(34, numGlyphs)
  return hhea
}

function buildHmtx(font: TrueTypeFont, ordered: number[]): Uint8Array {
  const original = tableBytes(font.bytes, font.tables, 'hmtx')
  const originalView = new DataView(original.buffer, original.byteOffset, original.byteLength)
  const hhea = tableBytes(font.bytes, font.tables, 'hhea')
  const numberOfHMetrics = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength).getUint16(34)

  const bytes = new Uint8Array(ordered.length * 4)
  const view = new DataView(bytes.buffer)
  ordered.forEach((glyphId, index) => {
    view.setUint16(index * 4, font.advance(glyphId))
    // Das Seitenlager steht für die ersten `numberOfHMetrics` Glyphen im
    // langen Eintrag, danach in einem eigenen Feld hinter der Tabelle.
    const bearing =
      glyphId < numberOfHMetrics
        ? originalView.getInt16(glyphId * 4 + 2)
        : readTrailingBearing(originalView, numberOfHMetrics, glyphId)
    view.setInt16(index * 4 + 2, bearing)
  })
  return bytes
}

function readTrailingBearing(view: DataView, numberOfHMetrics: number, glyphId: number): number {
  const at = numberOfHMetrics * 4 + (glyphId - numberOfHMetrics) * 2
  return at + 1 < view.byteLength ? view.getInt16(at) : 0
}

function buildMaxp(font: TrueTypeFont, numGlyphs: number): Uint8Array {
  const maxp = tableBytes(font.bytes, font.tables, 'maxp').slice()
  // Die übrigen Felder sind Obergrenzen (größte Punktzahl, tiefste
  // Verschachtelung …). Sie zu übernehmen ist zulässig und richtig: Die
  // Auswahl kann keine Glyphe enthalten, die aufwendiger wäre als das
  // Original erlaubte.
  new DataView(maxp.buffer, maxp.byteOffset, maxp.byteLength).setUint16(4, numGlyphs)
  return maxp
}

/**
 * Eine `cmap` über die tatsächlich benutzten Zeichen.
 *
 * Im PDF wird über Glyphennummern zugegriffen (`Identity-H`), der Betrachter
 * braucht sie also zum Setzen nicht. Sie bleibt trotzdem drin: Wer die Datei
 * aus dem PDF herauslöst — etwa ein Bewerbungsportal, das den Text
 * durchsucht — findet sonst eine Schrift ohne jede Zuordnung vor.
 */
function buildCmap(
  usedGlyphs: ReadonlyMap<number, number>,
  glyphIds: ReadonlyMap<number, number>,
): Uint8Array {
  const entries: { code: number; glyph: number }[] = []
  for (const [original, codePoint] of usedGlyphs) {
    const glyph = glyphIds.get(original)
    if (glyph === undefined || codePoint > 0xffff) continue
    entries.push({ code: codePoint, glyph })
  }
  entries.sort((a, b) => a.code - b.code)

  const segments: { start: number; end: number; startGlyph: number }[] = []
  for (const entry of entries) {
    const last = segments[segments.length - 1]
    if (last && entry.code === last.end + 1 && entry.glyph === last.startGlyph + (entry.code - last.start)) {
      last.end = entry.code
    } else {
      segments.push({ start: entry.code, end: entry.code, startGlyph: entry.glyph })
    }
  }
  // Der Abschluss, den das Format verlangt: ein Segment auf 0xFFFF. Es muss
  // auf Glyphe 0 zeigen — zeigte es auf 0xFFFF, stünde dort eine
  // Glyphennummer, die es in der Datei nicht gibt, und strenge Prüfer
  // (der Schriftprüfer der Browser) verwerfen die ganze Schrift.
  segments.push({ start: 0xffff, end: 0xffff, startGlyph: 0 })

  const segCount = segments.length
  const subtableLength = 16 + segCount * 8
  const bytes = new Uint8Array(12 + subtableLength)
  const view = new DataView(bytes.buffer)

  view.setUint16(2, 1) // eine Untertabelle
  view.setUint16(4, 3) // Plattform Windows
  view.setUint16(6, 1) // Kodierung Unicode, Grundebene
  view.setUint32(8, 12)

  const table = 12
  view.setUint16(table, 4)
  view.setUint16(table + 2, subtableLength)
  view.setUint16(table + 6, segCount * 2)
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount))
  view.setUint16(table + 8, searchRange)
  view.setUint16(table + 10, Math.log2(searchRange / 2))
  view.setUint16(table + 12, segCount * 2 - searchRange)

  const endCodes = table + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  segments.forEach((segment, index) => {
    view.setUint16(endCodes + index * 2, segment.end)
    view.setUint16(startCodes + index * 2, segment.start)
    // Auf 16 Bit mit Vorzeichen zurechtgestutzt: Der Delta-Wert darf
    // überlaufen, gerechnet wird ohnehin modulo 65536.
    view.setInt16(idDeltas + index * 2, ((segment.startGlyph - segment.start) << 16) >> 16)
  })

  return bytes
}

/** Die Prüfsumme einer Tabelle: die Summe ihrer 32-Bit-Wörter. */
function checksum(bytes: Uint8Array): number {
  let sum = 0
  const padded = (bytes.length + 3) & ~3
  for (let at = 0; at < padded; at += 4) {
    const word =
      ((bytes[at] ?? 0) << 24) |
      ((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0)
    sum = (sum + (word >>> 0)) >>> 0
  }
  return sum
}

/** Setzt die Datei aus den Tabellen zusammen, mit gültigem Verzeichnis. */
function assemble(tables: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort()
  const numTables = tags.length
  const searchRange = 16 * 2 ** Math.floor(Math.log2(numTables))

  let offset = 12 + numTables * 16
  const placed = tags.map((tag) => {
    const bytes = tables.get(tag) as Uint8Array
    const entry = { tag, bytes, offset }
    offset += (bytes.length + 3) & ~3
    return entry
  })

  const file = new Uint8Array(offset)
  const view = new DataView(file.buffer)
  view.setUint32(0, 0x00010000) // sfnt-Fassung: Umrisse im TrueType-Format
  view.setUint16(4, numTables)
  view.setUint16(6, searchRange)
  view.setUint16(8, Math.log2(searchRange / 16))
  view.setUint16(10, numTables * 16 - searchRange)

  placed.forEach((entry, index) => {
    const record = 12 + index * 16
    for (let character = 0; character < 4; character += 1) {
      view.setUint8(record + character, entry.tag.charCodeAt(character))
    }
    view.setUint32(record + 4, checksum(entry.bytes))
    view.setUint32(record + 8, entry.offset)
    view.setUint32(record + 12, entry.bytes.length)
    file.set(entry.bytes, entry.offset)
  })

  // `checkSumAdjustment` wird über die fertige Datei gebildet und muss
  // deshalb zuletzt gesetzt werden — mit sich selbst auf null gerechnet.
  const head = placed.find((entry) => entry.tag === 'head')
  if (head) {
    view.setUint32(head.offset + 8, 0)
    view.setUint32(head.offset + 8, (0xb1b0afba - checksum(file)) >>> 0)
  }
  return file
}
