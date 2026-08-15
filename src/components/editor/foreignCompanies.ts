import type { DocxDocument } from '@/lib/docx/model'
import { findForeignCompanyNames } from '@/lib/domain/letterhead'
import { claimParagraphs } from './unbackedClaims'

/**
 * Die Fremdfirmen-Warnung, auf die Absätze des Dokuments abgebildet.
 *
 * `findForeignCompanyNames` (Aufgabe 12, ohne KI) liefert Name und
 * Zeichen-Offset im Text. Die Arbeitsfläche braucht daraus zweierlei: eine
 * Liste zum Lesen und die Absätze zum Hervorheben — dieselbe Aufteilung wie
 * bei den unbelegten Aussagen (Aufgabe 14b), und aus demselben Grund
 * dieselbe Lösung: Hervorgehoben wird der **Absatz**, nicht der Name im
 * Absatz. Eine Auszeichnung innerhalb des Absatztexts bräuchte ein
 * Zwischenelement, und das würde die Offset-Rechnung brechen, auf der
 * Markierung und Ersetzung beruhen (`documentSelection.ts`, Kopfkommentar).
 *
 * **Der klassische Kopierfehler**, den das abfängt: Eine frühere Bewerbung
 * diente als Vorlage, und der Name der früheren Firma blieb irgendwo stehen.
 * Deshalb ist die Fundstelle wichtiger als die Zahl — die Liste nennt den
 * Namen und den Absatz, der Text zeigt den Absatz.
 */

export interface ForeignCompanyHit {
  name: string
  /** Zeichen-Offset im Dokumenttext. */
  index: number
  /** Der Absatz, in dem der Name steht. `null`, wenn er in keinem liegt. */
  paragraph: number | null
}

export interface ForeignCompanies {
  hits: ForeignCompanyHit[]
  /** Absätze mit mindestens einem Treffer, für die Hervorhebung. */
  paragraphs: number[]
}

const EMPTY: ForeignCompanies = { hits: [], paragraphs: [] }

/**
 * Sucht die Firmennamen früherer Bewerbungen im aktuellen Dokumentstand.
 *
 * `currentCompany` fällt aus der Suchliste — sie ist per Definition keine
 * Fremdfirma, auch wenn sie in der Bewerbungsliste steht (das übernimmt
 * `findForeignCompanyNames`).
 *
 * Gesucht wird im **laufenden** Dokumenttext, nicht im hochgeladenen: Der
 * Nutzer soll die Warnung verschwinden sehen, sobald er den Namen
 * berichtigt hat, und sie zurückkommen sehen, wenn eine übernommene Variante
 * ihn wieder hineinschreibt.
 */
export function findForeignCompanies(
  docx: DocxDocument | null,
  currentCompany: string | null,
  knownCompanies: readonly string[],
): ForeignCompanies {
  if (docx === null || knownCompanies.length === 0) return EMPTY

  const found = findForeignCompanyNames(docx.text, currentCompany, [...knownCompanies])
  if (found.length === 0) return EMPTY

  const hits: ForeignCompanyHit[] = found.map((hit) => ({
    name: hit.name,
    index: hit.index,
    // Der Treffer ist eine Zeichenkette ab `index`; ein Bereich der Länge
    // des Namens trifft denselben Absatz wie sein erstes Zeichen und deckt
    // zugleich den seltenen Fall ab, dass der Name über eine Absatzgrenze
    // reicht.
    paragraph: claimParagraphs(docx, { from: hit.index, to: hit.index + hit.name.length })[0] ?? null,
  }))

  return {
    hits,
    paragraphs: [
      ...new Set(hits.map((hit) => hit.paragraph).filter((index): index is number => index !== null)),
    ].sort((a, b) => a - b),
  }
}
