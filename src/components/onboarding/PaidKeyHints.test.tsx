import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import de from '@/lib/i18n/locales/de.json'
import en from '@/lib/i18n/locales/en.json'
import i18n from '@/lib/i18n/i18n'
import { PROVIDER_IDS } from '@/lib/storage/keyVault'
import { PaidKeyHints } from './PaidKeyHints'
import { PROVIDER_LINKS } from './providerLinks'

const t = i18n.getFixedT(i18n.resolvedLanguage ?? 'de')

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object' || value === null) return []
  return Object.values(value).flatMap(collectStrings)
}

describe('PaidKeyHints', () => {
  it('zeigt bei Google drei Punkte, sonst zwei', () => {
    const { unmount } = render(<PaidKeyHints provider="gemini" />)
    expect(screen.getAllByRole('group')).toHaveLength(3)
    unmount()

    for (const provider of ['openai', 'anthropic'] as const) {
      const view = render(<PaidKeyHints provider={provider} />)
      expect(screen.getAllByRole('group')).toHaveLength(2)
      expect(screen.queryByText(t('onboarding.paidHints.scope.title'))).not.toBeInTheDocument()
      view.unmount()
    }
  })

  /**
   * Der ursprünglich vorgesehene dritte Punkt („Herkunftsbeschränkung bei
   * Google") ist beim Bauen geprüft und entfernt worden: Google
   * dokumentiert für den Gemini-Dienst keine wirksame Referrer-Beschränkung,
   * aus dem Entwicklerforum ist das Gegenteil berichtet, und ein `Referer`
   * lässt sich außerhalb eines Browsers ohnehin frei setzen. Siehe den
   * Kopfkommentar von `PaidKeyHints.tsx`. Dieser Test hält die Entfernung
   * fest, damit sie nicht aus Gewohnheit zurückkehrt.
   */
  it('verspricht nirgends eine Herkunfts- oder Referrer-Beschränkung', () => {
    for (const bundle of [de, en]) {
      const strings = collectStrings(bundle.onboarding.paidHints)
      expect(strings.length).toBeGreaterThan(5)
      for (const text of strings) {
        expect(text).not.toMatch(/herkunft|referrer|referer/i)
      }
    }
  })

  it('sagt beim Google-Ausgabenlimit, dass ein Budget nur warnt', () => {
    expect(i18n.getFixedT('de')('onboarding.paidHints.limit.gemini')).toMatch(
      /warnt nur|stoppt weder/i,
    )
    expect(i18n.getFixedT('en')('onboarding.paidHints.limit.gemini')).toMatch(
      /only warns|stops neither/i,
    )
  })

  it('führt je Anbieter einen eigenen Text zum Ausgabenlimit', () => {
    const texts = PROVIDER_IDS.map((id) => i18n.getFixedT('de')(`onboarding.paidHints.limit.${id}`))
    expect(new Set(texts).size).toBe(PROVIDER_IDS.length)
  })

  it('klappt einen Punkt auf und zeigt darin Begründung und Verweis', async () => {
    const user = userEvent.setup()
    const { container } = render(<PaidKeyHints provider="anthropic" />)

    const details = container.querySelectorAll('details')
    expect(details[0].open).toBe(false)

    await user.click(screen.getByText(t('onboarding.paidHints.limit.title')))
    expect(details[0].open).toBe(true)

    const group = screen.getAllByRole('group')[0]
    expect(within(group).getByText(t('onboarding.paidHints.limit.anthropic'))).toBeInTheDocument()
  })

  it('verweist nach außen — neues Fenster, ohne Zugriff auf das alte', () => {
    render(<PaidKeyHints provider="gemini" />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link.getAttribute('href')).toMatch(/^https:\/\//)
    }
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      PROVIDER_LINKS.gemini.spendLimit,
      PROVIDER_LINKS.gemini.keys,
      PROVIDER_LINKS.gemini.keyScope,
    ])
  })

  it('gibt jedem Verweis einen eigenen Namen, statt dreimal „Anleitung" zu sagen', () => {
    render(<PaidKeyHints provider="gemini" />)

    const names = screen.getAllByRole('link').map((link) => link.textContent)
    expect(new Set(names).size).toBe(names.length)
  })
})
