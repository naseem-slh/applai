import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordRequest, resetUsage, subscribeUsage, usageSnapshot } from './usage'

beforeEach(() => {
  resetUsage()
})

describe('usage', () => {
  it('beginnt bei null', () => {
    expect(usageSnapshot().requests).toBe(0)
  })

  it('zählt jede Anfrage', () => {
    recordRequest()
    recordRequest()
    expect(usageSnapshot().requests).toBe(2)
  })

  it('liefert bei unveränderter Zahl dieselbe Momentaufnahme', () => {
    // Sonst hielte `useSyncExternalStore` jeden Aufruf für eine Änderung und
    // renderte endlos neu.
    expect(usageSnapshot()).toBe(usageSnapshot())
  })

  it('liefert nach einer Anfrage eine neue Momentaufnahme', () => {
    const before = usageSnapshot()
    recordRequest()
    expect(usageSnapshot()).not.toBe(before)
  })

  it('meldet jeden Zuhörer, bis er sich abmeldet', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeUsage(listener)

    recordRequest()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    recordRequest()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('setzt zurück und meldet auch das', () => {
    const listener = vi.fn()
    subscribeUsage(listener)
    recordRequest()

    resetUsage()

    expect(usageSnapshot().requests).toBe(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
