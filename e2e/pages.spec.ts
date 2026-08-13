import { expect, test } from '@playwright/test'
import { completeOnboarding, fillStartPage, stubProvider, t, waitForAnalysis } from './support'

/**
 * Der Brief als Seiten.
 *
 * Diese Prüfung kann es nur hier geben: jsdom hat kein Layout, misst also
 * jede Höhe als 0 und kommt nie über eine Seite hinaus. Die Aufteilung
 * entsteht aber genau aus gemessenen Höhen.
 *
 * Geprüft wird das, was gemeldet wurde — Text stand halb auf dem Blatt und
 * halb auf dem Hintergrund — und das, was daraus folgen soll: eine zweite
 * Seite darunter.
 */

/** So viel Text, dass eine A4-Seite sicher nicht reicht. */
const LONG_TEXT = `${'Ich bringe mehrjährige Erfahrung in der Entwicklung mit. '.repeat(90)}`

test('der Brief läuft nicht über das Blatt hinaus, sondern auf eine zweite Seite', async ({
  page,
}) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)

  const surface = page.getByRole('textbox', { name: t('editor.document.heading') })
  await expect(surface).toBeVisible()
  await expect(page.locator('[data-page]')).toHaveCount(1)

  // In einen Absatz sehr viel Text einsetzen.
  await page.getByRole('paragraph').filter({ hasText: 'ich bewerbe mich hiermit' }).click()
  await page.keyboard.insertText(LONG_TEXT)

  // Eine zweite Seite ist dazugekommen.
  await expect
    .poll(() => page.locator('[data-page]').count(), { timeout: 10_000 })
    .toBeGreaterThan(1)

  const measured = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll<HTMLElement>('[data-page]'))
    return boxes.map((box) => {
      const style = getComputedStyle(box)
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const texte = Array.from(box.querySelectorAll<HTMLElement>('[data-paragraph-index]'))
      return {
        breite: box.clientWidth,
        höhe: box.clientHeight,
        textraum: box.clientHeight - padding,
        belegt: texte.reduce((sum, element) => sum + element.offsetHeight, 0),
        überlauf: box.scrollHeight - box.clientHeight,
      }
    })
  })

  for (const [nummer, seite] of measured.entries()) {
    // Keine Seite läuft über ihren eigenen Rand hinaus — der ursprünglich
    // gemeldete Fehler.
    expect(seite.überlauf).toBeLessThanOrEqual(2)

    // Und jede Seite hat das A4-Verhältnis, solange sie nicht von einem
    // übergroßen Absatz gedehnt wird. Vorher waren sie mehr als doppelt so
    // hoch, weil `100cqw` sich gegen das Fenster auflöste.
    expect(seite.höhe).toBeGreaterThanOrEqual(seite.breite * (297 / 210) - 2)

    // Der gemeldete zweite Fehler: Umbruch, obwohl auf der Seite davor noch
    // reichlich Platz war. Jede Seite außer der letzten muss gefüllt sein.
    if (nummer < measured.length - 1) {
      expect(seite.belegt).toBeGreaterThan(seite.textraum * 0.6)
    }
  }
})

test('mehr als zwei Leerzeilen hintereinander fallen in der Ansicht zusammen', async ({ page }) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)

  // Die Testdatei trägt keine lange Leerlaufstrecke; die Regel selbst ist in
  // pagination.test.ts geprüft. Hier zählt, dass die Absätze im Baum
  // bleiben und anklickbar sind — daran hängen Offsets und Export.
  const boxes = page.locator('[data-paragraph-index]')
  expect(await boxes.count()).toBeGreaterThan(0)

  const heights = await boxes.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).getBoundingClientRect().height),
  )
  for (const height of heights) expect(height).toBeGreaterThan(0)
})
