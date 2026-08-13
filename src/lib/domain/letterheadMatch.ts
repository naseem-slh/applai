import { findWholeWordOccurrences } from '../text/wholeWord'

/**
 * Wo die vier Briefkopffelder im vorliegenden Brief heute stehen — die
 * Frage **wo**, nicht die Frage **was**. Was dort hinsoll, liefert
 * unverändert `suggestLetterhead` in `letterhead.ts`.
 *
 * `LetterheadPanel.tsx` begründet, warum der Briefkopf ursprünglich von Hand
 * eingesetzt wurde: Wer die Stelle automatisch sucht, rät, und wer beim
 * Raten danebenliegt, überschreibt eine falsche Zeile. Dieses Modul greift
 * die Begründung nicht an, sondern grenzt sie ein — es findet nur, was an
 * einer Formel erkennbar ist, und schweigt sonst. Ein Feld ohne Treffer
 * bleibt beim Einsetzen-Knopf.
 *
 * Die tragende Absicherung ist das **Suchfenster**: gesucht wird
 * ausschließlich oberhalb und einschließlich der Anrede. Ohne diese Grenze
 * könnte ein „Bewerbung" im Fließtext als Betreff durchgehen oder ein Datum
 * aus der Berufserfahrung als Briefdatum.
 */

export type LetterheadField = 'recipient' | 'date' | 'subject' | 'salutation'

/**
 * Die strukturelle Teilmenge von `Paragraph` (`src/lib/docx/model.ts`), die
 * diese Erkennung braucht. Bewusst nicht `Paragraph` selbst: So bleibt das
 * Modul frei von `docx`- und DOM-Typen und ohne Fixture testbar. Ein
 * `Paragraph` ist strukturell zuweisbar.
 */
export interface ParagraphSlice {
  index: number
  text: string
  start: number
  end: number
}

export interface LetterheadMatch {
  field: LetterheadField
  /** Bereich im Dokumenttext, Ende exklusiv. */
  range: { from: number; to: number }
  paragraph: number
  /** Was dort heute steht — für den Bericht „Alt → Neu". */
  previous: string
}

/**
 * Kleingeschrieben verglichen. „Sehr geehrte" ist Präfix von „Sehr
 * geehrter"; beide getrennt aufzuführen schadet nicht und macht die Liste
 * lesbar.
 */
const SALUTATION_OPENERS: readonly string[] = [
  'sehr geehrte',
  'sehr geehrter',
  'sehr geehrtes',
  'liebe',
  'lieber',
  'guten tag',
  'hallo',
  'dear',
  'to whom it may concern',
]

const SUBJECT_OPENERS: readonly string[] = ['bewerbung', 'betreff', 'application', 're:']

const MONTHS_DE = 'Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember'
const MONTHS_EN =
  'January|February|March|April|May|June|July|August|September|October|November|December'

/**
 * Die ausgeschriebenen Formen nennen die Monatsnamen ausdrücklich, statt
 * ein beliebiges Wort zwischen Zahlen zuzulassen — „12. Jahre 2026" ist
 * kein Datum.
 */
const DATE_PATTERNS: readonly RegExp[] = [
  /\d{1,2}\.\s?\d{1,2}\.\s?\d{4}/u,
  new RegExp(`\\d{1,2}\\.\\s?(?:${MONTHS_DE})\\s+\\d{4}`, 'u'),
  new RegExp(`(?:${MONTHS_EN})\\s+\\d{1,2},\\s?\\d{4}`, 'u'),
  /\d{4}-\d{2}-\d{2}/u,
]

/** Ohne erkannte Anrede gilt diese Zahl Absätze als Briefkopfbereich. */
const FALLBACK_WINDOW = 15

/** Bis hierhin darf die Anrede stehen; darunter ist sie Fließtext. */
const SALUTATION_WINDOW = 25

/**
 * Wie viel neben dem Datum im selben Absatz stehen darf. Ein Ortszusatz
 * („Berlin, ") passt, ein ganzer Satz mit einer Jahreszahl nicht.
 */
const DATE_CONTEXT_LIMIT = 40

const PRIORITY: readonly LetterheadField[] = ['salutation', 'date', 'subject', 'recipient']

