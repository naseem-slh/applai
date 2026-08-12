import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  createFakeStorage,
  createFakeVault,
  createHarness,
  type HarnessOptions,
} from '@/components/app/appContext.testutils'
import { CV_DRAFT_ID, LETTER_DRAFT_ID, type LoadedDocument } from '@/components/app/appContext'
import { DocumentLoadError, type DocumentLoaders } from '@/components/start/loadDocument'
import i18n from '@/lib/i18n/i18n'
import Start from './Start'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

// Erkennbar erfundene, aber namensförmige Kopfzeile: `detectHeadName`
// nimmt die erste Zeile aus zwei bis vier großgeschriebenen Wörtern.
const LETTER_TEXT = 'Marlene Ostwald\nBuchenweg 4\n12345 Beispielstadt\n\nSehr geehrte Damen und Herren,'
const HEADLESS_TEXT = 'sehr geehrte damen und herren, hiermit bewerbe ich mich.'

function loadedDocument(overrides: Partial<LoadedDocument> = {}): LoadedDocument {
  return {
    fileName: 'anschreiben.docx',
    source: 'docx',
    docxBase: new ArrayBuffer(8),
    text: LETTER_TEXT,
    multiColumn: false,
    ...overrides,
  }
}

function createLoaders(document: LoadedDocument | Error = loadedDocument()): DocumentLoaders {
  return {
    loadDocument: vi.fn(() =>
      document instanceof Error ? Promise.reject(document) : Promise.resolve(document),
    ),
    loadPdfText: vi.fn(() => Promise.resolve('Aus dem PDF gelesener Anzeigentext')),
  }
}

function setup(options: HarnessOptions & { loaders?: DocumentLoaders } = {}) {
  const { loaders = createLoaders(), ...harnessOptions } = options
  const harness = createHarness(harnessOptions)
  const view = render(
    <MemoryRouter>
      <Start loaders={loaders} />
    </MemoryRouter>,
    { wrapper: harness.wrapper },
  )
  return { ...view, ...harness, loaders, user: userEvent.setup() }
}

/** Datei in ein Ablegefeld geben — über den Knopf, nicht über das versteckte Feld. */
async function chooseFile(user: ReturnType<typeof userEvent.setup>, slot: 'letter' | 'cv', file: File) {
  const group = screen.getByRole('heading', { name: t(`start.files.${slot}`) }).parentElement
  if (group === null) throw new Error('Ablegefeld nicht gefunden')
  const input = group.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('Dateifeld nicht gefunden')
  await user.upload(input, file)
}

function docxFile(name = 'anschreiben.docx'): File {
  return new File(['x'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function continueButton(): HTMLElement {
  return screen.getByRole('button', { name: t('start.continue') })
}

describe('Start — Onboarding und Tresorzustände', () => {
  it('zeigt bei leerem Tresor zuerst den Datenschutzhinweis und danach die Schlüsseleinrichtung', async () => {
    const { user } = setup({ status: 'empty' })

    expect(screen.getByRole('heading', { name: t('onboarding.privacy.heading') })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: t('start.documents.heading') })).toBeNull()

    await user.click(screen.getByRole('button', { name: t('onboarding.privacy.accept') }))

    expect(screen.getByRole('heading', { name: t('onboarding.key.heading') })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: t('onboarding.privacy.heading') })).toBeNull()
  })

  it('bietet bei passwortgeschütztem Schlüssel das Entsperren an, nicht das Ersetzen', () => {
    setup({ status: 'locked' })

    expect(screen.getByRole('heading', { name: t('onboarding.unlock.heading') })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: t('onboarding.key.heading') })).toBeNull()
  })

  it('zeigt bei beschädigtem Datensatz den Ausweg aus der Schlüsseleinrichtung', () => {
    setup({ status: 'corrupted' })

    expect(
      screen.getByRole('heading', { name: t('onboarding.key.corrupted.heading') }),
    ).toBeInTheDocument()
  })

  it('trägt die Überschrift der Seite in jedem Zustand', () => {
    setup({ status: 'loading' })

    expect(screen.getByRole('heading', { level: 1, name: t('routes.start.heading') })).toBeInTheDocument()
  })
})

