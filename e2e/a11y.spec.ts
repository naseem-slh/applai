import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, fillStartPage, stubProvider, t, waitForAnalysis } from './support'

/**
 * Barrierefreiheit, maschinell geprüft — und die Tastaturwege, die axe nicht
 * beurteilt.
 *
 * **Was axe kann und was nicht.** Es findet fehlende Namen, zu geringe
 * Kontraste, kaputte Beziehungen zwischen Beschriftung und Bedienelement.
 * Es beurteilt **nicht**, ob sich die Anwendung mit der Tastatur bedienen
 * lässt, ob die Reihenfolge sinnvoll ist oder ob eine Meldung angesagt wird.
 * Deshalb stehen unten zusätzlich die Wege, die ein Mensch abgehen würde.
 *
 * Geprüft wird auf `serious` und `critical`. Die leichteren Stufen von axe
 * enthalten Hinweise, die eine Entscheidung verlangen (etwa „Region": jeder
 * Inhalt soll in einem Landmark liegen) — die gehören in eine Durchsicht,
 * nicht in einen gatenden Test.
 */

const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ''),
  )

  // Die Meldung nennt Regel, Wirkung und die betroffene Stelle — sonst
  // steht im Fehlschlag nur eine Zahl.
  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([])
}

test.describe('Barrierefreiheit', () => {
  test('Einstiegsseite, Erststart mit Datenschutzhinweis', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await page.getByRole('heading', { name: t('onboarding.privacy.heading') }).waitFor()

    await scan(page)
  })

  test('Schlüsseleinrichtung', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await page.getByRole('button', { name: t('onboarding.privacy.accept') }).click()
    await page.getByRole('heading', { name: t('onboarding.key.heading') }).waitFor()

    await scan(page)
  })

  test('Einstiegsseite mit Unterlagen und Bewerbungsliste', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await page.getByRole('heading', { name: t('start.documents.heading') }).waitFor()

    await scan(page)
  })

  test('Arbeitsfläche samt Seitenspalte und Export', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    await scan(page)
  })

  test('Datenschutz und Impressum', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/datenschutz')
    await page.getByRole('heading', { level: 1, name: t('privacy.heading') }).waitFor()

    await scan(page)
  })

  test('Einstellungen', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await page.getByRole('link', { name: t('nav.settings') }).click()
    await page.getByRole('heading', { name: t('routes.settings.heading') }).waitFor()

    await scan(page)
  })
})

test.describe('Bedienung mit der Tastatur', () => {
  test('markieren mit Umschalt+Pfeiltasten und die Variantenauswahl erreichen', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    // In den Brief hinein und von dort mit der Tastatur markieren.
    const surface = page.getByRole('textbox', { name: t('editor.document.heading') })
    await surface.getByText('Sehr geehrte Damen und Herren,').click()
    await page.keyboard.press('Home')
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+ArrowRight')
    }

    // Die Leiste nennt die markierte Zeichenzahl — die Markierung ist
    // angekommen, ohne dass eine Maus gezogen hat.
    await expect(page.getByText(t('editor.selection.summary', { chars: 12 }))).toBeVisible()

    // Und der Vorschlag ist mit der Tastatur auszulösen.
    await page.getByRole('button', { name: t('editor.variants.trigger') }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(
      page.getByRole('button', { name: t('editor.variants.apply') }).first(),
    ).toBeVisible()
  })

  test('die Wahrheitsgrenze lässt sich ohne Maus umstellen', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    const select = page.getByRole('combobox', { name: t('editor.truthMode.label') })
    await select.focus()
    await page.keyboard.press('Enter')

    await page.getByRole('option', { name: t('settings.truthMode.options.free') }).click()

    // Der erklärende Dialog nimmt den Fokus und lässt sich mit der Tastatur
    // beantworten.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(t('editor.truthMode.free.export'))
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
