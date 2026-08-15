import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AiErrorNotice } from '@/components/app/AiErrorNotice'
import { isAbortError } from '@/components/app/aiErrorKey'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { ArrowUpIcon, XIcon } from '@/components/ui/icons'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { hasFigureChanges, pairFigureChange } from '@/lib/domain/factsGuard'
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
 * **Drei Varianten, ein Vorschlag zur Zeit.** Wie sie dargestellt werden,
 * steht in `VariantDeck` weiter unten; was zu einem Vorschlag zu sagen ist,
 * bevor er im Brief steht, in `VariantNotices`.
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
  /** Zählt die Läufe. Er ist der `key` des Stapels — siehe unten. */
  const [run, setRun] = useState(0)
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
      setRun((current) => current + 1)
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

      {/* Breiter als die Vorgabe: Ein Formulierungsvorschlag ist Fließtext und
          in 18rem nicht am Stück zu lesen. */}
      <PopoverContent
        aria-labelledby={headingId}
        align="start"
        className="w-[min(33.75rem,calc(100vw-2rem))]"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3
              id={headingId}
              className="font-display text-[length:var(--text-body-size)] font-semibold text-[var(--color-ink-strong)]"
            >
              {t('editor.variants.heading')}
            </h3>
            {/* Der Stapel bringt seine eigene Schließmarke mit: Er füllt die
                Fläche, und wer ihn wegklicken will, sucht das Kreuz oben
                rechts, nicht die Escape-Taste. */}
            <PopoverClose asChild>
              <Button variant="ghost" size="iconSm" aria-label={t('editor.variants.close')}>
                <XIcon />
              </Button>
            </PopoverClose>
          </div>

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

          {status === 'ready' && selection !== null && variants.length > 0 && (
            // `key={run}`: Ein neuer Lauf ist ein neuer Stapel. Blattstand
            // und bestätigte Zahlen gehören zu den Vorschlägen, die gerade da
            // liegen, und nicht zu denen, die sie ersetzen.
            <VariantDeck
              key={run}
              variants={variants}
              selection={selection}
              onApply={handleApply}
              onRegenerate={() => void start(selection)}
            />
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

interface VariantDeckProps {
  variants: readonly Variant[]
  selection: EditorSelection
  onApply: (variant: Variant) => void
  onRegenerate: () => void
}

/**
 * Der Stapel: ein Vorschlag vorn, die übrigen versetzt darunter.
 *
 * **Warum nicht alle drei nebeneinander.** Die Varianten unterscheiden sich
 * in Nuancen; drei solcher Sätze zu vergleichen ist mehr Arbeit als das
 * Umschreiben selbst, und am Ende steht die Wahl zwischen drei Dingen, von
 * denen zwei ohnehin verworfen werden. Vorn liegt einer, die anderen zeigen
 * ihre Kante — sichtbar genug, dass niemand denkt, es gäbe nur diesen einen.
 *
 * **Geblättert wird über den Platz, nicht über den Inhalt.** Die Karten
 * behalten ihren Text und bekommen ein neues `data-pos`; die Bewegung zeigt
 * damit, woher der nächste Vorschlag kommt. Die Darstellung der Plätze steht
 * in `design.css` (`@utility deck`).
 *
 * **Nur ein „Übernehmen".** Es gehört zum vordersten Vorschlag und steht
 * deshalb in der Leiste darunter, neben den Punkten, die sagen, welcher das
 * gerade ist.
 */
function VariantDeck({ variants, selection, onApply, onRegenerate }: VariantDeckProps) {
  const { t } = useTranslation()
  const [front, setFront] = useState(0)
  /**
   * Die bestätigten Zahlenabweichungen, je Vorschlag.
   *
   * Hier und nicht in der Karte: Eine Karte wechselt beim Blättern ihren Platz
   * im Stapel, und eine Bestätigung, die am Platz hinge statt am Vorschlag,
   * wanderte damit auf einen anderen Text.
   */
  const [accepted, setAccepted] = useState<readonly number[]>([])

  function step(by: number): void {
    setFront((current) => (current + by + variants.length) % variants.length)
  }

  const variant = variants[front]!
  const figuresAccepted = accepted.includes(front)
  const blocked = hasFigureChanges(variant.figures) && !figuresAccepted

  return (
    <div className="flex flex-col gap-3">
      <ul className="deck">
        {variants.map((entry, index) => {
          // Der Platz im Stapel, nicht der Platz in der Antwort. Tiefer als
          // zwei geht die Darstellung nicht: Die Anbieter liefern drei, und
          // eine vierte Kante wäre von der dritten nicht zu unterscheiden.
          const position = Math.min((index - front + variants.length) % variants.length, 2)
          const inFront = position === 0
          return (
            <li
              key={`${index}-${entry.text.slice(0, 24)}`}
              data-pos={position}
              // Die hinteren Karten sind Auskunft über die Menge, nicht zum
              // Lesen da; ihr Text steht nur im Baum, damit der Stapel seine
              // Höhe behält (siehe `@utility deck`).
              aria-hidden={inFront ? undefined : true}
              className={cn(
                'flex flex-col gap-2 rounded-tile border-[3px] bg-[var(--field)]',
                'px-[15px] pt-[13px] pb-[14px]',
                inFront ? 'border-[var(--line)]' : 'border-[var(--line-soft)]',
              )}
            >
              <p className="whitespace-pre-wrap text-[var(--color-ink)]">{entry.text}</p>
              <span className={cn(FIELD_HINT_CLASS, 'tabular-nums')}>
                {t('editor.variants.length', { chars: entry.text.length })}
              </span>

              {inFront && (
                <VariantNotices
                  variant={entry}
                  selection={selection}
                  figuresAccepted={figuresAccepted}
                  onFiguresAccepted={(next) =>
                    setAccepted((current) =>
                      next ? [...current, front] : current.filter((item) => item !== front),
                    )
                  }
                />
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {variants.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label={t('editor.variants.previous')}
              onClick={() => step(-1)}
            >
              <ArrowUpIcon className="-rotate-90" />
            </Button>

            {/* Die Punkte sagen, wie viele es sind und wo man steht — dasselbe,
                was die Meldung darunter für Vorlesesoftware sagt. Zweimal
                dieselbe Auskunft ist einmal zu viel, deshalb hier nichts zu
                lesen. */}
            <ol aria-hidden="true" className="mx-1 flex items-center gap-1.5">
              {variants.map((entry, index) => (
                <li
                  key={`${index}-${entry.text.slice(0, 12)}`}
                  className={cn(
                    'h-[9px] rounded-pill border-2 border-[var(--line)]',
                    'transition-[width,background-color]',
                    index === front ? 'w-[22px] bg-[var(--accent)]' : 'w-[9px] bg-[var(--field)]',
                  )}
                />
              ))}
            </ol>

            <Button
              variant="ghost"
              size="iconSm"
              aria-label={t('editor.variants.next')}
              onClick={() => step(1)}
            >
              <ArrowUpIcon className="rotate-90" />
            </Button>
          </>
        )}

        <span className="flex-1" />

        <Button variant="primary" size="sm" disabled={blocked} onClick={() => onApply(variant)}>
          {t('editor.variants.apply')}
        </Button>
      </div>

      {/* Was die Punkte zeigen, in Worten: Wer blättert, ohne zu sehen, soll
          erfahren, wo er steht. */}
      <p role="status" className="sr-only">
        {t('editor.variants.position', { number: front + 1, count: variants.length })}
      </p>

      {/* Nicht „Erneut versuchen": Es ist nichts schiefgegangen. Wem keiner
          der drei zusagt, der lässt drei neue holen. */}
      <Button variant="secondary" size="sm" className="self-start" onClick={onRegenerate}>
        {t('editor.variants.regenerate')}
      </Button>
    </div>
  )
}

interface VariantNoticesProps {
  variant: Variant
  selection: EditorSelection
  figuresAccepted: boolean
  onFiguresAccepted: (next: boolean) => void
}

/**
 * Was zu einem Vorschlag zu sagen ist, bevor er im Brief steht: ungedeckte
 * Aussagen, abweichende Zahlen, zurückbleibende Absätze.
 *
 * Steht nur am vordersten Vorschlag — die hinteren sind nicht zu lesen, und
 * eine Warnung, die niemand sieht, ist keine.
 *
 * **Die Verschiebungswarnung ist hier genauer als in der Leiste.** Die Leiste
 * warnt beim Markieren, dass ein festgehaltener Absatz verrutschen **kann**;
 * hier liegt der Ersatztext vor, und `paragraphsLeftBehind` sagt für diesen
 * Vorschlag, ob es tatsächlich passiert.
 */
function VariantNotices({
  variant,
  selection,
  figuresAccepted,
  onFiguresAccepted,
}: VariantNoticesProps) {
  const { t } = useTranslation()
  const leftBehind = paragraphsLeftBehind(selection, variant.text)
  const figuresChanged = hasFigureChanges(variant.figures)
  const change = pairFigureChange(variant.figures)
  const figureCheckId = useId()

  return (
    <>
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

      {figuresChanged && (
        /**
         * Die Faktenprüfung sperrt „Übernehmen", bis sie bestätigt ist.
         *
         * **Bestätigt, nicht bloß angezeigt.** Eine Zahl, die sich verändert
         * hat, ist der eine Fehler, den man dem fertigen Dokument nicht mehr
         * ansieht — niemand liest ein Bewerbungs-PDF gegen das Arbeitszeugnis.
         * Ein Hinweis daneben würde in der Hälfte der Fälle überlesen; ein
         * gesperrter Knopf nicht.
         *
         * **Und trotzdem nur eine Sperre, kein Verbot.** Wer eine Zeile
         * zusammenfasst, verliert womöglich absichtlich eine Angabe. Diese
         * Entscheidung gehört dem Nutzer, hier, wo Markierung und Vorschlag
         * nebeneinander stehen.
         *
         * In `--color-error`, nicht in `--color-warning`: Letzteres erreicht
         * auf keiner hellen Fläche 4,5:1 (siehe DESIGN.md). Und die Farbe
         * trägt die Bedeutung nicht allein — die Überschrift sagt, was los
         * ist, und jede Angabe steht wörtlich da.
         */
        <div className="flex flex-col gap-2 rounded-md border border-[var(--color-error)] p-2">
          <p
            id={figureCheckId}
            className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-error)]"
          >
            {t('editor.variants.figures.heading')}
          </p>
          <p className="text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
            {change !== null
              ? t('editor.variants.figures.changed', { from: change.from, to: change.to })
              : [
                  variant.figures.removed.length > 0
                    ? t('editor.variants.figures.removed', {
                        figures: variant.figures.removed.join(', '),
                        count: variant.figures.removed.length,
                      })
                    : null,
                  variant.figures.added.length > 0
                    ? t('editor.variants.figures.added', {
                        figures: variant.figures.added.join(', '),
                        count: variant.figures.added.length,
                      })
                    : null,
                ]
                  .filter((line): line is string => line !== null)
                  .join(' ')}
          </p>
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${figureCheckId}-confirm`}
              checked={figuresAccepted}
              aria-describedby={figureCheckId}
              onCheckedChange={(next) => onFiguresAccepted(next === true)}
              className="mt-0.5"
            />
            <label
              htmlFor={`${figureCheckId}-confirm`}
              className="text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-ink)]"
            >
              {t('editor.variants.figures.confirm')}
            </label>
          </div>
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
    </>
  )
}
