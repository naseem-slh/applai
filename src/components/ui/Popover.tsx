import type { ComponentProps } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Popover — nicht-modale Überlagerung am Auslöser. Bewusst ohne Pfeil: die
// Verankerung genügt, und ein Pfeil bekäme die 1-px-Kontur der Fläche nicht
// sauber mit.

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-lg border border-[var(--color-border)]',
          'bg-[var(--color-surface-raised)] p-4 shadow-[var(--shadow-overlay)]',
          'text-[var(--color-ink)]',
          // Wie beim Dialog: der Fokus wandert in den Inhalt, ein Ring um
          // die ganze Fläche wäre irreführend.
          'focus:outline-none',
          'data-[state=open]:animate-content-in data-[state=closed]:animate-content-out',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
