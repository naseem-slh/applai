import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import Editor from './Editor'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

describe('Editor (Platzhalter)', () => {
  it('bringt kein eigenes <main> mit', () => {
    // Der Rahmen (`AppLayout`) setzt genau ein `<main>` um den `<Outlet />`.
    // Ein zweites darin wäre ungültiges HTML und ein zweiter
    // Orientierungspunkt für Vorlesesoftware. Gilt auch für die Arbeitsfläche
    // aus Aufgabe 14, die diesen Platzhalter ersetzt.
    const { container } = render(<Editor />)

    expect(container.querySelectorAll('main')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: t('routes.editor.heading') })).toBeInTheDocument()
  })
})
