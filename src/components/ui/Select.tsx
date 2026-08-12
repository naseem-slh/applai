import type { ComponentProps } from 'react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Auswahlliste — für überschaubare Mengen mit klarer Vorauswahl (Anbieter,
// Modell, Sprache). Radix baut daraus eine echte Combobox mit Tastatur-
// bedienung; hier kommt das Aussehen dazu.

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value
export const SelectGroup = SelectPrimitive.Group

function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-[var(--color-muted)]"
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

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 text-[var(--color-accent)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'focus-ring flex h-10 w-full items-center justify-between gap-2',
        'rounded-md border border-[var(--color-control-border)]',
        'bg-[var(--color-surface-raised)] px-3 text-left text-sm',
        'text-[var(--color-ink)] transition-colors',
        // Die Fläche bleibt unter dem Zeiger unverändert: ein Platzhalter
        // in --color-muted würde auf --color-surface-hover unter 4,5:1
        // rutschen. Stattdessen antwortet die Kontur.
        'hover:border-[var(--color-accent)]',
        'data-[placeholder]:text-[var(--color-muted)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronGlyph />
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
          'z-50 overflow-hidden rounded-lg border border-[var(--color-border)]',
          'bg-[var(--color-surface-raised)] shadow-[var(--shadow-overlay)]',
          // Radix stellt beide Maße als CSS-Variablen bereit: die Liste ist
          // so breit wie ihr Auslöser und nie höher als der Platz darunter.
          'max-h-(--radix-select-content-available-height)',
          'min-w-(--radix-select-trigger-width)',
          'data-[state=open]:animate-content-in data-[state=closed]:animate-content-out',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
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
        'relative flex cursor-default items-center rounded-sm py-2 pr-3 pl-8',
        'text-sm text-[var(--color-ink)] select-none',
        // Der Fokusring liegt hier innen: die Liste beschneidet ihren
        // Inhalt, ein außen liegender Ring würde abgeschnitten.
        'outline-none focus-ring-inset',
        'data-[highlighted]:bg-[var(--color-accent-soft)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      {/* Der Haken trägt die Auswahl, nicht die Tönung dahinter — Zustand
          nie allein über Farbe. */}
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckGlyph />
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
        'px-2 py-1.5 text-[length:var(--text-label-size)] font-semibold',
        'tracking-[var(--text-label-tracking)] text-[var(--color-muted)] uppercase',
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
      className={cn('my-1 h-px bg-[var(--color-border)]', className)}
      {...props}
    />
  )
}
