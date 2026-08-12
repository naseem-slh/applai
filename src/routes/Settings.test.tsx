import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createFakeStorage,
  createFakeVault,
  createHarness,
  type HarnessOptions,
} from '@/components/app/appContext.testutils'
import i18n from '@/lib/i18n/i18n'
import type { ProviderId } from '@/lib/storage/keyVault'
import Settings from './Settings'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

// Wie in Select.test.tsx: Radix' Auswahlliste braucht Zeigererfassung und
// scrollIntoView, beides kennt jsdom nicht.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function setup(options: HarnessOptions = {}) {
  const harness = createHarness(options)
  const view = render(<Settings />, { wrapper: harness.wrapper })
  return { ...view, ...harness, user: userEvent.setup() }
}

/**
 * Einen Wert in einer Schalterreihe wählen.
 *
 * Seit dem Aufräumen sind Darstellung, Sprache und Wahrheitsgrenze keine
 * Auswahllisten mehr, sondern Reihen aus sichtbaren Knöpfen (`Choice`).
 * Radix gibt ihnen `role="group"` und den Feldern `role="radio"`.
 */
function choose(groupName: string, optionName: string): void {
  const group = screen.getByRole('radiogroup', { name: groupName })
  fireEvent.click(within(group).getByRole('radio', { name: optionName }))
}

/** Einen Eintrag in einer Radix-Auswahlliste wählen — die gibt es noch in
 *  der Schlüsseleinrichtung, wo die Werte länger sind als eine Reihe trägt. */
function chooseFromList(triggerName: string, optionName: string): void {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: triggerName }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(screen.getByRole('option', { name: optionName }))
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: t('settings.delete.action') }))
  await user.click(await screen.findByRole('button', { name: t('settings.delete.confirm') }))
}

describe('Settings — Einstellungen ändern', () => {
  it('speichert das gewählte Erscheinungsbild', () => {
    const { updateSettings } = setup()

    choose(t('settings.appearance.label'), t('settings.appearance.options.dark'))

    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('speichert die gewählte Sprache', () => {
    const { updateSettings } = setup()

    choose(t('settings.language.label'), t('settings.language.options.en'))

    expect(updateSettings).toHaveBeenCalledWith({ uiLanguage: 'en' })
  })

  it('schaltet die Anonymisierung um und warnt, sobald sie aus ist', async () => {
    const { user, updateSettings } = setup()

    await user.click(screen.getByRole('switch', { name: t('settings.anonymize.label') }))

    expect(updateSettings).toHaveBeenCalledWith({ anonymize: false })
  })

  it('sagt bei abgeschalteter Anonymisierung, was das bedeutet', () => {
    setup({ settings: { anonymize: false } })

    expect(screen.getByText(t('settings.anonymize.off'))).toBeInTheDocument()
  })

  it('erklärt den gewählten Wahrheitsmodus, statt nur seinen Namen zu zeigen', () => {
    setup({ settings: { truthMode: 'free' } })

    expect(screen.getByText(t('settings.truthMode.explanations.free'))).toBeInTheDocument()
    expect(screen.queryByText(t('settings.truthMode.explanations.strict'))).toBeNull()
  })

  it('meldet, wenn eine Änderung nicht gespeichert werden konnte', async () => {
    const updateSettings = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))
    setup({ updateSettings })

    choose(t('settings.appearance.label'), t('settings.appearance.options.dark'))

    expect(await screen.findByText(t('settings.saveFailed'))).toBeInTheDocument()
  })
})

describe('Settings — Anbieter und Schlüssel', () => {
  it('nennt den Anbieter, zu dem der hinterlegte Schlüssel gehört', () => {
    setup({ vault: createFakeVault({ getProvider: vi.fn((): ProviderId => 'anthropic') }) })

    // Der Name des Anbieters steht seit dem Aufräumen für sich, nicht mehr
    // in einem Satz: „Anthropic" fett, „Schlüssel hinterlegt" leise daneben.
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
    expect(screen.getByText(t('settings.key.currentProvider'))).toBeInTheDocument()
  })

  it('sagt es, wenn noch kein Schlüssel hinterlegt ist', () => {
    setup({ status: 'empty' })

    expect(screen.getByText(t('settings.key.noProvider'))).toBeInTheDocument()
  })

  it('zieht den beim Speichern gewählten Anbieter in die Einstellungen nach', async () => {
    // Der Tresor ist die maßgebliche Quelle; `Settings.provider` folgt ihm,
    // damit die Sicherungsdatei ihn trägt.
    const vault = createFakeVault()
    const { user, updateSettings } = setup({ status: 'empty', vault })

    await user.type(screen.getByLabelText(t('onboarding.key.apiKeyLabel')), 'AQ.BEISPIEL-kein-echter')
    chooseFromList(t('onboarding.key.billingLabel'), t('onboarding.key.billingFree'))
    await user.click(screen.getByRole('button', { name: t('onboarding.key.submit') }))

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({ provider: 'gemini', paidKey: false }),
    )
  })
})

