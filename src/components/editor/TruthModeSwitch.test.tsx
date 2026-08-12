import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import type { TruthMode } from '@/lib/storage/adapter'
import { TruthModeSwitch } from './TruthModeSwitch'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

// Radix' Auswahlliste fängt den Zeiger ein und scrollt den gewählten
// Eintrag heran. jsdom kennt beides nicht; dieselben Ersatzfunktionen
// stehen in `Select.test.tsx` und `Settings.test.tsx`.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function setup(value: TruthMode = 'strict') {
  const onChange = vi.fn()
  render(<TruthModeSwitch value={value} onChange={onChange} />)
  return { onChange }
}

/**
 * Radix' Auswahlliste öffnet auf `pointerdown`, nicht auf `click` — dieselbe
 * Geste wie in `Select.test.tsx`.
 */
function openList(): void {
  fireEvent.pointerDown(screen.getByRole('combobox'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

async function choose(mode: TruthMode): Promise<void> {
  openList()
  const option = await screen.findByRole('option', { name: t(`settings.truthMode.options.${mode}`) })
  fireEvent.click(option)
}

describe('TruthModeSwitch', () => {
  it('zeigt den geltenden Modus an', () => {
    setup('bridge')
    expect(screen.getByRole('combobox')).toHaveTextContent(t('settings.truthMode.options.bridge'))
  })

  it('wechselt ohne Nachfrage in einen strengeren Modus', async () => {
    const { onChange } = setup('free')

    await choose('strict')

    expect(onChange).toHaveBeenCalledWith('strict')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('fragt vor dem freien Modus nach und nennt Markierung, Bestätigung und Exportsperre', async () => {
    const { onChange } = setup('strict')

    await choose('free')

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(t('editor.truthMode.free.marked'))
    expect(dialog).toHaveTextContent(t('editor.truthMode.free.confirm'))
    expect(dialog).toHaveTextContent(t('editor.truthMode.free.export'))
    // Noch ist nichts umgestellt: Die Nachfrage ist eine Bedingung, kein
    // Hinweis auf etwas bereits Geschehenes.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('bleibt beim bisherigen Modus, wenn die Nachfrage abgelehnt wird', async () => {
    const { onChange } = setup('strict')

    await choose('free')
    fireEvent.click(await screen.findByRole('button', { name: t('editor.truthMode.free.cancel') }))

    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('schaltet erst nach ausdrücklicher Zustimmung um', async () => {
    const { onChange } = setup('strict')

    await choose('free')
    fireEvent.click(
      await screen.findByRole('button', { name: t('editor.truthMode.free.confirmAction') }),
    )

    expect(onChange).toHaveBeenCalledWith('free')
  })
})
