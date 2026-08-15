import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { ProofreadingPanel } from './ProofreadingPanel'
import type { ProofreadingFinding } from './proofreading'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const DOUBLED: ProofreadingFinding = {
  id: 'doubledWord-9',
  rule: 'doubledWord',
  range: { from: 9, to: 18 },
  found: 'habe habe',
  suggestion: 'habe',
  paragraph: 2,
}

const SPACING: ProofreadingFinding = {
  id: 'spaceBeforePunctuation-40',
  rule: 'spaceBeforePunctuation',
  range: { from: 40, to: 42 },
  found: ' ,',
  suggestion: ',',
  paragraph: 0,
}

function setup(findings: ProofreadingFinding[]) {
  const onSelect = vi.fn()
  const onApply = vi.fn()
  render(
    <ProofreadingPanel
      findings={findings}
      onSelect={onSelect}
      onApply={onApply}
      defaultOpen
    />,
  )
  return { onSelect, onApply }
}

describe('ProofreadingPanel', () => {
  it('zählt die Befunde in der Kopfzeile', () => {
    setup([DOUBLED, SPACING])
    expect(screen.getByText(t('editor.proofreading.count', { count: 2 }))).toBeInTheDocument()
  })

  it('sagt es, wenn nichts gefunden wurde, statt leer dazustehen', () => {
    setup([])
    expect(screen.getByText(t('editor.proofreading.none'))).toBeInTheDocument()
  })

  it('nennt zu jedem Befund die Regel im Wort und den Absatz', () => {
    // Die Bedeutung hängt nie allein an der Wellenlinie (DESIGN.md).
    setup([DOUBLED])
    expect(
      screen.getByText(
        t('editor.proofreading.entry', {
          rule: t('editor.proofreading.rules.doubledWord'),
          paragraph: 3,
        }),
      ),
    ).toBeInTheDocument()
  })

  it('macht Leerzeichen im Vorschlag sichtbar', () => {
    // „ , durch , ersetzen" wäre sonst zweimal dasselbe.
    setup([SPACING])
    expect(
      screen.getByRole('button', {
        name: t('editor.proofreading.replace', { found: '·,', suggestion: ',' }),
      }),
    ).toBeInTheDocument()
  })

  it('springt beim Klick auf den Eintrag an die Stelle', () => {
    const { onSelect, onApply } = setup([DOUBLED])
    fireEvent.click(
      screen.getByRole('button', {
        name: t('editor.proofreading.replace', { found: 'habe·habe', suggestion: 'habe' }),
      }),
    )
    expect(onSelect).toHaveBeenCalledWith(DOUBLED)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('übernimmt den Vorschlag über den eigenen Knopf', () => {
    const { onSelect, onApply } = setup([DOUBLED])
    fireEvent.click(screen.getByRole('button', { name: t('editor.proofreading.apply') }))
    expect(onApply).toHaveBeenCalledWith(DOUBLED)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
