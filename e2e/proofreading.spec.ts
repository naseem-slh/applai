import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, fillStartPage, stubProvider, t, waitForAnalysis } from './support'

/**
 * Die Textprüfung.
 *
 * Die Regeln selbst sind in `proofreading.test.ts` Fall für Fall geprüft.
 * Hier zählt, was jsdom nicht kann: der Klick auf eine Fundstelle, die
 * Übernahme des Vorschlags — und die beiden Fälle, die leicht kaputtgehen,
 * ohne dass es jemandem auffällt:
 *
 * - **Das Kontextmenü bleibt dem Browser.** Dort stehen seine eigenen
 *   Rechtschreibvorschläge, und die berichtigen die echten Tippfehler.
 * - **Die Rechtschreibung hat Vorrang vor dem Vormerken.** Ein Doppelklick
 *   wählt das Wort aus, und Auswählen heißt hier sonst Vormerken.
 */

const SATZ = 'Ich habe habe dort seid 2024 gearbeitet.'

async function tippeSatzEin(page: Page): Promise<void> {
  await page.getByRole('paragraph').filter({ hasText: 'ich bewerbe mich hiermit' }).click()
  await page.keyboard.insertText(SATZ)
}

/** Der Mittelpunkt der Wellenlinie unter `wortlaut`. */
async function befund(page: Page, wortlaut: string) {
  return page.evaluate((needle) => {
    const surface = document.querySelector<HTMLElement>('[data-print-document]')
    if (surface === null) return null
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode()) !== null) {
      const at = (node.textContent ?? '').indexOf(needle)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    return null
  }, wortlaut)
}

function menu(page: Page) {
  return page.getByRole('dialog', { name: t('editor.proofreading.heading') })
}

function briefText(page: Page) {
  return page.locator('[data-print-document]').innerText()
}

test.beforeEach(async ({ page }) => {
  await stubProvider(page)
  await page.goto('/')
  await completeOnboarding(page)
  await fillStartPage(page)
  await waitForAnalysis(page)
})

test('führt die Befunde in der Spalte auf', async ({ page }) => {
  await tippeSatzEin(page)

  await expect(
    page.getByText(t('editor.proofreading.rules.doubledWord'), { exact: false }).first(),
  ).toBeVisible()
  await expect(
    page.getByText(t('editor.proofreading.rules.seidForSeit'), { exact: false }).first(),
  ).toBeVisible()
})

test('berichtigt einen Befund über den Linksklick auf die Wellenlinie', async ({ page }) => {
  await tippeSatzEin(page)

  const stelle = await befund(page, 'seid')
  expect(stelle).not.toBeNull()
  await page.mouse.click(stelle!.x, stelle!.y)

  // Ausdrücklich im Menü und nicht in der Spalte: Der Eintrag dort trägt
  // dieselbe Beschriftung, weil er dasselbe sagt.
  await expect(menu(page)).toBeVisible()
  await menu(page)
    .getByRole('button', {
      name: t('editor.proofreading.replace', { found: 'seid', suggestion: 'seit' }),
    })
    .click()

  await expect.poll(async () => (await briefText(page)).includes('seit 2024')).toBe(true)
  expect(await briefText(page)).not.toContain('seid 2024')

  // Der Schreibcursor bleibt im Brief: Weitertippen muss sofort gehen.
  const imBrief = await page.evaluate(() => {
    const active = document.activeElement
    return active !== null && active.closest('[data-print-document]') !== null
  })
  expect(imBrief).toBe(true)
})

test('öffnet nichts bei einem Klick neben eine Wellenlinie', async ({ page }) => {
  await tippeSatzEin(page)

  const stelle = await befund(page, 'gearbeitet')
  expect(stelle).not.toBeNull()
  await page.mouse.click(stelle!.x, stelle!.y)
  await page.waitForTimeout(300)

  await expect(menu(page)).toHaveCount(0)
})

test('lässt das Kontextmenü dem Browser, auch auf einer Wellenlinie', async ({ page }) => {
  await tippeSatzEin(page)

  const stelle = await befund(page, 'seid')
  expect(stelle).not.toBeNull()
  await page.mouse.click(stelle!.x, stelle!.y, { button: 'right' })
  await page.waitForTimeout(300)

  // Ob der Browser sein Menü zeigt, kann eine Seite nicht sehen — prüfbar
  // ist, dass wir uns nicht dazwischendrängen.
  await expect(menu(page)).toHaveCount(0)
})

test('legt beim Doppelklick auf einen Befund keine Vormerkung an', async ({ page }) => {
  await tippeSatzEin(page)
  await expect(page.getByText(t('editor.marks.count', { count: 0 }))).toBeVisible()

  const stelle = await befund(page, 'seid')
  expect(stelle).not.toBeNull()
  await page.mouse.dblclick(stelle!.x, stelle!.y)

  // Die Korrektur gewinnt, die Merkliste bleibt leer.
  await expect(menu(page)).toBeVisible()
  await expect(page.getByText(t('editor.marks.count', { count: 0 }))).toBeVisible()
})

test('merkt eine von Hand gezogene Stelle weiterhin vor', async ({ page }) => {
  await tippeSatzEin(page)

  // Dieselbe Stelle, aber als ausdrücklicher Zug mit der Maus.
  const von = await befund(page, 'dort')
  expect(von).not.toBeNull()
  await page.mouse.move(von!.x - 14, von!.y)
  await page.mouse.down()
  await page.mouse.move(von!.x + 14, von!.y, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByText(t('editor.marks.count', { count: 1 }))).toBeVisible()
})

test('übernimmt einen Befund auch aus der Liste', async ({ page }) => {
  await tippeSatzEin(page)

  await page.getByRole('button', { name: t('editor.proofreading.apply') }).first().click()

  await expect.poll(async () => (await briefText(page)).includes('habe habe')).toBe(false)
})