describe('Start — Unterlagen', () => {
  it('akzeptiert ein Anschreiben ohne Lebenslauf', async () => {
    // Die im Plan benannte Prüfung: eine Datei ohne ihr Gegenstück reicht.
    const { user, setSession } = setup()

    await chooseFile(user, 'letter', docxFile())
    await screen.findByText(t('start.files.loaded', { name: 'anschreiben.docx' }))

    await user.type(screen.getByLabelText(t('start.jobAd.label')), 'Wir suchen eine Entwicklerin.')

    expect(continueButton()).toBeEnabled()
    await user.click(continueButton())

    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1))
    expect(setSession).toHaveBeenCalledWith(
      expect.objectContaining({ letter: expect.objectContaining({ fileName: 'anschreiben.docx' }), cv: null }),
    )
  })

  it('akzeptiert einen Lebenslauf ohne Anschreiben', async () => {
    const { user } = setup({ loaders: createLoaders(loadedDocument({ fileName: 'lebenslauf.docx' })) })

    await chooseFile(user, 'cv', docxFile('lebenslauf.docx'))
    await screen.findByText(t('start.files.loaded', { name: 'lebenslauf.docx' }))
    await user.type(screen.getByLabelText(t('start.jobAd.label')), 'Wir suchen eine Entwicklerin.')

    expect(continueButton()).toBeEnabled()
  })

  it('blockiert den Weiter-Knopf bei leerer Eingabe und sagt, was fehlt', () => {
    // Die zweite im Plan benannte Prüfung.
    setup()

    expect(continueButton()).toBeDisabled()
    expect(screen.getByText(t('start.missing.document'))).toBeInTheDocument()
    expect(screen.getByText(t('start.missing.jobAd'))).toBeInTheDocument()
  })

  it('blockiert weiterhin, solange nur die Anzeige dasteht', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText(t('start.jobAd.label')), 'Wir suchen eine Entwicklerin.')

    expect(continueButton()).toBeDisabled()
    expect(screen.getByText(t('start.missing.document'))).toBeInTheDocument()
  })

  it('gibt den beiden Ablegefeldern unterscheidbare Knopfnamen', () => {
    // Zweimal „Datei auswählen" auf einer Seite wäre für eine
    // Vorlesesoftware nicht auseinanderzuhalten; der sichtbare Text bleibt
    // trotzdem Teil des Namens (WCAG 2.5.3).
    setup()

    const choose = t('start.files.choose')
    expect(
      screen.getByRole('button', { name: `${choose} ${t('start.files.letter')}` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `${choose} ${t('start.files.cv')}` }),
    ).toBeInTheDocument()
  })

  it('nimmt eine hineingezogene Datei an', async () => {
    const { loaders } = setup()

    const zone = screen.getByRole('heading', { name: t('start.files.letter') }).nextElementSibling
    if (zone === null) throw new Error('Ablegefeld nicht gefunden')
    fireEvent.drop(zone, { dataTransfer: { files: [docxFile()] } })

    await screen.findByText(t('start.files.loaded', { name: 'anschreiben.docx' }))
    expect(loaders.loadDocument).toHaveBeenCalledTimes(1)
  })

  it('meldet eine unlesbare Datei mit dem Grund, den der Leser zurückgibt', async () => {
    // Nie eine durchgereichte `error.message` (G8) — die Ansicht kennt nur
    // den Grund und übersetzt ihn selbst.
    const { user } = setup({ loaders: createLoaders(new DocumentLoadError('unreadable')) })

    await chooseFile(user, 'letter', docxFile())

    expect(await screen.findByRole('alert')).toHaveTextContent(t('start.files.errors.unreadable'))
    expect(continueButton()).toBeDisabled()
  })
})

describe('Start — PDF-Hinweise', () => {
  it('zeigt bei PDF-Eingabe den Beta-Hinweis, ohne die Mehrspaltigkeit zu behaupten', async () => {
    const { user } = setup({
      loaders: createLoaders(
        loadedDocument({ fileName: 'anschreiben.pdf', source: 'pdf', multiColumn: false }),
      ),
    })

    await chooseFile(user, 'letter', docxFile('anschreiben.pdf'))

    expect(await screen.findByText(t('start.pdf.beta'))).toBeInTheDocument()
    expect(screen.queryByText(t('start.pdf.multiColumn'))).toBeNull()
  })

  it('setzt die Mehrspaltigkeits-Warnung zusätzlich zum Beta-Hinweis, wenn sie erkannt wurde', async () => {
    const { user } = setup({
      loaders: createLoaders(
        loadedDocument({ fileName: 'lebenslauf.pdf', source: 'pdf', multiColumn: true }),
      ),
    })

    await chooseFile(user, 'cv', docxFile('lebenslauf.pdf'))

    expect(await screen.findByText(t('start.pdf.multiColumn'))).toBeInTheDocument()
    // „Zusätzlich", nicht „stattdessen".
    expect(screen.getByText(t('start.pdf.beta'))).toBeInTheDocument()
  })

  it('zeigt bei einer Word-Datei keinen Beta-Hinweis', async () => {
    const { user } = setup()

    await chooseFile(user, 'letter', docxFile())
    await screen.findByText(t('start.files.loaded', { name: 'anschreiben.docx' }))

    expect(screen.queryByText(t('start.pdf.beta'))).toBeNull()
  })
})

