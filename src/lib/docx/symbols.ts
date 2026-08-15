/**
 * Bildet die Zeichen der Symbolschriften auf gewöhnliches Unicode ab.
 *
 * **Warum das nötig ist.** Wingdings, Webdings und Symbol sind keine
 * Schriften im gewöhnlichen Sinn: Sie legen Bilder auf die Plätze der
 * Buchstaben. Word schreibt so ein Zeichen als `` — ein Zeichen aus dem
 * Privatbereich (`U+F09F`), das seine Bedeutung nur zusammen mit dem
 * Schriftnamen hat. Die Schriften selbst sind lizenziert und liegen hier
 * nicht (G2, G4). Ohne Übersetzung sucht der Satz `U+F09F` in Carlito,
 * findet nichts und setzt `.notdef` — im Brief ein leerer Kasten, und weil
 * `.notdef` eine eigene Breite hat, auch noch an der falschen Stelle.
 *
 * In echten Anschreiben steht so ein Zeichen fast immer als Trenner in der
 * Kontaktzeile: „Musterstraße 1  12345 Berlin  Mobil: …". Gemeint ist ein
 * Aufzählungspunkt, und den können die mitgelieferten Schriften zeichnen.
 *
 * **Warum die Tabellen so kurz sind.** Wingdings führt 221 Zeichen, aber
 * nur sechs davon haben eine Entsprechung, die Carlito oder Liberation
 * überhaupt zeichnen können — der Rest sind Hände, Wetterzeichen und
 * Sternbilder aus den oberen Unicode-Ebenen. Aufgenommen ist deshalb nur,
 * was auch ankommt; alles Übrige fällt auf den Aufzählungspunkt zurück.
 * Sichtbar und an der richtigen Stelle ist besser als ein leerer Kasten.
 */

/** Der Rückfall für ein Bildzeichen ohne zeichenbare Entsprechung. */
const BULLET = 0x2022

/**
 * Der Privatbereich, in den Word die Zeichen einer Symbolschrift legt.
 * `U+F09F` meint das Zeichen `0x9F` der jeweiligen Schrift.
 */
const PRIVATE_USE_BASE = 0xf000

/** Wingdings → Unicode. */
const WINGDINGS = new Map<number, number>([
  [0x6c, 0x25cf], // ● großer Punkt
  [0x6f, 0x25a1], // □ Kasten
  [0x9e, 0x00b7], // · Mittelpunkt
  [0x9f, 0x2022], // • Aufzählungspunkt
  [0xa0, 0x25aa], // ▪ kleines Quadrat
  [0xa7, 0x25aa], // ▪ kleines Quadrat
])

const WINGDINGS_2 = new Map<number, number>([
  [0x95, 0x2022], // •
  [0x96, 0x25cf], // ●
  [0xb8, 0x25ca], // ◊ Raute
])

const WINGDINGS_3 = new Map<number, number>([
  [0x66, 0x2190], // ←
  [0x67, 0x2192], // →
  [0x68, 0x2191], // ↑
  [0x69, 0x2193], // ↓
])

const WEBDINGS = new Map<number, number>([
  [0x63, 0x25a1], // □
  [0x7c, 0x007c], // |
])

/**
 * Symbol legt die lateinischen Buchstaben auf griechische — in einer eigenen
 * Reihenfolge, die sich nach dem Klang richtet (`c` → χ, `f` → φ). Deshalb
 * zwei Zeichenketten statt einer Rechnung.
 */
const SYMBOL_UPPER = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ'
const SYMBOL_LOWER = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ'

const SYMBOL_OTHER = new Map<number, number>([
  [0xa0, 0x20ac], // €
  [0xac, 0x2190], // ←
  [0xad, 0x2191], // ↑
  [0xae, 0x2192], // →
  [0xaf, 0x2193], // ↓
  [0xb0, 0x00b0], // °
  [0xb1, 0x00b1], // ±
  [0xb4, 0x00d7], // ×
  [0xb7, 0x2022], // •
  [0xb8, 0x00f7], // ÷
  [0xbc, 0x2026], // …
  [0xd7, 0x00d7], // ×
])

function symbolTable(): Map<number, number> {
  const table = new Map(SYMBOL_OTHER)
  for (const [index, character] of [...SYMBOL_UPPER].entries()) {
    table.set(0x41 + index, character.codePointAt(0) ?? BULLET)
  }
  for (const [index, character] of [...SYMBOL_LOWER].entries()) {
    table.set(0x61 + index, character.codePointAt(0) ?? BULLET)
  }
  return table
}

const SYMBOL = symbolTable()

interface SymbolFont {
  table: Map<number, number>
  /**
   * Ob nicht abgebildete ASCII-Zeichen stehen bleiben dürfen.
   *
   * Bei Symbol ja: Ziffern und Klammern sind dort, was sie überall sind.
   * Bei den Bildschriften nein — ein `l` steht in Wingdings für einen
   * Punkt, und es als Buchstaben zu setzen ergäbe im Brief Kauderwelsch.
   */
  keepAscii: boolean
}

const FONTS = new Map<string, SymbolFont>([
  ['wingdings', { table: WINGDINGS, keepAscii: false }],
  ['wingdings2', { table: WINGDINGS_2, keepAscii: false }],
  ['wingdings3', { table: WINGDINGS_3, keepAscii: false }],
  ['webdings', { table: WEBDINGS, keepAscii: false }],
  ['symbol', { table: SYMBOL, keepAscii: true }],
  ['symbolmt', { table: SYMBOL, keepAscii: true }],
])

/** Vergleichsform eines Schriftnamens — wie in `fonts.ts`. */
function normalize(fontFamily: string): string {
  return fontFamily.toLowerCase().replace(/[\s-]/g, '')
}

export function isSymbolFont(fontFamily: string): boolean {
  return FONTS.has(normalize(fontFamily))
}

/**
 * Das Zeichen, das statt `codePoint` gesetzt werden soll — oder `null`, wenn
 * die Schrift keine Symbolschrift ist und nichts zu übersetzen war.
 */
export function translateSymbol(fontFamily: string, codePoint: number): number | null {
  const font = FONTS.get(normalize(fontFamily))
  if (!font) return null

  // Leerraum und Steuerzeichen tragen in jeder Schrift dieselbe Bedeutung.
  if (codePoint <= 0x20) return codePoint

  const raw =
    codePoint >= PRIVATE_USE_BASE && codePoint <= PRIVATE_USE_BASE + 0xff
      ? codePoint - PRIVATE_USE_BASE
      : codePoint

  const mapped = font.table.get(raw)
  if (mapped !== undefined) return mapped
  if (font.keepAscii && raw >= 0x20 && raw <= 0x7e) return raw
  return BULLET
}

/** Dieselbe Übersetzung über eine ganze Zeichenkette. */
export function translateSymbolText(fontFamily: string, text: string): string {
  if (!isSymbolFont(fontFamily)) return text

  let translated = ''
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    translated += String.fromCodePoint(translateSymbol(fontFamily, codePoint) ?? codePoint)
  }
  return translated
}
