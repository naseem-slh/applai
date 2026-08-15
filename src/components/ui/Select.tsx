import type { ComponentProps } from 'react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'
import { CaretDownIcon, CheckIcon } from './icons'

// Auswahlliste — für überschaubare Mengen mit klarer Vorauswahl (Anbieter,
// Modell, Sprache). Radix baut daraus eine echte Combobox mit Tastatur-
// bedienung; hier kommt das Aussehen dazu.

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectGroup = SelectPrimitive.Group

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        // Wort für Wort die Gestalt des Eingabefeldes (siehe Input.tsx):
        // gleiche Polsterung, gleiche weiche Tinte, gleicher Radius. Feld
        // und Auswahl nebeneinander sollen als eine Bauform zu lesen sein.
        'focus-ring flex w-full items-center justify-between gap-2',
        'rounded-control border-[3px] border-[var(--line-soft)]',
        'bg-[var(--field)] px-4 py-3 text-left',
        'text-[length:var(--text-body-sm-size)] text-[var(--ink)] transition-colors',
        // Unter dem Zeiger antwortet die Kontur, nicht die Fläche.
        'not-disabled:hover:border-[var(--accent-line)]',
        'data-[placeholder]:text-[var(--muted)]',
        'disabled:cursor-not-allowed disabled:bg-[var(--card)] disabled:text-[var(--muted)]',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretDownIcon className="text-[var(--accent-line)]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={sideOffset}
        className={cn(
          'pop z-50 overflow-hidden rounded-card border-[3px] border-[var(--line)]',
          'bg-[var(--card)] [--pop-height:10px] [--pop-shadow:var(--card-shadow)]',
          // Radix stellt beide Maße als CSS-Variablen bereit: die Liste ist
          // so breit wie ihr Auslöser und nie höher als der Platz darunter.
          'max-h-(--radix-select-content-available-height)',
          'min-w-(--radix-select-trigger-width)',
          'data-[state=open]:animate-content-in data-[state=closed]:animate-content-out',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1.5">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-default items-center rounded-control py-2 pr-3 pl-9',
        'text-[length:var(--text-body-sm-size)] text-[var(--ink)] select-none',
        // Der Fokusring liegt hier innen: die Liste beschneidet ihren
        // Inhalt, ein außen liegender Ring würde abgeschnitten.
        'outline-none focus-ring-inset',
        'data-[highlighted]:bg-[var(--accent-wash)]',
        'data-[highlighted]:text-[var(--ink-strong)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      {/* Der Haken trägt die Auswahl, nicht die Tönung dahinter — Zustand
          nie allein über Farbe. */}
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="text-[var(--done-text)]" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

/** Überschrift einer Gruppe. Muss in einem <SelectGroup> stehen — Radix
 *  verknüpft sie darüber per aria-labelledby und wirft sonst. */
export function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn(
        'px-2 py-1.5 font-display text-[length:var(--text-label-size)] font-semibold',
        'tracking-[var(--text-label-tracking)] text-[var(--muted)] uppercase',
        className,
      )}
      {...props}
    />
  )
}

export function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn('my-1 h-0.5 bg-[var(--line-soft)]', className)}
      {...props}
    />
  )
}
