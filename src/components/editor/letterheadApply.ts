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
 * Vier Regeln, in dieser Reihenfolge:
 *
 * 1. **Leere Neuwerte werden übersprungen.** `suggestLetterhead` gibt
 *    `recipient: ''` zurück, wenn die Firma in der Anzeige fehlt — ohne
 *    diese Regel würde ein leerer Vorschlag den alten Adressblock löschen.
 *    Die wichtigste Einzelregel dieses Moduls.
 * 2. **Ersetzt wird von hinten nach vorn.** Jede Ersetzung verschiebt die
 *    Offsets alles Nachfolgenden; von hinten begonnen bleiben die noch
 *    offenen Treffer gültig.
 * 3. **Vormerkungen werden mitgeführt.** Beim Laden eines Entwurfs mit
 *    `keepMarks` können bereits welche liegen.
 * 4. **Alles oder nichts.** Wirft eine Ersetzung, wird der ganze Stapel
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
}

const ALL_FIELDS: readonly LetterheadField[] = ['recipient', 'date', 'subject', 'salutation']

export function applyLetterhead(
  docx: DocxDocument,
  letterhead: Letterhead,
  marks: readonly Mark[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadApplication {
  const matches = matchLetterhead(docx.paragraphs, knownCompanies, currentCompany).filter(
    (match) => letterhead[match.field].trim() !== '',
  )

  const unchanged: LetterheadApplication = {
    document: docx,
    marks,
    changes: [],
    missing: [...ALL_FIELDS],
  }
  if (matches.length === 0) return unchanged

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
      missing: ALL_FIELDS.filter((field) => !matches.some((match) => match.field === field)),
    }
  } catch {
    // Alles oder nichts: Das übergebene Dokument bleibt, wie es war.
    return unchanged
  }
}
