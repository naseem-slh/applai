import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Karte — abgegrenzter Bereich auf der Papierfläche. Die Höhenstaffelung
// kennt genau zwei Stufen: `raised` hebt eine Karte hervor, `overlay`
// (Dialog, Popover) liegt darüber. Alles andere bleibt flach.
const cardVariants = cva('rounded-lg border border-[var(--color-border)]', {
  variants: {
    variant: {
      // Ruhender Standard — helle Fläche, nur durch die Kontur abgegrenzt.
      default: 'bg-[var(--color-surface-raised)]',
      // Hervorgehoben — mit Schatten, für die eine Karte, die zählt.
      raised: 'bg-[var(--color-surface-raised)] shadow-[var(--shadow-raised)]',
      // Zurückgenommen — für Hinweise und Nebeninformation, die weniger
      // wiegen soll als der Text daneben.
      subtle: 'bg-[var(--color-surface-alt)]',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
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
