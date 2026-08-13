/**
 * Liest aus einer TrueType-Datei genau das, was der PDF-Export braucht:
 * die Zuordnung Zeichen → Glyphe, die Vorschubbreiten für den Zeilenumbruch
 * und die Kennzahlen für den `/FontDescriptor` im PDF.
 *
 * **Warum überhaupt selbst gelesen wird.** Der Zeilenumbruch muss vor dem
 * Schreiben feststehen, und dafür braucht er die Breite jedes Zeichens in
 * genau der Schrift, die später eingebettet wird. Der Browser könnte das
 * über `canvas.measureText` beantworten — aber nur für Schriften, die er
 * selbst geladen hat, und mit Rundungen auf Bildschirmpixel. Die Zahlen aus
 * der Datei sind exakt und dieselben, mit denen Word rechnet.
 *
 * **Was bewusst fehlt.** Keine Ersetzungen (`GSUB`), keine Unterschneidung
 * (`GPOS`/`kern`), keine Ligaturen. Word wendet sie in einem Anschreiben
 * standardmäßig ebenfalls nicht an; sie hier nachzubauen brächte
 * Abweichungen statt Treue.
 *
 * Die mitgelieferten Dateien liegen in `public/fonts/pdf/` und sind mit
 * `scripts/build-pdf-fonts.mjs` vorbereitet — siehe dort, warum.
 */

/** Ein Eintrag der Tabellenverzeichnisses einer TrueType-Datei. */
export interface TableRecord {
  offset: number
  length: number
}

/**
 * Die Kennzahlen, die der `/FontDescriptor` eines eingebetteten PDF-Zeichensatzes
 * verlangt — alle in Font-Einheiten, die Umrechnung auf die im PDF üblichen
 * 1000 Einheiten je Geviert macht der Schreiber.
 */
export interface FontMetrics {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
  capHeight: number
  italicAngle: number
  bbox: readonly [number, number, number, number]
  /** `/Flags` des Zeichensatzes: fest, Serifen, kursiv, nicht symbolisch. */
  flags: number
  /** Strichstärke. Steht in keiner Tabelle und wird aus der Schriftstärke geschätzt. */
  stemV: number
  fixedPitch: boolean
}

export interface TrueTypeFont {
  /** Die vollständige Datei, wie sie geladen wurde. */
  readonly bytes: Uint8Array
  readonly tables: ReadonlyMap<string, TableRecord>
  readonly numGlyphs: number
  readonly metrics: FontMetrics
  /** Glyphennummer eines Zeichens; `0` heißt „kennt die Schrift nicht". */
  glyphId(codePoint: number): number
  /** Vorschubbreite einer Glyphe in Font-Einheiten. */
  advance(glyphId: number): number
  /** Anfang und Ende der Umrissdaten einer Glyphe in `glyf`. */
  glyphRange(glyphId: number): readonly [number, number]
}

const MISSING_GLYPH = 0

export function readTrueType(bytes: Uint8Array): TrueTypeFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tables = readTableDirectory(view)

  const head = tableView(bytes, tables, 'head')
  const hhea = tableView(bytes, tables, 'hhea')
  const maxp = tableView(bytes, tables, 'maxp')

  const unitsPerEm = head.getUint16(18)
  const numGlyphs = maxp.getUint16(4)
  const numberOfHMetrics = hhea.getUint16(34)
  const longLoca = head.getInt16(50) === 1

  const hmtx = tableView(bytes, tables, 'hmtx')
  const loca = readLoca(bytes, tables, numGlyphs, longLoca)
  const cmap = readCharacterMap(bytes, tables)
  const metrics = readMetrics(bytes, tables, head, hhea, unitsPerEm)

  const lastAdvance = numberOfHMetrics > 0 ? hmtx.getUint16((numberOfHMetrics - 1) * 4) : 0

  return {
    bytes,
    tables,
    numGlyphs,
    metrics,
    glyphId: (codePoint) => cmap.get(codePoint) ?? MISSING_GLYPH,
    // Jenseits von `numberOfHMetrics` führt `hmtx` nur noch die
    // Seitenlager; die Breite ist dann für alle die des letzten Eintrags.
    // So speichern Schriften mit vielen gleich breiten Glyphen (etwa
    // Schreibmaschinenschriften) ihre Tabelle platzsparend.
    advance: (glyphId) =>
      glyphId < numberOfHMetrics ? hmtx.getUint16(glyphId * 4) : lastAdvance,
    glyphRange: (glyphId) =>
      glyphId + 1 < loca.length ? [loca[glyphId], loca[glyphId + 1]] : [0, 0],
  }
}

