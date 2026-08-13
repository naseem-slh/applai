import { describe, expect, it } from 'vitest'
import {
  abbrechen,
  anzeigeGelesen,
  fehler,
  naechsteHandlung,
  nochmal,
  starten,
  ueberspringen,
  uebernommen,
  variantenDa,
  waehlen,
  type ReapplyMode,
  type ReapplyState,
} from './reapply'
import type { Variant } from './rewrite'

const STEPS = [{ markId: 'a' }, { markId: 'b' }]

function variante(text: string, unbacked: string[] = []): Variant {
  return { text, unbackedClaims: unbacked }
}

const DREI = [variante('eins'), variante('zwei'), variante('drei')]

/** Bringt die Maschine bis zur ersten angeforderten Stelle. */
function bisErsteStelle(mode: ReapplyMode): ReapplyState {
  return anzeigeGelesen(starten(STEPS, mode))
}

describe('reapply — der Weg durch den Durchlauf', () => {
  it('beginnt damit, die Anzeige lesen zu lassen', () => {
    const state = starten(STEPS, 'schnell')
    expect(state.status).toBe('anzeigeWirdGelesen')
    expect(naechsteHandlung(state)).toEqual({ kind: 'anzeigeLesen' })
  })

  it('fordert nach der Anzeige die erste Stelle an', () => {
    expect(naechsteHandlung(bisErsteStelle('schnell'))).toEqual({
      kind: 'anfordern',
      markId: 'a',
    })
  })

  it('ist ohne vorgemerkte Stellen sofort fertig', () => {
    const state = anzeigeGelesen(starten([], 'schnell'))
    expect(state.status).toBe('fertig')
    expect(naechsteHandlung(state)).toEqual({ kind: 'beendet' })
  })
})

describe('reapply — die beiden Betriebsarten', () => {
  it('übernimmt im Schnellmodus die erste Variante ungefragt', () => {
    const state = variantenDa(bisErsteStelle('schnell'), DREI)
    expect(state.status).toBe('uebernimmt')
    expect(naechsteHandlung(state)).toEqual({
      kind: 'uebernehmen',
      markId: 'a',
      variant: DREI[0],
    })
  })

  it('hält im Wählen-Modus mit allen drei Varianten an', () => {
    const state = variantenDa(bisErsteStelle('waehlen'), DREI)
    expect(state).toMatchObject({ status: 'haelt', reason: 'wahl', variants: DREI })
    expect(naechsteHandlung(state)).toEqual({ kind: 'warten' })
  })

  it('hält auch im Schnellmodus an, sobald eine Variante unbelegte Aussagen trägt (G10)', () => {
    const mitErfundenem = [variante('eins', ['Zehn Jahre Erfahrung']), ...DREI.slice(1)]
    const state = variantenDa(bisErsteStelle('schnell'), mitErfundenem)
    expect(state).toMatchObject({ status: 'haelt', reason: 'unbelegteAussagen' })
  })

  it('verwirft eine leere Antwort als nicht verwertbar', () => {
    const state = variantenDa(bisErsteStelle('schnell'), [])
    expect(state).toMatchObject({ status: 'haelt', reason: 'antwortVerworfen' })
  })

  it('rückt nach der Übernahme auf die nächste Stelle', () => {
    const state = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    expect(state).toMatchObject({ status: 'laeuft', applied: 1 })
    expect(naechsteHandlung(state)).toEqual({ kind: 'anfordern', markId: 'b' })
  })

  it('ist nach der letzten Stelle fertig und zählt die Übernahmen', () => {
    let state = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    state = uebernommen(variantenDa(state, DREI))
    expect(state).toMatchObject({ status: 'fertig', applied: 2 })
  })

  it('nimmt im Wählen-Modus die gewählte Variante, nicht die erste', () => {
    const state = waehlen(variantenDa(bisErsteStelle('waehlen'), DREI), DREI[2])
    expect(naechsteHandlung(state)).toEqual({
      kind: 'uebernehmen',
      markId: 'a',
      variant: DREI[2],
    })
  })
})

describe('reapply — Halt, Überspringen, Abbruch', () => {
  it('hält bei einem Anbieterfehler an', () => {
    const state = fehler(bisErsteStelle('schnell'), 'anbieterfehler')
    expect(state).toMatchObject({ status: 'haelt', reason: 'anbieterfehler' })
    expect(naechsteHandlung(state)).toEqual({ kind: 'warten' })
  })

  it('versucht dieselbe Stelle nach einem Fehler erneut', () => {
    const state = nochmal(fehler(bisErsteStelle('schnell'), 'antwortVerworfen'))
    expect(naechsteHandlung(state)).toEqual({ kind: 'anfordern', markId: 'a' })
  })

  it('merkt sich übersprungene Stellen samt Grund', () => {
    const state = ueberspringen(fehler(bisErsteStelle('schnell'), 'anbieterfehler'))
    expect(state).toMatchObject({
      status: 'laeuft',
      index: 1,
      skipped: [{ markId: 'a', reason: 'anbieterfehler' }],
    })
  })

  it('überspringt die letzte Stelle und ist dann fertig', () => {
    let state = ueberspringen(fehler(bisErsteStelle('schnell'), 'anbieterfehler'))
    state = ueberspringen(fehler(state, 'anbieterfehler'))
    expect(state).toMatchObject({ status: 'fertig', applied: 0 })
    expect(state.status === 'fertig' && state.skipped).toHaveLength(2)
  })

  it('behält beim Abbruch, was schon übernommen wurde', () => {
    const nachErster = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    const state = abbrechen(nachErster)
    expect(state).toMatchObject({
      status: 'abgebrochen',
      applied: 1,
      skipped: [{ markId: 'b', reason: 'abgebrochen' }],
    })
    expect(naechsteHandlung(state)).toEqual({ kind: 'beendet' })
  })

  it('lässt einen bereits beendeten Durchlauf durch einen Abbruch unberührt', () => {
    let state = uebernommen(variantenDa(bisErsteStelle('schnell'), DREI))
    state = uebernommen(variantenDa(state, DREI))
    expect(abbrechen(state)).toBe(state)
  })
})