describe('Start — der Name des Nutzers (Übergabe 1)', () => {
  it('übernimmt den Namen aus dem Kopfbereich des Dokuments und lässt ihn prüfen', async () => {
    const { user } = setup()

    await chooseFile(user, 'letter', docxFile())

    const field = await screen.findByLabelText(t('start.name.label'))
    expect(field).toHaveValue('Marlene Ostwald')
    expect(screen.getByText(t('start.name.detected'))).toBeInTheDocument()
  })

  it('fragt nach dem Namen, wenn die Erkennung nichts findet, und blockiert bis dahin', async () => {
    // Der entscheidende Fall: Ein leerer Name führte in
    // `withAnonymization` dazu, dass sich `resolveNameHint` den ersten
    // namensförmigen Treffer sucht — auch eine Firmierung.
    const { user, setSession } = setup({
      loaders: createLoaders(loadedDocument({ text: HEADLESS_TEXT })),
    })

    await chooseFile(user, 'letter', docxFile())
    await user.type(screen.getByLabelText(t('start.jobAd.label')), 'Wir suchen eine Entwicklerin.')

    const field = await screen.findByLabelText(t('start.name.label'))
    expect(field).toHaveValue('')
    expect(continueButton()).toBeDisabled()
    expect(screen.getByText(t('start.missing.userName'))).toBeInTheDocument()

    await user.type(field, 'Marlene Ostwald')

    expect(continueButton()).toBeEnabled()
    await user.click(continueButton())
    await waitFor(() => expect(setSession).toHaveBeenCalled())
    expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ userName: 'Marlene Ostwald' }))
  })

  it('überschreibt einen von Hand eingetragenen Namen nicht mit der Erkennung', async () => {
    const { user } = setup({ session: { letter: loadedDocument(), userName: 'Ada Ostwald-Renk' } })

    await chooseFile(user, 'cv', docxFile('lebenslauf.docx'))

    await waitFor(() =>
      expect(screen.getByLabelText(t('start.name.label'))).toHaveValue('Ada Ostwald-Renk'),
    )
  })

  it('fragt gar nicht nach dem Namen, solange kein Dokument dasteht', () => {
    setup()

    expect(screen.queryByLabelText(t('start.name.label'))).toBeNull()
  })
})

describe('Start — Stellenausschreibung', () => {
  it('liest den Anzeigentext aus einer PDF-Datei in das Feld', async () => {
    const { user, loaders } = setup()

    const inputs = document.querySelectorAll('input[type="file"]')
    // Drittes Dateifeld der Seite: Anschreiben, Lebenslauf, Anzeige.
    const jobAdInput = inputs.item(2)
    if (!(jobAdInput instanceof HTMLInputElement)) throw new Error('Dateifeld der Anzeige nicht gefunden')
    await user.upload(jobAdInput, new File(['x'], 'anzeige.pdf', { type: 'application/pdf' }))

    await waitFor(() =>
      expect(screen.getByLabelText(t('start.jobAd.label'))).toHaveValue(
        'Aus dem PDF gelesener Anzeigentext',
      ),
    )
    expect(loaders.loadPdfText).toHaveBeenCalledTimes(1)
    // Kein Beta-Hinweis: Für die Anzeige wird nur Text gelesen, nichts nach
    // Word umgewandelt.
    expect(screen.queryByText(t('start.pdf.beta'))).toBeNull()
  })
})

