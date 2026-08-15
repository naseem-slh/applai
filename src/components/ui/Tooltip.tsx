import type { ComponentProps, ReactNode } from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

// Tooltip — kurze Erläuterung am Zeiger oder am Tastaturfokus. Anders als
// die übrigen Überlagerungen kehrt er die Fläche um (dunkel auf hell, hell
// auf dunkel): so ist auf einen Blick klar, dass er flüchtig ist und kein
// Popover mit Inhalt.
//
// Der Provider steckt in der Komponente selbst, damit ein Tooltip überall
// ohne Vorbereitung an der Programmwurzel funktioniert. Preis dafür: jeder
// Tooltip wartet für sich, das gemeinsame Überspringen der Verzögerung
// zwischen benachbarten Tooltips entfällt. Für diese Anwendung mit wenigen,
// verstreuten Hinweisen ist das der bessere Tausch.
//
// Achtung: Ein deaktivierter Knopf nimmt keine Zeigerereignisse an und löst
// deshalb keinen Tooltip aus. Wer erklären muss, warum etwas gesperrt ist,
// schreibt es daneben statt in einen Tooltip.

export interface TooltipProps
  extends Pick<
    ComponentProps<typeof TooltipPrimitive.Content>,
    'side' | 'align' | 'sideOffset' | 'className'
  > {
  /** Der Hinweis. Kommt übersetzt vom Aufrufer (G8). */
  content: ReactNode
  /** Das Element, an dem der Hinweis hängt. */
  children: ReactNode
  delayDuration?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  delayDuration = 300,
  className,
  open,
  defaultOpen,
  onOpenChange,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
      >
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={sideOffset}
            className={cn(
              // Umgekehrte Fläche: Tinte auf Papier wird zu Papier auf
              // Tinte. So ist auf einen Blick klar, dass der Hinweis
              // flüchtig ist und kein Popover mit Inhalt — er ist das
              // einzige Element der Oberfläche ohne Kontur.
              'z-50 max-w-64 rounded-control bg-[var(--ink-strong)] px-3 py-1.5',
              'text-[length:var(--text-caption-size)] text-[var(--paper)]',
              'data-[state=delayed-open]:animate-content-in',
              'data-[state=instant-open]:animate-content-in',
              'data-[state=closed]:animate-content-out',
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow
              width={10}
              height={5}
              className="fill-[var(--ink-strong)]"
            />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
