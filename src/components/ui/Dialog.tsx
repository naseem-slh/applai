import type { ComponentProps } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from './Button'

// Dialog — modale Überlagerung. Der Inhalt liegt im Portal, die Abdunklung
// scrollt bei zu hohem Inhalt mit. Radix übernimmt Fokusfalle, Escape,
// Klick daneben und aria-modal; hier kommt nur das Aussehen dazu.

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

// Ein einziges Sinnbild statt eines Sinnbild-Pakets — G2 verbietet
// Laufzeit-Ressourcen von fremden Hosts, und eine Bibliothek für drei
// Glyphen wäre gegen G9.
function CloseGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export interface DialogContentProps
  extends ComponentProps<typeof DialogPrimitive.Content> {
  /** Zugänglicher Name des Schließknopfes. Ohne Angabe die Übersetzung
   *  von `ui.dialog.close` (G8 — kein fest verdrahteter Text). */
  closeLabel?: string
}

export function DialogContent({
  className,
  children,
  closeLabel,
  ...props
}: DialogContentProps) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 overflow-y-auto bg-[var(--color-overlay)]',
          'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
        )}
      >
        {/* Eigener Kasten für die Zentrierung: mit min-h-full bleibt auch
            ein Dialog erreichbar, der höher ist als das Fenster. */}
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPrimitive.Content
            className={cn(
              'relative w-full max-w-lg rounded-lg border border-[var(--color-border)]',
              'bg-[var(--color-surface-raised)] p-6 shadow-[var(--shadow-overlay)]',
              // Radix setzt den Fokus beim Öffnen auf diesen Kasten. Ein
              // Ring um den ganzen Dialog wäre irreführend — den Fokus
              // zeigen die bedienbaren Elemente darin.
              'focus:outline-none',
              'data-[state=open]:animate-content-in data-[state=closed]:animate-content-out',
              className,
            )}
            {...props}
          >
            {children}
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3"
                aria-label={closeLabel ?? t('ui.dialog.close')}
              >
                <CloseGlyph />
              </Button>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  )
}

/** Überschrift des Dialogs. Radix verknüpft sie über aria-labelledby und
 *  warnt, wenn sie fehlt — jeder Dialog braucht sie. */
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        'pr-10 text-[length:var(--text-heading-size)] font-semibold',
        'leading-[var(--text-heading-leading)] text-[var(--color-ink-strong)]',
        className,
      )}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-2 text-[var(--color-muted)]', className)}
      {...props}
    />
  )
}

/** Fußzeile für die Aktionen. Auf schmalen Fenstern stehen sie
 *  untereinander (die wichtigste oben), sonst rechtsbündig nebeneinander. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}
