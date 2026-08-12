import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { isAbortError } from '@/components/app/aiErrorKey'
import { Button } from '@/components/ui/Button'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import type { Variant } from '@/lib/domain/rewrite'
import { cn } from '@/lib/utils'
import { paragraphsLeftBehind, type EditorSelection } from './documentSelection'

/**
 * Drei Formulierungsvarianten zur markierten Stelle — das, worum es in
 * diesem Produkt geht (`docs/spec.md`: „**Drei Varianten** zur Auswahl").
 *
 * **Diese Komponente kennt weder Anbieter noch Schlüssel noch
 * Anonymisierung.** Sie bekommt eine Funktion `rewrite`, ruft sie mit der
 * Markierung und einem Abbruchsignal auf und zeigt an, was zurückkommt. Die
 * Arbeitsfläche setzt den Auftrag zusammen (`rewriteRequest.ts`) und
 * entscheidet, mit welchem Schlüssel er läuft. Dadurch ist der ganze
 * Zustandsablauf hier — warten, abbrechen, scheitern, übernehmen — ohne
 * Modell und ohne Netz prüfbar.
 *
 * **Abbrechen bricht wirklich ab.** Jeder Lauf bekommt seinen eigenen
 * `AbortController`; der Abbrechen-Knopf ruft `abort()`, und das Signal
 * erreicht über `withSignal` (siehe `lib/ai/provider.ts`) beide möglichen
 * Modellaufrufe der Umformulierung. Ein abgebrochener Lauf schreibt danach
 * nichts mehr in den Zustand, auch keine Fehlermeldung: Der Nutzer hat den
 * Abbruch selbst ausgelöst und braucht darüber keine Belehrung.
 *
 * **Der Fokus wandert beim Öffnen in die Überlagerung**, wie Radix es
 * vorsieht. Naheliegend wäre gewesen, das zu unterdrücken, damit die
 * Markierung im Dokument sichtbar hervorgehoben bleibt — der Preis wäre
 * gewesen, dass wer mit der Tastatur arbeitet, die drei Vorschläge erst
 * suchen muss. Die Markierung selbst überlebt den Fokuswechsel ohnehin:
 * `useDocumentSelection` beachtet nur Änderungen innerhalb der
 * Dokumentfläche, und übernommen wird der gespeicherte Bereich, nicht der
 * im Browser gerade hervorgehobene.
 *
 * **Warum die Varianten beim Schließen verworfen werden.** Sie hängen an
 * genau der Markierung, für die sie erzeugt wurden; deren Offsets gelten
 * nach der nächsten Änderung am Dokument nicht mehr (siehe
 * `useDocumentSelection`). Eine aufbewahrte Variante ließe sich später an
 * eine verschobene Stelle schreiben — das ist die eine Art Fehler, die
 * dieses Projekt an der Datei des Nutzers nicht machen darf.
 *
 * **Die Verschiebungswarnung ist hier genauer als in der Leiste.** Die
 * Leiste warnt beim Markieren, dass ein festgehaltener Absatz verrutschen
 * **kann**; hier liegt der Ersatztext vor, und `paragraphsLeftBehind` sagt
 * für jede Variante einzeln, ob es tatsächlich passiert.
 */

export type VariantStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface VariantPopoverProps {
  /** Die Markierung, zu der Varianten erzeugt werden. `null` sperrt den Knopf. */
  selection: EditorSelection | null
  /**
   * Fragt das Modell. Wirft im Fehlerfall; diese Komponente übersetzt den
   * Fehler über `aiErrorKey`, statt einen Ausnahmetext anzuzeigen (G8).
   */
  rewrite: (selection: EditorSelection, signal: AbortSignal) => Promise<Variant[]>
  /**
   * Ist alles bereit, um zu fragen? Falsch, solange die Auswertung von
   * Anzeige und Stilprofil läuft oder gescheitert ist oder der Tresor
   * gesperrt ist. Der Grund steht dann in der Arbeitsfläche, nicht hier —
   * ein Knopf, der seine eigene Sperre erklärt, verdoppelt die Auskunft.
   */
  ready: boolean
  /** Übernimmt die gewählte Variante in das Dokument. */
  onApply: (variant: Variant) => void
}

