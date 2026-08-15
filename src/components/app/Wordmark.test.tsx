import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { Wordmark } from './Wordmark'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

/** jsdom kennt weder Objektadressen noch `decode()`. Beides wird hier
 *  nachgestellt, damit die eigentliche Frage prüfbar bleibt: **wann** die
 *  bewegte Datei geholt wird — und wann nicht. */
function stelleBrowserNach(options: { reduziert: boolean }) {
  // Nur `blob()` wird gebraucht; `Response` steht in der jsdom-Umgebung
  // nicht zuverlässig zur Verfügung.
  const geholt = vi.fn((quelle: string) =>
    Promise.resolve({
      quelle,
      blob: () => Promise.resolve(new Blob([new Uint8Array([1])], { type: 'image/webp' })),
    }),
  )
  vi.stubGlobal('fetch', geholt)
  URL.createObjectURL = vi.fn(() => 'blob:applai/schreck')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? options.reduziert : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  )
  return geholt
}

/** `pointerenter` erzeugt Testing Library nicht von selbst mit einem
 *  `pointerType`; React hört zudem auf `pointerover`/`pointerout` und leitet
 *  daraus `onPointerEnter`/`onPointerLeave` ab. */
function flaeche(marke: Element): Element {
  const treffer = marke.querySelector('[data-marke-flaeche]')
  if (treffer === null) throw new Error('keine empfindliche Fläche')
  return treffer
}

function zeigeHin(marke: Element, pointerType = 'mouse') {
  fireEvent(
    flaeche(marke),
    new PointerEvent('pointerover', { bubbles: true, pointerType }),
  )
}

/** Im Ruhezustand steht am bewegten Bild ein durchsichtiger Punkt: Ein
 *  `<img>` ohne Quelle zeigte in manchen Browsern das Zeichen für ein
 *  kaputtes Bild. Geholt wird dafür nichts, `data:` fragt niemanden. */
function istRuhig(bild: Element) {
  expect(bild.getAttribute('src')).toMatch(/^data:image\/gif;base64,/)
}

function zeigeWeg(marke: Element) {
  fireEvent(flaeche(marke), new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }))
}

beforeEach(() => {
  // jsdom kennt PointerEvent nicht; für diese Tests genügt MouseEvent mit
  // einem angehängten pointerType.
  if (typeof PointerEvent === 'undefined') {
    class PointerEventStub extends MouseEvent {
      pointerType: string
      constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
        super(type, init)
        this.pointerType = init.pointerType ?? ''
      }
    }
    vi.stubGlobal('PointerEvent', PointerEventStub)
  }
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: () => Promise.resolve(),
  })
})

const echteObjektadresse = URL.createObjectURL
const echtesFreigeben = URL.revokeObjectURL

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  URL.createObjectURL = echteObjektadresse
  URL.revokeObjectURL = echtesFreigeben
})

