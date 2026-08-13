import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { ReapplyDialog, type ReapplyDialogProps } from './ReapplyDialog'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function setup(props: Partial<ReapplyDialogProps> = {}) {
  const onStart = vi.fn()
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  render(
    <ReapplyDialog
      open
      onOpenChange={onOpenChange}
      markCount={5}
      unresolvedCount={0}
      onStart={onStart}
      {...props}
    />,
  )
  return { onStart, onOpenChange, user }
}

describe('ReapplyDialog', () => {
  it('zeigt nichts, solange er nicht geöffnet ist', () => {
    setup({ open: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sperrt beide Wege, solange keine Anzeige eingefügt ist', () => {
    setup()

    expect(screen.getByRole('button', { name: t('editor.reapply.fast') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('editor.reapply.choose') })).toBeDisabled()
  })

  // Der Nutzer soll vor dem Klick wissen, was der Durchlauf kostet: eine
  // Anfrage für die Anzeige, dazu eine je vorgemerkter Stelle.
  it('beziffert die Kosten aus Anzeige plus vorgemerkten Stellen', () => {
    setup({ markCount: 5 })

    expect(screen.getByText(t('editor.reapply.cost', { count: 6 }))).toBeInTheDocument()
    expect(screen.getByText(t('editor.reapply.marks', { count: 5 }))).toBeInTheDocument()
  })

  it('schweigt über nicht wiedergefundene Stellen, solange es keine gibt', () => {
    setup({ markCount: 5, unresolvedCount: 0 })

    expect(
      screen.queryByText(t('editor.reapply.unresolved', { count: 1 })),
    ).not.toBeInTheDocument()
  })

  it('nennt nicht wiedergefundene Stellen vorab, nicht erst im Lauf', () => {
    setup({ markCount: 4, unresolvedCount: 1 })

    expect(screen.getByText(t('editor.reapply.unresolved', { count: 1 }))).toBeInTheDocument()
  })

  it('gibt Text und Betriebsart „wählen" weiter', async () => {
    const { onStart, user } = setup()

    await user.type(screen.getByLabelText(t('editor.reapply.jobAdLabel')), 'Gesucht: Projektleiterin')
    await user.click(screen.getByRole('button', { name: t('editor.reapply.choose') }))

    expect(onStart).toHaveBeenCalledWith('Gesucht: Projektleiterin', 'waehlen')
  })

  it('meldet den Schnellmodus als eigene Betriebsart', async () => {
    const { onStart, user } = setup()

    await user.type(screen.getByLabelText(t('editor.reapply.jobAdLabel')), 'Gesucht: Projektleiterin')
    await user.click(screen.getByRole('button', { name: t('editor.reapply.fast') }))

    expect(onStart).toHaveBeenCalledWith('Gesucht: Projektleiterin', 'schnell')
  })

  // Leerraum ist keine Anzeige. Sonst ginge eine Anfrage für nichts hinaus.
  it('lässt sich mit reinem Leerraum nicht starten', async () => {
    const { onStart, user } = setup()

    await user.type(screen.getByLabelText(t('editor.reapply.jobAdLabel')), '   ')

    expect(screen.getByRole('button', { name: t('editor.reapply.fast') })).toBeDisabled()
    expect(onStart).not.toHaveBeenCalled()
  })
})
