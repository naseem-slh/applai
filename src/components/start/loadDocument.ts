import type { LoadedDocument } from '@/components/app/appContext'
import { parseDocx } from '@/lib/docx/parse'
import type { PdfPage } from '@/lib/pdf/extract'

/**
 * Eine hochgeladene Datei zu dem machen, womit die Anwendung weiterarbeitet:
 * `.docx`-Bytes plus Fließtext.
 *
 * Der PDF-Weg ist der Beta-Weg aus `docs/spec.md`: lesen, einspaltig nach
 * Word umwandeln, und dabei melden, ob die Seite mehrspaltig war —
 * `detectMultiColumn` repariert das nicht, es deckt es nur auf, und die
 * Oberfläche warnt dann zusätzlich zum Beta-Hinweis.
 *
 * **Warum das nicht in der Ansicht steht:** Der Ablauf ist mehrstufig
 * (entpacken, umwandeln, erneut parsen) und muss ohne gerenderte Oberfläche
 * prüfbar sein. Die Ansicht bekommt ihn als eine Funktion und kann ihn im
 * Test durch eine Attrappe ersetzen — sonst zöge jeder Test der
 * Einstiegsseite pdf.js mit hinein.
 *
 * **Warum pdf.js dynamisch geladen wird:** Der Standardweg ist `.docx`; pdf.js
 * wiegt gebündelt rund 670 kB und würde beim ersten Aufruf der Seite
 * mitgeladen, obwohl die meisten Nutzer nie ein PDF ablegen. Der `import()`
 * im PDF-Zweig macht daraus ein eigenes Stück, das erst geholt wird, wenn
 * jemand tatsächlich ein PDF wählt. Es bleibt gleicher Herkunft (Vite legt
 * es unter `dist/assets/` ab) und ist damit von `script-src 'self'` gedeckt
 * (G2, G3).
 */

/** Beide PDF-Module in einem Stück — ein Aufruf, ein Nachladen. */
async function pdfModules() {
  const [extract, toDocx] = await Promise.all([
    import('@/lib/pdf/extract'),
    import('@/lib/pdf/toDocx'),
  ])
  return { ...extract, ...toDocx }
}

/** Woran ein Ladevorgang scheitern kann — als Übersetzungsschlüssel, nie als Text (G8). */
export type DocumentLoadReason = 'unsupportedType' | 'passwordProtected' | 'unreadable'

export class DocumentLoadError extends Error {
  readonly reason: DocumentLoadReason

  constructor(reason: DocumentLoadReason) {
    // Die Meldung ist für das Protokoll, nicht für die Oberfläche: Sichtbar
    // wird ausschließlich die Übersetzung zu `reason`.
    super(`Dokument konnte nicht gelesen werden: ${reason}`)
    this.name = 'DocumentLoadError'
    this.reason = reason
  }
}

function isDocx(file: File): boolean {
  return file.name.toLowerCase().endsWith('.docx')
}

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Der Fließtext eines eingelesenen PDFs, Zeile für Zeile.
 *
 * `extractPdf` liefert die Elemente bereits in Lesereihenfolge, aber
 * flach — für einen Text, den ein Modell auswerten soll, braucht es die
 * Zeilenumbrüche zurück. Deshalb dieselbe Zeilenbildung wie dort
 * (`groupItemsIntoLines`), damit beide Seiten sich einig sind, was eine
 * Zeile ist.
 */
export function pdfPagesToText(
  pages: PdfPage[],
  groupItemsIntoLines: (items: PdfPage['items']) => PdfPage['items'][],
): string {
  return pages
    .map((page) =>
      groupItemsIntoLines(page.items)
        .map((line) =>
          line
            .map((item) => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter((line) => line !== '')
        .join('\n'),
    )
    .filter((page) => page !== '')
    .join('\n\n')
}

/** Liest eine `.pdf`-Datei als Text ein — für die eingefügte Stellenausschreibung, ohne Umwandlung nach Word. */
export async function loadPdfText(file: File): Promise<string> {
  if (!isPdf(file)) throw new DocumentLoadError('unsupportedType')
  const pdf = await pdfModules()
  return pdfPagesToText(await readPdfPages(file, pdf), pdf.groupItemsIntoLines)
}

type PdfModules = Awaited<ReturnType<typeof pdfModules>>

async function readPdfPages(file: File, pdf: PdfModules): Promise<PdfPage[]> {
  try {
    return await pdf.extractPdf(await file.arrayBuffer())
  } catch (error) {
    // Der Passwortfall wird an der Meldung erkannt, die `extract.ts` genau
    // dafür als Konstante exportiert — nicht am Text einer beliebigen
    // Ausnahme. Sichtbar wird trotzdem nur die Übersetzung.
    if (error instanceof Error && error.message === pdf.PASSWORD_PROTECTED_MESSAGE) {
      throw new DocumentLoadError('passwordProtected')
    }
    throw new DocumentLoadError('unreadable')
  }
}

export async function loadDocument(file: File): Promise<LoadedDocument> {
  if (isDocx(file)) {
    const docxBase = await file.arrayBuffer()
    let text: string
    try {
      text = (await parseDocx(docxBase)).text
    } catch {
      throw new DocumentLoadError('unreadable')
    }
    return { fileName: file.name, source: 'docx', docxBase, text, multiColumn: false }
  }

  if (isPdf(file)) {
    const pdf = await pdfModules()
    const pages = await readPdfPages(file, pdf)
    const multiColumn = pages.some(pdf.detectMultiColumn)
    let docxBase: ArrayBuffer
    let text: string
    try {
      docxBase = await (await pdf.pdfToDocx(pages)).arrayBuffer()
      text = (await parseDocx(docxBase)).text
    } catch {
      throw new DocumentLoadError('unreadable')
    }
    return { fileName: file.name, source: 'pdf', docxBase, text, multiColumn }
  }

  throw new DocumentLoadError('unsupportedType')
}

/** Was `loadDocument` und `loadPdfText` zusammen ausmachen — als ein Wert, damit die Ansicht ihn im Test ersetzen kann. */
export interface DocumentLoaders {
  loadDocument: (file: File) => Promise<LoadedDocument>
  loadPdfText: (file: File) => Promise<string>
}

export const DEFAULT_LOADERS: DocumentLoaders = { loadDocument, loadPdfText }
