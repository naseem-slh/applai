/**
 * Die Faktenprüfung: Kommen die Zahlen und Datumsangaben der markierten
 * Stelle in der Variante unverändert wieder vor?
 *
 * **Reiner Code. Kein Modellaufruf, kein React.** Das ist der Punkt: Ein
 * zweites Modell zu fragen, ob das erste die Wahrheit gesagt hat, verlagert
 * das Problem nur. Zahlen dagegen lassen sich abzählen, und genau das
 * passiert hier.
 *
 * **Warum diese Prüfung wichtiger ist als sie aussieht.** In einem
 * Anschreiben ist eine Formulierung Geschmackssache; in einem Lebenslauf ist
 * eine Jahreszahl eine Tatsache, die der Arbeitgeber gegen das Zeugnis hält.
 * Ein Modell, das „2019–2022" zu „2018–2022" macht, hat nichts erfunden, was
 * `unbackedClaims` melden würde — es hat eine belegte Angabe still verändert.
 * Diese eine Fehlerart fängt keine der Prüfungen in `rewrite.ts`, und sie ist
 * die einzige, die eine Bewerbung als Falschangabe erscheinen lässt.
 *
 * **Die Prüfung wirft nicht.** Sie liefert einen Befund, den die Oberfläche
 * anzeigt und der Nutzer bestätigt (`VariantPopover`). Eine veränderte Zahl
 * ist manchmal richtig — wer eine Zeile zusammenfasst, verliert womöglich
 * bewusst eine Angabe. Entschieden wird das dort, wo beides nebeneinander
 * steht, nicht hier.
 *
 * ## Was geprüft wird
 *
 * Jede zusammenhängende **Ziffernfolge**, samt Punkten und Kommas darin:
 * Jahreszahlen (`2019`), Daten (`15.03.2019`), Monat/Jahr (`03/2019` — als
 * zwei Angaben), Mengen (`4`), Dezimalzahlen (`1,5`), Zahlen in
 * Bezeichnungen (`ISO 9001`). Eine Zeitspanne braucht keine eigene Regel:
 * „2019–2022" sind zwei Angaben, und ob dazwischen ein Gedankenstrich oder
 * das Wort „bis" steht, ändert daran nichts.
 *
 * Verglichen werden die **Vorkommen**, nicht nur die Werte: Zweimal „2019"
 * ist etwas anderes als einmal.
 *
 * ## Was ausdrücklich NICHT geprüft wird
 *
 * - **Zahlwörter.** „drei Jahre" → „3 Jahre" ist keine Faktenänderung, und
 *   eine Warnung, die dabei anschlägt, wird nach dem dritten Mal
 *   weggeklickt, ohne gelesen zu werden. Eine Warnung, der niemand mehr
 *   glaubt, schützt schlechter als keine.
 * - **Namen, Titel, Arbeitgeber.** Sie zu vergleichen hieße, jede legitime
 *   Umformulierung zu melden — im Deutschen ist jedes Substantiv groß, und
 *   „Mitarbeit" → „Beteiligung" wäre nicht von „Bosch" → „Siemens" zu
 *   unterscheiden. Diese Zusage trägt der Prompt (`CV_HARD_FACTS_RULE`),
 *   nicht diese Datei.
 * - **Einheiten.** „20 %" → „20 Prozent" bleibt unbeanstandet; die Zahl ist
 *   dieselbe.
 * - **Tausendertrennzeichen.** „1.500" und „1500" gelten als verschieden.
 *   Das ist eine bekannte Fehlmeldung: Sie tritt selten auf, ist mit einem
 *   Blick als harmlos zu erkennen, und die Alternative — Punkte je nach
 *   Stellenzahl mal als Trennzeichen, mal als Datumspunkt zu deuten — wäre
 *   eine Ratearbeit, die im Datumsfall echten Schaden anrichtet.
 */

/**
 * Eine Ziffernfolge samt der Punkte und Kommas **innerhalb** von ihr. Der
 * Nachbedingungsteil verlangt vor dem Trennzeichen eine Ziffer und danach
 * ebenfalls; „2019." am Satzende endet damit bei `2019`.
 */
const FIGURE = /\d+(?:[.,]\d+)*/g

/**
 * Macht zwei Schreibweisen derselben Angabe vergleichbar: führende Nullen
 * fallen weg, das Dezimalkomma wird zum Punkt. `03/2019` und `3/2019` sind
 * danach dasselbe, `15.03.2019` und `15.3.2019` ebenso.
 */
function normalize(figure: string): string {
  return figure
    .split(/[.,]/)
    .map((part) => part.replace(/^0+(?=\d)/, ''))
    .join('.')
}

/** Alle Ziffernangaben eines Textes, normalisiert, in ihrer Reihenfolge. */
export function extractFigures(text: string): string[] {
  return Array.from(text.matchAll(FIGURE), (match) => normalize(match[0]))
}

export interface FigureCheck {
  /** In der Variante, aber nicht in der Markierung. */
  added: readonly string[]
  /** In der Markierung, aber nicht in der Variante. */
  removed: readonly string[]
}

/**
 * Vergleicht die Ziffernangaben zweier Texte als **Multimenge**: Jedes
 * Vorkommen zählt einzeln, die Reihenfolge nicht. „2019 bis 2022" und „von
 * 2022 zurück bis 2019" gelten damit als gleich — eine umgestellte Zeile ist
 * kein veränderter Fakt.
 */
export function checkFigures(original: string, variant: string): FigureCheck {
  const remaining = new Map<string, number>()
  for (const figure of extractFigures(original)) {
    remaining.set(figure, (remaining.get(figure) ?? 0) + 1)
  }

  const added: string[] = []
  for (const figure of extractFigures(variant)) {
    const count = remaining.get(figure) ?? 0
    if (count > 0) {
      remaining.set(figure, count - 1)
    } else {
      added.push(figure)
    }
  }

  const removed: string[] = []
  for (const [figure, count] of remaining) {
    for (let index = 0; index < count; index += 1) removed.push(figure)
  }

  return { added, removed }
}

/** Gibt es überhaupt etwas zu melden? */
export function hasFigureChanges(check: FigureCheck): boolean {
  return check.added.length > 0 || check.removed.length > 0
}

/**
 * Eine entfernte und eine hinzugekommene Angabe zu einem Paar
 * („2019 → 2018"), **wenn die Zuordnung eindeutig ist** — also genau eine
 * auf jeder Seite. Sonst bleiben beide Seiten getrennt stehen.
 *
 * Geraten wird hier nichts: Bei zwei verschwundenen und drei neuen Angaben
 * gibt es keine Zuordnung, die die Prüfung kennen könnte, und eine erfundene
 * Paarung wäre eine Behauptung darüber, was das Modell gemeint hat.
 */
export interface FigureChange {
  from: string
  to: string
}

export function pairFigureChange(check: FigureCheck): FigureChange | null {
  if (check.added.length !== 1 || check.removed.length !== 1) return null
  const from = check.removed[0]
  const to = check.added[0]
  if (from === undefined || to === undefined) return null
  return { from, to }
}
