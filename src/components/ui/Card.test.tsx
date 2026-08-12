import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('trägt nur in der Variante `raised` einen Schatten', () => {
    render(
      <>
        <Card data-testid="ruhig">flach</Card>
        <Card variant="raised" data-testid="hervorgehoben">
          hervorgehoben
        </Card>
      </>,
    )

    expect(screen.getByTestId('ruhig')).not.toHaveClass(
      'shadow-[var(--shadow-raised)]',
    )
    expect(screen.getByTestId('hervorgehoben')).toHaveClass(
      'shadow-[var(--shadow-raised)]',
    )
  })

  it('lässt sich den Innenabstand abnehmen', () => {
    render(
      <Card padding="none" data-testid="karte">
        randlos
      </Card>,
    )
    const card = screen.getByTestId('karte')
    expect(card).not.toHaveClass('p-4')
    expect(card).not.toHaveClass('p-6')
  })

  it('wird mit asChild zum übergebenen Element, statt ein <div> zu verschachteln', () => {
    render(
      <Card asChild variant="subtle">
        <section aria-label="Hinweis">Text</section>
      </Card>,
    )

    const section = screen.getByRole('region', { name: 'Hinweis' })
    expect(section.tagName).toBe('SECTION')
    expect(section).toHaveClass('bg-[var(--color-surface-alt)]')
  })
})
