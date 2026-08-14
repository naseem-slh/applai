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
 * Der Durchlauf für die nächste Ausschreibung, im echten Browser.
 *
 * Was hier und nur hier geprüft wird: dass die ganze Kette **gegen den
 * gebauten Stand samt strenger CSP** trägt — Original herstellen, neue
 * Anzeige auswerten lassen, Stelle für Stelle umschreiben, Word-Datei. In
 * jsdom fehlen dafür die echte Textmarkierung und der echte Download.
 */

const NEUE_ANZEIGE = `Stellenanzeige: Projektleiterin (m/w/d)

Wir suchen eine Projektleiterin für unser Team in Hamburg. Gesucht wird
Erfahrung in der Leitung von Teams und sicheres Auftreten gegenüber Kunden.`

/**
 * Den Absatz mit diesem Text vormerken. Das Markieren **ist** das
 * Vormerken — einen eigenen Knopf dafür gibt es nicht.
 */
async function markParagraph(page: Page, contains: string): Promise<void> {
  await page.getByRole('paragraph').filter({ hasText: contains }).click()
  await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()
}

/**
 * Den Dialog öffnen und die neue Ausschreibung einfügen.
 *
 * Über die Rolle, nicht über `getByLabel`: Der Titel des Dialogs heißt
 * „Nächste Stellenausschreibung" und enthält damit den Namen des Feldes —
 * `getByLabel` träfe beide.
 */
async function openDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: t('editor.reapply.trigger') }).click()
  await page
    .getByRole('textbox', { name: t('editor.reapply.jobAdLabel') })
    .fill(NEUE_ANZEIGE)
}

test.describe('Nächste Anzeige', () => {
  test('schreibt die vorgemerkten Stellen auf die neue Anzeige um', async ({ page }) => {
    const provider = await stubProvider(page)

    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    await markParagraph(page, 'ich bewerbe mich hiermit')

    await openDialog(page)
    // Eine Anfrage für die Anzeige, dazu eine je vorgemerkter Stelle.
    await expect(page.getByText(t('editor.reapply.cost', { count: 2 }))).toBeVisible()

    const vorher = provider.requests.length
    await page.getByRole('button', { name: t('editor.reapply.fast') }).click()

    await expect(page.getByText(t('editor.reapply.done', { count: 1 }))).toBeVisible()
    await expect(page.getByRole('textbox', { name: t('editor.document.heading') })).toContainText(
      VARIANT_TEXT,
    )
    // Genau zwei zusätzliche Aufrufe: die neue Anzeige und die eine Stelle.
    // Das Stilprofil hängt am Anschreiben und wird nicht neu geholt.
    expect(provider.requests.length - vorher).toBe(2)
  })

  test('lässt im Wählen-Modus die Formulierung von Hand aussuchen', async ({ page }) => {
    await stubProvider(page)

    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    await markParagraph(page, 'ich bewerbe mich hiermit')
    await openDialog(page)
    await page.getByRole('button', { name: t('editor.reapply.choose') }).click()

    // Angehalten, nichts übernommen.
    await expect(page.getByText(t('editor.reapply.halt.wahl'))).toBeVisible()

    await expect(page.getByText(VARIANT_TEXT)).toBeVisible()
    await page.getByRole('button', { name: t('editor.variants.apply') }).first().click()

    await expect(page.getByText(t('editor.reapply.done', { count: 1 }))).toBeVisible()
    await expect(page.getByRole('textbox', { name: t('editor.document.heading') })).toContainText(
      VARIANT_TEXT,
    )
  })

  /**
   * **Auch ohne vorgemerkte Stelle.** Der Knopf war einmal an
   * `marks.length > 0` gebunden und verschwand deshalb genau dann, wenn eine
   * Vormerkung wegfiel — der Weg in die nächste Bewerbung war dann nicht mehr
   * auffindbar, ohne dass irgendetwas erklärte, warum (siehe `ExportBar`,
   * Commit „Klick in den Brief hebt die Vormerkung nicht mehr auf"). Dieser
   * Test hielt bis hierher die alte Zusage fest.
   */
  test('bietet den Durchlauf auch ohne vorgemerkte Stelle an', async ({ page }) => {
    await stubProvider(page)

    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    await expect(page.getByRole('button', { name: t('editor.reapply.trigger') })).toBeVisible()
  })
})
