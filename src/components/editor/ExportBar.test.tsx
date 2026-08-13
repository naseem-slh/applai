import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import i18n from '@/lib/i18n/i18n'
import { ExportBar } from './ExportBar'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

vi.mock('@/lib/docx/serialize', () => ({
  // Der Weg von `DocxDocument` zu Bytes ist in `serialize.test.ts` geprüft.
  // Hier zählt, was die Ansicht mit dem Ergebnis tut.
  serializeDocx: vi.fn(() => Promise.resolve(new Blob(['docx'], { type: 'application/zip' }))),
}))

// Dasselbe für den PDF-Weg: Dass die Datei richtig aussieht, prüft
// `src/lib/export/pdf/write.test.ts` mit einem fremden Leser. Hier zählt nur,
// ob die Ansicht ihn anstößt, den Erfolg meldet und die Bewerbung abschließt.
const downloadPdf = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@/lib/export/pdf', () => ({ downloadPdf }))

function fakeDocument(texts: string[]): DocxDocument {
  let offset = 0
  const paragraphs: Paragraph[] = texts.map((text, index) => {
    const start = offset
    offset += text.length + 1
    return {
      index,
      node: null as unknown as Element,
      text,
      runs: [],
      start,
      end: start + text.length,
    }
  })
  return { zip: {}, doc: null as unknown as XMLDocument, paragraphs, text: texts.join('\n') }
}

const DOCX = fakeDocument(['Sehr geehrte Damen und Herren,', '', 'ich bewerbe mich.'])

function setup(options: { blocked?: boolean; company?: string | null } = {}) {
  const onExported = vi.fn()
  render(
    <ExportBar
      document={DOCX}
      company={options.company === undefined ? 'Musterwerk' : options.company}
      blocked={options.blocked ?? false}
      onExported={onExported}
    />,
  )
  return { onExported }
}

function stubDownload() {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  })
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ExportBar', () => {
  it('bietet alle drei Wege an', () => {
    setup()

    expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeEnabled()
    expect(screen.getByRole('button', { name: t('editor.export.pdf') })).toBeEnabled()
    expect(screen.getByRole('button', { name: t('editor.export.copy') })).toBeEnabled()
  })

  // G10: Die Exportsperre gilt für jeden Weg hinaus, auch für den Reintext.
  it('sperrt alle drei Wege, solange eine unbestätigte Aussage im Brief steht', () => {
    setup({ blocked: true })

    expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('editor.export.pdf') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('editor.export.copy') })).toBeDisabled()
  })

  it('lädt die Word-Datei mit sprechendem Namen herunter und meldet danach den Export', async () => {
    const click = stubDownload()
    const { onExported } = setup({ company: 'Musterwerk Solutions' })

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.docx') }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toMatch(/^Anschreiben_Musterwerk_Solutions_\d{4}-\d{2}-\d{2}\.docx$/)
    await waitFor(() => expect(onExported).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.docxDone'))
  })

  it('meldet einen gescheiterten Download, ohne die Bewerbung einzutragen', async () => {
    const { serializeDocx } = await import('@/lib/docx/serialize')
    vi.mocked(serializeDocx).mockRejectedValueOnce(new Error('kaputt'))
    const { onExported } = setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.docx') }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.docxFailed')),
    )
    expect(onExported).not.toHaveBeenCalled()
  })

  it('kopiert den Reintext mit Leerzeilen zwischen den Absätzen', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.copy') }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'Sehr geehrte Damen und Herren,\n\nich bewerbe mich.',
      ),
    )
    expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.copyDone'))
  })

  // Das Kopierfeld ist für Online-Formulare — wer dorthin kopiert, ist noch
  // mitten im Ausfüllen und hat nicht exportiert.
  it('schließt die Bewerbung mit dem Kopieren nicht ab', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => Promise.resolve()) } })
    const { onExported } = setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.copy') }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.copyDone')),
    )
    expect(onExported).not.toHaveBeenCalled()
  })

  it('meldet eine abgelehnte Zwischenablage, statt Erfolg vorzutäuschen', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error('NotAllowedError'))) },
    })
    setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.copy') }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.copyFailed')),
    )
  })

  it('erzeugt das PDF unter demselben Namen wie die Word-Datei', async () => {
    setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.pdf') }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.pdfDone')),
    )
    expect(downloadPdf).toHaveBeenCalledWith(DOCX, expect.stringMatching(/^Anschreiben_Musterwerk_\d{4}-\d{2}-\d{2}\.pdf$/))
  })

  /**
   * Der Unterschied zum alten Weg über den Druckdialog: Eine erzeugte Datei
   * ist ein eindeutiger Abschluss. `afterprint` war es nie — es feuerte auch
   * nach einem Abbruch, und den Zwischenstand daraufhin zu löschen hieße, die
   * Arbeit wegzuwerfen, weil jemand in eine Vorschau geschaut hat.
   */
  it('schließt die Bewerbung mit dem PDF ab', async () => {
    const { onExported } = setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.pdf') }))

    await waitFor(() => expect(onExported).toHaveBeenCalledTimes(1))
  })

  it('meldet ein gescheitertes PDF, statt Erfolg vorzutäuschen', async () => {
    downloadPdf.mockRejectedValueOnce(new Error('Schrift nicht ladbar'))
    const { onExported } = setup()

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.pdf') }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(t('editor.export.pdfFailed')),
    )
    expect(onExported).not.toHaveBeenCalled()
  })

  it('sagt, dass das PDF neu gesetzt wird', () => {
    setup()

    expect(screen.getByText(t('editor.export.pdfHint'))).toBeInTheDocument()
  })
})
