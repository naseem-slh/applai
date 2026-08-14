import { readDocumentFormat } from '../../docx/format'
import type { DocxDocument } from '../../docx/model'
import { loadFonts } from './fonts'
import { requiredFontKeys } from '../../fonts/required'
import { layoutDocument } from './layout'
import { writePdf } from './write'

/**
 * Der PDF-Export: aus der geladenen `.docx` eine PDF-Datei, die aussieht wie
 * das Original in Word.
 *
 * **Warum nicht mehr über den Druckdialog.** Der frühere Weg druckte die
 * Bildschirmdarstellung — und die kennt vom Original nur die Zeichen. Schrift,
 * Grade, Ränder, Ausrichtung, Kopfzeile: alles Angaben, die der Bearbeiter
 * nie ausliest, weil er sie nicht braucht. Das Ergebnis hatte mit der
 * Word-Datei nichts gemein außer dem Wortlaut. Jetzt wird das Original
 * ausgelesen (`docx/format.ts`), gesetzt (`layout.ts`) und geschrieben
 * (`write.ts`).
 *
 * **Vier Schritte, vier Module** — jedes für sich ohne Browser prüfbar:
 * lesen, Schriften holen, setzen, schreiben. Nur der zweite braucht das Netz,
 * und auch der nur zum eigenen Server (G2).
 */

const PDF_MIME_TYPE = 'application/pdf'

export async function buildPdf(docx: DocxDocument, created: Date = new Date()): Promise<Blob> {
  const format = readDocumentFormat(docx)
  // Erst laden, dann setzen: Der Satz misst mit den Vorschubbreiten der
  // Dateien und darf deshalb nicht auf sie warten müssen.
  const fonts = await loadFonts(requiredFontKeys(format))
  const bytes = writePdf(layoutDocument(format, fonts), { created })
  return new Blob([bytes], { type: PDF_MIME_TYPE })
}

/**
 * Löst den Download aus.
 *
 * Wortgleich zu `downloadDocx` (`../docx.ts`) bis auf den Inhalt — auch in
 * der verzögerten Freigabe der Objekt-URL: Wird sie noch in derselben
 * Aufgabe freigegeben, brechen mehrere Browser den Download stillschweigend
 * ab.
 *
 * Meldet **nicht**, ob die Datei abgelegt wurde; ein `<a download>` gibt
 * darüber keine Auskunft. „Erzeugt" ist alles, was der Aufrufer behaupten
 * darf.
 */
export async function downloadPdf(docx: DocxDocument, fileName: string): Promise<void> {
  const blob = await buildPdf(docx)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
