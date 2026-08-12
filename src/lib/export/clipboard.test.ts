import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard, toPlainText } from './clipboard'

describe('toPlainText', () => {
  it('trennt die Absätze durch eine Leerzeile, damit sie in einem Formularfeld lesbar sind', () => {
    expect(toPlainText('Erster Absatz\nZweiter Absatz')).toBe('Erster Absatz\n\nZweiter Absatz')
  })

  it('lässt die leeren Absätze des Word-Originals weg — sie sind im Reintext die Leerzeile', () => {
    expect(toPlainText('Anrede\n\n\nText\n\nGruß')).toBe('Anrede\n\nText\n\nGruß')
  })

  it('entfernt Leerraum an den Zeilenrändern, auch die Tabulatoren aus w:tab', () => {
    expect(toPlainText('  Anrede\t\n\tText  ')).toBe('Anrede\n\nText')
  })

  it('liefert für ein leeres Dokument eine leere Zeichenkette', () => {
    expect(toPlainText('')).toBe('')
    expect(toPlainText('\n\n\n')).toBe('')
  })
})

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('meldet Erfolg, wenn der Browser geschrieben hat', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyToClipboard('Ein Brief')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('Ein Brief')
  })

  // Unsichere Herkunft, verweigerte Berechtigung, fehlende Nutzergeste: Für
  // die Oberfläche ist das alles derselbe Fall, und sie darf ihn nicht als
  // Erfolg anzeigen.
  it('meldet einen Fehlschlag, statt eine Ausnahme durchzureichen', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => Promise.reject(new Error('NotAllowedError'))) },
    })

    await expect(copyToClipboard('Ein Brief')).resolves.toBe('failed')
  })

  it('meldet einen Fehlschlag, wenn der Browser die Zwischenablage gar nicht anbietet', async () => {
    vi.stubGlobal('navigator', {})

    await expect(copyToClipboard('Ein Brief')).resolves.toBe('failed')
  })
})
