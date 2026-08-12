import { expect, test, type Page } from '@playwright/test'
import {
  completeOnboarding,
  fillStartPage,
  stubProvider,
  t,
  VARIANT_TEXT,
  waitForAnalysis,
} from './support'

/**
 * Vorgemerkte Stellen, im echten Browser.
 *
 * Zwei Wege, die die Testeinheiten nicht abdecken können:
 *
 * 1. **Mehrere Stellen nacheinander bearbeiten.** In jsdom gibt es keine
 *    echte Textmarkierung über die Maus und keine CSS Custom Highlight API;
 *    hier läuft beides.
 * 2. **Die Wiederverwendung selbst** — der ganze Sinn der Sache. Vormerken,
 *    die Anwendung neu laden, dasselbe Anschreiben mit einer **anderen**
 *    Ausschreibung öffnen, und die Stellen stehen wieder da.
 */

/**
 * Wie viele Bereiche unter diesem Namen hinterlegt sind. In jsdom gibt es
 * die CSS Custom Highlight API nicht; hier ist sie echt, und nur hier lässt
 * sich prüfen, dass sie tatsächlich bespielt wird.
 */
function highlightedRanges(page: Page, name: string): Promise<number> {
  return page.evaluate((highlightName) => {
    const registry = (CSS as unknown as { highlights?: Map<string, { size: number }> }).highlights
    return registry?.get(highlightName)?.size ?? 0
  }, name)
}

/** Der Eintrag mit dieser Nummer in der Merkliste. */
function markEntry(page: Page, number: number) {
  return page.getByRole('button', { name: new RegExp(`^${number}\\.`) })
}

/** Den Absatz mit diesem Text markieren und vormerken. */
async function markParagraph(page: Page, contains: string): Promise<void> {
  await page.getByRole('paragraph').filter({ hasText: contains }).click()
  await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()
  await page.getByRole('button', { name: t('editor.marks.add') }).click()
}

/**
 * Zurück auf die Einstiegsseite, wie beim Beginn der nächsten Bewerbung.
 * Ein Neuladen wirft den Übergabestand weg — genau darum geht es hier.
 */
async function startOver(page: Page): Promise<void> {
  await page.goto('/')
  const privacy = page.getByRole('button', { name: t('onboarding.privacy.accept') })
  if (await privacy.isVisible().catch(() => false)) {
    await completeOnboarding(page)
  }
  await page.getByRole('heading', { name: t('start.documents.heading') }).waitFor()
}

test.describe('Vorgemerkte Stellen', () => {
  test('mehrere Stellen vormerken und eine nach der anderen bearbeiten', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    await markParagraph(page, 'ich bewerbe mich hiermit')
    await markParagraph(page, 'Mit freundlichen Grüßen')

    await expect(page.getByText(t('editor.marks.progress', { done: 0, total: 2 }))).toBeVisible()
    expect(await highlightedRanges(page, 'applai-mark')).toBe(2)

    // Eine Stelle aus der Liste anspringen macht sie zur laufenden
    // Markierung — ab hier arbeitet die bestehende Varianten-Kette.
    await markEntry(page, 1).click()
    await page.getByRole('button', { name: t('editor.variants.trigger') }).click()
    await expect(page.getByText(VARIANT_TEXT)).toBeVisible()
    await page.getByRole('button', { name: t('editor.variants.apply') }).first().click()

    // Abgehakt — und **nicht** verschwunden.
    await expect(page.getByText(t('editor.marks.progress', { done: 1, total: 2 }))).toBeVisible()
    await expect(markEntry(page, 1)).toBeVisible()
    await expect(markEntry(page, 2)).toBeVisible()

    // Die erledigte Stelle bleibt hinterlegt, nur in der blasseren Farbe.
    await expect
      .poll(() => highlightedRanges(page, 'applai-mark-done'))
      .toBe(1)
    expect(await highlightedRanges(page, 'applai-mark')).toBe(1)
  })

  test('stellt die Stellen bei der nächsten Ausschreibung wieder her', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    await markParagraph(page, 'ich bewerbe mich hiermit')
    await expect(page.getByText(t('editor.marks.progress', { done: 0, total: 1 }))).toBeVisible()

    // Das Ablegen ist bewusst verzögert (MARK_SAVE_DELAY_MS). Hier ist das
    // Warten auf die Uhr die Sache selbst und kein Behelf.
    await page.waitForTimeout(2000)

    await startOver(page)
    await fillStartPage(page, 'Stellenanzeige: Projektleiterin (m/w/d). Gesucht wird Erfahrung in der Leitung von Teams.')
    await page.getByRole('textbox', { name: t('editor.document.heading') }).waitFor()

    await expect(
      page.getByText(t('editor.marks.restored', { restored: 1, total: 1 })),
    ).toBeVisible()
    await expect(markEntry(page, 1)).toContainText('ich bewerbe mich hiermit')
  })
})
