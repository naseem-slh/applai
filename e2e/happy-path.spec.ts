import { expect, test } from '@playwright/test'
import {
  completeOnboarding,
  fillStartPage,
  JOB_AD_TEXT,
  stubProvider,
  t,
  VARIANT_TEXT,
  waitForAnalysis,
} from './support'

/**
 * Der Durchlauf, für den es diese Anwendung gibt: Anschreiben hochladen,
 * Anzeige einfügen, Textstelle markieren, Variante übernehmen, exportieren —
 * und die Bewerbung steht danach in der Liste.
 *
 * **Gegen den gebauten Stand, nicht gegen den Entwicklungsserver** (siehe
 * `playwright.config.ts`): Nur dort gilt die strenge CSP. Jeder abgefangene
 * Anbieteraufruf ist damit zugleich ein Beleg, dass `connect-src` ihn
 * durchlässt (G3) — und der Rest des Durchlaufs ein Beleg, dass die Anwendung
 * ohne eine einzige Verbindung zu einem anderen Host auskommt (G2).
 */

test.describe('Der ganze Weg', () => {
  test('von der leeren Seite bis zur Word-Datei in der Bewerbungsliste', async ({ page }) => {
    const provider = await stubProvider(page)

    await page.goto('/')

    // 1. Erststart: Datenschutzhinweis und Schlüssel.
    await expect(page.getByRole('heading', { name: t('onboarding.privacy.heading') })).toBeVisible()
    await completeOnboarding(page)

    // 2. Unterlagen und Anzeige.
    await fillStartPage(page)

    // 3. Die Arbeitsfläche wertet Anzeige und Stilprofil aus.
    await waitForAnalysis(page)
    expect(provider.requests).toHaveLength(2)

    // Der Briefkopf steht vorbefüllt in der Seitenspalte.
    await expect(page.getByLabel(t('editor.letterhead.fields.recipient'), { exact: true })).toHaveValue(
      'Musterwerk Solutions',
    )
    // Und die Anforderung der Anzeige ist einsehbar, ohne dass jemand gefragt
    // hätte (docs/spec.md: „Sichtbarer Zwischenschritt"): Die Liste steht
    // ohne Modellaufruf bereit. Seit „Vorgemerkte Stellen über die
    // Anforderungen" beginnt der Bereich zugeklappt — er ist Nachschlagestoff,
    // nicht das Werkzeug. „Einsehbar" heißt deshalb einen Klick entfernt und
    // nicht ungefragt aufgeschlagen; die Überschrift im `summary` klappt auf.
    await page.getByRole('heading', { name: t('editor.gaps.heading') }).click()
    await expect(page.getByText('Sehr gute Kenntnisse in TypeScript')).toBeVisible()

    // 4. Eine Textstelle markieren und umformulieren lassen.
    await page.getByRole('paragraph').filter({ hasText: 'ich bewerbe mich hiermit' }).click()
    await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()
    await page.getByRole('button', { name: t('editor.variants.trigger') }).click()

    await expect(page.getByText(VARIANT_TEXT)).toBeVisible()
    await page.getByRole('button', { name: t('editor.variants.apply') }).first().click()

    // 5. Die Übernahme steht im Dokument.
    await expect(
      page.getByRole('textbox', { name: t('editor.document.heading') }),
    ).toContainText(VARIANT_TEXT)

    // Der Klarname ist nie hinausgegangen (Anonymisierung, standardmäßig an).
    expect(provider.requests.join('\n')).not.toContain('Marlene Ostwald')

    // 6. Exportieren.
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: t('editor.export.docx') }).click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(
      /^Anschreiben_Musterwerk_Solutions_\d{4}-\d{2}-\d{2}\.docx$/,
    )
    await expect(page.getByText(t('editor.export.docxDone'))).toBeVisible()

    // 7. Die Bewerbung steht in der Liste. Sie liegt seit dem Aufräumen der
    //    Einstiegsseite hinter einem Verweis in der Fußleiste, nicht mehr
    //    aufgeklappt unter der Stellenausschreibung.
    await page.getByRole('link', { name: t('editor.backToStart') }).click()
    await page.getByRole('button', { name: t('start.applications.open', { count: 1 }) }).click()
    const list = page.getByRole('dialog')
    await expect(list.getByRole('cell', { name: 'Musterwerk Solutions' })).toBeVisible()
    await expect(list.getByRole('cell', { name: 'Entwicklerin' })).toBeVisible()
  })

  test('eine zweite Bewerbung bei derselben Firma erzeugt den Hinweis', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)

    // Erste Bewerbung bis zum Export.
    await fillStartPage(page)
    await waitForAnalysis(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: t('editor.export.docx') }).click()
    await download

    // Zweite Bewerbung: dieselbe Anzeige noch einmal einfügen.
    await page.getByRole('link', { name: t('editor.backToStart') }).click()
    await page.getByLabel(t('start.jobAd.heading'), { exact: true }).fill(JOB_AD_TEXT)

    const hint = page.getByRole('alert').filter({ hasText: 'schon beworben' })
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('Musterwerk Solutions')
  })
})

