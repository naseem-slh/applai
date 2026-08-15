import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, FIXTURES_DIR, stubProvider, t } from './support'
import { join } from 'node:path'

/**
 * Die Nachweise zur Gestalt — nicht behauptet, sondern gemessen.
 *
 * Die vier Ansichten stammen aus abgenommenen Attrappen (`.scratch/mock/`,
 * v20–v23). Was dort mit Playwright nachgemessen wurde, wird hier
 * nachgemessen: Passt die Einstiegsseite ausgefüllt ins Fenster? Läuft
 * irgendwo etwas quer? Steht die Marke, wo sie stehen soll? Sind beide
 * Ablegekacheln gleich hoch? Und wird die bewegte Bilddatei der Marke
 * wirklich nie geholt, wenn jemand reduzierte Bewegung eingestellt hat?
 *
 * **Warum das nicht in die Unit-Tests gehört.** Jede dieser Fragen ist eine
 * Frage an den Umbruch: Sie hängt an echten Maßen, an Medienabfragen und an
 * dem, was der Browser wirklich lädt. jsdom rechnet kein Layout und lädt
 * kein Bild.
 */

/** Die Einstiegsseite ausfüllen, ohne weiterzugehen: Datei, Name, Anzeige. */
async function fillWithoutContinuing(page: Page): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(join(FIXTURES_DIR, 'anschreiben.docx'))
  await page.getByText(t('start.files.loaded', { name: 'anschreiben.docx' })).waitFor()
  await page.getByLabel(t('start.name.label'), { exact: true }).fill('Marlene Ostwald')
  await page.getByLabel(t('start.jobAd.heading'), { exact: true }).fill('Wir suchen eine Entwicklerin.')
  await expect(page.getByRole('button', { name: t('start.continue') })).toBeEnabled()
}

