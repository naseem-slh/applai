#!/usr/bin/env node
/*
 * Bereitet die Schriften auf, die der PDF-Export in die erzeugte Datei
 * einbettet (`public/fonts/pdf/`).
 *
 * **Warum überhaupt eigene Schriftdateien.** Ein PDF zeigt nur, was es
 * mitbringt. Word setzt seine Briefe seit 2007 voreingestellt in Calibri,
 * daneben stehen Arial und Times New Roman — alle drei sind lizenziert und
 * dürfen hier nicht liegen. Es gibt aber metrikgleiche Nachbauten unter der
 * SIL Open Font License: gleiche Vorschubbreiten, gleiche Zeilenhöhen, nahezu
 * gleiche Formen. Damit bricht der Satz an denselben Stellen um wie in Word.
 *
 *   Calibri          → Carlito         (github.com/googlefonts/carlito)
 *   Arial            → Liberation Sans (github.com/liberationfonts)
 *   Times New Roman  → Liberation Serif
 *
 * **Warum sie hier durchlaufen und nicht einfach kopiert werden.** Die
 * Originaldateien sind 400 bis 800 kB groß, weil sie Kyrillisch, Griechisch,
 * Hinweise für die Bildschirmdarstellung, Ersetzungstabellen (`GSUB`/`GPOS`)
 * und die Namen aller Glyphen enthalten. Eingebettet landete das alles in
 * **jedem** erzeugten PDF — ein einseitiger Brief käme auf über ein halbes
 * Megabyte, verschickt an ein Bewerbungsportal mit Anhangsgrenze. Dieses
 * Skript wirft heraus, was ein Anschreiben nicht braucht.
 *
 * **Was es genau tut.** Es benennt keine Glyphen um. Ein echtes Subsetting
 * mit neuer Nummerierung müsste `cmap`, `hmtx`, zusammengesetzte Glyphen und
 * `maxp` konsistent umschreiben — viel Gelegenheit für stille Fehler. Statt
 * dessen bleiben alle Glyphennummern, wo sie sind; die Umrisse der nicht
 * benötigten werden schlicht geleert (`loca` bekommt dort die Länge null).
 * Das schrumpft `glyf`, die mit Abstand größte Tabelle, ohne irgendeinen
 * Verweis ungültig zu machen.
 *
 * **Die `cmap` wird trotzdem neu gebaut**, und zwar genau auf die behaltenen
 * Zeichen. Ohne das zeigte die Schrift für ein weggelassenes Zeichen
 * weiterhin auf eine jetzt leere Glyphe: Der Buchstabe verschwände spurlos
 * aus dem Brief. Mit der neuen `cmap` landet er auf Glyphe 0 (`.notdef`) —
 * sichtbar als Kasten, und für den Aufrufer als „diese Schrift kann das
 * Zeichen nicht" erkennbar, sodass er auf eine andere ausweichen kann.
 *
 * **Aufruf:**
 *
 *   node scripts/build-pdf-fonts.mjs <Quellverzeichnis>
 *
 * Das Quellverzeichnis enthält die zwölf unveränderten `.ttf`-Dateien. Die
 * Ergebnisse sind eingecheckt; dieses Skript ist die Herkunftsangabe und der
 * Weg, sie nachzubauen, kein Schritt des gewöhnlichen Builds.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const OUTPUT_DIR = new URL('../public/fonts/pdf/', import.meta.url).pathname

/**
 * Die Zeichen, die in der Datei bleiben.
 *
 * Latin-1 und Latin Extended-A decken Deutsch, Englisch und die Sprachen ab,
 * aus denen die Namen der Bewerber kommen: polnisch (ł, ż), tschechisch (č,
 * ř), ungarisch (ő, ű), türkisch (ğ, ş, ı), rumänisch (ă, ș), skandinavisch,
 * baltisch. Griechisch und Kyrillisch sind dabei, weil ein Name in einem
 * deutschen Anschreiben durchaus in seiner eigenen Schrift stehen kann.
 * Vietnamesisch (Latin Extended Additional) ebenfalls — die Nachbauten führen
 * es teilweise, und was fehlt, fällt hier ohnehin heraus.
 */
