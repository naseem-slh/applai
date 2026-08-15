import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  completeOnboarding,
  fillStartPage,
  fillStartPageCvOnly,
  stubProvider,
  t,
  waitForAnalysis,
} from './support'

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

/**
 * Die geprüften Ansichten — je eine Funktion, die die Anwendung dorthin
 * bringt. Vom Prüfen getrennt, weil jede Ansicht bei **jeder**
 * Fenstergröße durchlaufen wird.
 */
const VIEWS: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'Einstiegsseite, Erststart mit Datenschutzhinweis',
    open: async (page) => {
      await page.goto('/')
      await page.getByRole('heading', { name: t('onboarding.privacy.heading') }).waitFor()
    },
  },
  {
    name: 'Schlüsseleinrichtung',
    open: async (page) => {
      await page.goto('/')
      await page.getByRole('button', { name: t('onboarding.privacy.accept') }).click()
      await page.getByRole('heading', { name: t('onboarding.key.heading') }).waitFor()
    },
  },
  {
    name: 'Einstiegsseite mit Unterlagen und Bewerbungsliste',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await page.getByRole('button', { name: t('start.continue') }).waitFor()
    },
  },
  {
    name: 'Arbeitsfläche samt Seitenspalte und Export',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await fillStartPage(page)
      await waitForAnalysis(page)
    },
  },
  {
    // Der Lebenslauf allein: eigene Bereiche (Form der Einträge statt
    // Briefkopf und Schreibstil) und eine Markierungsleiste ohne „Ganzes
    // Dokument". Beides ist Oberfläche, die es beim Anschreiben nicht gibt.
    name: 'Arbeitsfläche mit dem Lebenslauf allein',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await fillStartPageCvOnly(page)
      await waitForAnalysis(page, t('editor.document.cvHeading'))
    },
  },
  {
    // Eigener Durchgang, weil die Merkliste erst entsteht, wenn etwas
    // vorgemerkt ist: Der Durchgang darüber sähe nur den Leerzustand.
    name: 'Arbeitsfläche mit vorgemerkten Stellen',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await fillStartPage(page)
      await waitForAnalysis(page)

      // Markieren ist Vormerken; einen eigenen Knopf gibt es nicht.
      for (const paragraph of ['ich bewerbe mich hiermit', 'Mit freundlichen Grüßen']) {
        await page.getByRole('paragraph').filter({ hasText: paragraph }).click()
        await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()
      }
      // Auf schmalen Fenstern sind die Bereiche der Seitenspalte
      // zugeklappt. Zugeklappt ist die Merkliste weder für den Nutzer noch
      // für axe da — und geprüft werden soll sie aufgeklappt.
      const progress = page.getByText(t('editor.marks.tally', { done: 0, total: 2 }))
      if (!(await progress.isVisible())) {
        await page.getByRole('heading', { level: 3, name: t('editor.marks.heading') }).click()
      }
      await progress.waitFor()
    },
  },
  {
    // Der Dialog für die nächste Ausschreibung. Eigener Durchgang, weil er
    // den Rest der Seite verdeckt und axe sonst nur den Hintergrund sähe.
    name: 'Dialog für die nächste Anzeige',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await fillStartPage(page)
      await waitForAnalysis(page)

      await page.getByRole('paragraph').filter({ hasText: 'ich bewerbe mich hiermit' }).click()
      await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()

      await page.getByRole('button', { name: t('editor.reapply.trigger') }).click()
      await page.getByRole('dialog', { name: t('editor.reapply.heading') }).waitFor()
    },
  },
  {
    // Der Haltezustand: Fortschrittszeile, Grund und die drei Formulierungen
    // zur Auswahl stehen erst hier zusammen im Baum.
    name: 'Durchlauf hält zur Auswahl an',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await fillStartPage(page)
      await waitForAnalysis(page)

      await page.getByRole('paragraph').filter({ hasText: 'ich bewerbe mich hiermit' }).click()
      await page.getByRole('button', { name: t('editor.selection.currentParagraph') }).click()

      await page.getByRole('button', { name: t('editor.reapply.trigger') }).click()
      await page
        .getByRole('textbox', { name: t('editor.reapply.jobAdLabel') })
        .fill('Stellenanzeige: Projektleiterin (m/w/d). Gesucht wird Erfahrung in der Leitung.')
      await page.getByRole('button', { name: t('editor.reapply.choose') }).click()

      await page.getByText(t('editor.reapply.halt.wahl')).waitFor()
    },
  },
  {
    name: 'Datenschutz und Impressum',
    open: async (page) => {
      await page.goto('/datenschutz')
      await page.getByRole('heading', { level: 1, name: t('privacy.heading') }).waitFor()
    },
  },
  {
    name: 'Einstellungen',
    open: async (page) => {
      await page.goto('/')
      await completeOnboarding(page)
      await page.getByRole('link', { name: t('nav.settings') }).click()
      await page.getByRole('heading', { name: t('routes.settings.heading') }).waitFor()
    },
  },
]

/**
 * Breit und schmal. Der schmale Durchgang ist keine Zugabe, sondern der
 * Teil, der die Fehler findet: Was bei 1280 Pixeln im Baum steht, kann bei
 * 390 mit `hidden` ausgeblendet sein — und `hidden` nimmt eine Beschriftung
 * nicht nur aus dem Bild, sondern auch aus dem Zugänglichkeitsbaum. Genau so
 * sind zwei Verweise ohne Namen in der Kopfzeile durch alle bisherigen
 * Durchgänge gerutscht, weil sie sämtlich breit liefen.
 *
 * 390 × 700 ist ein heute übliches Telefon.
 */
const VIEWPORTS = [
  { name: 'breites Fenster', size: { width: 1280, height: 720 } },
  { name: 'schmales Fenster', size: { width: 390, height: 700 } },
]

/**
 * **Und beides in beiden Themen.** Die dunkle Fassung ist keine Umfärbung
 * derselben Werte: Sie führt eigene Farben für Tinte, Karte, Feld und jeden
 * Zustand. Ein Kontrast, der hell trägt, kann dunkel durchfallen — und
 * umgekehrt. Geprüft wird die Systemwahl (`colorScheme`), weil die
 * ausdrückliche Wahl über `data-theme` dieselben Werte setzt.
 */
const THEMES = ['light', 'dark'] as const

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`Barrierefreiheit, ${viewport.name}, ${theme === 'light' ? 'hell' : 'dunkel'}`, () => {
      test.use({ colorScheme: theme })

      for (const view of VIEWS) {
        test(view.name, async ({ page }) => {
          await page.setViewportSize(viewport.size)
          await stubProvider(page)
          await view.open(page)

          await scan(page)
        })
      }
    })
  }
}

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
