import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createHarness, type HarnessOptions } from './appContext.testutils'
import { RequireSession } from './RequireSession'

const START = 'Einstiegsseite'
const EDITOR = 'Arbeitsfläche'

/** Die beiden Ziele, um die es geht, an einem Router von Hand. */
function renderAt(path: string, options: HarnessOptions = {}) {
  const harness = createHarness(options)
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>{START}</p>} />
        <Route
          path="/editor"
          element={
            <RequireSession>
              <p>{EDITOR}</p>
            </RequireSession>
          }
        />
      </Routes>
    </MemoryRouter>,
    { wrapper: harness.wrapper },
  )
  return harness
}

describe('RequireSession', () => {
  it('schickt einen unmittelbaren Aufruf der Arbeitsfläche zurück auf die Einstiegsseite', () => {
    // Der Fall, um den es geht: `/editor` von Hand aufgerufen (Lesezeichen,
    // getippte Adresse, Neuladen). Es gibt keinen Übergabestand, und die
    // Arbeitsfläche darf sich keinen ausdenken — daraus entstünde wieder ein
    // leerer `userName` (Übergabe 1).
    renderAt('/editor')

    expect(screen.getByText(START)).toBeInTheDocument()
    expect(screen.queryByText(EDITOR)).toBeNull()
  })

  it('lässt die Arbeitsfläche durch, sobald die Einstiegsseite etwas übergeben hat', () => {
    renderAt('/editor', { session: { userName: 'Marlene Ostwald' } })

    expect(screen.getByText(EDITOR)).toBeInTheDocument()
    expect(screen.queryByText(START)).toBeNull()
  })
})