describe('Start — Bewerbungsliste und Doppelbewerbung', () => {
  it('zeigt die Liste und weist auf eine frühere Bewerbung bei derselben Firma hin', async () => {
    const storage = createFakeStorage({
      applications: [
        { id: '1', company: 'Nordwerk Systeme', position: 'Entwicklerin', date: '2026-05-04' },
      ],
    })
    const { user } = setup({ storage })

    expect(await screen.findByText('Nordwerk Systeme')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()

    await user.type(
      screen.getByLabelText(t('start.jobAd.label')),
      'Die Nordwerk Systeme GmbH sucht Verstärkung.',
    )

    expect(screen.getByRole('alert').textContent).toContain('Nordwerk Systeme')
  })

  it('sagt bei leerer Liste, wann ein Eintrag entsteht', async () => {
    setup()

    expect(await screen.findByText(t('start.applications.empty'))).toBeInTheDocument()
  })
})

describe('Start — zuletzt benutzte Dokumente', () => {
  it('bietet einen vorhandenen Zwischenstand an und übernimmt ihn samt Namen', async () => {
    const storage = createFakeStorage({
      drafts: new Map([
        [
          LETTER_DRAFT_ID,
          { id: LETTER_DRAFT_ID, docxBase: new ArrayBuffer(4), text: LETTER_TEXT, savedAt: Date.UTC(2026, 7, 10) },
        ],
      ]),
    })
    const { user } = setup({ storage })

    await screen.findByRole('heading', { name: t('start.recent.heading') })
    await user.click(screen.getByRole('button', { name: t('start.recent.use') }))

    expect(screen.getByText(t('start.files.loaded', { name: t('start.files.fromDraft') }))).toBeInTheDocument()
    expect(screen.getByLabelText(t('start.name.label'))).toHaveValue('Marlene Ostwald')
    expect(screen.queryByRole('heading', { name: t('start.recent.heading') })).toBeNull()
  })

  it('löscht einen verworfenen Zwischenstand wirklich', async () => {
    const storage = createFakeStorage({
      drafts: new Map([
        [CV_DRAFT_ID, { id: CV_DRAFT_ID, docxBase: new ArrayBuffer(4), text: LETTER_TEXT, savedAt: Date.now() }],
      ]),
    })
    const { user } = setup({ storage })

    await screen.findByRole('heading', { name: t('start.recent.heading') })
    await user.click(screen.getByRole('button', { name: t('start.recent.discard') }))

    expect(storage.deleteDraft).toHaveBeenCalledWith(CV_DRAFT_ID)
    expect(storage.state.drafts.size).toBe(0)
  })

  it('fragt den Speicher erst, wenn abgelaufene Entwürfe gelöscht sind', () => {
    // Sonst böte die Seite einen Entwurf an, der im selben Moment abläuft.
    const storage = createFakeStorage()
    setup({ storage, storageReady: false })

    expect(storage.loadDraft).not.toHaveBeenCalled()
    expect(storage.listApplications).not.toHaveBeenCalled()
  })
})

describe('Start — Übergabe an die Arbeitsfläche', () => {
  it('legt beim Weitergehen einen Zwischenstand ab', async () => {
    const storage = createFakeStorage()
    const { user } = setup({ storage })

    await chooseFile(user, 'letter', docxFile())
    await screen.findByText(t('start.files.loaded', { name: 'anschreiben.docx' }))
    await user.type(screen.getByLabelText(t('start.jobAd.label')), 'Wir suchen eine Entwicklerin.')
    await user.click(continueButton())

    await waitFor(() => expect(storage.saveDraft).toHaveBeenCalledTimes(1))
    expect(storage.state.drafts.get(LETTER_DRAFT_ID)).toMatchObject({ text: LETTER_TEXT })
    expect(storage.state.drafts.has(CV_DRAFT_ID)).toBe(false)
  })

  it('nimmt einen bereits übergebenen Stand beim Zurückkommen wieder auf', () => {
    setup({
      session: {
        letter: loadedDocument(),
        jobAdText: 'Wir suchen eine Entwicklerin.',
        userName: 'Marlene Ostwald',
      },
    })

    expect(screen.getByText(t('start.files.loaded', { name: 'anschreiben.docx' }))).toBeInTheDocument()
    expect(screen.getByLabelText(t('start.jobAd.label'))).toHaveValue('Wir suchen eine Entwicklerin.')
    expect(continueButton()).toBeEnabled()
  })

  it('geht auch dann weiter, wenn sich der Zwischenstand nicht speichern lässt', async () => {
    const storage = createFakeStorage()
    storage.saveDraft = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))
    const { user, setSession } = setup({ storage })

    await chooseFile(user, 'letter', docxFile())
    await screen.findByText(t('start.files.loaded', { name: 'anschreiben.docx' }))
    await user.type(screen.getByLabelText(t('start.jobAd.label')), 'Wir suchen eine Entwicklerin.')
    await user.click(continueButton())

    await waitFor(() => expect(setSession).toHaveBeenCalled())
  })
})

describe('Start — gesperrter Speicher', () => {
  it('sagt es, statt so zu tun, als würde etwas gemerkt', () => {
    setup({ storageUnavailable: true, vault: createFakeVault() })

    expect(screen.getByText(t('start.storageUnavailable'))).toBeInTheDocument()
  })
})
