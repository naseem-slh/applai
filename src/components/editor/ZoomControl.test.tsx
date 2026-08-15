import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n/i18n'
import { ZoomControl } from './ZoomControl'
import { ZOOM_MAX, ZOOM_MIN } from './zoom'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function setup(zoom = 100) {
  const onZoomChange = vi.fn()
  const onZoomCommit = vi.fn()
  render(<ZoomControl zoom={zoom} onZoomChange={onZoomChange} onZoomCommit={onZoomCommit} />)
  return { onZoomChange, onZoomCommit }
}

describe('ZoomControl', () => {
  it('sagt den Maßstab mit seiner Einheit an, nicht als nackte Zahl', () => {
    setup(60)
    const thumb = screen.getByRole('slider', { name: t('editor.zoom.label') })
    expect(thumb).toHaveAttribute('aria-valuetext', t('editor.zoom.value', { percent: 60 }))
    expect(thumb).toHaveAttribute('aria-valuenow', '60')
    expect(thumb).toHaveAttribute('aria-valuemin', String(ZOOM_MIN))
    expect(thumb).toHaveAttribute('aria-valuemax', String(ZOOM_MAX))
  })

  it('kommt mit zwei Bedienelementen aus: Schiene und Stand', () => {
    // Davor standen hier vier für eine einzige Zahl — ein Minus, eine
    // Schiene, ein Plus und der Stand. Die beiden Knöpfe machten dasselbe
    // wie ein Pfeiltastendruck auf der Schiene und dasselbe wie ein Zug mit
    // dem Finger.
    setup(60)

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('slider', { name: t('editor.zoom.label') })).toBeInTheDocument()
  })

  it('führt der Stand auf 100 % zurück', () => {
    const { onZoomChange, onZoomCommit } = setup(45)
    fireEvent.click(screen.getByRole('button', { name: t('editor.zoom.reset', { percent: 45 }) }))
    expect(onZoomChange).toHaveBeenCalledWith(ZOOM_MAX)
    expect(onZoomCommit).toHaveBeenCalledWith(ZOOM_MAX)
  })

  it('nennt im Namen des Standes zuerst genau das, was dasteht', () => {
    // WCAG 2.5.3: Der zugängliche Name muss die sichtbare Beschriftung
    // enthalten, sonst spricht eine Sprachsteuerung den Knopf nicht an.
    setup(45)
    const shown = t('editor.zoom.value', { percent: 45 })
    const reset = screen.getByRole('button', { name: t('editor.zoom.reset', { percent: 45 }) })
    expect(reset).toHaveTextContent(shown)
    expect(reset.getAttribute('aria-label')).toContain(shown)
  })

  it('bewegt sich mit den Pfeiltasten um eine Schrittweite', () => {
    const { onZoomChange } = setup(60)
    const thumb = screen.getByRole('slider', { name: t('editor.zoom.label') })
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' })
    expect(onZoomChange).toHaveBeenCalledWith(55)
  })
})
