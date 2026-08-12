import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import type { ProviderId } from '@/lib/storage/keyVault'
import { cn } from '@/lib/utils'
import { PROVIDER_LINKS } from './providerLinks'

/**
 * Was einen kostenpflichtigen Schlüssel schützt — je Punkt ein aufklappbarer
 * Eintrag mit Begründung und Verweis auf die Dokumentation des Anbieters.
 *
 * ## Der entfernte dritte Punkt: Herkunftsbeschränkung
 *
 * Die Aufgabenstellung nannte als dritten Punkt eine
 * Herkunfts-/Referrer-Beschränkung für Google-Schlüssel und verlangte
 * ausdrücklich, beim Bauen zu prüfen, ob sie für den Gemini-Dienst greift.
 * **Sie ist entfernt.** Drei Gründe, jeder für sich ausreichend:
 *
 * 1. Google dokumentiert für den Gemini-Dienst keine wirksame
 *    Website-/Referrer-Beschränkung. `ai.google.dev/gemini-api/docs/api-key`
 *    nennt allgemein „IP addresses, websites, or applications", weist aber
 *    in der Anleitung nur IP-Beschränkungen aus und rät für Client-Apps zu
 *    einem eigenen Server als Vermittler — den Applai per G1 nicht hat.
 * 2. Aus dem Entwicklerforum von Google (Beitrag „Generative Language API
 *    Key cannot be restricted", 09.08.2024) geht hervor, dass eine gesetzte
 *    Referrer-Beschränkung auf einem Schlüssel der Generative Language API
 *    nicht wie erwartet gewirkt hat. Eine offizielle Zusage dazu gibt es
 *    nicht.
 * 3. Selbst wo sie greift, prüft sie einen Kopfzeilenwert, den der Browser
 *    schickt. Wer den Schlüssel entwendet hat, benutzt keinen Browser und
 *    setzt `Referer` beliebig. Sie hält also niemanden auf, der den
 *    Schlüssel schon hat.
 *
 * Ein Hinweis, der ein Sicherheitsgefühl erzeugt, das die Technik nicht
 * einlöst, ist schlechter als kein Hinweis. An seine Stelle tritt für Google
 * die Beschränkung auf die Gemini-API — die ist dokumentiert, wird
 * durchgesetzt und begrenzt tatsächlich, was ein abhandengekommener
 * Schlüssel anrichten kann. **Wer die Herkunftsbeschränkung wieder
 * aufnehmen will, braucht dafür einen Beleg von Google, nicht eine
 * Erinnerung.**
 */

interface Hint {
  readonly id: string
  readonly titleKey: string
  readonly bodyKey: string
  readonly href: string
}

function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-4 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

function buildHints(provider: ProviderId): Hint[] {
  const links = PROVIDER_LINKS[provider]
  const hints: Hint[] = [
    {
      id: 'limit',
      titleKey: 'onboarding.paidHints.limit.title',
      // Der Text unterscheidet sich je Anbieter, weil sich die Sache
      // unterscheidet: OpenAI und Anthropic können Anfragen wirklich
      // abweisen, ein Google-Budget verschickt nur E-Mails.
      bodyKey: `onboarding.paidHints.limit.${provider}`,
      href: links.spendLimit,
    },
    {
      id: 'dedicated',
      titleKey: 'onboarding.paidHints.dedicated.title',
      bodyKey: 'onboarding.paidHints.dedicated.body',
      href: links.keys,
    },
  ]
  if (links.keyScope !== undefined) {
    hints.push({
      id: 'scope',
      titleKey: 'onboarding.paidHints.scope.title',
      bodyKey: 'onboarding.paidHints.scope.body',
      href: links.keyScope,
    })
  }
  return hints
}

export interface PaidKeyHintsProps {
  provider: ProviderId
  className?: string
}

export function PaidKeyHints({ provider, className }: PaidKeyHintsProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const hints = buildHints(provider)

  return (
    // `subtle` liegt auf --color-surface-alt. Dort verfehlt --color-muted
    // die 4,5:1 (siehe DESIGN.md) — jeder Text hier trägt deshalb
    // --color-ink, auch der erläuternde.
    <Card
      asChild
      variant="subtle"
      padding="md"
      className={cn('text-[var(--color-ink)]', className)}
    >
      <section aria-labelledby={headingId}>
        <h3 id={headingId} className="font-semibold text-[var(--color-ink-strong)]">
          {t('onboarding.paidHints.heading')}
        </h3>
        <p className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
          {t('onboarding.paidHints.intro')}
        </p>

        {/* role="list" hält die Listenbedeutung fest, die Tailwinds
            Grundstile mit `list-style: none` sonst in Safari kosten. */}
        <ul role="list" className="mt-4 divide-y divide-[var(--color-border)]">
          {hints.map((hint) => (
            <li key={hint.id}>
              <details className="group py-3">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm font-medium [&::-webkit-details-marker]:hidden">
                  {t(hint.titleKey)}
                  <ChevronGlyph className="transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)]">
                  {t(hint.bodyKey)}
                </p>
                <a
                  href={hint.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring mt-2 inline-block rounded-sm text-[length:var(--text-body-sm-size)] text-[var(--color-accent)] underline underline-offset-2 hover:decoration-2"
                >
                  {t('onboarding.paidHints.docsLink', { topic: t(hint.titleKey) })}
                </a>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  )
}
