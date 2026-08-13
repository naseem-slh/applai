import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { completeOnboarding, fillStartPage, stubProvider, t, waitForAnalysis } from './support'

/**
 * Der PDF-Export, gegen den gebauten Stand.
 *
 * **Warum das hier und nicht in einem Vitest-Lauf steht.** Die Einheitstests
 * erzeugen die Datei aus Schriften, die von der Platte kommen. Im Betrieb
 * holt der Browser sie über das Netz, und dabei gilt die strenge CSP
 * (`public/_headers`, G3). Dass `connect-src 'self'` die Schriften durchlässt
 * und der Aufruf keinen fremden Host braucht (G2), zeigt nur ein Lauf im
 * echten Browser.
 */

test.describe('PDF-Export', () => {
  test('erzeugt eine PDF-Datei und schließt die Bewerbung ab', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: t('editor.export.pdf') }).click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(
      /^Anschreiben_Musterwerk_Solutions_\d{4}-\d{2}-\d{2}\.pdf$/,
    )

    const path = await file.path()
    const bytes = await readFile(path)
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.7')
    // Ein Brief mit eingebetteten Schriften, aber ohne die vollen Dateien:
    // Das Eindampfen (`subset.ts`) ist der Unterschied zwischen 30 kB und
    // einem halben Megabyte.
    expect(bytes.length).toBeGreaterThan(5_000)
    expect(bytes.length).toBeLessThan(200_000)

    await expect(page.getByText(t('editor.export.pdfDone'))).toBeVisible()

    // Anders als früher über den Druckdialog ist eine erzeugte Datei ein
    // eindeutiger Abschluss — die Bewerbung steht danach in der Liste.
    await page.getByRole('link', { name: t('nav.start') }).click()
    await page.getByRole('button', { name: t('start.applications.open', { count: 1 }) }).click()
    await expect(page.getByRole('dialog').getByRole('cell', { name: 'Musterwerk Solutions' })).toBeVisible()
  })

  /**
   * Die mitgelieferten Schriften sind mit `scripts/build-pdf-fonts.mjs`
   * umgeschrieben worden: Glyphen geleert, `cmap` und `post` neu gebaut,
   * Tabellen entfernt. Ob dabei eine gültige Datei herauskam, beantwortet am
   * strengsten der Prüfer des Browsers selbst — er lehnt eine Schrift ab,
   * deren Tabellen nicht zusammenpassen. Bricht dieser Test, ist das Skript
   * kaputt, und zwar bevor jemand ein PDF in der Hand hält, das kein
   * Betrachter öffnet.
   */
  test('liefert gültige Schriftdateien aus', async ({ page }) => {
    await page.goto('/')

    const faces = [
      'Carlito-Regular',
      'Carlito-Bold',
      'Carlito-Italic',
      'Carlito-BoldItalic',
      'LiberationSans-Regular',
      'LiberationSans-Bold',
      'LiberationSans-Italic',
      'LiberationSans-BoldItalic',
      'LiberationSerif-Regular',
      'LiberationSerif-Bold',
      'LiberationSerif-Italic',
      'LiberationSerif-BoldItalic',
      'LiberationMono-Regular',
      'LiberationMono-Bold',
      'LiberationMono-Italic',
      'LiberationMono-BoldItalic',
    ]

    const rejected = await page.evaluate(async (names: string[]) => {
      const failures: string[] = []
      for (const name of names) {
        // Über die Bytes und nicht über eine `url()`: So scheitert der Test
        // nur an der Schrift selbst und nicht an einem Netzfehler, den er
        // sonst nicht davon unterscheiden könnte.
        const response = await fetch(`/fonts/pdf/${name}.ttf`)
        if (!response.ok) {
          failures.push(`${name}: HTTP ${response.status}`)
          continue
        }
        try {
          await new FontFace(name, await response.arrayBuffer()).load()
        } catch (error) {
          failures.push(`${name}: ${String(error)}`)
        }
      }
      return failures
    }, faces)

    expect(rejected).toEqual([])
  })
})
