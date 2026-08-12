import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import type { LlmProvider, ModelChoice } from '@/lib/ai/provider'
import i18n from '@/lib/i18n/i18n'
import { ModelPicker, type ModelPickerProps } from './ModelPicker'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const CHOICES: ModelChoice[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
]

function provider(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id: 'gemini',
    label: 'Gemini',
    model: 'gemini-3.6-flash',
    endpoint: 'https://generativelanguage.googleapis.com',
    generate: vi.fn(() => Promise.resolve('{}')),
    listModels: vi.fn(() => Promise.resolve(CHOICES)),
    ...overrides,
  }
}

function setup(overrides: Partial<ModelPickerProps> = {}) {
  const props: ModelPickerProps = {
    provider: provider(),
    apiKey: 'test-key',
    value: undefined,
    onChange: vi.fn(),
    fieldId: 'modell',
    paidKey: false,
    ...overrides,
  }
  render(<ModelPicker {...props} />)
  return props
}

describe('ModelPicker', () => {
  it('nennt das voreingestellte Modell, solange nichts gewählt ist', () => {
    setup()
    expect(
      screen.getByText(t('settings.model.current', { model: 'gemini-3.6-flash' })),
    ).toBeInTheDocument()
  })

  it('sagt ausdrücklich, dass die Liste den kostenlosen Tarif nicht ausweist', () => {
    setup()
    const hint = t('settings.model.hint')
    expect(hint).not.toBe('settings.model.hint')
    expect(screen.getByText(hint)).toBeInTheDocument()
  })

  it('übernimmt eine von Hand eingetragene Kennung', () => {
    const props = setup()

    fireEvent.change(screen.getByLabelText(t('settings.model.label'), { exact: false }), {
      target: { value: 'gemini-2.5-flash' },
    })

    expect(props.onChange).toHaveBeenCalledWith('gemini-2.5-flash')
  })

  // Ein leeres Feld heißt „nimm die Voreinstellung", nicht „Modell ohne Namen".
  it('macht aus einem geleerten Feld die Voreinstellung', () => {
    const props = setup({ value: 'gemini-2.5-flash' })

    fireEvent.change(screen.getByLabelText(t('settings.model.label'), { exact: false }), {
      target: { value: '   ' },
    })

    expect(props.onChange).toHaveBeenCalledWith(undefined)
  })

  // Die Liste kostet eine Anfrage. Sie darf erst auf Druck hinausgehen.
  it('holt die Liste nicht von selbst, sondern erst auf Knopfdruck', async () => {
    const listModels = vi.fn(() => Promise.resolve(CHOICES))
    setup({ provider: provider({ listModels }) })

    expect(listModels).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: t('settings.model.load') }))

    // Beide sind Flash-Modelle, im kostenlosen Tarif bleiben also beide stehen.
    await waitFor(() =>
      expect(screen.getByText(t('settings.model.loaded', { count: 2 }))).toBeInTheDocument(),
    )
    expect(listModels).toHaveBeenCalledTimes(1)
  })

  it('bietet das Laden nicht an, wenn der Anbieter keine Liste kennt', () => {
    setup({ provider: provider({ listModels: undefined }) })
    expect(screen.queryByRole('button', { name: t('settings.model.load') })).not.toBeInTheDocument()
  })

  it('sperrt das Laden, solange der Tresor gesperrt ist', () => {
    setup({ apiKey: null })

    expect(screen.getByRole('button', { name: t('settings.model.load') })).toBeDisabled()
    expect(screen.getByText(t('settings.model.needsKey'))).toBeInTheDocument()
  })

  it('setzt auf die Voreinstellung zurück', () => {
    const props = setup({ value: 'gemini-2.5-flash' })

    fireEvent.click(screen.getByRole('button', { name: t('settings.model.reset') }))

    expect(props.onChange).toHaveBeenCalledWith(undefined)
  })

  it('zeigt einen fehlgeschlagenen Abruf als Fehler statt still zu bleiben', async () => {
    const listModels = vi.fn(() => Promise.reject(new LlmError('invalid_key', 'gemini', 'egal')))
    setup({ provider: provider({ listModels }) })

    fireEvent.click(screen.getByRole('button', { name: t('settings.model.load') }))

    expect(await screen.findByRole('alert')).toHaveTextContent(t('ai.errors.invalid_key'))
  })

  it('lässt Pro-Modelle im kostenlosen Tarif weg', async () => {
    const listModels = vi.fn(() =>
      Promise.resolve([...CHOICES, { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }]),
    )
    setup({ provider: provider({ listModels }), paidKey: false })

    fireEvent.click(screen.getByRole('button', { name: t('settings.model.load') }))

    await waitFor(() =>
      expect(screen.getByText(t('settings.model.loaded', { count: 2 }))).toBeInTheDocument(),
    )
  })

  it('nimmt Pro dazu, sobald der Schlüssel abgerechnet wird', async () => {
    const listModels = vi.fn(() =>
      Promise.resolve([...CHOICES, { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }]),
    )
    setup({ provider: provider({ listModels }), paidKey: true })

    fireEvent.click(screen.getByRole('button', { name: t('settings.model.load') }))

    await waitFor(() =>
      expect(screen.getByText(t('settings.model.loaded', { count: 3 }))).toBeInTheDocument(),
    )
  })

  // Eine Heuristik über fremde Namen wird eines Tages danebenliegen. Dann
  // darf sie nicht das Modell verstecken, das gerade gebraucht wird.
  it('zeigt auf Wunsch alles, auch was die Heuristik aussortiert hätte', async () => {
    const listModels = vi.fn(() =>
      Promise.resolve([...CHOICES, { id: 'text-embedding-004', label: 'Einbettung' }]),
    )
    setup({ provider: provider({ listModels }), paidKey: false })
    fireEvent.click(screen.getByRole('button', { name: t('settings.model.load') }))
    await waitFor(() =>
      expect(screen.getByText(t('settings.model.loaded', { count: 2 }))).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: t('settings.model.showAll') }))

    expect(screen.getByText(t('settings.model.loaded', { count: 3 }))).toBeInTheDocument()
  })
})