/**
 * Nur die erste **inhaltliche** Zeile des Absatzes, nicht der ganze Absatz
 * und nicht zwingend die rein erste Zeile im rohen Sinn.
 *
 * `Paragraph.text` (`src/lib/docx/parse.ts`) trägt ein `\n` für jeden
 * manuellen Zeilenumbruch (`w:br`/`w:cr`) — ein Word-Absatz mit
 * Shift+Enter ist also EIN Absatz mit mehreren Zeilen, kein Absatz je
 * Zeile. Ohne diese Grenze reißt eine Ersetzung an dieser Stelle die
 * zweite Zeile mit: Ein Betreffblock „Bewerbung als
 * Disponentin⏎Ihre Anzeige vom 05.08.2026" ist ein einziger Absatz, und
 * `findSubject` träfe ihn als Ganzes — die Bezugszeile darunter verschwände
 * mit dem neuen Betreff. Dieselbe Form trägt eine Anrede mit angehängter
 * Leerzeile.
 *
 * **Schaden 1 (Regression der ersten Fixrunde).** Ein Absatz kann
 * umgekehrt auch MIT einem `\n` BEGINNEN — in Word der übliche
 * Shift+Enter-Abstand vor der Anrede. Die rein erste Zeile ist dann leer,
 * und „nimm die erste Zeile" lieferte `range.from === range.to`.
 * `replaceRange` behandelt einen leeren Bereich als reine EINFÜGESTELLE,
 * nicht als Ersetzung (siehe `docx/replace.ts`): Der neue Text würde
 * eingefügt, die alte Zeile bliebe zusätzlich stehen — neue und alte
 * Anrede stünden untereinander im Brief. Gesucht wird deshalb die erste
 * NICHT-LEERE Zeile (Leerraum, auch Tabulatoren, zählt als leer); gibt es
 * gar keine Zeilenumbrüche, ist das weiterhin die letzte (und einzige)
 * Zeile — der Regelfall bleibt der ganze Absatz.
 *
 * (Zusätzlich trägt `applyLetterhead` einen Riegel gegen einen dennoch
 * leeren Bereich — die Rückversicherung, nicht die Behebung selbst.)
 */
function wholeParagraph(field: LetterheadField, paragraph: ParagraphSlice): LetterheadMatch {
  const text = paragraph.text
  let lineStart = 0
  for (;;) {
    const newlineAt = text.indexOf('\n', lineStart)
    const lineEnd = newlineAt === -1 ? text.length : newlineAt
    const line = text.slice(lineStart, lineEnd)
    // Die letzte Zeile wird in jedem Fall genommen, auch wenn sie (gegen
    // die Erwartung des Aufrufers) selbst nur Leerraum trüge — `findSalutation`
    // und `findSubject` prüfen vorab, dass der Absatz als Ganzes nicht nur
    // aus Leerraum besteht, also gibt es immer eine inhaltliche Zeile.
    if (line.trim() !== '' || newlineAt === -1) {
      return {
        field,
        range: { from: paragraph.start + lineStart, to: paragraph.start + lineEnd },
        paragraph: paragraph.index,
        previous: line,
      }
    }
    lineStart = newlineAt + 1
  }
}

function findSalutation(paragraphs: readonly ParagraphSlice[]): LetterheadMatch | null {
  for (const paragraph of paragraphs.slice(0, SALUTATION_WINDOW)) {
    const lower = paragraph.text.trim().toLowerCase()
    if (lower === '') continue
    if (!SALUTATION_OPENERS.some((opener) => lower.startsWith(opener))) continue
    return wholeParagraph('salutation', paragraph)
  }
  return null
}

function findSubject(paragraphs: readonly ParagraphSlice[]): LetterheadMatch | null {
  for (const paragraph of paragraphs) {
    const lower = paragraph.text.trim().toLowerCase()
    if (lower === '') continue
    if (!SUBJECT_OPENERS.some((opener) => lower.startsWith(opener))) continue
    return wholeParagraph('subject', paragraph)
  }
  return null
}

/**
 * Ersetzt wird **nur die Datumsstelle**, nicht der Absatz: Ein Ortspräfix
 * wie „Berlin, " muss stehen bleiben.
 */
