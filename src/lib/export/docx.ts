import type { DocxDocument } from '../docx/model'
import { serializeDocx } from '../docx/serialize'

/**
 * Der Word-Export: das Original mit gepatchten Textstellen, unter einem
 * sprechenden Dateinamen.
 *
 * Gepackt wird von `serializeDocx` (Aufgabe 3), das jeden Archiveintrag außer
 * `word/document.xml` byteidentisch übernimmt — daran hängt die Zusage
 * „Schrift, Ränder, Kopfzeile unverändert" (`docs/spec.md`). Diese Datei
 * fügt nur zwei Dinge hinzu: den Namen und den Weg in den Download-Ordner.
 */

const DOCX_EXTENSION = '.docx'

/**
 * Zeichen, die in Dateinamen nicht vorkommen dürfen: die Verbote von Windows
 * (`\ / : * ? " < > |`) samt dem einzigen von POSIX (`/`). Ein Firmenname wie
 * „Meier & Co. / Nord" käme sonst als Pfadangabe im Namen an, und Windows
 * lehnt die Datei schlicht ab.
 *
 * Der Bindestrich fehlt bewusst: „Musterwerk-Solutions" ist ein gültiger
 * Dateiname und soll einer bleiben.
 */
const FORBIDDEN_CHARACTERS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])

/**
 * Steuerzeichen bleiben ebenfalls draußen. Als Prüfung und nicht als
 * regulärer Ausdruck, wie schon in `keyVault.ts`: Steuerzeichen in einem
 * Regex-Literal verbietet die ESLint-Regel `no-control-regex`.
 */
function isPrintable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  return code >= 0x20 && code !== 0x7f
}

/**
 * Auch am Rand verboten: Ein Punkt oder Leerzeichen am Ende wird von Windows
 * stillschweigend abgeschnitten, und ein führender Punkt macht die Datei
 * unter Unix unsichtbar.
 */
const TRIMMABLE_EDGES = /^[.\s]+|[.\s]+$/g

/**
 * Wie viele Zeichen der Firmenname höchstens beisteuert. Der ganze Name
 * bleibt weit unter jeder Pfadgrenze (255 Bytes auf gängigen Dateisystemen),
 * auch wenn jemand die Anzeige einer Behörde mit vollständiger
 * Bezeichnung eingefügt hat.
 */
const MAX_COMPANY_CHARS = 60

/** Das Datum im Dateinamen: `JJJJ-MM-TT`, wie im Plan vorgegeben. */
export function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  // Bewusst nicht `toISOString().slice(0, 10)`: Das rechnet nach UTC und
  // liefert am Abend des 12. in Mitteleuropa noch den 12., am Abend in
  // Neuseeland aber schon den Vortag. Gemeint ist der Kalendertag des
  // Nutzers.
  return `${year}-${month}-${day}`
}

/**
 * Baut den Dateinamen `Anschreiben_<Firma>_<JJJJ-MM-TT>.docx`.
 *
 * Die Endung ist überschreibbar, weil der PDF-Export denselben Namen unter
 * `.pdf` braucht. Beide Wege sollen dieselbe Datei benennen — die Regeln für
 * verbotene Zeichen, die Länge und den fehlenden Firmennamen gelten für ein
 * PDF genauso, und ein zweiter Satz davon wäre ein zweiter Satz Fehler.
 *
 * Ohne bekannte Firma entfällt der mittlere Teil samt seinem Trennzeichen —
 * `Anschreiben__2026-08-12.docx` mit einer Lücke sähe nach einem Fehler aus,
 * und einen Platzhalter („unbekannt") in den Namen zu schreiben wäre eine
 * Behauptung über die Anzeige, die dort nicht steht (G10, dieselbe Linie wie
 * `nullableFactString` in Aufgabe 9).
 *
 * Leerzeichen werden zu Unterstrichen: Der Name landet in Mail-Anhängen und
 * Bewerbungsportalen, und dort ist ein Name ohne Leerzeichen der
 * verlässlichere.
 */
export function buildFileName(
  company: string | null,
  date: Date,
  extension: string = DOCX_EXTENSION,
): string {
  const cleaned = [...(company ?? '')]
    .map((character) =>
      FORBIDDEN_CHARACTERS.has(character) || !isPrintable(character) ? ' ' : character,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .replace(TRIMMABLE_EDGES, '')
    .slice(0, MAX_COMPANY_CHARS)
    // Zweites Mal, weil die Kürzung einen neuen Rand erzeugt haben kann.
    .replace(TRIMMABLE_EDGES, '')
    .replace(/ /g, '_')

  const parts = cleaned === '' ? ['Anschreiben', isoDate(date)] : ['Anschreiben', cleaned, isoDate(date)]
  return `${parts.join('_')}${extension}`
}

/**
 * Löst den Download aus.
 *
 * Getrennt von `buildFileName`, damit der Name ohne Browser prüfbar ist —
 * und getrennt von `serializeDocx`, weil das Packen nichts über den Weg in
 * den Download-Ordner wissen muss.
 *
 * **Die Objekt-URL wird erst im nächsten Durchlauf der Ereignisschleife
 * freigegeben.** Der Download beginnt asynchron; wird sie noch in derselben
 * Aufgabe freigegeben, brechen ihn mehrere Browser stillschweigend ab. Ohne
 * Freigabe wiederum hielte sie den Blob bis zum Verlassen der Seite im
 * Speicher. Dieselbe Begründung wie bei der Sicherungsdatei in den
 * Einstellungen (Aufgabe 13c).
 *
 * Meldet **nicht**, ob die Datei tatsächlich abgelegt wurde: Ein
 * `<a download>` gibt darüber keine Auskunft. „Erzeugt" ist alles, was der
 * Aufrufer behaupten darf.
 */
export async function downloadDocx(docx: DocxDocument, fileName: string): Promise<void> {
  const blob = await serializeDocx(docx)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