test.describe('Der Zwischenstand', () => {
  test('überlebt ein Neuladen der Arbeitsfläche', async ({ page }) => {
    await stubProvider(page)
    await page.goto('/')
    await completeOnboarding(page)
    await fillStartPage(page)
    await waitForAnalysis(page)

    // Eine eigene Änderung tippen und warten, bis sie gesichert ist.
    const surface = page.getByRole('textbox', { name: t('editor.document.heading') })
    await surface.getByText('Sehr geehrte Damen und Herren,').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Guten Tag!')

    await expect(page.getByText(t('editor.draft.savedJustNow'))).toBeVisible({ timeout: 30_000 })

    await page.reload()

    // Zurück auf der Einstiegsseite wird der Entwurf angeboten (die
    // Arbeitsfläche selbst hat nach dem Neuladen keinen Übergabestand mehr).
    //
    // Als Zettel neben der Karte oder als Marke in der Kachel, je nach
    // Fensterbreite — der Name des Knopfes ist in beiden Fassungen derselbe.
    await expect(
      page.getByRole('button', {
        name: `${t('start.recent.use')} ${t('start.files.letter')}`,
      }),
    ).toBeVisible()
  })
})

test.describe('Die Zusagen der Seite', () => {
  test('die Datenschutzerklärung ist von der Einstiegsseite aus erreichbar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: t('nav.privacy') }).click()

    await expect(page.getByRole('heading', { level: 1, name: t('privacy.heading') })).toBeVisible()
    await expect(page.getByText(t('privacy.lead'))).toBeVisible()
  })

  // G3: Die Ausleitungssperre ist der stärkste Teil der Zusage — sie gilt
  // selbst dann, wenn eine Abhängigkeit kompromittiert wäre. Geprüft wird
  // gegen den gebauten Stand, denn nur dort ist die CSP scharf.
  test('die CSP lässt keinen anderen Host als die drei Anbieter zu', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('heading', { name: t('onboarding.privacy.heading') }).waitFor()

    const blocked = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/', { mode: 'no-cors' })
        return false
      } catch {
        return true
      }
    })

    expect(blocked).toBe(true)
  })

  // Die eigene Herkunft kommt aus der Konfiguration, nicht aus einer festen
  // Zeichenkette: Der Port des Vorschau-Servers ist über `PLAYWRIGHT_PORT`
  // wählbar, damit mehrere Arbeitsbäume nebeneinander prüfen können.
  test('die Seite lädt nichts von einem fremden Host', async ({ page, baseURL }) => {
    const own = new URL(baseURL ?? 'http://localhost:4173').origin
    const foreign: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.origin !== own) foreign.push(request.url())
    })

    await page.goto('/')
    await page.getByRole('heading', { name: t('onboarding.privacy.heading') }).waitFor()

    // G2: keine CDN-Skripte, keine Google-Fonts, keine Analytics. Die
    // Schriftarten liegen im Projekt.
    expect(foreign).toEqual([])
  })
})
