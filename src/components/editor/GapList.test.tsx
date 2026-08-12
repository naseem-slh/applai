import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '@/lib/ai/errors'
import type { GapEntry } from '@/lib/domain/gaps'
import type { Requirement } from '@/lib/domain/jobAd'
import i18n from '@/lib/i18n/i18n'
import { GapList } from './GapList'
import type { GapAnalysisHandle } from './useGapAnalysis'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

const REQUIREMENTS: Requirement[] = [
  { text: 'Erfahrung mit TypeScript', kind: 'skill' },
  { text: 'Abgeschlossenes Studium', kind: 'education' },
]

const ENTRIES: GapEntry[] = [
  {
    requirement: REQUIREMENTS[0]!,
    status: 'covered',
    evidence: 'Fünf Jahre TypeScript im Lebenslauf',
  },
  { requirement: REQUIREMENTS[1]!, status: 'missing', evidence: null },
]

function gaps(overrides: Partial<GapAnalysisHandle> = {}): GapAnalysisHandle {
  return { status: 'idle', entries: [], error: null, run: vi.fn(), ...overrides }
}

function setup(handle: GapAnalysisHandle, requirements = REQUIREMENTS) {
  render(<GapList requirements={requirements} gaps={handle} defaultOpen />)
}

describe('GapList', () => {
  it('zeigt die Anforderungen der Anzeige, bevor irgendetwas gefragt wurde', () => {
    setup(gaps())

    expect(screen.getByText('Erfahrung mit TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Abgeschlossenes Studium')).toBeInTheDocument()
    expect(screen.getByText(t('editor.gaps.kind.education'))).toBeInTheDocument()
  })

  it('fordert den Abgleich erst auf Knopfdruck an', () => {
    const handle = gaps()
    setup(handle)

    fireEvent.click(screen.getByRole('button', { name: t('editor.gaps.run') }))

    expect(handle.run).toHaveBeenCalledTimes(1)
  })

  it('nennt für jede Anforderung ihren Zustand und markiert die Begründung als Einschätzung', () => {
    setup(gaps({ status: 'ready', entries: ENTRIES }))

    expect(screen.getByText(t('editor.gaps.status.covered'))).toBeInTheDocument()
    expect(screen.getByText(t('editor.gaps.status.missing'))).toBeInTheDocument()
    // Weitergabe aus Aufgabe 12: `evidence` ist Modellprosa und wird nicht
    // auf Wörtlichkeit geprüft. Es darf deshalb nicht wie ein Zitat aussehen.
    expect(
      screen.getByText(
        t('editor.gaps.evidence', { evidence: 'Fünf Jahre TypeScript im Lebenslauf' }),
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(t('editor.gaps.assessment'))).toBeInTheDocument()
  })

  // docs/spec.md, ausdrücklich: „Kein Prozentwert — er wäre erfunden."
  it('nennt keinen Deckungsgrad, weder als Prozentwert noch als Quote', () => {
    const { container } = render(
      <GapList requirements={REQUIREMENTS} gaps={gaps({ status: 'ready', entries: ENTRIES })} defaultOpen />,
    )

    const text = container.textContent ?? ''
    expect(text).not.toMatch(/%/)
    expect(text).not.toMatch(/\d\s*(von|of|\/)\s*\d/)
  })

  it('meldet einen Fehler übersetzt und bietet den Abgleich erneut an', () => {
    setup(gaps({ status: 'failed', error: new LlmError('quota', 'gemini', 'intern') }))

    expect(screen.getByRole('alert')).toHaveTextContent(t('ai.errors.quota_gemini'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('intern')
    expect(screen.getByRole('button', { name: t('editor.gaps.run') })).toBeEnabled()
  })

  it('sperrt den Knopf, solange der Abgleich läuft', () => {
    setup(gaps({ status: 'loading' }))

    expect(screen.getByRole('button', { name: t('editor.gaps.running') })).toBeDisabled()
  })

  it('bietet ohne erkannte Anforderungen keinen Abgleich an, sondern sagt, dass es nichts gibt', () => {
    setup(gaps(), [])

    expect(screen.getByText(t('editor.gaps.none'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('editor.gaps.run') })).not.toBeInTheDocument()
  })
})
