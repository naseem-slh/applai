import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('trägt die harte Kante — außer in der eingelassenen Variante', () => {
    // Was auf dem Blatt liegt, hat eine Kante; was in einer Karte eingelassen
    // ist, hat keine. Daran hängt der ganze Höhenunterschied dieser Welt,
    // nicht an einem Helligkeitssprung (Karte gegen Blatt: 1,08:1).
    render(
      <>
        <Card data-testid="liegt">liegt auf</Card>
        <Card variant="raised" data-testid="traegt">
          trägt die Seite
        </Card>
        <Card variant="subtle" data-testid="eingelassen">
          eingelassen
        </Card>
      </>,
    )

    expect(screen.getByTestId('liegt')).toHaveClass('pop')
    expect(screen.getByTestId('traegt')).toHaveClass('pop')
    expect(screen.getByTestId('eingelassen')).not.toHaveClass('pop')
  })

  it('gibt der tragenden Karte eine höhere Kante als der gewöhnlichen', () => {
    render(
      <>
        <Card data-testid="ruhig">flach</Card>
        <Card variant="raised" data-testid="hervorgehoben">
          hervorgehoben
        </Card>
      </>,
    )

    expect(screen.getByTestId('ruhig').className).not.toContain('--pop-height')
    expect(screen.getByTestId('hervorgehoben').className).toContain(
      '[--pop-height:10px]',
    )
  })

  it('wechselt beim Löschen die Konturfarbe, nicht die Bauform', () => {
    render(
      <Card variant="danger" data-testid="karte">
        Alles löschen
      </Card>,
    )

    const card = screen.getByTestId('karte')
    expect(card).toHaveClass('border-[var(--error)]')
    expect(card).toHaveClass('pop')
    expect(card).toHaveClass('rounded-card')
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
    expect(section).toHaveClass('bg-[var(--field)]')
  })
})
