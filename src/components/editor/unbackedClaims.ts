import type { DocxDocument } from '@/lib/docx/model'
import type { Range as TextRange } from '@/lib/docx/replace'

/**
 * Die unbelegten Aussagen des freien Modus — wo sie im Dokument stehen und
 * welche davon den Export noch sperren.
 *
 * Das ist die Schutzvorrichtung aus G10: „Die KI darf nie Fakten erfinden,
 * außer im ausdrücklich gewählten freien Modus — dort mit Markierung,
 * Einzelbestätigung und **Exportsperre**." Aufgabe 11 liefert die Aussagen
 * (`Variant.unbackedClaims`) und garantiert, dass jede von ihnen **wörtlich**
 * im Variantentext steht (`assertClaimsAreVerbatim`, Leerraum normalisiert).
 * Diese Datei ist die andere Hälfte: Sie findet dieselbe Aussage im
 * Dokument wieder, nachdem die Variante übernommen wurde.
 *
 * **Warum nachgeschlagen wird und nicht mitgezählt.** Naheliegend wäre, sich
 * beim Übernehmen den Bereich zu merken, in den die Variante geschrieben
 * wurde. Dieser Bereich ist aber schon beim nächsten Tastendruck falsch:
 * Jede Eingabe davor verschiebt ihn, jedes Rückgängig setzt ihn zurück, ein
 * zweites Umschreiben derselben Stelle überschreibt ihn. Ein gemerkter
 * Bereich müsste bei jeder dieser Gelegenheiten nachgeführt werden, und
 * genau eine vergessene Gelegenheit ergibt eine Sperre, die auf eine Stelle
 * zeigt, an der nichts mehr steht — oder schlimmer: einen erfundenen Satz,
 * der aus der Sperre gefallen ist und unmarkiert exportiert wird.
 *
 * Deshalb ist der Text selbst die Kennung. Steht die Aussage noch im
 * Dokument, sperrt sie; steht sie nicht mehr da (der Nutzer hat sie
 * gelöscht, umgeschrieben oder die Übernahme rückgängig gemacht), sperrt sie
 * nicht mehr. Das ist ohne Nachführung richtig, bei jedem Dokumentstand,
 * und es ist die Frage, die die Sperre tatsächlich stellt: **Steht gerade
 * eine unbestätigte erfundene Aussage im Brief?**
 *
 * **Der Preis** ist eine falsch positive Sperre, wenn derselbe Wortlaut
 * durch Zufall an anderer Stelle im Brief steht, und eine falsch negative,
 * wenn der Nutzer den Satz so umbaut, dass die Aussage inhaltlich bleibt,
 * aber wörtlich nicht mehr auffindbar ist. Das zweite ist der teurere Fall
 * und bewusst hingenommen: Wer einen markierten Satz von Hand umschreibt,
 * hat ihn gelesen — das ist genau die Prüfung, die die Bestätigung
 * einholen soll. Eine Aussage über Bedeutungsgleichheit könnte hier
 * ohnehin nur ein zweites Modell treffen.
 */

/**
 * Eine unbelegte Aussage, wie die Arbeitsfläche sie führt.
 *
 * `id` ist stabil über Dokumentänderungen hinweg (die Bestätigung darf beim
 * Tippen nicht verlorengehen); `text` ist der Wortlaut aus
 * `Variant.unbackedClaims`.
 */
export interface UnbackedClaim {
  id: string
  text: string
  confirmed: boolean
}

/** Eine Aussage mit ihrer Fundstelle im aktuellen Dokumentstand. */
export interface LocatedClaim extends UnbackedClaim {
  range: TextRange
  /** Indizes der Absätze, in denen die Aussage steht (Dokumentreihenfolge). */
  paragraphs: number[]
}

/**
 * Leerraum-unempfindliche Suche: Der Vergleichstext zieht jede Folge von
 * Leerraum auf ein einzelnes Leerzeichen zusammen, und `offsets` hält für
 * jedes Zeichen der zusammengezogenen Fassung fest, wo es im Original stand.
 *
 * Nötig, weil Aufgabe 11 die Wörtlichkeit ebenfalls nur nach dieser
 * Normalisierung prüft (`normalizeWhitespace` in `domain/rewrite.ts`): Eine
 * Aussage, die dort als „steht wörtlich im Variantentext" durchgeht, darf
 * hier nicht an einem Zeilenumbruch scheitern. Der Ersatztext einer
 * Übernahme wird zudem über mehrere Absätze verteilt (`replaceRange`), wobei
 * aus einem `\n` eine Absatzgrenze wird — nach Normalisierung ist das
 * beidseits dasselbe Leerzeichen.
 *
 * `offsets` hat ein Element mehr als `text`: Der letzte Eintrag ist das Ende
 * des letzten übernommenen Zeichens, damit sich auch das exklusive Ende
 * eines Treffers am Textende abbilden lässt — ohne den Leerraum dahinter
 * mit in den Bereich zu ziehen.
 */
