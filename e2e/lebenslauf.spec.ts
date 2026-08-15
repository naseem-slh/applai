import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import {
  completeOnboarding,
  fillStartPageCvOnly,
  FIXTURES_DIR,
  JOB_AD_TEXT,
  stubProvider,
  t,
  VARIANT_TEXT,
  waitForAnalysis,
} from './support'

/**
 * Der Lebenslauf in der Arbeitsfläche, im echten Browser.
 *
 * Was hier und nur hier geprüft wird: dass eine Bewerbung, die **kein**
 * Anschreiben verlangt, überhaupt durchläuft — von der Vorbereiten-Seite bis
 * zur umformulierten Stelle, gegen den gebauten Stand samt strenger CSP. In
 * jsdom fehlen dafür die echte Textmarkierung und der echte Download.
 *
 * Bis zum zweiten Bauabschnitt endete genau dieser Weg auf einer Karte mit
 * dem Satz, der Lebenslauf sei nicht an der Reihe.
 */

test.describe('Lebenslauf anpassen', () => {
  test('läuft ohne Anschreiben von der Einstiegsseite bis zur übernommenen Variante', async ({
    page,
  }) => {
    await stubProvider(page)

    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPageCvOnly(page)

    // Die Arbeitsfläche öffnet mit dem Lebenslauf.
    await waitForAnalysis(page, t('editor.document.cvHeading'))

    // Ein Umschalter mit einem einzigen Eintrag wäre eine Wahl, die keine ist.
    await expect(page.getByRole('radiogroup', { name: t('editor.switch.label') })).toHaveCount(0)

    // Kein Briefkopf: Ein Lebenslauf hat keinen.
    await expect(page.getByRole('button', { name: t('editor.letterhead.heading') })).toHaveCount(0)

    // **Kein „Ganzes Dokument"**: Ein Lebenslauf am Stück umformuliert
    // verlöre seine Gliederung.
    await expect(
      page.getByRole('button', { name: t('editor.selection.wholeDocument') }),
    ).toHaveCount(0)

    // Absatzweise markieren, umformulieren, übernehmen.
    await page.getByRole('paragraph').filter({ hasText: 'ich bewerbe mich hiermit' }).click()
    await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()
    await page.getByRole('button', { name: t('editor.variants.trigger') }).click()

    await page.getByText(VARIANT_TEXT).waitFor()
    await page.getByRole('button', { name: t('editor.variants.apply') }).first().click()

    await expect(page.getByRole('paragraph').filter({ hasText: VARIANT_TEXT })).toHaveCount(1)
  })

  test('zeigt bei zwei Unterlagen den Umschalter und beide Ausgabewege', async ({ page }) => {
    await stubProvider(page)

    await page.goto('/')
    await completeOnboarding(page)

    // Beide Ablegefelder belegen. Nicht über `fillStartPage`: Dieselbe Datei
    // liegt dann zweimal da, und ihr Name allein ist nicht mehr eindeutig —
    // gewartet wird deshalb je Ablegefeld.
    const datei = join(FIXTURES_DIR, 'anschreiben.docx')
    for (const [index, label] of [t('start.files.letter'), t('start.files.cv')].entries()) {
      await page.locator('input[type="file"]').nth(index).setInputFiles(datei)
      await page
        .getByRole('group', { name: label })
        .getByText(t('start.files.loaded', { name: 'anschreiben.docx' }))
        .waitFor()
    }

    await page.getByLabel(t('start.name.label'), { exact: true }).fill('Marlene Ostwald')
    await page.getByLabel(t('start.jobAd.heading'), { exact: true }).fill(JOB_AD_TEXT)
    await page.getByRole('button', { name: t('start.continue') }).click()

    await waitForAnalysis(page)

    const umschalter = page.getByRole('radiogroup', { name: t('editor.switch.label') })
    await expect(umschalter).toBeVisible()

    // Der Export folgt dem Umschalter: **eine** Unterlage, drei Wege. Sechs
    // Knöpfe für zwei Unterlagen waren vier zu viel.
    await expect(page.getByRole('button', { name: t('editor.export.docx') })).toHaveCount(1)

    // Umschalten wechselt das Blatt **und** die Datei, die herausgeht, ohne
    // die Seitenspalten zu wechseln.
    await umschalter.getByRole('radio', { name: t('editor.switch.cv') }).click()
    await expect(
      page.getByRole('textbox', { name: t('editor.document.cvHeading') }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: t('editor.export.docx') })).toHaveCount(1)
  })
})
