import { describe, expect, it } from 'vitest'
import i18n from './i18n'

describe('i18n', () => {
  it('löst einen bekannten Schlüssel auf Deutsch auf', () => {
    expect(i18n.getFixedT('de')('app.name')).toBe('Applai')
    expect(i18n.getFixedT('de')('routes.editor.heading')).toBe('Arbeitsfläche')
  })

  it('löst denselben Schlüssel auf Englisch anders auf', () => {
    expect(i18n.getFixedT('en')('routes.editor.heading')).toBe('Workspace')
    expect(i18n.getFixedT('en')('nav.settings')).toBe('Settings')
  })
})
