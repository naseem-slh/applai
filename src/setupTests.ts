// Wird von Vitest vor jeder Testdatei geladen (siehe vitest.config.ts).
// Erweitert `expect` um DOM-Matcher wie `toBeInTheDocument()`. Der
// Vitest-spezifische Unterpfad bindet direkt an Vitests `expect`, statt ein
// globales `expect` vorauszusetzen (wir nutzen `test.globals` bewusst nicht).
import '@testing-library/jest-dom/vitest'

// Testing Library hängt sein automatisches Aufräumen an ein globales
// `afterEach`. Wir betreiben Vitest bewusst ohne Globals (siehe oben),
// deshalb greift das nicht von selbst — ohne diese Zeile blieben die
// gerenderten Bäume mehrerer Tests einer Datei gemeinsam im Dokument
// stehen und Abfragen wie getByRole fänden sie doppelt.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom kennt ResizeObserver nicht. Mehrere Radix-Primitive (Schalter,
// Regler, alles Verankerte) messen damit ihre eigene Größe; ohne diesen
// Ersatz bricht schon das Rendern ab. Die Messwerte spielen im Test keine
// Rolle — nur dass die Klasse existiert und sich abbestellen lässt.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub
