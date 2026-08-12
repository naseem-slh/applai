import type { ComponentProps } from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Schalter — sofort wirksames Ja/Nein (Anonymisierung, Wahrheitsmodus,
// dunkle Darstellung). Kein Formularfeld mit Speichern-Knopf.
//
// Der Zustand hängt nie allein an der Farbe: der Knauf steht links oder
// rechts, und Radix meldet role="switch" mit aria-checked. Aus 24 px Höhe,
// 44 px Breite, 1 px Kontur und 2 px Innenabstand bleiben 18 px für den
// Knauf und 20 px Weg — deshalb translate-x-5.
export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'focus-ring inline-flex h-6 w-11 shrink-0 items-center rounded-full',
        'border p-0.5 transition-colors',
        'data-[state=unchecked]:border-[var(--color-control-border)]',
        'data-[state=unchecked]:bg-[var(--color-surface-alt)]',
        'data-[state=checked]:border-[var(--color-accent)]',
        'data-[state=checked]:bg-[var(--color-accent)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4.5 rounded-full transition-transform',
          'data-[state=unchecked]:translate-x-0',
          'data-[state=unchecked]:bg-[var(--color-muted)]',
          'data-[state=checked]:translate-x-5',
          'data-[state=checked]:bg-[var(--color-accent-contrast)]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}
