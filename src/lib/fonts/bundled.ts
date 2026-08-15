/**
 * Ordnet die Schriften aus einem Word-Dokument den Dateien zu, die dieses
 * Projekt mitbringt.
 *
 * **Warum überhaupt zugeordnet wird.** Calibri, Arial und Times New Roman
 * sind lizenziert; sie liegen nicht im Repository und dürfen es nicht (G2,
 * G4). Zu jeder gibt es aber einen Nachbau unter der SIL Open Font License
 * mit **denselben Vorschubbreiten**: Carlito, Liberation Sans, Liberation
 * Serif, Liberation Mono. Gleiche Breiten heißt gleicher Zeilenumbruch — der
 * Brief bricht an denselben Stellen um wie in Word, und die Seitenzahl
 * stimmt.
 *
 * **Was das nicht heißt.** Für eine Schrift ohne Nachbau (Garamond, Verdana,
 * Bahnschrift …) gibt es hier nur die nächstbeste Gattung. Der Brief bleibt
 * lesbar und ordentlich gesetzt, sieht aber nicht aus wie das Original. Das
 * offen zu haben ist besser, als eine Treue zu behaupten, die nicht besteht.
 *
 * **Warum das Modul nicht bei der PDF-Ausfuhr liegt.** Seit die
 * Arbeitsfläche den Brief originalgetreu zeigt, brauchen Bildschirm und
 * Ausfuhr dieselbe Zuordnung — und zwar zwingend dieselbe, sonst zeigte der
 * Bildschirm eine andere Schrift als die Datei, die der Nutzer verschickt.
 * Eine Oberfläche, die dafür den PDF-Schreiber einbindet, hätte die
 * Abhängigkeit verkehrt herum.
 */

/** Die vier mitgelieferten Familien. */
export type BundledFamily = 'Carlito' | 'LiberationSans' | 'LiberationSerif' | 'LiberationMono'

const FALLBACK_FAMILY: BundledFamily = 'LiberationSans'

/**
 * Word-Schriftname → mitgelieferte Familie.
 *
 * Die erste Gruppe sind echte Metrikgleichheiten — dort stimmen die Breiten
 * auf die Einheit. Die zweite Gruppe ist Ersatz nach Gattung: Georgia und
 * Garamond sind Serifenschriften, also Liberation Serif, auch wenn sie
 * anders aussehen und anders breit sind.
 */
const FAMILY_BY_NAME = new Map<string, BundledFamily>([
  // Metrikgleich
  ['calibri', 'Carlito'],
  ['calibrilight', 'Carlito'],
  ['carlito', 'Carlito'],
  ['arial', 'LiberationSans'],
  ['arialmt', 'LiberationSans'],
  ['helvetica', 'LiberationSans'],
  ['liberationsans', 'LiberationSans'],
  ['arimo', 'LiberationSans'],
  ['timesnewroman', 'LiberationSerif'],
  ['timesnewromanpsmt', 'LiberationSerif'],
  ['times', 'LiberationSerif'],
  ['liberationserif', 'LiberationSerif'],
  ['tinos', 'LiberationSerif'],
  ['couriernew', 'LiberationMono'],
  ['courier', 'LiberationMono'],
  ['liberationmono', 'LiberationMono'],
  ['cousine', 'LiberationMono'],

  // Ersatz nach Gattung
  ['cambria', 'LiberationSerif'],
  ['georgia', 'LiberationSerif'],
  ['garamond', 'LiberationSerif'],
  ['bookantiqua', 'LiberationSerif'],
  ['palatinolinotype', 'LiberationSerif'],
  ['constantia', 'LiberationSerif'],
  ['segoeui', 'LiberationSans'],
  ['tahoma', 'LiberationSans'],
  ['verdana', 'LiberationSans'],
  ['trebuchetms', 'LiberationSans'],
  ['candara', 'LiberationSans'],
  ['corbel', 'LiberationSans'],
  ['centurygothic', 'LiberationSans'],
  ['consolas', 'LiberationMono'],
  ['lucidaconsole', 'LiberationMono'],
])

/** Vergleichsform eines Schriftnamens: ohne Leerzeichen, ohne Groß/Klein. */
function normalize(fontFamily: string): string {
  return fontFamily.toLowerCase().replace(/[\s-]/g, '')
}

export function bundledFamily(fontFamily: string): BundledFamily {
  const normalized = normalize(fontFamily)
  const direct = FAMILY_BY_NAME.get(normalized)
  if (direct) return direct

  // Unbekannter Name: nach dem entscheiden, was er über sich sagt. Word
  // schreibt zusammengesetzte Namen wie „Frutiger LT Std 45 Light".
  if (normalized.includes('mono') || normalized.includes('courier')) return 'LiberationMono'
  if (normalized.includes('serif') && !normalized.includes('sansserif')) return 'LiberationSerif'
  return FALLBACK_FAMILY
}

/** Der Dateiname einer Familie im gewünschten Schnitt, ohne Endung. */
export function fontFileKey(fontFamily: string, bold: boolean, italic: boolean): string {
  const style = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'
  return `${bundledFamily(fontFamily)}-${style}`
}