export function readTableDirectory(view: DataView): Map<string, TableRecord> {
  const numTables = view.getUint16(4)
  const tables = new Map<string, TableRecord>()
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

export function tableBytes(
  bytes: Uint8Array,
  tables: ReadonlyMap<string, TableRecord>,
  tag: string,
): Uint8Array {
  const record = tables.get(tag)
  if (!record) throw new Error(`Die Schriftdatei hat keine Tabelle "${tag}".`)
  return bytes.subarray(record.offset, record.offset + record.length)
}

function tableView(
  bytes: Uint8Array,
  tables: ReadonlyMap<string, TableRecord>,
  tag: string,
): DataView {
  const table = tableBytes(bytes, tables, tag)
  return new DataView(table.buffer, table.byteOffset, table.byteLength)
}

/**
 * `loca` als Feld von Byte-Offsets in `glyf`, mit einem Eintrag mehr als es
 * Glyphen gibt: Der letzte markiert das Ende der letzten Glyphe.
 */
function readLoca(
  bytes: Uint8Array,
  tables: ReadonlyMap<string, TableRecord>,
  numGlyphs: number,
  longFormat: boolean,
): Uint32Array {
  const view = tableView(bytes, tables, 'loca')
  const offsets = new Uint32Array(numGlyphs + 1)
  for (let index = 0; index <= numGlyphs; index += 1) {
    // Das kurze Format speichert den halben Offset — daher die Verdopplung.
    offsets[index] = longFormat ? view.getUint32(index * 4) : view.getUint16(index * 2) * 2
  }
  return offsets
}

/**
 * Die Unicode-Zuordnung aus `cmap`. Format 12 wird bevorzugt (es reicht über
 * die Grundebene hinaus), sonst Format 4. Die mitgelieferten Dateien tragen
 * nach der Vorbereitung genau eine Untertabelle im Format 4.
 */
function readCharacterMap(
  bytes: Uint8Array,
  tables: ReadonlyMap<string, TableRecord>,
): Map<number, number> {
  const view = tableView(bytes, tables, 'cmap')
  const numSubtables = view.getUint16(2)

  let chosen: { offset: number; format: number } | null = null
  for (let index = 0; index < numSubtables; index += 1) {
    const record = 4 + index * 8
    const platform = view.getUint16(record)
    const encoding = view.getUint16(record + 2)
    const offset = view.getUint32(record + 4)
    const isUnicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
    if (!isUnicode) continue
    const format = view.getUint16(offset)
    if (format !== 4 && format !== 12) continue
    if (chosen === null || (format === 12 && chosen.format !== 12)) chosen = { offset, format }
  }
  if (chosen === null) throw new Error('Die Schriftdatei hat keine lesbare Unicode-cmap.')

  return chosen.format === 12
    ? readCmapFormat12(view, chosen.offset)
    : readCmapFormat4(view, chosen.offset)
}

function readCmapFormat12(view: DataView, offset: number): Map<number, number> {
  const map = new Map<number, number>()
  const groups = view.getUint32(offset + 12)
  for (let index = 0; index < groups; index += 1) {
    const group = offset + 16 + index * 12
    const start = view.getUint32(group)
    const end = view.getUint32(group + 4)
    const startGlyph = view.getUint32(group + 8)
    for (let code = start; code <= end; code += 1) map.set(code, startGlyph + (code - start))
  }
  return map
}

function readCmapFormat4(view: DataView, offset: number): Map<number, number> {
  const map = new Map<number, number>()
  const segCount = view.getUint16(offset + 6) / 2
  const endCodes = offset + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2

  for (let segment = 0; segment < segCount; segment += 1) {
    const end = view.getUint16(endCodes + segment * 2)
    const start = view.getUint16(startCodes + segment * 2)
    if (start === 0xffff) continue
    const delta = view.getInt16(idDeltas + segment * 2)
    const rangeOffset = view.getUint16(idRangeOffsets + segment * 2)

    for (let code = start; code <= end; code += 1) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        // Die Sonderbarkeit des Formats: `idRangeOffset` zählt vom Ort des
        // Eintrags selbst, nicht vom Anfang der Tabelle.
        const at = idRangeOffsets + segment * 2 + rangeOffset + (code - start) * 2
        if (at + 1 >= view.byteLength) continue
        glyph = view.getUint16(at)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== MISSING_GLYPH) map.set(code, glyph)
    }
  }
  return map
}

