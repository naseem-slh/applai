import { describe, expect, it } from 'vitest'
import {
  SHEET_MAX_PX,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  sheetSize,
  steppedZoom,
} from './zoom'

describe('clampZoom', () => {
  it('nimmt einen gültigen Maßstab unverändert', () => {
    expect(clampZoom(60)).toBe(60)
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN)
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX)
  })

  it('zieht einen fehlenden Wert auf die Voreinstellung', () => {
    // Der Fall jedes Datensatzes, der vor dieser Aufgabe gespeichert wurde.
    expect(clampZoom(undefined)).toBe(ZOOM_DEFAULT)
    expect(clampZoom(null)).toBe(ZOOM_DEFAULT)
  })

  it('zieht Unsinn auf die Voreinstellung statt die Fläche unbrauchbar zu machen', () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(ZOOM_DEFAULT)
  })

  it('hält Werte außerhalb der Spanne an ihren Enden', () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN)
    expect(clampZoom(-40)).toBe(ZOOM_MIN)
    expect(clampZoom(1000)).toBe(ZOOM_MAX)
  })

  it('rundet auf ganze Prozent', () => {
    expect(clampZoom(62.4)).toBe(62)
    expect(clampZoom(62.6)).toBe(63)
  })
})

describe('steppedZoom', () => {
  it('geht einen Schritt hinauf und hinunter', () => {
    expect(steppedZoom(60, 1)).toBe(65)
    expect(steppedZoom(60, -1)).toBe(55)
  })

  it('rastet auf der Schrittweite ein, auch von einem krummen Wert aus', () => {
    // Ein Wert wie 63 kann aus einer älteren Sicherung stammen. Von dort
    // aus soll ein Knopfdruck auf einer runden Zahl landen.
    expect(steppedZoom(63, 1)).toBe(65)
    expect(steppedZoom(63, -1)).toBe(60)
  })

  it('läuft an den Enden nicht darüber hinaus', () => {
    expect(steppedZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(steppedZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
  })
})

describe('sheetSize', () => {
  it('gibt bei 100 % die volle Spalte und die volle Höchstbreite', () => {
    expect(sheetSize(100)).toEqual({ width: '100%', maxWidth: `${SHEET_MAX_PX}px` })
  })

  it('trägt denselben Faktor in beiden Maßen', () => {
    // Der Kern der Sache: Am breiten Fenster deckelt `maxWidth`, am
    // schmalen greift `width`. Liefen die beiden auseinander, hinge der
    // Maßstab an der Fensterbreite.
    expect(sheetSize(50)).toEqual({ width: '50%', maxWidth: '450px' })
    expect(sheetSize(25)).toEqual({ width: '25%', maxWidth: '225px' })
  })

  it('bändigt einen unmöglichen Wert, statt ein Blatt der Breite null zu bauen', () => {
    expect(sheetSize(0)).toEqual(sheetSize(ZOOM_MIN))
    expect(sheetSize(Number.NaN)).toEqual(sheetSize(ZOOM_DEFAULT))
  })
})
