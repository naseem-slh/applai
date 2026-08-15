import type { ComponentProps } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Popover — nicht-modale Überlagerung am Auslöser. Bewusst ohne Pfeil: die
// Verankerung genügt, und ein Pfeil bekäme weder die 3 px dicke Kontur der
// Fläche noch die harte Kante darunter sauber mit — er wäre die einzige
// Stelle der Oberfläche, an der die Tinte abreißt.

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
          // Dieselbe Bauform wie eine Karte, eine Ebene höher — siehe Dialog.
          'pop z-50 w-72 rounded-card border-[3px] border-[var(--line)]',
          'bg-[var(--card)] p-4 text-[var(--ink)]',
          '[--pop-height:10px] [--pop-shadow:var(--card-shadow)]',
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
