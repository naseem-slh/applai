import type { DocxDocument } from '@/lib/docx/model'
import { replaceRange } from '@/lib/docx/replace'
import type { Letterhead } from '@/lib/domain/letterhead'
import { matchLetterhead, type LetterheadField } from '@/lib/domain/letterheadMatch'
import { shiftMarks, type Mark } from './marks'

/**
 * Die selbsttätige Übernahme des Briefkopfs — die Brücke zwischen der reinen
 * Erkennung (`letterheadMatch.ts`, Frage **wo**) und dem ebenso reinen
 * Vorschlag (`letterhead.ts`, Frage **was**).
 *
 * Fünf Regeln, in dieser Reihenfolge:
 *
 * 1. **Leere Neuwerte werden übersprungen.** `suggestLetterhead` gibt
 *    `recipient: ''` zurück, wenn die Firma in der Anzeige fehlt — ohne
 *    diese Regel würde ein leerer Vorschlag den alten Adressblock löschen.
 *    Die wichtigste Einzelregel dieses Moduls.
 * 2. **Bereits richtige Felder werden übersprungen.** Ist der alte Wortlaut
 *    schon zeichengleich mit dem neuen (seit die Anrede immer ein Komma
 *    trägt, ist das bei „Sehr geehrte Damen und Herren," der Regelfall),
 *    gäbe eine Ersetzung nur einen Verlaufsschritt und einen Bericht
 *    „X → X" für nichts. Das Feld ist trotzdem GEFUNDEN worden — es gehört
 *    deshalb nicht nach `missing` (das hieße „nicht gefunden"), sondern in
 *    die eigens dafür vorgesehene Kategorie `unchanged`, damit der Bericht
 *    ehrlich zwischen „nicht gefunden" und „gefunden, aber schon richtig"
 *    unterscheidet.
 * 3. **Ersetzt wird von hinten nach vorn.** Jede Ersetzung verschiebt die
 *    Offsets alles Nachfolgenden; von hinten begonnen bleiben die noch
 *    offenen Treffer gültig.
 * 4. **Vormerkungen werden mitgeführt.** Beim Laden eines Entwurfs mit
 *    `keepMarks` können bereits welche liegen.
 * 5. **Alles oder nichts.** Wirft eine Ersetzung, wird der ganze Stapel
 *    verworfen und das übergebene Dokument unverändert zurückgegeben. Ein
 *    halb angewandter Briefkopf entsteht nie.
 */

export interface LetterheadChange {
  field: LetterheadField
  paragraph: number
  previous: string
  next: string
}

export interface LetterheadApplication {
  document: DocxDocument
  marks: readonly Mark[]
  changes: LetterheadChange[]
  /** Nicht übernommene Felder — gleich ob nicht gefunden oder ohne Neuwert. */
  missing: LetterheadField[]
  /**
   * Gefundene Felder, deren alter Wortlaut bereits zeichengleich mit dem
   * Vorschlag war — nicht ersetzt, weil nichts zu ersetzen war. Weder
   * `changes` (nichts hat sich geändert) noch `missing` (es fehlt nichts).
   */
  unchanged: LetterheadField[]
}

const ALL_FIELDS: readonly LetterheadField[] = ['recipient', 'date', 'subject', 'salutation']

export function applyLetterhead(
  docx: DocxDocument,
  letterhead: Letterhead,
  marks: readonly Mark[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadApplication {
  const found = matchLetterhead(docx.paragraphs, knownCompanies, currentCompany)
    .filter((match) => letterhead[match.field].trim() !== '')
    // Schaden 1, Riegel: `replaceRange` behandelt `range.from === range.to`
    // als reine Einfügestelle statt als Ersetzung — der neue Text würde
    // eingefügt, die alte Zeile bliebe zusätzlich stehen (neue und alte
    // Anrede untereinander im Brief). Die eigentliche Behebung sitzt in
    // `wholeParagraph` (`letterheadMatch.ts`), das seither die erste
    // NICHT-LEERE Zeile wählt; dieser Riegel ist die Rückversicherung,
    // falls die Erkennung dennoch einmal einen leeren Bereich liefert. Ein
    // so übersprungenes Feld gilt als nicht sicher gefunden und fällt
    // zurück auf `missing` (Hand-Einsetzen bleibt der sichere Weg).
    .filter((match) => match.range.from !== match.range.to)
  const missing = ALL_FIELDS.filter((field) => !found.some((match) => match.field === field))

  const notFound: LetterheadApplication = {
    document: docx,
    marks,
    changes: [],
    missing: [...ALL_FIELDS],
    unchanged: [],
  }
  if (found.length === 0) return notFound

  // Regel 2: Treffer, deren alter Wortlaut bereits zeichengleich mit dem
  // Vorschlag ist, werden nicht ersetzt.
  const unchanged = found.filter((match) => match.previous === letterhead[match.field])
  const matches = found.filter((match) => match.previous !== letterhead[match.field])
  const unchangedFields = unchanged.map((match) => match.field)

  if (matches.length === 0) {
    // Alle gefundenen Felder waren schon richtig — nichts zu ersetzen, aber
    // eben nicht „nicht gefunden".
    return { document: docx, marks, changes: [], missing, unchanged: unchangedFields }
  }

  try {
    let document = docx
    let moved = marks
    // Von hinten nach vorn, damit die Offsets der offenen Treffer gültig bleiben.
    for (const match of [...matches].sort((a, b) => b.range.from - a.range.from)) {
      const next = letterhead[match.field]
      const replaced = replaceRange(document, match.range, next)
      moved = shiftMarks(moved, match.range, next.length, replaced.text)
      document = replaced
    }

    return {
      document,
      marks: moved,
      changes: matches.map((match) => ({
        field: match.field,
        paragraph: match.paragraph,
        previous: match.previous,
        next: letterhead[match.field],
      })),
      missing,
      unchanged: unchangedFields,
    }
  } catch {
    // Alles oder nichts: Das übergebene Dokument bleibt, wie es war.
    return notFound
  }
}
