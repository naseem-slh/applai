import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import type { LoadedDocument } from '@/components/app/appContext'

/**
 * Eine Ablegekachel für eine Unterlage: hineinziehen oder auswählen.
 *
 * **Die Kachel ist der Knopf.** Ein Ablegeziel, das man nicht anklicken kann,
 * ist eine Fläche mit einem Knopf daneben — zweimal auf der Seite ergab das
 * vier Rahmen für „lege zwei Dateien ab". Hier ist die Fläche selbst das
 * Bedienelement, und damit ist der Weg über die Tastatur derselbe wie der mit
 * der Maus. Das Ziehen bleibt eine Zugabe für die Maus, kein eigener
 * Bedienweg. Das `<input type="file">` steht auf `hidden` und wird von der
 * Kachel ausgelöst; `hidden` nimmt es aus dem Baum, deshalb ist die Kachel
 * der einzige Halt für den Tabulator.
 *
 * **Die Farbe sagt den Stand, nicht ein Wort daneben.** Tangerine an der
 * leeren Kachel heißt „hier fehlt noch etwas", Minze an der vollen heißt
 * „liegt vor". Der Zustand steht trotzdem als Text da — der Dateiname, die
 * Meldung, „wird gelesen" —, denn eine Farbe allein trägt nichts für den, der
 * sie nicht sieht.
 *
 * **In der leeren Kachel steht nichts als das Plus und der Name.** Kein Satz
 * darüber, was mit der Unterlage geschieht: Wer zwei Ablegeflächen sieht,
 * legt ab; er liest dort keine Erläuterung. Was zu sagen ist, sagt die
 * Oberfläche an der Stelle, an der es zählt — die Marke „Optional" an der
 * Kachel, der Hinweis zur Beta-Umwandlung erst, wenn ein PDF daliegt.
 *
 * **Die leichte Schräglage ist der Wartezustand:** lose Blätter liegen
 * schief. Sobald etwas darin liegt, richtet sich die Kachel auf.
 *
 * **Die Ladeanzeige läuft einmal von 0 auf 100 %**, in derselben Zeit, die
 * das Lesen im Programm braucht. Eine unendliche Pulsanzeige würde mitten in
 * der Bewegung abgeschnitten und käme nie oben an.
 *
 * **Beide Kacheln bleiben gleich hoch, auch wenn eine geladen ist.** Das
 * Raster gibt beiden Zellen dieselbe Höhe (`grid-auto-rows: 1fr`), und
 * `flex-1` lässt die Kachel die Höhe ihres Halters annehmen. Ohne das nähme
 * jede Kachel die Höhe ihres Inhalts: Sobald eine geladen ist, fällt das Plus
 * weg und der Dateiname kommt dazu — unterm Strich rund 19 px weniger. Die
 * volle Kachel schrumpfte also, statt sich zu füllen.
 *
 * **Nachgemessen wird das mit `offsetHeight`, nicht mit
 * `getBoundingClientRect()`.** Die leere Kachel steht um 1,5° gekippt, und
 * ein umschließendes Rechteck wächst dadurch um `Breite × sin(1,5°)` — bei
 * 350 px Kachelbreite sind das 9 px. Wer die Rechtecke vergleicht, misst die
 * Drehung und meldet einen Unterschied, den es nicht gibt.
 */

export interface DocumentTileProps {
  /** Überschrift der Kachel, z. B. „Anschreiben". */
  label: string
  /** Marke oben rechts an der leeren Kachel, z. B. „Optional". */
  flag?: string
  /** Wert für `accept` am Dateifeld, z. B. `.docx,.pdf`. */
  accept: string
  document: LoadedDocument | null
  busy?: boolean
  /** Übersetzte Meldung, wenn das Lesen gescheitert ist. */
  error?: string
  /** Neigung im Wartezustand. Die beiden Kacheln kippen gegeneinander. */
  tilt?: 'left' | 'right'
  /**
   * Etwas, das **über** der leeren Kachel liegt — heute die Marke mit dem
   * Zwischenstand (`RecentDraftChip`).
   *
   * Über und nicht in: Die Kachel ist selbst ein Knopf, und ein Knopf in
   * einem Knopf ist kein gültiges Auszeichnungsformat. Der Halter ist
   * `relative`, das Eingehängte setzt sich darin selbst.
   */
  overlay?: ReactNode
  onSelect: (file: File) => void
  onClear: () => void
  className?: string
}

