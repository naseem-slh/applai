import type { Range as TextRange } from '@/lib/docx/replace'
import type { MarkAnchor } from '@/lib/storage/adapter'
import { textFingerprint } from '@/lib/text/fingerprint'

/**
 * Vorgemerkte Stellen: mehrere Textbereiche, die der Nutzer nacheinander
 * umformulieren will — und die als Vorlage für die nächste Ausschreibung
 * erhalten bleiben.
 *
 * Diese Datei rechnet nur und kennt weder React noch den Speicher. Sie liegt
 * bei der Oberfläche und nicht in `lib/domain`, weil sie dieselbe Rolle hat
 * wie `unbackedClaims.ts` und `foreignCompanies.ts`: reine Logik über einem
 * Dokumenttext, ohne Anbieter und ohne Ablage, Fall für Fall prüfbar.
 *
 * Die drei Zusicherungen, auf denen alles Weitere beruht:
 *
 * 1. **Vormerkungen überschneiden sich nie.** Zwei überlappende Bereiche
 *    ließen sich nicht nacheinander ersetzen: Nach der ersten Ersetzung
 *    zeigte die zweite auf Bruchstücke. `toggleMark` und `restoreMarks`
 *    halten das ein, `shiftMarks` bewahrt es.
 * 2. **Sie stehen in Dokumentreihenfolge.** Die Liste in der Oberfläche
 *    nummeriert sie, und eine Nummerierung, die springt, wäre keine.
 * 3. **`anchor` ändert sich nie, `current` immer.** Der Anker ist der
 *    vollständige {@link MarkAnchor} vom Zeitpunkt des Vormerkens — Wortlaut,
 *    Rand und damalige Position — und geht unverändert in den Speicher; er
 *    ist es, was die Stelle beim nächsten Anschreiben wiederfindet.
 *    `current` ist der Wortlaut, den der Bereich **jetzt** überdeckt, und
 *    dient nur der Anzeige.
 *
 *    Dass der Anker beim **Vormerken** entsteht und nicht beim Speichern,
 *    ist der Kern der Wiederverwendung: Beim nächsten Mal wird das
 *    Grundanschreiben geladen, nicht die für die letzte Firma angepasste
 *    Fassung. Ein beim Speichern gebildeter Anker trüge den angepassten
 *    Wortlaut und fände im Grundanschreiben nichts wieder.
 */

/**
 * Wie viele Zeichen Kontext ein Anker mitnimmt, je Seite.
 *
 * Deutlich weniger als die 600 Zeichen aus `documentSelection.ts`: Dort
 * geht der Kontext an das Modell und soll den Absatz verständlich machen,
 * hier dient er allein dazu, mehrere gleichlautende Fundstellen
 * auseinanderzuhalten. 60 Zeichen leisten das und halten die Menge an
 * Briefinhalt im Speicher klein.
 */
export const MARK_CONTEXT_CHARS = 60

/** Eine vorgemerkte Stelle im laufenden Arbeitsstand. */
export interface Mark {
  /** Stabile Kennung über Textänderungen hinweg — Listenschlüssel und Auswahl. */
  id: string
  range: TextRange
  /** Der Anker vom Zeitpunkt des Vormerkens. Wandert unverändert in den Speicher. */
  anchor: MarkAnchor
  /** Der Wortlaut, den der Bereich jetzt überdeckt. Nur für die Anzeige. */
  current: string
  /** In dieser Bewerbungsrunde erledigt. Wird nicht gespeichert. */
  done: boolean
}

/** Das Ergebnis von {@link restoreMarks}. */
export interface RestoredMarks {
  marks: Mark[]
  /** Anker, die im Brief nicht mehr eindeutig auffindbar sind. */
  unresolved: MarkAnchor[]
}

/**
 * Die Auswahl ohne Leerraum an den Rändern — `null`, wenn nichts übrig
 * bleibt.
 *
 * Jede Vormerkung ist der getrimmte Bereich. Das ist zugleich die Toleranz
 * des Umschalters: Wer eine Stelle mit der Maus neu zieht und dabei das
 * Leerzeichen dahinter mitnimmt, hebt sie auf, statt sie um ein Zeichen
 * versetzt neu zu setzen.
 */
export function trimRange(text: string, range: TextRange): TextRange | null {
  let from = clamp(range.from, 0, text.length)
  let to = clamp(range.to, from, text.length)
  while (from < to && isSpace(text.charAt(from))) from += 1
  while (to > from && isSpace(text.charAt(to - 1))) to -= 1
  return to > from ? { from, to } : null
}

/**
 * Die Vormerkungen, die sich mit diesem Bereich um mindestens ein Zeichen
 * überschneiden. Eine Berührung an der Grenze (`a.to === b.from`) zählt
 * nicht dazu — zwei aneinandergrenzende Stellen sind zwei Stellen.
 *
 * Öffentlich, weil die Leiste damit ankündigt, welche Vormerkung ein
 * weiterer Druck auf „vormerken" ersetzen würde.
 */
