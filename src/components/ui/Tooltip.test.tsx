import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('funktioniert ohne Provider an der Programmwurzel', () => {
    render(
      <Tooltip defaultOpen content="Der Schlüssel bleibt im Browser">
        <Button size="icon" aria-label="Erklärung" />
      </Tooltip>,
    )

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Der Schlüssel bleibt im Browser',
    )
  })

  it('verbindet den Hinweis über aria-describedby mit dem Auslöser', () => {
    render(
      <Tooltip defaultOpen content="Der Schlüssel bleibt im Browser">
        <Button size="icon" aria-label="Erklärung" />
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Erklärung' })
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Der Schlüssel bleibt im Browser',
    )
  })

  it('reicht sein Verhalten an das übergebene Element weiter, statt es zu umhüllen', () => {
    render(
      <Tooltip content="Hinweis">
        <Button>Anbieter wählen</Button>
      </Tooltip>,
    )

    const trigger = screen.getByRole('button', { name: 'Anbieter wählen' })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveAttribute('data-state', 'closed')
  })
})