const KEPT_RANGES = [
  [0x0020, 0x007e], // ASCII
  [0x00a0, 0x00ff], // Latin-1 Supplement: ä ö ü ß é à …
  [0x0100, 0x017f], // Latin Extended-A
  [0x0180, 0x024f], // Latin Extended-B
  [0x02b0, 0x02ff], // Modifier Letters (ʼ in manchen Namen)
  [0x0300, 0x036f], // kombinierende Zeichen
  [0x0370, 0x03ff], // Griechisch
  [0x0400, 0x04ff], // Kyrillisch
  [0x1e00, 0x1eff], // Latin Extended Additional (vietnamesisch)
  [0x2000, 0x206f], // Interpunktion: – — „ " … •
  [0x20a0, 0x20bf], // Währungszeichen inkl. €
  [0x2100, 0x214f], // ℅ № ™
  [0x2190, 0x2193], // Pfeile
  [0x2212, 0x2212], // Minus
  [0x25a0, 0x25cf], // Aufzählungszeichen ■ ▪ ●
  [0xfb00, 0xfb06], // Ligaturen ﬀ ﬁ ﬂ
]

/**
 * Tabellen, die in die Ausgabe übernommen werden.
 *
 * Für eine in ein PDF eingebettete `CIDFontType2` verlangt die Spezifikation
 * `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp` und `cmap`. `OS/2` liefert
 * die Werte des `/FontDescriptor`. Die drei Hinweistabellen (`cvt `, `fpgm`,
 * `prep`) bleiben, weil Betrachter sie für die Darstellung in kleinen Graden
 * benutzen und sie zusammen nur wenige Kilobyte wiegen. `name` bleibt, damit
 * die Datei identifizierbar bleibt.
 *
 * Nicht übernommen und deshalb hier nicht aufgeführt: `GSUB`, `GPOS`, `GDEF`
 * (Ersetzung und Positionierung — im PDF wird nicht umgeformt, dort stehen
 * schon fertige Glyphennummern), `DSIG` (Signatur, nach jeder Änderung
 * ohnehin ungültig), `kern`, `hdmx`, `LTSH`, `VDMX`, `gasp` (Bildschirmwerte)
 * und `post` in seiner alten Form (siehe `buildPostV3`).
 */
const KEPT_TABLES = new Set([
  'cmap',
  'cvt ',
  'fpgm',
  'glyf',
  'head',
  'hhea',
  'hmtx',
  'loca',
  'maxp',
  'name',
  'OS/2',
  'prep',
])

function readTableDirectory(view) {
  const numTables = view.getUint16(4)
  const tables = new Map()
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    )
    tables.set(tag, { offset: view.getUint32(record + 8), length: view.getUint32(record + 12) })
  }
  return tables
}

function tableBytes(bytes, tables, tag) {
  const entry = tables.get(tag)
  if (!entry) throw new Error(`Tabelle "${tag}" fehlt.`)
  return bytes.subarray(entry.offset, entry.offset + entry.length)
}

/** Die `loca`-Tabelle als Feld von Byte-Offsets in `glyf`. */
function readLoca(bytes, tables, numGlyphs, longFormat) {
  const raw = tableBytes(bytes, tables, 'loca')
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const offsets = new Array(numGlyphs + 1)
  for (let index = 0; index <= numGlyphs; index += 1) {
    // Im kurzen Format steht der halbe Offset — deshalb die Verdopplung.
    offsets[index] = longFormat ? view.getUint32(index * 4) : view.getUint16(index * 2) * 2
  }
  return offsets
}

/**
 * Liest die beste Unicode-Zuordnung aus `cmap`: Format 12 (alle Ebenen) wenn
 * vorhanden, sonst Format 4 (nur die Grundebene). Andere Formate kommen in
 * den drei Nachbauten nicht vor.
 */
