import { describe, expect, it } from 'vitest'
import { pdfjsLib, workerSrc } from './worker'

describe('worker', () => {
  it('löst den Worker-Pfad über Vite (?url) auf einen lokalen, selbst gehosteten Pfad auf — nie ein CDN (G2)', () => {
    expect(workerSrc).not.toMatch(/^https?:\/\//)
    expect(workerSrc).toContain('pdf.worker')
  })

  it('überschreibt GlobalWorkerOptions.workerSrc unter Vitest/Node nicht, damit pdf.js seinen eingebauten Node-Rückfall (relativer Import neben sich selbst) nutzen kann', () => {
    // pdf.js erkennt Node selbst (siehe worker.ts) und setzt bereits vor
    // unserem Modulcode den funktionierenden Standardwert; würden wir ihn
    // hier durch die von Vite aufgelöste Browser-URL ersetzen, bräche
    // extractPdf unter Vitest (siehe Aufgabe-4-Bericht, Abschnitt Worker).
    expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toBe('./pdf.worker.mjs')
    expect(pdfjsLib.GlobalWorkerOptions.workerSrc).not.toBe(workerSrc)
  })
})
