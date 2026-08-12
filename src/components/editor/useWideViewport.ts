import { useEffect, useState } from 'react'

/**
 * Ist der Bildschirm breit genug für die Feinmarkierung?
 *
 * `docs/spec.md` sagt für Mobilgeräte: „Nutzbar, aber ohne Feinmarkierung;
 * dort ‚Anzeige einfügen, Ergebnis lesen'." Das ist keine Notlösung, sondern
 * eine Entscheidung: Eine zeichengenaue Markierung mit dem Finger ist auf
 * einem Telefon unzuverlässig, und eine unzuverlässige Markierung schreibt
 * an der falschen Stelle im Anschreiben.
 *
 * Die Schwelle ist Tailwinds `md` (768 px) — dieselbe Breite, ab der die
 * Einstiegsseite ihre Ablegefelder nebeneinander stellt. Sie steht hier als
 * Zahl, weil eine CSS-Klasse die Frage nicht beantworten kann: Von ihr hängt
 * nicht nur ab, was sichtbar ist, sondern auch, ob die Absätze überhaupt
 * beschreibbar sind.
 *
 * **Kennt der Browser `matchMedia` nicht** (jsdom im Test, sehr alte
 * Umgebungen), gilt „breit". Das ist der Weg mit allen Möglichkeiten;
 * Funktionen wegzunehmen, weil man nicht fragen konnte, wäre die falsche
 * Richtung.
 */

export const WIDE_VIEWPORT_QUERY = '(min-width: 768px)'

export function useWideViewport(): boolean {
  const [wide, setWide] = useState(() => matches())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(WIDE_VIEWPORT_QUERY)
    setWide(query.matches)
    const handle = (event: MediaQueryListEvent) => setWide(event.matches)
    query.addEventListener('change', handle)
    return () => query.removeEventListener('change', handle)
  }, [])

  return wide
}

function matches(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(WIDE_VIEWPORT_QUERY).matches
}
