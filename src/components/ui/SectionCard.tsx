import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, type CardProps } from './Card'

/**
 * Ein benannter Abschnitt in einer Karte — Überschrift oben, Inhalt
 * darunter, `<section aria-labelledby>` außen herum.
 *
 * Bis Aufgabe 13b stand das als lokales `SetupCard` in `KeySetup.tsx`.
 * 13a hatte `Card` bewusst ohne Unterteile gelassen, mit der Regel: „Falls
 * dieselbe Kopfstruktur dreimal geschrieben wird, ist das der Moment, sie
 * nachzuziehen." Die Einstellungen allein bestehen aus sechs solchen
 * Abschnitten, die Einstiegsseite aus vier.
 *
 * Die Vorgaben sind die von `SetupCard`, damit die Schlüsseleinrichtung
 * unverändert aussieht: hervorgehobene Karte, großer Innenabstand, `h2`.
 * Die Einstellungen setzen `variant="default"` — dort steht kein Abschnitt
 * über dem anderen, und sechs hervorgehobene Karten untereinander wären
 * sechsmal „das hier ist wichtig".
 */
export interface SectionCardProps extends Omit<CardProps, 'title' | 'asChild' | 'children'> {
  /** Kennung der Überschrift; das `<section>` verweist darauf. */
  headingId: string
  heading: ReactNode
  /** Ebene der Überschrift. `h2` unter der `h1` der Seite; `h3` in einem
   *  Abschnitt, der selbst schon eine `h2` trägt. */
  headingLevel?: 2 | 3
  children: ReactNode
}

export function SectionCard({
  headingId,
  heading,
  headingLevel = 2,
  variant = 'raised',
  padding = 'lg',
  className,
  children,
  ...props
}: SectionCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <Card asChild variant={variant} padding={padding} className={className} {...props}>
      <section aria-labelledby={headingId}>
        <Heading
          id={headingId}
          className={cn(
            // Überschriften werden erkannt, nicht gelesen — deshalb Fredoka
            // (siehe DESIGN.md, Abschnitt Schrift).
            'font-display font-semibold text-[var(--ink-strong)]',
            headingLevel === 2
              ? 'text-[length:var(--text-heading-size)] leading-[var(--text-heading-leading)]'
              : 'text-[length:var(--text-subheading-size)] leading-[var(--text-subheading-leading)]',
          )}
        >
          {heading}
        </Heading>
        {children}
      </section>
    </Card>
  )
}
