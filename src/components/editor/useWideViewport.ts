import { useEffect, useState } from 'react'

/**
 * Ist neben dem Blatt Platz für eine zweite Spalte?
 *
 * **Warum hier die Fensterbreite gefragt wird und in `usePrecisePointer`
 * ausdrücklich nicht.** Dort geht es um eine Fähigkeit des Eingabegeräts
 * (lässt sich zeichengenau markieren?), und die hängt am Zeigegerät, nicht
 * an der Breite — ein schmal gezogenes Fenster mit Maus kann weiterhin
 * genau markieren. Hier geht es um Platz: Ob Briefkopf, Lückenliste und
 * Stilprofil neben dem Brief stehen können oder unter ihm, entscheidet
 * allein, wie breit das Fenster ist. Dieselbe Frage, die auch die
 * `lg:`-Klassen im Aufbau stellen, deshalb dieselbe Schwelle.
 *
 * Gebraucht wird sie nur für **einen Anfangswert**: Auf breiten Fenstern
 * stehen die Bereiche offen, auf schmalen zugeklappt (der Plan verlangt
 * für Aufgabe 14 „auf schmalen Bildschirmen als aufklappbarer Bereich").
 * Danach entscheidet der Nutzer; ein Wechsel der Fensterbreite reißt einen
 * von Hand zugeklappten Bereich nicht wieder auf.
 *
 * Kennt der Browser `matchMedia` nicht (jsdom im Test), gilt „breit" — das
 * ist der Zustand, in dem alles sichtbar ist.
 */

/** Tailwinds `lg`, als Medienabfrage. Muss zu den `lg:`-Klassen passen. */
export const WIDE_VIEWPORT_QUERY = '(min-width: 64rem)'

export function useWideViewport(): boolean {
  const [wide, setWide] = useState(matchesWide)

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

function matchesWide(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(WIDE_VIEWPORT_QUERY).matches
}
