import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Karte — was auf dem Blatt liegt, liegt wie ein Aufkleber darauf: 3 px
// Tinte ringsum, eine harte Kante darunter, der weiche Schatten dahinter.
//
// **Die Ablösung trägt die Kontur, nicht der Helligkeitsunterschied.** Karte
// gegen Blatt steht bei 1,08:1 im Hellen und 1,33:1 im Dunklen — bei diesen
// Werten trägt allein der Farbton (warm gegen neutralweiß). Wer die Kontur
// wegnimmt und stattdessen die Flächen auseinanderzieht, hat den Entwurf
// verlassen; genau daran ist ein früherer heller Entwurf gescheitert.
const cardVariants = cva('rounded-card border-[3px]', {
  variants: {
    variant: {
      // Ruhender Standard — jede Karte auf dem Blatt.
      default: 'pop border-[var(--line)] bg-[var(--card)] [--pop-shadow:var(--card-shadow)]',
      // Die eine Karte, die die Seite trägt (Einstiegsseite, Datenschutz).
      // Zwei Pixel mehr Kante, sonst identisch: Sie liegt nicht auf einer
      // anderen Ebene, sie ist nur die größte auf ihrer.
      raised:
        'pop border-[var(--line)] bg-[var(--card)] [--pop-height:10px] [--pop-shadow:var(--card-shadow)]',
      // Zurückgenommen — Hinweise und Nebeninformation **in** einer Karte.
      // Die eingelassene Fläche der Eingabefelder, weiche Tinte, kleinerer
      // Radius und **keine** Kante: Was eingelassen ist, hebt sich nicht ab.
      subtle: 'rounded-tile border-[var(--line-soft)] bg-[var(--field)]',
      // Löschen. Die Kontur wechselt die Farbe, die Bauform nicht — und die
      // Farbe trägt die Bedeutung nie allein, die Überschrift der Karte tut
      // es.
      danger: 'pop border-[var(--error)] bg-[var(--card)] [--pop-shadow:var(--card-shadow)]',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-4 sm:p-6',
    },
  },
  defaultVariants: { variant: 'default', padding: 'md' },
})

export interface CardProps
  extends ComponentProps<'div'>,
    VariantProps<typeof cardVariants> {
  /** Reicht Klassen an das Kind weiter, damit eine Karte auch ein
   *  <section> oder <article> sein kann statt eines weiteren <div>. */
  asChild?: boolean
}

export function Card({
  className,
  variant,
  padding,
  asChild = false,
  ...props
}: CardProps) {
  const Component = asChild ? Slot.Root : 'div'
  return (
    <Component
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
}