describe('Wordmark', () => {
  it('nennt den Namen einmal, nicht dreimal', () => {
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    // Alle Bilder tragen alt=""; den Namen sagt die versteckte Zeile.
    expect(screen.getByText(t('app.name'))).toBeInTheDocument()
    for (const bild of screen.getByTestId('wordmark').querySelectorAll('img')) {
      expect(bild).toHaveAttribute('alt', '')
    }
  })

  it('gibt jedem Bild feste Maße, damit die Kopfzeile nicht springt', () => {
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    for (const bild of screen.getByTestId('wordmark').querySelectorAll('img')) {
      expect(bild).toHaveAttribute('width', '640')
      expect(bild).toHaveAttribute('height', '234')
    }
  })

  it('holt im Ruhezustand nichts — das bewegte Bild trägt nur einen Punkt', () => {
    const geholt = stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const bilder = screen.getByTestId('wordmark').querySelectorAll('img')
    istRuhig(bilder[2])
    expect(geholt).not.toHaveBeenCalled()
  })

  it('holt die bewegte Datei erst, wenn jemand hinzeigt — und dann nur einmal', async () => {
    const geholt = stelleBrowserNach({ reduziert: false })
    const { unmount } = render(<Wordmark className="[--breite:400px]" />)

    zeigeHin(screen.getByTestId('wordmark'))
    await waitFor(() => expect(geholt).toHaveBeenCalledTimes(1))
    expect(geholt.mock.calls[0][0]).toContain('logo-schreck')

    // Der Klumpen liegt bereit und überlebt einen Seitenwechsel: Die Marke
    // steht auf jeder Seite, und jedes weitere Zeigen kostet nichts mehr.
    // Eine frische Objektadresse gibt es trotzdem — nur so beginnt der Lauf
    // wieder beim ersten Bild.
    unmount()
    render(<Wordmark />)
    zeigeHin(screen.getByTestId('wordmark'))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    expect(geholt).toHaveBeenCalledTimes(1)
  })

  it('holt bei reduzierter Bewegung auch beim Hinzeigen nichts', async () => {
    const geholt = stelleBrowserNach({ reduziert: true })
    render(<Wordmark className="[--breite:400px]" />)

    zeigeHin(screen.getByTestId('wordmark'))

    // Kein Warten auf ein Ereignis, das nicht kommt: Nach einem Durchlauf
    // der Mikroaufgaben darf nichts geholt worden sein.
    await Promise.resolve()
    expect(geholt).not.toHaveBeenCalled()
  })

  it('blendet die Bewegung ab, sobald niemand mehr hinzeigt', async () => {
    // Sofort abzuschneiden hieße, ein beliebiges Bild aus der Mitte des Laufs
    // gegen die Ruhefassung zu schneiden. Die Datei bleibt deshalb, solange
    // die Blende läuft — sie ist ja das, was abgeblendet wird.
    vi.useFakeTimers()
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const marke = screen.getByTestId('wordmark')
    const anim = marke.querySelectorAll('img')[2]

    zeigeHin(marke)
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(anim.className).toContain('opacity-100')

    zeigeWeg(marke)
    expect(anim.className).toContain('opacity-0')
    expect(anim).toHaveAttribute('src', 'blob:applai/schreck')

    await act(() => vi.advanceTimersByTimeAsync(250))
    istRuhig(anim)
    // Eine Objektadresse, die niemand freigibt, hält die Datei im Speicher.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:applai/schreck')
  })

  it('blendet nur heraus, nicht hinein', async () => {
    // Ruhebild und erstes Bild der Bewegung sind Punkt für Punkt gleich: Der
    // Wechsel hinein ist unsichtbar und soll nicht warten.
    vi.useFakeTimers()
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const marke = screen.getByTestId('wordmark')
    const anim = marke.querySelectorAll('img')[2]

    zeigeHin(marke)
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(anim.className).toContain('duration-0')

    zeigeWeg(marke)
    expect(anim.className).toContain('duration-200')
  })

  it('macht nur die ruhende Tinte empfindlich, nicht den ganzen Kasten', () => {
    // Rechts im Bild stehen 11,4 % leer. Wer dort vorbeifährt, hat die Marke
    // nicht berührt und soll sie nicht erschrecken.
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const treffer = flaeche(screen.getByTestId('wordmark'))
    expect(treffer.className).toContain('right-[11.41%]')
    expect(treffer.className).toContain('left-[0.62%]')
  })

  it('bricht auch ab, wenn der Zeiger schon weg ist, ehe das erste Bild steht', async () => {
    // Wer nur über die Marke streicht, bekommt nichts zu sehen: Bis die
    // Datei da ist, ist die Frage längst beantwortet.
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const marke = screen.getByTestId('wordmark')
    const anim = marke.querySelectorAll('img')[2]

    zeigeHin(marke)
    zeigeWeg(marke)
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled())
    istRuhig(anim)
  })

  it('spielt ein Tippen einmal ab und hört von selbst auf', async () => {
    // Auf dem Finger gibt es kein Weggehen — der Lauf muss sich selbst
    // anhalten, und zwar am Ende seines Zyklus (3000 ms laut Datei).
    vi.useFakeTimers()
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const marke = screen.getByTestId('wordmark')
    const anim = marke.querySelectorAll('img')[2]

    fireEvent(flaeche(marke), new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(anim).toHaveAttribute('src', 'blob:applai/schreck')

    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(anim).toHaveAttribute('src', 'blob:applai/schreck')

    // 3000 ms Zyklus, 80 ms Zugabe, danach die Blende.
    await act(() => vi.advanceTimersByTimeAsync(1500))
    istRuhig(anim)
  })

  it('hört auf, sobald die Seite verborgen ist', async () => {
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const marke = screen.getByTestId('wordmark')
    const anim = marke.querySelectorAll('img')[2]

    zeigeHin(marke)
    await waitFor(() => expect(anim).toHaveAttribute('src', 'blob:applai/schreck'))

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))

    istRuhig(anim)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('rechnet die leere Fläche rechts heraus, statt den Rahmen zu zentrieren', () => {
    stelleBrowserNach({ reduziert: false })
    render(<Wordmark className="[--breite:400px]" />)

    const marke = screen.getByTestId('wordmark')
    // Die Breite kommt als Klasse und nicht als Stilwert: Nur so lässt sie
    // sich in einer Medienabfrage übersteuern.
    expect(marke.className).toContain('[--breite:400px]')
    expect(marke.className).toContain('mr-[calc(var(--breite)*-0.1078)]')
    // `max-width` löst sich gegen die verkleinerte Zelle auf und schrumpft
    // die Marke — es darf hier nie stehen.
    expect(marke.className).not.toContain('max-w')
  })
})
