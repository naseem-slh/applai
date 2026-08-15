import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocxDocument, Paragraph } from '@/lib/docx/model'
import i18n from '@/lib/i18n/i18n'
import { ExportBar, type ExportDocument, type ExportDocumentKind } from './ExportBar'

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

/**
 * Ein leerer XML-Baum als `doc`. Er wird gebraucht, seit `ExportBar` am
 * Dokument abliest, ob eine Tabelle darin steht (`hasTables`) — ein `null`
 * mit Typzusicherung reichte dafür nicht mehr.
 */
function emptyXml(inner = ''): XMLDocument {
  return new DOMParser().parseFromString(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:document>`,
    'application/xml',
  )
}

function fakeDocument(texts: string[], inner = ''): DocxDocument {
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
  return { zip: {}, doc: emptyXml(inner), paragraphs, text: texts.join('\n') }
}

const DOCX = fakeDocument(['Sehr geehrte Damen und Herren,', '', 'ich bewerbe mich.'])

/** Ein Dokument mit einer Tabelle — der Fall, für den der PDF-Weg gesperrt ist. */
const DOCX_WITH_TABLE = fakeDocument(
  ['Berufserfahrung', '2019 bis 2022'],
  '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>',
)

function setup(
  options: {
    blocked?: boolean
    company?: string | null
    onNextPosting?: () => void
    document?: DocxDocument
    documents?: readonly ExportDocument[]
    activeKind?: ExportDocumentKind
  } = {},
) {
  const onExported = vi.fn()
  render(
    <ExportBar
      documents={
        options.documents ?? [
          {
            kind: 'letter',
            document: options.document ?? DOCX,
            blocked: options.blocked ?? false,
          },
        ]
      }
      // Heruntergeladen wird, was oben gewählt ist. Ohne Angabe das
      // Anschreiben — die Reihenfolge des Umschalters.
      activeKind={options.activeKind ?? 'letter'}
      company={options.company === undefined ? 'Musterwerk' : options.company}
      onExported={onExported}
      onNextPosting={options.onNextPosting ?? (() => {})}
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

  it('sagt im Fähnchen, dass das PDF neu gesetzt wird', async () => {
    // Der Halbsatz stand als dauerhafte Zeile unter den Knöpfen. Er sagt
    // etwas über **einen** der drei Wege und gehört deshalb an ihn.
    setup()

    fireEvent.focus(screen.getByRole('button', { name: t('editor.export.pdf') }))

    const fahne = await screen.findAllByText(t('editor.export.pdfTooltip'))
    expect(fahne.length).toBeGreaterThan(0)
  })
})

/**
 * Die Tabellensperre. Der PDF-Satz kennt keine Tabellen
 * (`lib/export/pdf/layout.ts`), und ein zweispaltiger Lebenslauf IST eine
 * Tabelle — das PDF käme still ohne seine Spalten heraus.
 */
describe('ExportBar — Tabellen', () => {
  it('sperrt den PDF-Weg, sobald eine Tabelle im Dokument steht', () => {
    setup({ document: DOCX_WITH_TABLE })

    expect(screen.getByRole('button', { name: t('editor.export.pdf') })).toBeDisabled()
  })

  it('lässt Word und Kopierfeld dabei offen — sie reichen das Original weiter', () => {
    setup({ document: DOCX_WITH_TABLE })

    expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeEnabled()
    expect(screen.getByRole('button', { name: t('editor.export.copy') })).toBeEnabled()
  })
})

/**
 * Der Export gehört der Bewerbung, nicht dem sichtbaren Dokument: Wer beide
 * Unterlagen angepasst hat, sieht hier beide.
 */
describe('ExportBar — zwei Unterlagen', () => {
  const BOTH: readonly ExportDocument[] = [
    { kind: 'letter', document: DOCX, blocked: false },
    { kind: 'cv', document: fakeDocument(['Berufserfahrung', 'Entwickelt Software']), blocked: false },
  ]

  it('bietet genau die Unterlage an, die oben gewählt ist', () => {
    // Sechs Knöpfe für zwei Unterlagen waren vier zu viel: Heruntergeladen
    // wird, was der Umschalter zeigt.
    setup({ documents: BOTH, activeKind: 'cv' })

    expect(screen.getAllByRole('button', { name: t('editor.export.docx') })).toHaveLength(1)
  })

  it('sperrt den Weg, wenn in der gewählten Unterlage eine unbestätigte Aussage steht', () => {
    const gesperrt: readonly ExportDocument[] = [
      { kind: 'letter', document: DOCX, blocked: false },
      { kind: 'cv', document: DOCX, blocked: true },
    ]

    setup({ documents: gesperrt, activeKind: 'letter' })
    expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeEnabled()

    cleanup()

    setup({ documents: gesperrt, activeKind: 'cv' })
    expect(screen.getByRole('button', { name: t('editor.export.docx') })).toBeDisabled()
  })

  it('sagt beim Erzeugen, um welche Unterlage es geht', async () => {
    setup({ documents: BOTH, activeKind: 'cv' })

    fireEvent.click(screen.getByRole('button', { name: t('editor.export.docx') }))

    await waitFor(() =>
      expect(
        screen.getByText(`${t('editor.switch.cv')}: ${t('editor.export.docxDone')}`),
      ).toBeInTheDocument(),
    )
  })
})
