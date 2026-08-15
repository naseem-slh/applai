import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { recordRequest, resetUsage } from '@/lib/ai/usage'
import { ApiUsageStatus } from './ApiUsageStatus'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

beforeEach(() => {
  resetUsage()
})

describe('ApiUsageStatus', () => {
  it('zeigt nichts, solange keine Anfrage hinausgegangen ist', () => {
    const { container } = render(<ApiUsageStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nennt die Zahl der Anfragen', () => {
    render(<ApiUsageStatus />)

    act(() => {
      recordRequest()
      recordRequest()
    })

    const shown = t('ai.usage.requests', { count: 2 })
    // Ohne diese Zeile wäre der Test wertlos: Fehlt der Schlüssel, gibt
    // i18next ihn selbst zurück, und der Vergleich ginge gegen dieselbe
    // Ersatzausgabe auf beiden Seiten auf. Genau das ist mir passiert.
    expect(shown).not.toBe('ai.usage.requests')
    expect(shown).toContain('2')
    expect(screen.getByText(shown)).toBeInTheDocument()
  })

  it('zählt live weiter, ohne dass die Ansicht neu geladen wird', () => {
    render(<ApiUsageStatus />)
    act(() => recordRequest())

    act(() => recordRequest())

    expect(screen.getByText(t('ai.usage.requests', { count: 2 }))).toBeInTheDocument()
  })
})
