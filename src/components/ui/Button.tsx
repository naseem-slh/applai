import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Knopf — das einzige Primitiv, das eine Aktion auslöst, und damit die
// Vorlage für alles Weitere: `variant` bestimmt den Ton, `size` die Größe.
// Der Fokusring kommt aus der gemeinsamen Utility (siehe design.css), der
// Druckpunkt aus einer Verschiebung um 1 px statt aus einer Animation.
const buttonVariants = cva(
  [
    'focus-ring inline-flex shrink-0 items-center justify-center gap-2',
    'rounded-md font-medium whitespace-nowrap select-none',
    'transition-colors active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        // Hauptaktion — gefüllter Akzent, höchstens einer pro Ansicht.
        primary:
          'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--btn-primary-bg-hover)]',
        // Gleichrangige Nebenaktion — sichtbare Kontur auf heller Fläche.
        secondary:
          'border border-[var(--color-control-border)] bg-[var(--color-surface-raised)] text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
        // Beiläufige Aktion in dichten Bereichen — erst unter dem Zeiger
        // bekommt sie eine Fläche.
        ghost:
          'text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)]',
        // Löschen und Verwerfen. Die Warnfarbe trägt die Bedeutung nie
        // allein — der Text des Knopfes benennt die Folge.
        danger:
          'bg-[var(--color-error)] text-[var(--btn-danger-fg)] hover:bg-[var(--btn-danger-bg-hover)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        // Nur ein Sinnbild, kein Text. Braucht zwingend ein aria-label vom
        // Aufrufer, damit der Knopf einen Namen hat (G8: übersetzt).
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Reicht Klassen und Verhalten an das Kind weiter, statt ein <button> zu
   *  erzeugen — für Links, die wie ein Knopf aussehen sollen. */
  asChild?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      // Ohne ausdrückliche Angabe schickt ein <button> in einem Formular
      // dieses ab. Bei asChild bleibt das Attribut weg, weil das Kind kein
      // <button> sein muss.
      {...(asChild ? {} : { type: type ?? 'button' })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