interface NormalizedText {
  text: string
  offsets: number[]
}

function normalizeWithOffsets(source: string): NormalizedText {
  let text = ''
  const offsets: number[] = []
  let pendingSpaceAt: number | null = null
  let afterLastChar = 0

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    if (/\s/.test(char)) {
      // Führender Leerraum fällt ganz weg; sonst wird die Folge zu einem
      // einzelnen Leerzeichen, das auf ihr erstes Zeichen zeigt.
      if (text.length > 0 && pendingSpaceAt === null) pendingSpaceAt = i
      continue
    }
    if (pendingSpaceAt !== null) {
      text += ' '
      offsets.push(pendingSpaceAt)
      pendingSpaceAt = null
    }
    text += char
    offsets.push(i)
    afterLastChar = i + 1
  }

  // Abschließender Leerraum wird verworfen (wie `String.trim`): Eine Aussage
  // am Textende scheitert dadurch nicht an einem Zeilenumbruch dahinter, und
  // ihr Bereich endet trotzdem am letzten Zeichen der Aussage.
  offsets.push(afterLastChar)
  return { text, offsets }
}

/** Dieselbe Normalisierung ohne Offsets — für die gesuchte Aussage. */
export function normalizeClaim(claim: string): string {
  return claim.replace(/\s+/g, ' ').trim()
}

/**
 * Sucht eine Aussage im Dokumenttext und liefert ihren Bereich in
 * **Original**-Offsets. `null`, wenn sie dort (nach Leerraum-Normalisierung)
 * nicht mehr steht.
 *
 * Gesucht wird das **erste** Vorkommen. Steht derselbe Wortlaut mehrfach im
 * Brief, zeigt die Markierung auf das erste — die Sperre bleibt dennoch
 * richtig, denn sie fragt nur, *ob* die Aussage noch dasteht.
 */
export function findClaimRange(documentText: string, claim: string): TextRange | null {
  const needle = normalizeClaim(claim)
  if (needle === '') return null

  const haystack = normalizeWithOffsets(documentText)
  const at = haystack.text.indexOf(needle)
  if (at === -1) return null

  const from = haystack.offsets[at]!
  // Das Ende ist der Anfang des Zeichens **nach** dem Treffer, nicht dessen
  // eigener Offset: Ein zusammengezogenes Leerzeichen steht im Original für
  // mehrere Zeichen, und der Bereich soll sie alle enthalten.
  const to = haystack.offsets[at + needle.length]!
  return { from, to }
}

/** Die Absätze, die ein Bereich überdeckt. Leer, wenn er in keinem liegt. */
export function claimParagraphs(docx: DocxDocument, range: TextRange): number[] {
  return docx.paragraphs
    .filter((paragraph) => paragraph.start < range.to && paragraph.end > range.from)
    .map((paragraph) => paragraph.index)
}

/**
 * Die Aussagen, die im übergebenen Dokumentstand tatsächlich noch stehen,
 * samt Fundstelle. Aussagen, die nicht mehr auffindbar sind, fallen heraus
 * — sie sperren nichts mehr und werden auch nicht mehr angezeigt.
 */
export function locateClaims(
  docx: DocxDocument | null,
  claims: readonly UnbackedClaim[],
): LocatedClaim[] {
  if (docx === null) return []
  const located: LocatedClaim[] = []
  for (const claim of claims) {
    const range = findClaimRange(docx.text, claim.text)
    if (range === null) continue
    located.push({ ...claim, range, paragraphs: claimParagraphs(docx, range) })
  }
  return located
}

/**
 * Die Exportsperre selbst: `true`, solange mindestens eine unbestätigte
 * Aussage im Dokument steht.
 *
 * Bewusst eine Funktion über den **aufgefundenen** Aussagen, nicht über den
 * gemerkten: Eine bestätigte oder gelöschte Aussage sperrt nicht, eine
 * unbestätigte, die noch dasteht, sperrt — mehr ist die Regel nicht.
 */
export function isExportBlocked(located: readonly LocatedClaim[]): boolean {
  return located.some((claim) => !claim.confirmed)
}
