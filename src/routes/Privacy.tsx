import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Figure, RoomFigures } from '@/components/app/Figures'
import { PageHeader } from '@/components/app/PageHeader'
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
 *
 * **Zwei Figuren stehen im Raum und sagen zu je einer Hälfte dasselbe noch
 * einmal, ohne ein Wort mehr:** Links steht sie unter dem Schirm — es regnet
 * auf den Schirm und nicht auf sie, das ist „bleibt auf Ihrem Gerät". Rechts
 * trägt sie eine Sonnenbrille: Sie geht hinaus, aber sie wird nicht erkannt,
 * das ist „geht anonymisiert an den Anbieter".
 *
 * Sie liegen im Blatt, nicht in den Karten (siehe `Figures`), stehen
 * ausdrücklich **nicht** auf einer Linie und fallen unter 1140px weg — dort
 * bleibt neben der 780px breiten Spalte kein Platz mehr für sie.
 */

const SOURCE_URL = 'https://github.com/'

export default function Privacy() {
  const { t } = useTranslation()

  return (
    <>
      <RoomFigures>
        {/* 390px ist die halbe Spaltenbreite; unter 1140px bleibt daneben
            kein Platz mehr. Eine steht hoch und weiter weg, die andere tief
            und dichter dran, jede anders gekippt — auf einer Linie läsen sie
            sich als Ornament. Beide sind auf 66px Kopfbreite gerechnet, damit
            es dieselbe Person ist und nicht zwei verschieden große. */}
        <Figure
          pose="schirm"
          className="hidden top-[19vh] right-[calc(50%+416px)] w-[129px] rotate-[-4deg] min-[1140px]:block"
        />
        <Figure
          pose="inkognito"
          className="hidden bottom-[8vh] left-[calc(50%+398px)] w-[87px] rotate-[5deg] min-[1140px]:block"
        />
      </RoomFigures>

      <div className="flex w-full flex-col items-center gap-6 px-4 pt-6 pb-8">
        <PageHeader
          backTo="/"
          backLabel={t('nav.back')}
          className="max-w-[780px]"
        />

        <main className="flex w-full max-w-[780px] flex-col gap-6">
          <h1 className="font-display text-[length:var(--text-display-size)] leading-[var(--text-display-leading)] font-semibold tracking-[var(--text-display-tracking)] text-[var(--ink-strong)]">
            {t('privacy.heading')}
          </h1>

          {/* Der eine Satz, um den es geht. Als Karte, damit er auch dann
              gelesen wird, wenn der Rest überflogen wird. */}
          <Card variant="raised" padding="lg" className="max-w-[65ch]">
            <p className="font-display text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--ink-strong)]">
              {t('privacy.lead')}
            </p>
          </Card>

          {/* Alle Abschnitte in **einer** Karte, nicht frei auf dem Blatt:
              Die Zeilen des Papiers laufen sonst durch den Fließtext, und
              ein Rechtstext von mehreren hundert Wörtern ist genau die
              Sorte Text, die eine ruhige Fläche braucht. Die Gliederung in
              Abschnitte bleibt, wie sie war. */}
          <Card variant="default" padding="lg" className="flex flex-col gap-6">
            <Section title={t('privacy.noServer.heading')}>
              <p>{t('privacy.noServer.body')}</p>
            </Section>

            <Section title={t('privacy.provider.heading')}>
              <p>{t('privacy.provider.body')}</p>
              <p>{t('privacy.provider.anonymize')}</p>
              <p>{t('privacy.provider.training')}</p>
              <p className="font-display font-semibold text-[var(--ink-strong)]">
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
          </Card>

          {/* Pflichtangabe, kein Abschnitt zum Lesen. Deshalb klein, am
              Ende und außerhalb der Karte. */}
          <Card variant="default" padding="lg">
            <Section title={t('privacy.imprint.heading')}>
              <p className={FIELD_HINT_CLASS}>{t('privacy.imprint.body')}</p>
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
          </Card>
        </main>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex max-w-[65ch] flex-col gap-3">
      <h2
        id={headingId}
        className="font-display text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)] font-semibold text-[var(--ink-strong)]"
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
        'focus-ring rounded-control underline underline-offset-2',
        'text-[var(--accent-text)] hover:no-underline',
      )}
    >
      {children}
    </a>
  )
}
