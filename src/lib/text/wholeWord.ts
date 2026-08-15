/**
 * Ganzwort-/Ganzphrasen-Suche mit Unicode-Wortgrenze — ein abhängigkeitsfreies
 * Blattmodul (kein Import, keine Domäne, kein KI-Bezug), das sowohl
 * `privacy/anonymize.ts` (Aufgabe 8, PII-Erkennung) als auch
 * `domain/letterhead.ts` (Aufgabe 12, Fremdfirmen-Warnung) verwenden — beide
 * lösen dasselbe technische Problem (eine Phrase als GANZES Wort finden,
 * nicht als Teilstring, ohne dass Regex-Sonderzeichen in der Phrase den
 * Suchausdruck verfälschen) und sollen es nicht zweimal lösen. Ein
 * Blattmodul ohne eigene Abhängigkeiten dürfen laut `CLAUDE.md`
 * (Architektur-Grenzen) beide Schichten kennen — anders als ein Import in
 * die jeweils andere Richtung (`domain` → `privacy` wäre die falsche
 * Kopplungsrichtung für eine reine Textfunktion, `CLAUDE.md`: "`src/lib/
 * domain` kennt nur `src/lib/ai` und die Modelltypen").
 *
 * **Bewusst nicht `\b` (JavaScripts eingebaute Wortgrenze):** `\b` prüft nur
 * ASCII-`\w` (`[A-Za-z0-9_]`) — ein deutscher Umlaut zählt dafür NICHT als
 * Wortzeichen. Zwischen "o" und "Ö" (z. B. in "BioÖkotech") läge nach `\b`
 * fälschlich eine Wortgrenze, eine Suche nach "Ökotech" träfe dort also
 * einen Fehlalarm, den es mit einer echten Wortgrenzen-Definition nicht
 * geben dürfte. Stattdessen: Unicode-Eigenschaften `\p{L}` (Buchstabe) und
 * `\p{N}` (Ziffer) in einer Lookaround-Prüfung
 * (`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`) — ein Treffer zählt nur als
 * Ganzwort, wenn davor UND danach kein Buchstabe/keine Ziffer irgendeiner
 * Sprache steht. Siehe `wholeWord.test.ts` für den Regressionsfall, der
 * `\b` und diese Prüfung tatsächlich unterscheidet.
 */

export interface WholeWordMatch {
  /** Position des Treffers im Text (Zeichenindex des ersten Zeichens). */
  index: number
  /** Länge des Treffers in Zeichen — bei `caseInsensitive` identisch zur Länge von `phrase` (Groß-/Kleinschreibung ändert die Zeichenzahl nicht). */
  length: number
}

/**
 * Maskiert Regex-Sonderzeichen in `value`, damit die Zeichenkette in einem
 * regulären Ausdruck als LITERALER Text behandelt wird — ohne das würde
 * z. B. "+" als Quantifizierer statt als Zeichen gelesen (relevant für
 * Firmennamen wie "Müller + Partner GmbH" oder E-Mail-Adressen).
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Findet jedes Vorkommen von `phrase` in `text` als GANZE Phrase — nicht als
 * Teilstring eines längeren Worts (siehe Doc-Kommentar oben). Eine leere
 * oder nur aus Leerraum bestehende `phrase` liefert `[]`, statt (wie ein
 * naiver regulärer Ausdruck) jede Position im Text zu "treffen".
 *
 * `caseInsensitive` steuert nur die Groß-/Kleinschreibung, niemals die
 * Grenzprüfung selbst — beide Aufrufer brauchen hier unterschiedliches
 * Verhalten (Namen case-sensitiv, E-Mail/Firmennamen case-insensitiv).
 */
export function findWholeWordOccurrences(text: string, phrase: string, caseInsensitive: boolean): WholeWordMatch[] {
  const trimmed = phrase.trim()
  if (!trimmed) return []

  const pattern = `(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`
  const regex = new RegExp(pattern, caseInsensitive ? 'gui' : 'gu')

  const results: WholeWordMatch[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    results.push({ index: match.index, length: match[0].length })
  }
  return results
}
