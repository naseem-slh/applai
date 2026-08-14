import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import type { ReapplyState } from '@/lib/domain/reapply'
import { variant } from '@/lib/domain/rewrite.testutils'
import { ReapplyStatus } from './ReapplyStatus'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const LAUF = {
  mode: 'schnell',
  steps: [
    { markId: 'a', document: 'letter' as const },
    { markId: 'b', document: 'letter' as const },
  ],
  index: 1,
  applied: 1,
  skipped: [],
} as const

function setup(state: ReapplyState) {
  const onRetry = vi.fn()
  const onSkip = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  const onChoose = vi.fn()
  const view = render(
    <ReapplyStatus
      state={state}
      onChoose={onChoose}
      onRetry={onRetry}
      onSkip={onSkip}
      onCancel={onCancel}
    />,
  )
  return { onRetry, onSkip, onCancel, onChoose, user, view }
}

describe('ReapplyStatus', () => {
  it('zeigt im Ruhezustand nichts', () => {
    const { view } = setup({ status: 'bereit' })

    expect(view.container).toBeEmptyDOMElement()
  })

  it('sagt, dass die Anzeige gelesen wird', () => {
    setup({ status: 'anzeigeWirdGelesen', ...LAUF })

    expect(screen.getByText(t('editor.reapply.reading'))).toBeInTheDocument()
  })

  it('zeigt während des Laufs, welche Stelle dran ist', () => {
    setup({ status: 'laeuft', ...LAUF })

    expect(
      screen.getByText(t('editor.reapply.progress', { current: 2, total: 2 })),
    ).toBeInTheDocument()
  })

  // Der Wechsel der Stelle geschieht ohne Zutun des Nutzers. Ohne
  // Höflichkeitsmeldung bekäme eine Vorlesesoftware davon nichts mit.
  it('meldet den Fortschritt höflich an Hilfsmittel', () => {
    setup({ status: 'laeuft', ...LAUF })

    const zeile = screen.getByRole('status')
    expect(zeile).toHaveAttribute('aria-live', 'polite')
  })

  it('nennt beim Halt den Grund und bietet die Auswege', async () => {
    const { onRetry, onSkip, user } = setup({
      status: 'haelt',
      reason: 'anbieterfehler',
      variants: [],
      ...LAUF,
    })

    expect(screen.getByText(t('editor.reapply.halt.anbieterfehler'))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t('editor.reapply.retry') }))
    expect(onRetry).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: t('editor.reapply.skip') }))
    expect(onSkip).toHaveBeenCalled()
  })

  // Beim Wählen ist die Variantenauswahl selbst der Weg weiter — ein
  // „Erneut versuchen" daneben wäre eine zweite, sinnlose Anfrage.
  it('bietet beim Wählen kein „erneut versuchen" an', () => {
    setup({ status: 'haelt', reason: 'wahl', variants: [], ...LAUF })

    expect(screen.getByText(t('editor.reapply.halt.wahl'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('editor.reapply.retry') }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('editor.reapply.skip') })).toBeInTheDocument()
  })

  // Die drei stehen hier, weil sie schon bezahlt sind: Das Fähnchen am Brief
  // holt seine Varianten selbst und würde dieselbe Stelle ein zweites Mal
  // anfragen.
  it('zeigt beim Wählen die bereits geholten Formulierungen zur Übernahme', async () => {
    const varianten = [
      variant('Erste Fassung'),
      variant('Zweite Fassung'),
      variant('Dritte Fassung'),
    ]
    const { onChoose, user } = setup({
      status: 'haelt',
      reason: 'wahl',
      variants: varianten,
      ...LAUF,
    })

    expect(screen.getByText('Zweite Fassung')).toBeInTheDocument()

    const knoepfe = screen.getAllByRole('button', { name: t('editor.variants.apply') })
    expect(knoepfe).toHaveLength(3)
    await user.click(knoepfe[1]!)

    expect(onChoose).toHaveBeenCalledWith(varianten[1])
  })

  it('lässt den ganzen Durchlauf abbrechen, solange er läuft', async () => {
    const { onCancel, user } = setup({ status: 'laeuft', ...LAUF })

    await user.click(screen.getByRole('button', { name: t('editor.reapply.stop') }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('zeigt am Ende, was übernommen und was ausgelassen wurde', () => {
    setup({
      status: 'fertig',
      applied: 3,
      skipped: [{ markId: 'x', document: 'letter' as const, reason: 'anbieterfehler' as const }],
    })

    expect(screen.getByText(t('editor.reapply.done', { count: 3 }))).toBeInTheDocument()
    expect(screen.getByText(t('editor.reapply.skipped', { count: 1 }))).toBeInTheDocument()
  })

  it('schweigt am Ende über Ausgelassenes, wenn es keines gibt', () => {
    setup({ status: 'fertig', applied: 2, skipped: [] })

    expect(screen.getByText(t('editor.reapply.done', { count: 2 }))).toBeInTheDocument()
    expect(
      screen.queryByText(t('editor.reapply.skipped', { count: 1 })),
    ).not.toBeInTheDocument()
  })

  it('sagt beim Abbruch zu, dass Übernommenes stehen bleibt', () => {
    setup({
      status: 'abgebrochen',
      applied: 1,
      skipped: [{ markId: 'b', document: 'letter' as const, reason: 'abgebrochen' as const }],
    })

    expect(screen.getByText(t('editor.reapply.stopped'))).toBeInTheDocument()
    expect(screen.getByText(t('editor.reapply.done', { count: 1 }))).toBeInTheDocument()
  })
})
