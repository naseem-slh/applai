import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { ClaimGuard } from './ClaimGuard'
import type { LocatedClaim } from './unbackedClaims'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function claim(overrides: Partial<LocatedClaim> = {}): LocatedClaim {
  return {
    id: 'c1',
    text: 'spreche fließend Finnisch',
    confirmed: false,
    range: { from: 10, to: 35 },
    paragraphs: [1],
    ...overrides,
  }
}

function setup(claims: LocatedClaim[]) {
  const onConfirm = vi.fn()
  render(<ClaimGuard claims={claims} onConfirm={onConfirm} headingId="claims" />)
  return { onConfirm }
}

describe('ClaimGuard', () => {
  it('zeigt gar nichts, solange keine unbelegte Aussage im Brief steht', () => {
    const { container } = render(
      <ClaimGuard claims={[]} onConfirm={vi.fn()} headingId="claims" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('meldet die Exportsperre und nennt die Aussage im Wortlaut samt Fundstelle', () => {
    setup([claim()])

    expect(screen.getByRole('status')).toHaveTextContent(
      t('editor.claims.blocked', { count: 1 }),
    )
    expect(screen.getByText('spreche fließend Finnisch')).toBeInTheDocument()
    expect(
      screen.getByText(t('editor.claims.location', { paragraphs: '2', count: 1 })),
    ).toBeInTheDocument()
  })

  it('zählt nur die unbestätigten Aussagen in die Sperre', () => {
    setup([claim(), claim({ id: 'c2', text: 'habe in Kanada studiert', confirmed: true })])

    expect(screen.getByRole('status')).toHaveTextContent(
      t('editor.claims.blocked', { count: 1 }),
    )
  })

  it('meldet jede Aussage einzeln zur Bestätigung', () => {
    const { onConfirm } = setup([claim(), claim({ id: 'c2', text: 'habe in Kanada studiert' })])

    const buttons = screen.getAllByRole('button', { name: t('editor.claims.confirm') })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)

    expect(onConfirm).toHaveBeenCalledWith('c2')
  })

  it('gibt den Export frei, sobald jede Aussage bestätigt ist, und bietet keinen Knopf mehr an', () => {
    setup([claim({ confirmed: true })])

    expect(screen.getByRole('status')).toHaveTextContent(t('editor.claims.released'))
    expect(screen.queryByRole('button', { name: t('editor.claims.confirm') })).not.toBeInTheDocument()
    expect(screen.getByText(t('editor.claims.confirmed'))).toBeInTheDocument()
  })
})
