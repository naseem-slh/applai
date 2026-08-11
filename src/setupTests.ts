// Wird von Vitest vor jeder Testdatei geladen (siehe vitest.config.ts).
// Erweitert `expect` um DOM-Matcher wie `toBeInTheDocument()`. Der
// Vitest-spezifische Unterpfad bindet direkt an Vitests `expect`, statt ein
// globales `expect` vorauszusetzen (wir nutzen `test.globals` bewusst nicht).
import '@testing-library/jest-dom/vitest'