function readCmap(bytes, tables) {
  const raw = tableBytes(bytes, tables, 'cmap')
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const numSubtables = view.getUint16(2)

  let best = null
  for (let index = 0; index < numSubtables; index += 1) {
    const record = 4 + index * 8
    const platform = view.getUint16(record)
    const encoding = view.getUint16(record + 2)
    const offset = view.getUint32(record + 4)
    const format = view.getUint16(offset)
    const unicode =
      (platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0
    if (!unicode) continue
    if (best === null || (format === 12 && best.format !== 12)) best = { offset, format }
  }
  if (best === null) throw new Error('Keine brauchbare Unicode-cmap gefunden.')

  const map = new Map()
  if (best.format === 12) {
    const groups = view.getUint32(best.offset + 12)
    for (let index = 0; index < groups; index += 1) {
      const group = best.offset + 16 + index * 12
      const start = view.getUint32(group)
      const end = view.getUint32(group + 4)
      const startGlyph = view.getUint32(group + 8)
      for (let code = start; code <= end; code += 1) map.set(code, startGlyph + (code - start))
    }
    return map
  }

  const segCount = view.getUint16(best.offset + 6) / 2
  const endCodes = best.offset + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2
  for (let segment = 0; segment < segCount; segment += 1) {
    const end = view.getUint16(endCodes + segment * 2)
    const start = view.getUint16(startCodes + segment * 2)
    const delta = view.getInt16(idDeltas + segment * 2)
    const rangeOffset = view.getUint16(idRangeOffsets + segment * 2)
    if (start === 0xffff) continue
    for (let code = start; code <= end; code += 1) {
      let glyph
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        const at = idRangeOffsets + segment * 2 + rangeOffset + (code - start) * 2
        if (at + 1 >= raw.byteLength) continue
        glyph = view.getUint16(at)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) map.set(code, glyph)
    }
  }
  return map
}

/**
 * Zusammengesetzte Glyphen (z. B. „ä" aus „a" und dem Trema) verweisen auf
 * andere Glyphennummern. Wer die behalten will, muss die Bestandteile
 * mitbehalten — und deren Bestandteile, deshalb rekursiv.
 */
function addComponents(glyf, offsets, glyph, keep) {
  const start = offsets[glyph]
  const end = offsets[glyph + 1]
  if (end <= start) return
  const view = new DataView(glyf.buffer, glyf.byteOffset + start, end - start)
  if (view.getInt16(0) >= 0) return // einfache Glyphe, keine Verweise

  const MORE_COMPONENTS = 0x0020
  let at = 10
  for (;;) {
    const flags = view.getUint16(at)
    const component = view.getUint16(at + 2)
    if (!keep.has(component)) {
      keep.add(component)
      addComponents(glyf, offsets, component, keep)
    }
    at += 4
    at += flags & 0x0001 ? 4 : 2 // ARG_1_AND_2_ARE_WORDS
    if (flags & 0x0008) at += 2 // WE_HAVE_A_SCALE
    else if (flags & 0x0040) at += 4 // WE_HAVE_AN_X_AND_Y_SCALE
    else if (flags & 0x0080) at += 8 // WE_HAVE_A_TWO_BY_TWO
    if (!(flags & MORE_COMPONENTS)) break
  }
}

/** Neue `glyf`- und `loca`-Tabelle: behaltene Umrisse bleiben, alle anderen werden leer. */
function rebuildGlyf(glyf, offsets, numGlyphs, keep) {
  const pieces = []
  const newOffsets = new Uint32Array(numGlyphs + 1)
  let position = 0
  for (let glyph = 0; glyph < numGlyphs; glyph += 1) {
    newOffsets[glyph] = position
    if (!keep.has(glyph)) continue
    const start = offsets[glyph]
    const end = offsets[glyph + 1]
    if (end <= start) continue
    // Auf ein Vielfaches von vier auffüllen, wie es die Spezifikation für
    // Glyphengrenzen empfiehlt.
    const padded = (end - start + 3) & ~3
    const piece = new Uint8Array(padded)
    piece.set(glyf.subarray(start, end))
    pieces.push(piece)
    position += padded
  }
  newOffsets[numGlyphs] = position

  const merged = new Uint8Array(position)
  let at = 0
  for (const piece of pieces) {
    merged.set(piece, at)
    at += piece.length
  }

  // Immer das lange `loca`-Format: Das kurze speichert halbe Offsets und
  // verlangt damit, dass jede Glyphe an einer geraden Adresse beginnt. Die
  // vier Byte je Glyphe sind bei rund 2500 Glyphen ein Kilobyte — der Preis
  // dafür, eine Fehlerquelle nicht zu haben.
  const loca = new Uint8Array((numGlyphs + 1) * 4)
  const locaView = new DataView(loca.buffer)
  for (let index = 0; index <= numGlyphs; index += 1) locaView.setUint32(index * 4, newOffsets[index])

  return { glyf: merged, loca }
}

