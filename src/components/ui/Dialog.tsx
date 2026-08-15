import type { ComponentProps } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { XIcon } from './icons'

// Dialog — modale Überlagerung. Der Inhalt liegt im Portal, die Abdunklung
// scrollt bei zu hohem Inhalt mit. Radix übernimmt Fokusfalle, Escape,
// Klick daneben und aria-modal; hier kommt nur das Aussehen dazu.
//
// Die Attrappen kennen keine Tastaturbedienung — sie sind reines HTML. Genau
// deshalb bleibt Radix: Das Aussehen kommt aus der Attrappe, das Verhalten
// aus dem Primitiv.

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

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
          // `overscroll-contain`: Ist der Dialog zu Ende gerollt, soll die
          // Seite dahinter nicht weiterrollen — sonst steht man nach dem
          // Schließen an einer anderen Stelle als vorher.
          'fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[var(--overlay)]',
          'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
        )}
      >
        {/* Eigener Kasten für die Zentrierung: mit min-h-full bleibt auch
            ein Dialog erreichbar, der höher ist als das Fenster. */}
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPrimitive.Content
            className={cn(
              // Dieselbe Bauform wie eine Karte auf dem Blatt — dieselbe
              // Tinte, derselbe Radius, dieselbe harte Kante. Eine
              // Überlagerung ist in dieser Welt keine andere Materie,
              // sondern dieselbe eine Ebene höher; getragen wird das von der
              // Abdunklung darunter, nicht von einer eigenen Gestalt.
              'pop relative w-full max-w-[460px] rounded-card border-[3px]',
              'border-[var(--line)] bg-[var(--card)] p-6 text-[var(--ink)]',
              '[--pop-height:10px] [--pop-shadow:var(--card-shadow)]',
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
                size="iconSm"
                className="absolute top-3 right-3"
                aria-label={closeLabel ?? t('ui.dialog.close')}
              >
                <XIcon />
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
        // pr-12 hält die Zeile vom Schließknopf frei: Der ist 30 px breit
        // und sitzt mit 12 px Abstand in der Ecke. Das Maß folgt seiner
        // Größe, nicht der Abstandsskala.
        'pr-12 font-display text-[length:var(--text-heading-size)] font-semibold',
        'leading-[var(--text-heading-leading)] text-[var(--ink-strong)]',
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
      className={cn('mt-2 text-[var(--muted)]', className)}
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
