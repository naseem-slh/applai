import { useEffect, useState } from 'react'

/**
 * Lässt sich auf diesem Gerät zeichengenau markieren?
 *
 * `docs/spec.md` sagt für Mobilgeräte: „Nutzbar, aber ohne Feinmarkierung;
 * dort ‚Anzeige einfügen, Ergebnis lesen'." Das ist keine Notlösung, sondern
 * eine Entscheidung: Eine zeichengenaue Markierung mit dem Finger ist
 * unzuverlässig, und eine unzuverlässige Markierung ließe die Ersetzung an
 * der falschen Stelle im Anschreiben ansetzen.
 *
 * **Gefragt wird das Zeigegerät, nicht die Fensterbreite.** Die erste
 * Fassung fragte `(min-width: 768px)` und lag damit in beide Richtungen
 * falsch: Ein Fenster, das jemand auf einem Notebook auf 700 px zieht,
 * verlöre die Feinmarkierung, obwohl eine Maus daran hängt; ein Tablet im
 * Querformat behielte sie, obwohl dort nur ein Finger zeigt. Die Frage ist
 * eine Eigenschaft des Eingabegeräts, und dafür gibt es eine eigene
 * Medienabfrage.
 *
 * `(pointer: coarse)` beschreibt das **primäre** Zeigegerät. Ein Notebook
 * mit Berührungsbildschirm meldet weiterhin „fein", ein Telefon und ein
 * Tablet melden „grob". Eine Umgebung ganz ohne Zeigegerät (`pointer: none`,
 * etwa reine Tastaturbedienung) meldet hier ebenfalls nicht „grob" — und das
 * ist richtig so: Umschalt+Pfeil markiert zeichengenau.
 *
 * **Kennt der Browser `matchMedia` nicht** (jsdom im Test, sehr alte
 * Umgebungen), gilt „genau". Das ist der Weg mit allen Möglichkeiten;
 * Funktionen wegzunehmen, weil man nicht fragen konnte, wäre die falsche
 * Richtung.
 *
 * **Was hiervon nicht abhängt: das Tippen.** Die Dokumentfläche bleibt auf
 * jedem Gerät beschreibbar. Die Checkliste verlangt nur, die Feinmarkierung
 * auszublenden, und ein Anschreiben, das sich auf dem Telefon nicht einmal
 * an einer Stelle berichtigen ließe, wäre weniger wert als eine ungenaue
 * Einfügestelle.
 */

export const COARSE_POINTER_QUERY = '(pointer: coarse)'

export function usePrecisePointer(): boolean {
  const [precise, setPrecise] = useState(() => !coarse())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(COARSE_POINTER_QUERY)
    setPrecise(!query.matches)
    const handle = (event: MediaQueryListEvent) => setPrecise(!event.matches)
    query.addEventListener('change', handle)
    return () => query.removeEventListener('change', handle)
  }, [])

  return precise
}

function coarse(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(COARSE_POINTER_QUERY).matches
}