export function overlappingMarks(marks: readonly Mark[], range: TextRange): Mark[] {
  return marks.filter((mark) => overlaps(mark.range, range))
}

/**
 * Die Umschaltregel: vormerken, aufheben oder ersetzen.
 *
 * In dieser Reihenfolge:
 *
 * 1. Die Auswahl wird getrimmt. Bleibt nichts übrig, geschieht nichts.
 * 2. Gibt es eine Vormerkung mit **genau** diesem Bereich, wird sie
 *    aufgehoben. So hebt man eine Stelle wieder auf: indem man sie noch
 *    einmal vormerkt.
 * 3. Sonst fallen alle **überschneidenden** Vormerkungen weg und die neue
 *    tritt an ihre Stelle — ein Druck schafft Platz und setzt neu.
 * 4. Sonst kommt die neue hinzu.
 *
 * `id` wird nur im Fall 3 und 4 gebraucht; sie kommt von außen, damit diese
 * Datei ohne Zufall auskommt und Fall für Fall prüfbar bleibt.
 */
export function toggleMark(
  marks: readonly Mark[],
  text: string,
  range: TextRange,
  id: string,
): Mark[] {
  const trimmed = trimRange(text, range)
  if (trimmed === null) return [...marks]

  const identical = marks.find(
    (mark) => mark.range.from === trimmed.from && mark.range.to === trimmed.to,
  )
  if (identical !== undefined) return marks.filter((mark) => mark !== identical)

  const kept = marks.filter((mark) => !overlaps(mark.range, trimmed))
  const anchor = createAnchor(text, trimmed)
  return sortByPosition([
    ...kept,
    { id, range: trimmed, anchor, current: anchor.text, done: false },
  ])
}

/** Die speicherbare Form eines Bereichs: Wortlaut, Rand und alte Position. */
export function createAnchor(text: string, range: TextRange): MarkAnchor {
  return {
    text: text.slice(range.from, range.to),
    before: text.slice(Math.max(0, range.from - MARK_CONTEXT_CHARS), range.from),
    after: text.slice(range.to, range.to + MARK_CONTEXT_CHARS),
    from: range.from,
    to: range.to,
  }
}

/**
 * Wo steht diese Stelle in **diesem** Text? Vier Stufen, deterministisch,
 * ohne Modellaufruf:
 *
 * 1. Steht an der alten Position noch derselbe Wortlaut, ist sie gefunden.
 *    Der Regelfall bei unverändertem Grundanschreiben, und der billigste.
 * 2. Sonst den Wortlaut suchen. **Genau ein** Vorkommen: Die Stelle hat sich
 *    nur verschoben.
 * 3. **Mehrere** Vorkommen: mit `before` und `after` bewerten — längste
 *    Übereinstimmung am linken plus am rechten Rand. Ein eindeutiger Sieger
 *    gewinnt.
 * 4. Sonst `null`.
 *
 * **In Stufe 4 wird nicht geraten**, auch nicht „das nächstgelegene
 * Vorkommen". Eine falsch gesetzte Vormerkung ließe das Modell die falsche
 * Textstelle umformulieren; eine fehlende ist ein sichtbarer Verlust, den
 * der Nutzer in zwei Sekunden von Hand behebt. Die unauffindbaren Anker
 * werden in der Oberfläche genannt, nicht verschwiegen.
 */
export function relocate(text: string, anchor: MarkAnchor): TextRange | null {
  if (anchor.text === '') return null
  if (text.slice(anchor.from, anchor.to) === anchor.text) {
    return { from: anchor.from, to: anchor.to }
  }

  const found: number[] = []
  for (let at = text.indexOf(anchor.text); at !== -1; at = text.indexOf(anchor.text, at + 1)) {
    found.push(at)
  }
  if (found.length === 0) return null

  const first = found[0]
  if (first === undefined) return null
  if (found.length === 1) return { from: first, to: first + anchor.text.length }

  let best: number | null = null
  let bestScore = -1
  let tied = false
  for (const at of found) {
    const score = contextScore(text, at, anchor)
    if (score > bestScore) {
      bestScore = score
      best = at
      tied = false
    } else if (score === bestScore) {
      tied = true
    }
  }

  return tied || best === null ? null : { from: best, to: best + anchor.text.length }
}

/**
 * Gespeicherte Anker in Vormerkungen für **diesen** Brief zurückverwandeln.
 *
 * Jeder Anker geht durch {@link relocate}. Was nicht wiedergefunden wird,
 * steht in `unresolved` — ebenso ein Anker, der auf eine bereits belegte
 * Stelle zeigt: Die Zusicherung „Vormerkungen überschneiden sich nie" wiegt
 * schwerer als die zweite Vormerkung, und der erste Anker hat den Vorrang,
 * weil er weiter vorn im gespeicherten Satz steht.
 */