export function DocumentTile({
  label,
  flag,
  accept,
  document: loaded,
  busy = false,
  error,
  tilt = 'left',
  overlay,
  onSelect,
  onClear,
  className,
}: DocumentTileProps) {
  const { t } = useTranslation()
  const prefix = useId()
  const labelId = `${prefix}-label`
  const actionId = `${prefix}-action`
  const errorId = `${prefix}-error`
  const statusId = `${prefix}-status`
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setDragging(false)
    // `Array.from` statt `.item(0)`: Nur die erste Datei zählt, und die
    // Umwandlung kommt auch mit dem einfacheren Datenträger zurecht, den
    // ein Test mitbringt.
    const [file] = Array.from(event.dataTransfer.files)
    if (file !== undefined) onSelect(file)
  }

  const fileName = loaded === null ? null : (loaded.fileName ?? t('start.files.fromDraft'))

  return (
    // Kachel, Meldung und Entfernen gehören zusammen und sagen das auch: Als
    // benannte Gruppe liest eine Vorlesesoftware „Anschreiben, Gruppe" statt
    // einer losen Folge von Absätzen.
    <div
      role="group"
      aria-labelledby={labelId}
      // Das Ziehen liegt an der ganzen Gruppe, nicht nur an der Kachel:
      // Wer eine Datei über die Meldung darunter fallen lässt, meint dieselbe
      // Kachel. Die Rückmeldung zeigt trotzdem die Kachel, denn sie ist das
      // Ziel.
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      // **Raster statt Flexbox**, und das ist der Kern der gleichen Höhe:
      // In einer Spalten-Flexbox trägt ein Kind mit `flex: 1` die
      // Mindesthöhe null bei — die Zelle des äußeren Rasters wurde damit so
      // hoch wie die *niedrigere* der beiden Kacheln, und die höhere ragte
      // 9px darüber hinaus. Als Raster mit `1fr auto` meldet die Hülle die
      // wirkliche Höhe ihrer Kachel nach oben, die Zeile nimmt die größere
      // der beiden, und beide Kacheln füllen sie aus.
      className={cn('relative flex flex-1 flex-col gap-2', className)}
    >
      <button
        type="button"
        data-tile={label}
        // Der Name ist „Auswählen Anschreiben", nicht der ganze Inhalt der
        // Kachel: Beide Kacheln hießen sonst gleich, und eine Vorlesesoftware
        // könnte sie nicht auseinanderhalten. Der sichtbare Text bleibt Teil
        // des Namens (WCAG 2.5.3 — „Anschreiben" steht darin).
        aria-labelledby={`${actionId} ${labelId}`}
        aria-describedby={cn(statusId, error !== undefined && errorId)}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'focus-ring group relative flex w-full flex-1 flex-col items-center justify-center',
          'min-h-[106px] gap-3 overflow-hidden rounded-tile border-[3px] px-4 py-[18px]',
          // Auf flachen Fenstern gibt die Kachel nach. Polsterung und
          // Zwischenraum sind die Stellschrauben, nicht eine Mindesthöhe:
          // Die natürliche Höhe (Plus, Name, Zeile) liegt ohnehin darüber.
          'short:gap-2 short:py-3',
          'shorter:py-[9px] shorter:gap-1.5',
          'shortest:py-1.5 shortest:gap-1',
          // Platz für das Eingehängte am Fuß der Kachel.
          overlay !== undefined && loaded === null && !busy && 'pb-[42px] short:pb-9',
          'text-center text-[var(--ink)] transition-[transform,background-color,border-color]',
          'duration-200 ease-bounce',
          loaded === null && !busy && 'cursor-pointer border-dashed border-[var(--line-soft)] bg-[var(--field)]',
          // Die Schräglage nur im Wartezustand — und nur dann, wenn nichts
          // anderes gerade passiert.
          loaded === null && !busy && !dragging && (tilt === 'left' ? '-rotate-[1.5deg]' : 'rotate-[1.5deg]'),
          loaded === null &&
            !busy &&
            'hover:rotate-0 hover:-translate-y-[3px] hover:border-[var(--accent-line)] hover:bg-[var(--accent-wash)]',
          'active:rotate-0 active:translate-y-[2px]',
          dragging && 'rotate-0 scale-[1.03] border-solid border-[var(--accent-line)] bg-[var(--accent-wash)]',
          busy && 'cursor-progress rotate-0 border-solid border-[var(--accent-line)] bg-[var(--field)]',
          loaded !== null &&
            !busy &&
            'tile-ruled cursor-pointer rotate-0 border-solid border-[var(--done-line)] bg-[var(--done-wash)] hover:border-[var(--done-deep)]',
          error !== undefined && 'border-solid border-[var(--error)] motion-safe:animate-shake',
        )}
      >
        {/* Das Blatt füllt sich von unten. Kein kreisender Zeiger, sondern
            dieselbe Form, die gleich das Ergebnis trägt. Bei reduzierter
            Bewegung steht die Füllung still auf halber Höhe: Der
            eingeklemmte Lauf käme sonst in einer Millisekunde oben an und
            meldete „fertig", während noch gelesen wird. */}
        {busy && (
          <span
            aria-hidden="true"
            data-testid="tile-fill"
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-0 bg-[var(--accent-wash)]',
              'animate-fill motion-reduce:h-[45%] motion-reduce:animate-none',
            )}
          />
        )}

        {flag !== undefined && loaded === null && !busy && (
          <span className="absolute top-3 right-3 rounded-pill border-2 border-[var(--line-soft)] bg-[var(--card)] px-[11px] py-[3px] font-display text-[length:var(--text-label-size)] font-semibold tracking-[var(--text-label-tracking)] text-[var(--muted)] uppercase">
            {flag}
          </span>
        )}

        {/* Das dicke Plus ist reine Geometrie, kein gezeichnetes Sinnbild —
            und damit das Einzige hier, was nicht aus Phosphor kommt. */}
        {loaded === null && (
          <span
            aria-hidden="true"
            className={cn(
              'relative size-[42px] shrink-0 text-[var(--accent)]',
              'transition-transform duration-[260ms] ease-bounce',
              'shorter:size-8 shortest:size-6',
              'group-hover:rotate-90 group-hover:scale-[1.08]',
              busy && 'opacity-30',
            )}
          >
            <span className="absolute inset-y-0 inset-x-[41%] rounded-pill bg-current" />
            <span className="absolute inset-x-0 inset-y-[41%] rounded-pill bg-current" />
          </span>
        )}

        {/* `relative` steht hier nur der Malreihenfolge wegen: Die Füllung
            ist absolut gesetzt und würde sonst über allem Unpositionierten
            gezeichnet — die Beschriftung verschwände beim Laden hinter ihr. */}
        <span className="sr-only" id={actionId}>
          {loaded === null ? t('start.files.choose') : t('start.files.replace')}
        </span>
        <span
          id={labelId}
          className="relative shrink-0 font-display text-[length:var(--text-heading-size)] font-semibold text-[var(--ink-strong)]"
        >
          {label}
        </span>
        {/* Die Zeile gibt es nur, wenn sie etwas zu sagen hat: den
            Dateinamen oder „wird gelesen". Leer bleibt sie weg — und die
            Kachel damit so hoch, wie das Plus und der Name sie machen. */}
        <span
          id={statusId}
          role="status"
          className={cn(
            'relative max-w-full shrink-0 text-[length:var(--text-caption-size)] break-words',
            'font-medium text-[var(--done-text)]',
          )}
        >
          {busy
            ? t('start.files.reading')
            : fileName === null
              ? ''
              : t('start.files.loaded', { name: fileName })}
        </span>
      </button>

      {/* Entfernen. Bewusst kein `Button`: Er ist eine gefüllte Tintenscheibe
          mit einem Ring in Kartenfarbe und sitzt über der Ecke der Kachel —
          eine Bauform, die es sonst nirgends gibt und die als Variante des
          Knopfes nur einmal gebraucht würde. */}
      {loaded !== null && !busy && (
        <button
          type="button"
          aria-label={`${t('start.files.remove')} ${label}`}
          onClick={onClear}
          className={cn(
            'focus-ring absolute -top-[13px] -right-[13px] z-[1] grid size-9 place-items-center',
            'rounded-pill border-[3px] border-[var(--card)] bg-[var(--ink-strong)] text-[var(--card)]',
            'transition-transform duration-200 ease-bounce hover:scale-[1.14] hover:rotate-90',
          )}
        >
          <XIcon />
        </button>
      )}

      {/* Erst nach der Kachel im Aufbau: Der Tabulator soll zuerst auf die
          Fläche treffen, um die es geht, und danach auf das Angebot. */}
      {loaded === null && !busy && overlay}

      {error !== undefined && (
        <p
          id={errorId}
          role="alert"
          className="px-1 text-[length:var(--text-caption-size)] leading-[var(--text-caption-leading)] font-medium text-[var(--error)]"
        >
          {error}
        </p>
      )}

      {/* Nicht fokussierbar, weil `hidden` es aus dem Baum nimmt — die Kachel
          darüber ist der Bedienweg. */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.item(0) ?? null
          if (file !== null) onSelect(file)
          // Zurücksetzen, damit dieselbe Datei nach einem „Entfernen" erneut
          // gewählt werden kann — sonst löst `change` nicht aus.
          event.target.value = ''
        }}
      />
    </div>
  )
}
