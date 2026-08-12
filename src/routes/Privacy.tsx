import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PROVIDER_LINKS } from '@/components/onboarding/providerLinks'
import { Card } from '@/components/ui/Card'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { PROVIDER_IDS } from '@/lib/storage/keyVault'
import { cn } from '@/lib/utils'

/**
 * Datenschutzerklärung und Impressum.
 *
 * **Der Kern steht zuerst und in einem Satz:** Diese Seite speichert nichts
 * auf einem Server. Alles Weitere erläutert ihn — was der Browser ablegt,
 * was an den gewählten Anbieter geht, was beim Ausliefern anfällt.
 *
 * **Kein Rechtsdeutsch.** Die Nutzer sind Bewerbende, keine Juristen, und
 * eine Erklärung, die niemand liest, erklärt nichts. Die Angaben sind
 * dieselben, die eine förmliche Fassung machen müsste.
 *
 * **Die drei Anbieterverweise stehen hier, weil die Verantwortung dort
 * liegt:** Was mit einem gesendeten Text geschieht, entscheidet der
 * Anbieter. Die Adressen kommen aus `providerLinks.ts` — dieselbe Stelle,
 * die schon die Einrichtung benutzt, damit ein toter Verweis an einer Stelle
 * auffällt und nicht an zweien gepflegt werden muss.
 *
 * **Das Impressum trägt Platzhalter.** Es ist ein privates Vorhaben, und der
 * Name des Betreibers gehört nicht in ein öffentliches Repository, solange
 * er ihn nicht selbst dort hineinschreibt (G4 gilt für Schlüssel, dieselbe
 * Zurückhaltung gilt für die eigene Anschrift). Vor der Veröffentlichung
 * sind sie zu ersetzen — der sichtbare Platzhalter sagt das.
 */

const SOURCE_URL = 'https://github.com/'

export default function Privacy() {
  const { t } = useTranslation()

  return (
    <div className="w-full px-5 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1 className="text-[length:var(--text-display-size)] leading-[var(--text-display-leading)] font-semibold tracking-[var(--text-display-tracking)] text-[var(--color-ink-strong)]">
          {t('privacy.heading')}
        </h1>

        {/* Der eine Satz, um den es geht. Als Karte, damit er auch dann
            gelesen wird, wenn der Rest überflogen wird. */}
        <Card variant="raised" padding="lg" className="max-w-[65ch]">
          <p className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-medium text-[var(--color-ink-strong)]">
            {t('privacy.lead')}
          </p>
        </Card>

        <Section title={t('privacy.noServer.heading')}>
          <p>{t('privacy.noServer.body')}</p>
        </Section>

        <Section title={t('privacy.provider.heading')}>
          <p>{t('privacy.provider.body')}</p>
          <p>{t('privacy.provider.anonymize')}</p>
          <p>{t('privacy.provider.training')}</p>
          <p className="font-medium text-[var(--color-ink-strong)]">
            {t('privacy.provider.linksHeading')}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {PROVIDER_IDS.map((id) => (
              <li key={id}>
                <ExternalLink href={PROVIDER_LINKS[id].privacy}>
                  {PROVIDER_LINKS[id].label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('privacy.storage.heading')}>
          <p>{t('privacy.storage.key')}</p>
          <p>{t('privacy.storage.drafts')}</p>
          <p>{t('privacy.storage.applications')}</p>
          <p>{t('privacy.storage.delete')}</p>
        </Section>

        <Section title={t('privacy.hosting.heading')}>
          <p>{t('privacy.hosting.body')}</p>
        </Section>

        <Section title={t('privacy.rights.heading')}>
          <p>{t('privacy.rights.body')}</p>
        </Section>

        <Section title={t('privacy.source.heading')}>
          <p>{t('privacy.source.body')}</p>
          <p>
            <ExternalLink href={SOURCE_URL}>{t('privacy.source.link')}</ExternalLink>
          </p>
        </Section>

        <Section title={t('privacy.imprint.heading')}>
          <p>{t('privacy.imprint.body')}</p>
          <dl className="flex flex-col gap-2">
            <div className="flex flex-col">
              <dt className={FIELD_HINT_CLASS}>{t('privacy.imprint.operator')}</dt>
              <dd>{t('privacy.imprint.placeholder')}</dd>
            </div>
            <div className="flex flex-col">
              <dt className={FIELD_HINT_CLASS}>{t('privacy.imprint.contact')}</dt>
              <dd>{t('privacy.imprint.placeholder')}</dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex max-w-[65ch] flex-col gap-3">
      <h2
        id={headingId}
        className="text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--color-ink-strong)]"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * Auswärtiger Verweis. `rel="noreferrer"` ist hier keine Formsache: Die
 * Herkunft dieser Seite soll nicht bei einem Anbieter in einem Zugriffslog
 * landen, nur weil jemand seine Bestimmungen gelesen hat.
 */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'focus-ring rounded-sm underline underline-offset-2',
        'text-[var(--color-accent)] hover:no-underline',
      )}
    >
      {children}
    </a>
  )
}