function readMetrics(
  bytes: Uint8Array,
  tables: ReadonlyMap<string, TableRecord>,
  head: DataView,
  hhea: DataView,
  unitsPerEm: number,
): FontMetrics {
  const os2 = tables.has('OS/2') ? tableView(bytes, tables, 'OS/2') : null
  const post = tables.has('post') ? tableView(bytes, tables, 'post') : null

  const macStyle = head.getUint16(44)
  const italicFromHead = (macStyle & 0x0002) !== 0
  // `italicAngle` steht als Festkommazahl mit 16 Nachkommastellen in `post`.
  const italicAngle = post ? post.getInt32(4) / 65536 : 0

  const weightClass = os2 ? os2.getUint16(4) : 400
  const os2Version = os2 ? os2.getUint16(0) : 0
  // `sCapHeight` gibt es erst ab Fassung 2. Fehlt es, ist die Höhe eines
  // Großbuchstabens rund 70 % des Gevierts — die Zahl geht im PDF nur in den
  // Descriptor ein, kein Betrachter setzt danach um.
  const capHeight =
    os2 && os2Version >= 2 && os2.byteLength >= 90 ? os2.getInt16(88) : Math.round(unitsPerEm * 0.7)

  const isSerif = tables.has('post') && detectSerif(bytes, tables)
  const fixedPitch = post ? post.getUint32(12) !== 0 : false

  let flags = 0
  if (fixedPitch) flags |= 1 // FixedPitch
  if (isSerif) flags |= 2 // Serif
  flags |= 32 // Nonsymbolic: der Zeichensatz folgt einer Standardkodierung
  if (italicFromHead || italicAngle !== 0) flags |= 64 // Italic

  return {
    unitsPerEm,
    ascent: hhea.getInt16(4),
    descent: hhea.getInt16(6),
    lineGap: hhea.getInt16(8),
    capHeight,
    italicAngle,
    bbox: [head.getInt16(36), head.getInt16(38), head.getInt16(40), head.getInt16(42)],
    flags,
    // Es gibt keine Tabelle, die die Strichstärke nennt. Die verbreitete
    // Näherung leitet sie aus der Schriftstärke ab; Betrachter benutzen den
    // Wert nur, wenn die Schrift **nicht** eingebettet ist — hier ist sie es
    // immer, der Eintrag ist also Formsache.
    stemV: Math.round(50 + (weightClass / 65) ** 2),
    fixedPitch,
  }
}

/**
 * Ob die Schrift Serifen hat, verrät die `PANOSE`-Kennung in `OS/2`: Ihre
 * zweite Stelle (Serifenart) liegt bei serifenlosen Schriften bei 11 bis 13.
 */
function detectSerif(bytes: Uint8Array, tables: ReadonlyMap<string, TableRecord>): boolean {
  if (!tables.has('OS/2')) return false
  const os2 = tableBytes(bytes, tables, 'OS/2')
  if (os2.byteLength < 42) return false
  const serifStyle = os2[33]
  if (serifStyle === 0) return false // „keine Angabe"
  return serifStyle < 11
}
