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

  it('stellt und sichert mit einem Klick auf „kleiner"', () => {
    const { onZoomChange, onZoomCommit } = setup(60)
    fireEvent.click(screen.getByRole('button', { name: t('editor.zoom.out') }))
    // Ein Klick ist eine abgeschlossene Geste — anders als das Ziehen am
    // Regler, wo erst das Loslassen sichert.
    expect(onZoomChange).toHaveBeenCalledWith(55)
    expect(onZoomCommit).toHaveBeenCalledWith(55)
  })

  it('stellt und sichert mit einem Klick auf „größer"', () => {
    const { onZoomChange, onZoomCommit } = setup(60)
    fireEvent.click(screen.getByRole('button', { name: t('editor.zoom.in') }))
    expect(onZoomChange).toHaveBeenCalledWith(65)
    expect(onZoomCommit).toHaveBeenCalledWith(65)
  })

  it('sperrt den Knopf, der über das Ende hinausführen würde', () => {
    setup(ZOOM_MAX)
    expect(screen.getByRole('button', { name: t('editor.zoom.in') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('editor.zoom.out') })).toBeEnabled()
  })

  it('sperrt am unteren Ende den anderen', () => {
    setup(ZOOM_MIN)
    expect(screen.getByRole('button', { name: t('editor.zoom.out') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('editor.zoom.in') })).toBeEnabled()
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