describe('Settings — Sicherung', () => {
  it('lädt eine Sicherungsdatei mit sprechendem Namen herunter und gibt ihre Objekt-URL erst danach frei', async () => {
    const createObjectURL = vi.fn(() => 'blob:applai/test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    // jsdom kennt keinen Download; ohne diesen Ersatz meldete es
    // „navigation to another Document". Der Ersatz ist zugleich die
    // Stelle, an der der Dateiname prüfbar wird.
    const downloads: { href: string; download: string }[] = []
    // Ein aus dem Klick heraus eingereihter Mikrotask läuft, wenn die
    // laufende Aufgabe fertig ist, aber bevor die nächste beginnt. Wer die
    // Objekt-URL unmittelbar nach `click()` freigibt, ist zu diesem
    // Zeitpunkt damit durch; wer sie aufschiebt, noch nicht. Genau daran
    // hängt der Download: Er beginnt erst nach der laufenden Aufgabe.
    let revokedBeforeNextTask: boolean | null = null
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ href: this.href, download: this.download })
        queueMicrotask(() => {
          revokedBeforeNextTask = revokeObjectURL.mock.calls.length > 0
        })
      })

    const storage = createFakeStorage()
    const { user } = setup({ storage })

    await user.click(screen.getByRole('button', { name: t('settings.backup.export') }))

    await waitFor(() => expect(storage.exportAll).toHaveBeenCalledTimes(1))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(downloads).toHaveLength(1)
    expect(downloads[0]!.href).toBe('blob:applai/test')
    expect(downloads[0]!.download).toMatch(/^applai-sicherung-\d{4}-\d{2}-\d{2}\.json$/)
    // Freigegeben wird die Objekt-URL, sonst hielte sie den Blob bis zum
    // Verlassen der Seite im Speicher.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:applai/test'))
    // Der Kern dieses Tests: aber nicht in derselben Aufgabe wie der Klick.
    // Der Download beginnt asynchron; eine Freigabe davor bricht ihn in
    // mehreren Browsern stillschweigend ab, und die Oberfläche meldete
    // Erfolg, während keine Datei ankäme.
    expect(revokedBeforeNextTask).toBe(false)
    expect(screen.getByText(t('settings.backup.done.export'))).toBeInTheDocument()

    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('spielt eine Sicherung ein und liest Einstellungen und Tresor danach neu', async () => {
    const storage = createFakeStorage()
    const { user, reloadSettings, refresh } = setup({ storage })

    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('Dateifeld nicht gefunden')
    await user.upload(input, new File(['{}'], 'sicherung.json', { type: 'application/json' }))

    await waitFor(() => expect(storage.importAll).toHaveBeenCalledTimes(1))
    expect(reloadSettings).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByText(t('settings.backup.done.import'))).toBeInTheDocument()
  })

  it('reicht die Meldung einer beschädigten Sicherungsdatei nicht durch, sondern übersetzt sie', async () => {
    const storage = createFakeStorage()
    storage.importAll = vi.fn(() =>
      Promise.reject(new Error('Die Sicherungsdatei ist beschädigt oder kein gültiges Applai-Backup.')),
    )
    const { user } = setup({ storage })

    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('Dateifeld nicht gefunden')
    await user.upload(input, new File(['kaputt'], 'sicherung.json', { type: 'application/json' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(t('settings.backup.errors.import'))
    expect(alert.textContent).not.toMatch(/Sicherungsdatei ist beschädigt/)
  })
})

describe('Settings — Alle Daten löschen', () => {
  it('löscht erst nach einer Rückfrage', async () => {
    const storage = createFakeStorage()
    const vault = createFakeVault()
    const { user } = setup({ storage, vault })

    await user.click(screen.getByRole('button', { name: t('settings.delete.action') }))

    expect(storage.clearAll).not.toHaveBeenCalled()
    expect(vault.clear).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: t('settings.delete.confirmTitle') })).toBeInTheDocument()
  })

  it('lässt sich abbrechen, ohne etwas zu löschen', async () => {
    const storage = createFakeStorage()
    const vault = createFakeVault()
    const { user } = setup({ storage, vault })

    await user.click(screen.getByRole('button', { name: t('settings.delete.action') }))
    await user.click(await screen.findByRole('button', { name: t('settings.delete.cancel') }))

    expect(storage.clearAll).not.toHaveBeenCalled()
    expect(vault.clear).not.toHaveBeenCalled()
  })

  it('ruft beide Datenbanken auf — Speicher und Schlüsseltresor', async () => {
    // Übergabe 2: zwei getrennte Datenbanken, eine allein wäre die Hälfte
    // einer Löschung.
    const storage = createFakeStorage({
      applications: [{ id: '1', company: 'Nordwerk Systeme', position: 'Entwicklerin', date: '2026-05-04' }],
    })
    const vault = createFakeVault()
    const { user, reloadSettings, refresh } = setup({ storage, vault })

    await confirmDelete(user)

    await waitFor(() => expect(screen.getByText(t('settings.delete.done'))).toBeInTheDocument())
    expect(storage.clearAll).toHaveBeenCalledTimes(1)
    expect(vault.clear).toHaveBeenCalledTimes(1)
    expect(storage.state.applications).toEqual([])
    expect(reloadSettings).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('meldet keinen Erfolg, wenn nur der Tresor gescheitert ist', async () => {
    const storage = createFakeStorage()
    const vault = createFakeVault({ clear: vi.fn(() => Promise.reject(new Error('Tresor gesperrt'))) })
    const { user } = setup({ storage, vault })

    await confirmDelete(user)

    expect(await screen.findByText(t('settings.delete.vaultFailed'))).toBeInTheDocument()
    expect(screen.queryByText(t('settings.delete.done'))).toBeNull()
    // Die andere Hälfte wurde trotzdem versucht und ist durchgelaufen.
    expect(storage.clearAll).toHaveBeenCalledTimes(1)
  })

  it('löscht den Tresor auch dann, wenn der Speicher nicht antwortet', async () => {
    // Der Knopf ist der einzige Ausweg für jemanden mit beschädigtem
    // Datenbestand — er muss arbeiten, wenn eine Seite hakt.
    const storage = createFakeStorage()
    storage.clearAll = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))
    const vault = createFakeVault()
    const { user } = setup({ storage, vault })

    await confirmDelete(user)

    expect(await screen.findByText(t('settings.delete.storageFailed'))).toBeInTheDocument()
    expect(vault.clear).toHaveBeenCalledTimes(1)
  })

  it('meldet beide Hälften, wenn keine gelöscht werden konnte', async () => {
    const storage = createFakeStorage()
    storage.clearAll = vi.fn(() => Promise.reject(new Error('Speicher gesperrt')))
    const { user } = setup({ storage, vault: createFakeVault({ clear: vi.fn(() => Promise.reject(new Error('x'))) }) })

    await confirmDelete(user)

    expect(await screen.findByText(t('settings.delete.bothFailed'))).toBeInTheDocument()
  })

  it('behauptet nichts, wenn der Tresor gar nicht zur Verfügung steht', async () => {
    const storage = createFakeStorage()
    const harness = createHarness({ storage })
    harness.value.keyVault = { ...harness.value.keyVault, vault: null }
    const user = userEvent.setup()
    render(<Settings />, { wrapper: harness.wrapper })

    await confirmDelete(user)

    expect(await screen.findByText(t('settings.delete.vaultFailed'))).toBeInTheDocument()
  })
})

describe('Settings — gesperrter Speicher', () => {
  it('sagt, dass Änderungen nur für diese Sitzung gelten', () => {
    setup({ storageUnavailable: true })

    expect(screen.getByText(t('settings.storageUnavailable'))).toBeInTheDocument()
  })
})