function findDate(paragraphs: readonly ParagraphSlice[]): LetterheadMatch | null {
  for (const paragraph of paragraphs) {
    for (const pattern of DATE_PATTERNS) {
      const found = pattern.exec(paragraph.text)
      if (found === null) continue
      if (paragraph.text.trim().length - found[0].length > DATE_CONTEXT_LIMIT) continue
      return {
        field: 'date',
        range: { from: paragraph.start + found.index, to: paragraph.start + found.index + found[0].length },
        paragraph: paragraph.index,
        previous: found[0],
      }
    }
  }
  return null
}

/**
 * Der Anker ist der Firmenname einer früheren Bewerbung — dieselbe Suche,
 * die auch die Fremdfirmen-Warnung benutzt. Ersetzt wird nur der Name, damit
 * eine mehrzeilige Anschrift nicht verschwindet. Dass Straße und
 * Postleitzahl der alten Firma dann stehen bleiben, ist beabsichtigt und für
 * den Nutzer sichtbar: Genau dafür gibt es den Bericht.
 *
 * Es gewinnt der **oberste** Absatz und darin das **erste** Vorkommen — die
 * Anschrift steht im Geschäftsbrief über allem anderen. Weitere Vorkommen
 * bleiben unangetastet; für sie ist die Fremdfirmen-Warnung zuständig.
 */
function findRecipient(
  paragraphs: readonly ParagraphSlice[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadMatch | null {
  const current = currentCompany === null ? null : currentCompany.trim().toLowerCase()

  for (const paragraph of paragraphs) {
    let best: LetterheadMatch | null = null
    for (const company of knownCompanies) {
      const trimmed = company.trim()
      if (trimmed === '') continue
      if (current !== null && trimmed.toLowerCase() === current) continue

      const hit = findWholeWordOccurrences(paragraph.text, trimmed, true)[0]
      if (hit === undefined) continue
      if (best !== null && paragraph.start + hit.index >= best.range.from) continue

      best = {
        field: 'recipient',
        range: { from: paragraph.start + hit.index, to: paragraph.start + hit.index + hit.length },
        paragraph: paragraph.index,
        previous: paragraph.text.slice(hit.index, hit.index + hit.length),
      }
    }
    if (best !== null) return best
  }
  return null
}

/**
 * Treffer dürfen sich nicht überlappen. Bei Konflikt gewinnt die
 * verlässlichere Regel — die Reihenfolge in {@link PRIORITY}. Der
 * unterlegene Treffer entfällt ersatzlos.
 */
function withoutOverlaps(matches: readonly LetterheadMatch[]): LetterheadMatch[] {
  const kept: LetterheadMatch[] = []
  for (const field of PRIORITY) {
    const match = matches.find((candidate) => candidate.field === field)
    if (match === undefined) continue
    const clashes = kept.some(
      (other) => other.range.from < match.range.to && other.range.to > match.range.from,
    )
    if (!clashes) kept.push(match)
  }
  return kept.sort((a, b) => a.range.from - b.range.from)
}

export function matchLetterhead(
  paragraphs: readonly ParagraphSlice[],
  knownCompanies: readonly string[],
  currentCompany: string | null,
): LetterheadMatch[] {
  const salutation = findSalutation(paragraphs)
  // Das Fenster für Empfänger, Datum und Betreff bleibt in jedem Fall auf
  // `FALLBACK_WINDOW` Absätze begrenzt — auch wenn die Anrede (dank des
  // weiteren `SALUTATION_WINDOW`) erst deutlich später erkannt wurde. Ohne
  // dieses zweite Maß risse eine fälschlich spät erkannte Anrede (die
  // Präfixprüfung kennt keine Wortgrenze, „Liebe Grüße" im Fließtext genügt)
  // das Suchfenster bis in den Fließtext auf — weiter, als die
  // Rückfallgrenze ohne Anrede je zuließe.
  const above =
    salutation === null
      ? paragraphs.slice(0, FALLBACK_WINDOW)
      : paragraphs.filter(
          (paragraph) => paragraph.index < salutation.paragraph && paragraph.index < FALLBACK_WINDOW,
        )

  const found = [
    salutation,
    findDate(above),
    findSubject(above),
    findRecipient(above, knownCompanies, currentCompany),
  ].filter((match): match is LetterheadMatch => match !== null)

  return withoutOverlaps(found)
}