/** Eine `cmap` mit genau einer Untertabelle im Format 4 über die behaltenen Zeichen. */
function buildCmap(mapping) {
  const codes = [...mapping.keys()].filter((code) => code <= 0xffff).sort((a, b) => a - b)

  // Zusammenhängende Läufe, in denen die Differenz zwischen Zeichen und
  // Glyphennummer gleich bleibt — genau das, was ein Format-4-Segment abbildet.
  const segments = []
  for (const code of codes) {
    const glyph = mapping.get(code)
    const last = segments[segments.length - 1]
    if (last && code === last.end + 1 && glyph === last.startGlyph + (code - last.start)) {
      last.end = code
    } else {
      segments.push({ start: code, end: code, startGlyph: glyph })
    }
  }
  // Der Abschluss, den das Format verlangt: ein Segment auf 0xFFFF. Es muss
  // auf Glyphe 0 zeigen — zeigte es auf 0xFFFF, stünde dort eine
  // Glyphennummer, die es in der Datei nicht gibt, und strenge Prüfer
  // (der Schriftprüfer der Browser) verwerfen die ganze Schrift.
  segments.push({ start: 0xffff, end: 0xffff, startGlyph: 0 })

  const segCount = segments.length
  const subtableLength = 16 + segCount * 8
  const bytes = new Uint8Array(4 + 8 + subtableLength)
  const view = new DataView(bytes.buffer)

  view.setUint16(0, 0) // Version
  view.setUint16(2, 1) // eine Untertabelle
  view.setUint16(4, 3) // Plattform Windows
  view.setUint16(6, 1) // Kodierung Unicode BMP
  view.setUint32(8, 12) // Offset der Untertabelle

  const table = 12
  view.setUint16(table, 4)
  view.setUint16(table + 2, subtableLength)
  view.setUint16(table + 4, 0) // Sprache
  view.setUint16(table + 6, segCount * 2)
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount))
  view.setUint16(table + 8, searchRange)
  view.setUint16(table + 10, Math.log2(searchRange / 2))
  view.setUint16(table + 12, segCount * 2 - searchRange)

  const endCodes = table + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2
  segments.forEach((segment, index) => {
    view.setUint16(endCodes + index * 2, segment.end)
    view.setUint16(startCodes + index * 2, segment.start)
    view.setInt16(idDeltas + index * 2, ((segment.startGlyph - segment.start) << 16) >> 16)
    view.setUint16(idRangeOffsets + index * 2, 0)
  })

  return bytes
}

/**
 * `post` in der Fassung 3.0: dieselben Kopfdaten, aber ohne die Namen der
 * Glyphen. Die Namen wiegen in Carlito über 30 kB und werden im PDF von
 * niemandem gelesen — dort wird über Glyphennummern adressiert.
 */
function buildPostV3(original) {
  const bytes = new Uint8Array(32)
  bytes.set(original.subarray(0, 32))
  new DataView(bytes.buffer).setUint32(0, 0x00030000)
  return bytes
}