export function VariantPopover({ selection, rewrite, ready, onApply }: VariantPopoverProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<VariantStatus>('idle')
  const [variants, setVariants] = useState<Variant[]>([])
  const [error, setError] = useState<unknown>(null)
  const running = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    running.current?.abort()
    running.current = null
  }, [])

  // Wer die Ansicht verlässt, während gefragt wird, soll die Antwort nicht
  // mehr bezahlen und schon gar nicht in einen abgebauten Baum schreiben.
  useEffect(() => stop, [stop])

  const start = useCallback(
    async (current: EditorSelection) => {
      stop()
      const controller = new AbortController()
      running.current = controller
      setStatus('loading')
      setError(null)
      setVariants([])
      try {
        const result = await rewrite(current, controller.signal)
        if (controller.signal.aborted) return
        setVariants(result)
        setStatus('ready')
      } catch (caught) {
        if (controller.signal.aborted || isAbortError(caught)) return
        setError(caught)
        setStatus('failed')
      } finally {
        if (running.current === controller) running.current = null
      }
    },
    [rewrite, stop],
  )

  function handleOpenChange(next: boolean): void {
    setOpen(next)
    if (next) {
      if (selection !== null) void start(selection)
      return
    }
    // Schließen heißt verwerfen: laufender Aufruf abbrechen, Ergebnis
    // wegwerfen (siehe Kopfkommentar).
    stop()
    setStatus('idle')
    setVariants([])
    setError(null)
  }

  function handleApply(variant: Variant): void {
    onApply(variant)
    handleOpenChange(false)
  }

  // Wie jeder Knopf in dieser Leiste: Das Voreingestellte des `mousedown`
  // unterdrücken, sonst legt der Browser die Markierung im Text zusammen
  // und die Hervorhebung verschwindet, während der Nutzer noch auswählt
  // (siehe `SelectionLayer`, `actions`).
  function keepSelection(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
  }

  const disabled = selection === null || !selection.hasContent || !ready

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="primary" size="sm" disabled={disabled} onMouseDown={keepSelection}>
          {t('editor.variants.trigger')}
        </Button>
      </PopoverTrigger>

      {/* Breiter als die Vorgabe: Drei Formulierungsvorschläge sind Fließtext
          und in 18rem nicht zu vergleichen. */}
      <PopoverContent
        aria-labelledby={headingId}
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))]"
      >
        <div className="flex flex-col gap-3">
          <h3
            id={headingId}
            className="text-[length:var(--text-body-size)] font-semibold text-[var(--color-ink-strong)]"
          >
            {t('editor.variants.heading')}
          </h3>

          {status === 'loading' && <PendingNotice onCancel={() => handleOpenChange(false)} />}

          {status === 'failed' && (
            <div className="flex flex-col gap-3">
              <AiErrorNotice error={error} />
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => selection !== null && void start(selection)}
              >
                {t('editor.variants.retry')}
              </Button>
            </div>
          )}

          {status === 'ready' && selection !== null && (
            <ul className="flex flex-col gap-3">
              {variants.map((variant, index) => (
                <VariantOption
                  key={`${index}-${variant.text.slice(0, 24)}`}
                  variant={variant}
                  number={index + 1}
                  selection={selection}
                  onApply={() => handleApply(variant)}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * „Antwort wird erzeugt" samt Abbruch. Der Punkt trägt
 * `data-motion-essential`: Eine Wartezeige, die die Klammer für reduzierte
 * Bewegung mitnimmt, bliebe nach einer Umdrehung stehen und meldete damit
 * „abgestürzt" (DESIGN.md, Abschnitt Bewegung).
 */
function PendingNotice({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="flex items-center gap-2 text-[var(--color-ink)]">
        <span
          data-motion-essential
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-[var(--color-accent)] animate-pending"
        />
        {t('editor.variants.pending')}
      </p>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t('editor.variants.cancel')}
      </Button>
    </div>
  )
}

interface VariantOptionProps {
  variant: Variant
  number: number
  selection: EditorSelection
  onApply: () => void
}

function VariantOption({ variant, number, selection, onApply }: VariantOptionProps) {
  const { t } = useTranslation()
  const leftBehind = paragraphsLeftBehind(selection, variant.text)

  return (
    <li className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-3">
      <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-ink-strong)]">
        {t('editor.variants.option', { number })}
      </p>
      <p className="whitespace-pre-wrap text-[var(--color-ink)]">{variant.text}</p>

      {variant.unbackedClaims.length > 0 && (
        // Der freie Modus, sichtbar gemacht, bevor etwas im Brief steht.
        // Die Farbe trägt die Bedeutung nicht allein: Die Überschrift sagt,
        // was die Liste ist, und jede Aussage steht wörtlich da.
        <div className="flex flex-col gap-1 rounded-md bg-[var(--color-surface-alt)] p-2">
          <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-ink)]">
            {t('editor.variants.unbacked.heading', { count: variant.unbackedClaims.length })}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
            {variant.unbackedClaims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>
      )}

      {leftBehind.length > 0 && (
        <p className={cn('text-[length:var(--text-body-sm-size)]', 'text-[var(--color-error)]')}>
          {t('editor.variants.willShift', {
            paragraphs: leftBehind.map((entry) => entry.index + 1).join(', '),
            count: leftBehind.length,
          })}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onApply}>
          {t('editor.variants.apply')}
        </Button>
        <span className={FIELD_HINT_CLASS}>
          {t('editor.variants.length', { chars: variant.text.length })}
        </span>
      </div>
    </li>
  )
}
