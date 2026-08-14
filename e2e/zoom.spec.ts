import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, fillStartPage, stubProvider, t, waitForAnalysis } from './support'

/**
 * Der Maßstabsregler.
 *
 * Auch diese Prüfung kann es nur hier geben: Der Maßstab wirkt über die
 * gemessene Breite des Blattkastens, und jsdom misst jede Breite als 0.
 *
 * Die eigentliche Frage ist nicht, ob das Blatt kleiner wird — das sieht
 * man —, sondern ob es **dasselbe Blatt bleibt**: Der Umbruch entsteht aus
 * gemessenen Höhen, und wenn die Höhen mit dem Maßstab nicht sauber
 * mitskalieren, stünde bei 50 % ein Absatz auf einer anderen Seite als beim
 * Ausdruck. Genau das darf nicht passieren.
 */

/** Was auf welcher Seite steht, und wie breit das Blatt dabei ist. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('[data-print-document]')
    const surface = document.querySelector<HTMLElement>('[data-page]')?.parentElement ?? null
    return {
      breite: sheet?.clientWidth ?? 0,
      pt: surface === null ? '' : getComputedStyle(surface).getPropertyValue('--pt').trim(),
      seiten: Array.from(document.querySelectorAll<HTMLElement>('[data-page]')).map((box) => ({
        überlauf: box.scrollHeight - box.clientHeight,
        absätze: Array.from(box.querySelectorAll<HTMLElement>('[data-paragraph-index]')).map(
          (element) => element.dataset.paragraphIndex ?? '',
        ),
      })),
    }
  })
}

test('der Regler verkleinert das Blatt, ohne den Umbruch zu verschieben', async ({ page }) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)

  const regler = page.getByRole('slider', { name: t('editor.zoom.label') })
  await expect(regler).toHaveAttribute('aria-valuenow', '100')

  const vorher = await layout(page)
  expect(vorher.breite).toBeGreaterThan(0)

  // Von 100 % auf 50 %: zehn Schritte zu je 5 %.
  await regler.focus()
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowLeft')
  await expect(regler).toHaveAttribute('aria-valuenow', '50')
  await expect(regler).toHaveAttribute('aria-valuetext', t('editor.zoom.value', { percent: 50 }))

  // Das Blatt misst die Hälfte — und mit ihm `--pt`, an dem jedes Maß des
  // Briefes hängt.
  await expect.poll(async () => (await layout(page)).breite).toBeLessThan(vorher.breite * 0.55)
  const nachher = await layout(page)
  expect(nachher.breite).toBeGreaterThan(vorher.breite * 0.45)
  expect(parseFloat(nachher.pt)).toBeLessThan(parseFloat(vorher.pt) * 0.55)

  // Und es ist dasselbe Blatt geblieben: gleich viele Seiten, und auf jeder
  // stehen dieselben Absätze wie bei 100 %.
  expect(nachher.seiten.map((seite) => seite.absätze)).toEqual(
    vorher.seiten.map((seite) => seite.absätze),
  )
  for (const seite of nachher.seiten) expect(seite.überlauf).toBeLessThanOrEqual(2)
})

test('der gewählte Maßstab gilt auch für die nächste Bewerbung', async ({ page }) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)

  const regler = page.getByRole('slider', { name: t('editor.zoom.label') })
  await regler.focus()
  // Die Pos1-Taste führt an das untere Ende der Spanne.
  await page.keyboard.press('Home')
  await expect(regler).toHaveAttribute('aria-valuenow', '25')

  // Neu laden und den Weg noch einmal gehen. Der Übergabestand steht nur im
  // Arbeitsspeicher, ein Neuladen führt deshalb zurück auf die
  // Einstiegsseite (`RequireSession`) — die Einstellungen dagegen liegen in
  // der IndexedDB und überdauern.
  await page.reload()
  await fillStartPage(page)
  await waitForAnalysis(page)

  // Gesichert wird in den Einstellungen, nicht im localStorage (G5).
  await expect(page.getByRole('slider', { name: t('editor.zoom.label') })).toHaveAttribute(
    'aria-valuenow',
    '25',
  )
  const gespeichert = await page.evaluate(() => localStorage.length)
  expect(gespeichert).toBe(0)
})

test('der Stand führt auf 100 % zurück', async ({ page }) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)

  const regler = page.getByRole('slider', { name: t('editor.zoom.label') })
  await regler.focus()
  await page.keyboard.press('Home')
  await expect(regler).toHaveAttribute('aria-valuenow', '25')

  await page.getByRole('button', { name: t('editor.zoom.reset', { percent: 25 }) }).click()
  await expect(regler).toHaveAttribute('aria-valuenow', '100')
})