/** Die Prüfsumme einer Tabelle: die Summe ihrer 32-Bit-Wörter. */
function checksum(bytes) {
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

/** Setzt die Datei aus den Tabellen neu zusammen, mit gültigen Prüfsummen. */
function assemble(tables) {
  const tags = [...tables.keys()].sort()
  const numTables = tags.length
  const searchRange = 16 * 2 ** Math.floor(Math.log2(numTables))

  let offset = 12 + numTables * 16
  const placed = tags.map((tag) => {
    const bytes = tables.get(tag)
    const entry = { tag, bytes, offset }
    offset += (bytes.length + 3) & ~3
    return entry
  })

  const file = new Uint8Array(offset)
  const view = new DataView(file.buffer)
  view.setUint32(0, 0x00010000)
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

  // `head.checkSumAdjustment` wird über die fertige Datei gebildet und muss
  // deshalb zuletzt gesetzt werden — mit sich selbst auf null gerechnet.
  const head = placed.find((entry) => entry.tag === 'head')
  view.setUint32(head.offset + 8, 0)
  view.setUint32(head.offset + 8, (0xb1b0afba - checksum(file)) >>> 0)
  return file
}

function trimFont(source) {
  const bytes = new Uint8Array(readFileSync(source))
  const view = new DataView(bytes.buffer)
  const tables = readTableDirectory(view)

  const head = tableBytes(bytes, tables, 'head')
  const longLoca = new DataView(head.buffer, head.byteOffset, head.byteLength).getInt16(50) === 1
  const maxp = tableBytes(bytes, tables, 'maxp')
  const numGlyphs = new DataView(maxp.buffer, maxp.byteOffset, maxp.byteLength).getUint16(4)

  const offsets = readLoca(bytes, tables, numGlyphs, longLoca)
  const glyf = tableBytes(bytes, tables, 'glyf')
  const cmap = readCmap(bytes, tables)

  const kept = new Map()
  const keepGlyphs = new Set([0])
  for (const [start, end] of KEPT_RANGES) {
    for (let code = start; code <= end; code += 1) {
      const glyph = cmap.get(code)
      if (glyph === undefined || glyph >= numGlyphs) continue
      kept.set(code, glyph)
      keepGlyphs.add(glyph)
    }
  }
  for (const glyph of [...keepGlyphs]) addComponents(glyf, offsets, glyph, keepGlyphs)

  const rebuilt = rebuildGlyf(glyf, offsets, numGlyphs, keepGlyphs)

  const output = new Map()
  for (const tag of tables.keys()) {
    if (!KEPT_TABLES.has(tag)) continue
    output.set(tag, tableBytes(bytes, tables, tag).slice())
  }
  output.set('glyf', rebuilt.glyf)
  output.set('loca', rebuilt.loca)
  output.set('cmap', buildCmap(kept))
  if (tables.has('post')) output.set('post', buildPostV3(tableBytes(bytes, tables, 'post')))

  // `head.indexToLocFormat` muss zum neu geschriebenen langen `loca` passen.
  const newHead = output.get('head')
  new DataView(newHead.buffer, newHead.byteOffset, newHead.byteLength).setInt16(50, 1)

  return { file: assemble(output), glyphs: keepGlyphs.size, characters: kept.size, numGlyphs }
}

const sourceDir = process.argv[2]
if (!sourceDir) {
  console.error('Aufruf: node scripts/build-pdf-fonts.mjs <Quellverzeichnis mit den .ttf-Dateien>')
  process.exit(1)
}

mkdirSync(OUTPUT_DIR, { recursive: true })
const sources = readdirSync(sourceDir)
  .filter((name) => name.toLowerCase().endsWith('.ttf'))
  .sort()

if (sources.length === 0) {
  console.error(`Keine .ttf-Dateien in "${sourceDir}".`)
  process.exit(1)
}

for (const name of sources) {
  const result = trimFont(join(sourceDir, name))
  writeFileSync(join(OUTPUT_DIR, basename(name)), result.file)
  const before = readFileSync(join(sourceDir, name)).length
  console.log(
    `${name.padEnd(28)} ${String(before).padStart(7)} → ${String(result.file.length).padStart(6)} Byte` +
      `  (${result.characters} Zeichen, ${result.glyphs} von ${result.numGlyphs} Glyphen)`,
  )
}
