import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { PageHeader } from './PageHeader'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function renderHeader(backTo = '/') {
  return render(
    <MemoryRouter initialEntries={['/datenschutz']}>
      <PageHeader backTo={backTo} backLabel={t('nav.back')} />
    </MemoryRouter>,
  )
}

describe('PageHeader', () => {
  it('führt über die Marke zurück zum Vorbereiten', () => {
    renderHeader()

    // Wohin die Marke einer Seite führt, ist keine Frage, die man sich
    // stellt — man klickt sie und erwartet den Anfang.
    expect(screen.getByRole('link', { name: t('nav.home') })).toHaveAttribute('href', '/')
  })

  it('führt über die Marke auch dann zum Vorbereiten, wenn der Knopf woanders hingeht', () => {
    // Der Zurück-Knopf trägt das Ziel des Aufrufers; die Marke tut es nicht.
    // Sie steht für den Anfang und nicht für den Weg, den jemand genommen hat.
    renderHeader('/editor')

    expect(screen.getByRole('link', { name: t('nav.back') })).toHaveAttribute('href', '/editor')
    expect(screen.getByRole('link', { name: t('nav.home') })).toHaveAttribute('href', '/')
  })
})