test.describe('Kein Querlauf', () => {
  /**
   * Von 360 bis 1920. Ein waagerechter Bildlauf ist auf einem Telefon der
   * Unterschied zwischen „bedienbar" und „die Hälfte der Knöpfe ist weg" —
   * und er entsteht fast immer aus einem einzigen Element, das seine Breite
   * nicht hergibt. Die Marke ist dafür der erste Verdächtige: Sie trägt
   * ausdrücklich **kein** `max-width` (siehe `Wordmark`).
   */
  const BREITEN = [360, 390, 560, 720, 860, 1024, 1280, 1440, 1920]

  for (const breite of BREITEN) {
    test(`bei ${breite}px`, async ({ page }) => {
      await stubProvider(page)
      await page.setViewportSize({ width: breite, height: 900 })

      await page.goto('/')
      await completeOnboarding(page)

      for (const pfad of ['/', '/datenschutz', '/settings']) {
        if (pfad !== '/') await page.goto(pfad)
        await page.waitForLoadState('networkidle')
        const ueberstand = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(ueberstand, `Querlauf auf ${pfad}`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe('Die Einstiegsseite passt ins Fenster', () => {
  /**
   * Ausgefüllt heißt: mit Datei, mit Anzeigentext und mit ausgeklapptem
   * Namensfeld — der höchste Zustand, den die Seite kennt.
   *
   * **668px ist gemessen, nicht gewünscht.** Die Attrappe kommt mit 620px
   * aus; sie trägt aber fünf Blöcke nicht, die die Anwendung braucht: den
   * Arbeitsumfang je Unterlage, den Hinweis unter der Anzeige, den
   * Aufklapper „Warum kein Link", die Bewerbungsliste und die Fußzeile mit
   * Datenschutz und Impressum. Wer davon etwas streicht, misst hier neu.
   */
  const HOEHEN = [1080, 900, 800, 720, 680]

  for (const hoehe of HOEHEN) {
    test(`bei ${hoehe}px Fensterhöhe`, async ({ page }) => {
      await stubProvider(page)
      await page.setViewportSize({ width: 1440, height: hoehe })

      await page.goto('/')
      await completeOnboarding(page)
      await fillWithoutContinuing(page)

      const ueberstand = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      )
      expect(ueberstand).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('Die Marke steht, wo sie stehen soll', () => {
  /**
   * Auf den Pixel und über alle Breiten. **Zentriert wird die Tinte, nicht
   * der Rahmen:** Rechts im Bild stehen 11,4 % leer (Platz für die
   * ausschlagenden Arme des Bleistifts), links 0,6 %. Ohne den Ausgleich
   * säße der Schriftzug sichtbar links der Mitte — und genau das prüft
   * dieser Test, indem er die Mitte des **Kastens** gegen die Mitte der
   * Seite hält: Der Kasten muss um die halbe Differenz nach links versetzt
   * sein.
   */
  const BREITEN = [720, 1024, 1440, 1920]

  for (const breite of BREITEN) {
    test(`mittig auf den Unterseiten bei ${breite}px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 })

      for (const pfad of ['/datenschutz', '/settings']) {
        await page.goto(pfad)
        const marke = page.getByTestId('wordmark')
        const kasten = await marke.boundingBox()
        expect(kasten, pfad).not.toBeNull()
        if (kasten === null) return

        // Die sichtbare Tinte endet 11,4 % vor der rechten Kante des Bildes.
        const tinteMitte = kasten.x + (kasten.width * (1 - 0.114)) / 2
        expect(Math.abs(tinteMitte - breite / 2), pfad).toBeLessThanOrEqual(2)
      }
    })
  }

  test('links auf der Arbeitsfläche', async ({ page }) => {
    await stubProvider(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await completeOnboarding(page)
    await fillWithoutContinuing(page)
    await page.getByRole('button', { name: t('start.continue') }).click()
    await page.waitForURL('**/editor')
    await page.getByTestId('wordmark').waitFor()

    const kasten = await page.getByTestId('wordmark').boundingBox()
    expect(kasten).not.toBeNull()
    // Am linken Rand der Hülle, nicht in der Mitte: 16px Polster plus die
    // 16px, um die die Marke dort aus der Flucht der Karten rückt.
    expect(kasten?.x ?? 0).toBeLessThanOrEqual(40)
  })
})

test.describe('Beide Ablegekacheln bleiben gleich hoch', () => {
  /**
   * In allen drei Zuständen: leer, eine geladen, beide geladen.
   *
   * Ohne `grid-auto-rows: 1fr` und `flex: 1` nimmt jede Kachel die Höhe
   * ihres Inhalts. Sobald eine geladen ist, fällt das Plus weg und der
   * Dateiname kommt dazu — unterm Strich rund 19px weniger. Die volle Kachel
   * schrumpfte also, statt sich zu füllen.
   */
  async function kachelhoehen(page: Page): Promise<number[]> {
    // Zwei Fallen stecken in dieser einen Messung.
    //
    // **`[data-tile]` und nicht „erster Knopf in der Gruppe":** Der
    // Entfernen-Knopf ist ebenfalls ein direktes Kind der Gruppe und wäre
    // mitgemessen worden — 36px neben 138.
    //
    // **`offsetHeight` und nicht `getBoundingClientRect()`:** Die leere
    // Kachel steht um 1,5° gekippt (lose Blätter liegen schief), und ein
    // umschließendes Rechteck wächst dadurch um `Breite × sin(1,5°)` — bei
    // 350px Kachelbreite sind das 9px. Wer die Rechtecke vergleicht, misst
    // die Drehung und meldet einen Unterschied, den es nicht gibt.
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-tile]')].map(
        (element) => (element as HTMLElement).offsetHeight,
      ),
    )
  }

  test('leer, eine geladen, beide geladen', async ({ page }) => {
    await stubProvider(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/')
    await completeOnboarding(page)

    const leer = await kachelhoehen(page)
    expect(leer).toHaveLength(2)
    expect(leer[0]).toBe(leer[1])

    await page.locator('input[type="file"]').first().setInputFiles(join(FIXTURES_DIR, 'anschreiben.docx'))
    await page.getByText(t('start.files.loaded', { name: 'anschreiben.docx' })).waitFor()

    const eine = await kachelhoehen(page)
    expect(eine[0]).toBe(eine[1])

    await page.locator('input[type="file"]').nth(1).setInputFiles(join(FIXTURES_DIR, 'anschreiben.docx'))
    await expect(page.getByText(t('start.files.loaded', { name: 'anschreiben.docx' }))).toHaveCount(2)

    const beide = await kachelhoehen(page)
    expect(beide[0]).toBe(beide[1])
  })
})

test.describe('Reduzierte Bewegung', () => {
  /**
   * **Die bewegte Fassung der Marke wird nie geholt.** Sie ist rund 875 KB
   * groß und hat im Ruhezustand keine Quelle; wer nie hinzeigt, lädt sie
   * nie. Bei `prefers-reduced-motion: reduce` wird sie auch beim Hinzeigen
   * nicht angefordert — das ist kein Feinschliff, sondern der Grund, warum
   * die Datei überhaupt vertretbar ist.
   *
   * Geprüft über den Netzwerkmitschnitt: Nicht „das Bild bewegt sich nicht",
   * sondern „die Datei wurde nie angefragt".
   */
  test('holt die bewegte Marke auch beim Hinzeigen nicht', async ({ page }) => {
    const angefragt: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('logo-schreck')) angefragt.push(request.url())
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    const marke = page.getByTestId('wordmark')
    await marke.hover()
    await page.waitForTimeout(600)

    expect(angefragt).toEqual([])
  })

  test('holt sie beim Hinzeigen, wenn Bewegung erlaubt ist', async ({ page }) => {
    // Die Gegenprobe. Ohne sie wäre der Test darüber auch dann grün, wenn
    // das Zeigen gar nichts mehr auslöst.
    const angefragt: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('logo-schreck')) angefragt.push(request.url())
    })

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    // Im Ruhezustand liegt nichts an.
    await page.waitForTimeout(300)
    expect(angefragt).toEqual([])

    await page.getByTestId('wordmark').hover()
    await expect.poll(() => angefragt.length).toBeGreaterThan(0)
  })
})

test.describe('Tastaturweg', () => {
  /**
   * Durch jede Ansicht: sichtbarer Fokus überall, kein Element ohne Namen.
   *
   * Geprüft wird beides an derselben Stelle, weil beides denselben Weg
   * abläuft: Bei jedem Halt wird der berechnete Umriss abgefragt (der Ring
   * ist eine `outline`, siehe `design.css`) und der zugängliche Name.
   */
  const ANSICHTEN = ['/datenschutz', '/settings'] as const

  for (const pfad of ANSICHTEN) {
    test(`durch ${pfad}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(pfad)

      const ohneRing: string[] = []
      const ohneNamen: string[] = []

      for (let schritt = 0; schritt < 40; schritt += 1) {
        await page.keyboard.press('Tab')
        const halt = await page.evaluate(() => {
          const element = document.activeElement
          if (element === null || element === document.body) return null
          const stil = getComputedStyle(element)
          return {
            marke: `${element.tagName.toLowerCase()}${element.id === '' ? '' : `#${element.id}`}`,
            ring: stil.outlineStyle !== 'none' && parseFloat(stil.outlineWidth) > 0,
          }
        })
        if (halt === null) break

        if (!halt.ring) ohneRing.push(halt.marke)

        // Der zugängliche Name, in der Reihenfolge, in der ihn auch eine
        // Vorlesesoftware sucht: aria-label, aria-labelledby, das zugehörige
        // `<label>` (per `for` oder als Elternelement), dann der Textinhalt.
        const name = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null
          if (element === null) return ''
          const label = element.getAttribute('aria-label')
          if (label !== null && label.trim() !== '') return label
          if (element.getAttribute('aria-labelledby') !== null) return 'über aria-labelledby'
          if (element.id !== '') {
            const fuer = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
            if (fuer !== null) return (fuer.textContent ?? '').trim()
          }
          const umschliessend = element.closest('label')
          if (umschliessend !== null) return (umschliessend.textContent ?? '').trim()
          return (element.textContent ?? '').trim()
        })
        if (name === '') ohneNamen.push(halt.marke)
      }

      expect(ohneRing, 'Halte ohne sichtbaren Fokus').toEqual([])
      expect(ohneNamen, 'Halte ohne zugänglichen Namen').toEqual([])
    })
  }
})

test.describe('Der Ring ist für die Tastatur', () => {
  /**
   * Ein Textfeld erfüllt `:focus-visible` auch beim Klicken — der Browser
   * macht das mit Absicht, weil es Tasten entgegennimmt. Wer hineinklickt,
   * weiß aber, wo er hingefahren ist, und bekam trotzdem den vollen Ring.
   *
   * Geprüft wird deshalb beides an derselben Stelle: dass der Ring beim
   * Klicken **weg** ist und beim Tabben **da** — und dass der Fokus im
   * ersten Fall trotzdem zu sehen bleibt, nämlich an der Kontur des Feldes.
   */
  async function fokusbild(page: Page) {
    // Die Kontur wechselt über 140 ms (`transition-colors`); vorher gemessen
    // stünde noch der Ausgangswert da.
    await page.waitForTimeout(250)
    return page.evaluate(() => {
      const element = document.activeElement
      if (element === null) return null
      const stil = getComputedStyle(element)
      return { ring: stil.outlineStyle, kontur: stil.borderTopColor }
    })
  }

  test('kein Ring beim Klicken, Ring beim Tabben', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await completeOnboarding(page)

    const feld = page.getByLabel(t('start.jobAd.heading'), { exact: true })
    const ruhe = (await feld.evaluate((element) => getComputedStyle(element).borderTopColor)) as string

    await feld.click()
    const geklickt = await fokusbild(page)
    expect(geklickt?.ring, 'Ring nach dem Klicken').toBe('none')
    expect(geklickt?.kontur, 'Kontur meldet den Fokus trotzdem').not.toBe(ruhe)

    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(feld).toBeFocused()
    expect((await fokusbild(page))?.ring, 'Ring nach dem Tabben').toBe('solid')

    // Tippen ist kein Fokuswechsel: Der Ring darf nicht mitten im Wort
    // anspringen, nur weil eine Taste gedrückt wurde.
    await feld.click()
    await page.keyboard.type('Wir suchen')
    expect((await fokusbild(page))?.ring, 'Ring beim Tippen').toBe('none')
  })
})