export function restoreMarks(
  text: string,
  anchors: readonly MarkAnchor[],
  makeId: (index: number) => string,
): RestoredMarks {
  const marks: Mark[] = []
  const unresolved: MarkAnchor[] = []

  anchors.forEach((anchor, index) => {
    const range = relocate(text, anchor)
    if (range === null || marks.some((mark) => overlaps(mark.range, range))) {
      unresolved.push(anchor)
      return
    }
    marks.push({
      id: makeId(index),
      range,
      anchor,
      current: text.slice(range.from, range.to),
      done: false,
    })
  })

  return { marks: sortByPosition(marks), unresolved }
}

/**
 * Die Vormerkungen einer Textänderung nachführen.
 *
 * `range` ist der ersetzte Bereich **im bisherigen** Text,
 * `insertedLength` die Länge des eingesetzten Textes, `nextText` der Stand
 * danach. Genau die drei Angaben, die jeder Aufruf von `replaceRange` schon
 * zur Hand hat.
 *
 * Eine Einfügung genau **auf einer Grenze** gehört zum Text davor: Sie lässt
 * eine dort endende Vormerkung wachsen und eine dort beginnende
 * unangetastet. Das ist die übliche Erwartung beim Tippen am Ende einer
 * markierten Stelle — und es hält zwei aneinandergrenzende Vormerkungen
 * überschneidungsfrei, statt beide wachsen zu lassen.
 */
export function shiftMarks(
  marks: readonly Mark[],
  range: TextRange,
  insertedLength: number,
  nextText: string,
): Mark[] {
  const shifted: Mark[] = []
  for (const mark of marks) {
    const moved = shiftRange(mark.range, range, insertedLength)
    if (moved === null) continue
    const trimmed = trimRange(nextText, moved)
    if (trimmed === null) continue
    shifted.push({ ...mark, range: trimmed, current: nextText.slice(trimmed.from, trimmed.to) })
  }
  return shifted
}

/**
 * Der Fingerabdruck eines Anschreibens. Seit dem Auswertungsspeicher stellt
 * `lib/text/fingerprint` dieselbe Rechnung für beide Nutzer bereit; der Name
 * bleibt hier stehen, weil er an dieser Stelle sagt, **wovon** der Abdruck
 * genommen wird.
 */
export const letterFingerprint = textFingerprint

/** Wie gut passt der Text um diese Fundstelle zum gespeicherten Rand? */
function contextScore(text: string, at: number, anchor: MarkAnchor): number {
  const before = text.slice(Math.max(0, at - anchor.before.length), at)
  const after = text.slice(at + anchor.text.length, at + anchor.text.length + anchor.after.length)
  return commonSuffixLength(before, anchor.before) + commonPrefixLength(after, anchor.after)
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let length = 0
  while (length < max && a.charAt(length) === b.charAt(length)) length += 1
  return length
}

function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let length = 0
  while (length < max && a.charAt(a.length - 1 - length) === b.charAt(b.length - 1 - length)) {
    length += 1
  }
  return length
}

/** Ein Bereich nach einer Textänderung — `null`, wenn nichts von ihm bleibt. */
function shiftRange(mark: TextRange, edit: TextRange, insertedLength: number): TextRange | null {
  const delta = insertedLength - (edit.to - edit.from)

  // Ganz davor. Eine Einfügung genau auf dem Anfang zählt dazu.
  if (edit.to <= mark.from) return { from: mark.from + delta, to: mark.to + delta }
  // Ganz dahinter. Eine Einfügung genau auf dem Ende zählt **nicht** dazu —
  // sie fällt in den Fall darunter und lässt die Vormerkung wachsen.
  if (edit.from > mark.to) return mark
  if (edit.from === mark.to && edit.to > edit.from) return mark
  // Die Änderung liegt in der Vormerkung: Sie wächst und schrumpft mit.
  if (edit.from >= mark.from && edit.to <= mark.to) return { from: mark.from, to: mark.to + delta }
  // Die Änderung überdeckt sie ganz: Ihr Text existiert nicht mehr.
  if (edit.from <= mark.from && edit.to >= mark.to) return null
  // Teilweise überschrieben: Der überschriebene Rand fällt weg.
  return edit.from < mark.from
    ? { from: edit.from + insertedLength, to: mark.to + delta }
    : { from: mark.from, to: edit.from }
}

function overlaps(a: TextRange, b: TextRange): boolean {
  return a.from < b.to && b.from < a.to
}

function sortByPosition(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => a.range.from - b.range.from)
}

function isSpace(character: string): boolean {
  return character.trim() === ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
