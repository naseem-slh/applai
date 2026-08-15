import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'
import { Input } from './Input'

describe('Field', () => {
  it('benennt das Feld über <label for>', () => {
    render(
      <Field id="name" label="Ihr Name">
        {(control) => <Input {...control} />}
      </Field>,
    )

    expect(screen.getByLabelText('Ihr Name')).toBeInTheDocument()
  })

  it('nennt beim Fehler zuerst die Meldung und danach den Hinweis', () => {
    // Beim Fokussieren soll die Vorlesesoftware zuerst sagen, was zu tun
    // ist, und erst danach die Regel wiederholen.
    render(
      <Field id="name" label="Ihr Name" hint="Steht im Kopf des Dokuments." error="Bitte ausfüllen.">
        {(control) => <Input {...control} />}
      </Field>,
    )

    const field = screen.getByLabelText('Ihr Name')
    expect(field).toHaveAttribute('aria-invalid', 'true')

    const described = (field.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual(['Bitte ausfüllen.', 'Steht im Kopf des Dokuments.'])
  })

  it('verweist ohne Fehler nur auf den Hinweis und meldet das Feld als gültig', () => {
    render(
      <Field id="name" label="Ihr Name" hint="Steht im Kopf des Dokuments.">
        {(control) => <Input {...control} />}
      </Field>,
    )

    const field = screen.getByLabelText('Ihr Name')
    expect(field).toHaveAttribute('aria-invalid', 'false')
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ')
    expect(described).toHaveLength(1)
    expect(document.getElementById(described[0]!)?.textContent).toBe('Steht im Kopf des Dokuments.')
  })

  it('lässt ohne Hinweis und ohne Fehler gar keinen Verweis stehen', () => {
    render(
      <Field id="name" label="Ihr Name">
        {(control) => <Input {...control} />}
      </Field>,
    )

    expect(screen.getByLabelText('Ihr Name')).not.toHaveAttribute('aria-describedby')
  })

  it('benennt mit `labelledBy` über aria-labelledby statt über <label for>', () => {
    // Der Auslöser der Auswahlliste ist ein <button>; ein <label for> wäre
    // dort eine Beschriftung ohne Wirkung.
    render(
      <Field id="anbieter" label="Anbieter" labelledBy>
        {(control) => <button type="button" {...control} />}
      </Field>,
    )

    const trigger = screen.getByRole('button', { name: 'Anbieter' })
    expect(trigger).toHaveAttribute('aria-labelledby', 'anbieter-label')
    expect(document.querySelector('label')).toBeNull()
  })
})
