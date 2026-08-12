import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR_CLASS, FIELD_HINT_CLASS, FIELD_LABEL_CLASS } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import type { LoadedDocument } from '@/components/app/appContext'

/**
 * Ein Ablegefeld für eine Unterlage: hineinziehen oder auswählen.
 *
 * Das eigentliche `<input type="file">` ist auf `hidden` gesetzt und wird
 * von einem Knopf ausgelöst. Bewusst so und nicht über ein gestyltes
 * `<label>`: Ein `display:none`-Feld ist nicht fokussierbar, ein Label auch
 * nicht — ein Knopf ist es, und damit bleibt der Weg über die Tastatur
 * derselbe wie der mit der Maus. Das Ziehen ist eine Zugabe für die Maus,
 * kein eigener Bedienweg.
 *
 * Der Zustand steht als Text da, nicht nur als Farbe: „wird gelesen",
 * der Dateiname, die Meldung. Das Umranden beim Darüberziehen ist die
 * Zugabe, nicht die Auskunft.
 *
 * **Eine Zeile, kein Kasten im Kasten.** Bis zum Aufräumen der
 * Einstiegsseite stand hier ein Rahmen um einen Absatz, einen Knopf und
 * eine Statuszeile, dreimal untereinander — zweimal auf der Seite, für
 * Anschreiben und Lebenslauf, ergab das vier Rahmen und rund vierzig
 * Wörter für „lege zwei Dateien ab". Jetzt trägt die Fläche genau eine
 * Zeile: links der Zustand, rechts die Knöpfe. Was zur Datei zu sagen ist,
 * steht als Hinweis darunter, außerhalb der Fläche, wo es nicht mit dem
 * Ablegeziel um Aufmerksamkeit ringt.
 */

export interface FileDropProps {
  /** Überschrift des Feldes, z. B. „Anschreiben". */
  label: string
  /** Ein kurzer Hinweis unter der Fläche, z. B. was beim Export passiert. */
  description: string
  /**
   * Steht klein neben der Überschrift: das Format bei der Pflichtunterlage,
   * das Kennzeichen „Optional" beim Lebenslauf. Ohne Angabe bleibt die
   * Zeile leer.
   */
  meta?: ReactNode
  /** Wert für `accept` am Dateifeld, z. B. `.docx,.pdf`. */
  accept: string
  document: LoadedDocument | null
  busy?: boolean
  /** Übersetzte Meldung, wenn das Lesen gescheitert ist. */
  error?: string
  onSelect: (file: File) => void
  onClear: () => void
  className?: string
}

export function FileDrop({
  label,
  description,
  meta,
  accept,
  document: loaded,
  busy = false,
  error,
  onSelect,
  onClear,
  className,
}: FileDropProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const labelId = `${inputId}-label`
  const chooseId = `${inputId}-choose`
  const removeId = `${inputId}-remove`
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

  return (
    // Überschrift, Ablegefläche, Hinweis und Meldung gehören zusammen und
    // sagen das jetzt auch: Als benannte Gruppe liest eine Vorlesesoftware
    // „Anschreiben, Gruppe" statt einer losen Folge von Absätzen, und die
    // Zugehörigkeit des Hinweises zum Feld steht nicht mehr nur räumlich da.
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={labelId} className={FIELD_LABEL_CLASS}>
          {label}
        </h3>
        {meta}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        // Gestrichelt, solange das Feld leer ist: Es lädt zum Ablegen ein.
        // Sobald etwas darin liegt, wird die Kontur durchgezogen — dann ist
        // es kein Ziel mehr, sondern ein Inhalt.
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3 transition-colors',
          dragging
            ? 'border-dashed border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
            : loaded === null
              ? 'border-dashed border-[var(--color-control-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
        )}
      >
        {/* Nicht fokussierbar, weil `hidden` es aus dem Baum nimmt — der
            Knopf daneben ist der Bedienweg. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            const file = event.target.files?.item(0) ?? null
            if (file !== null) onSelect(file)
            // Zurücksetzen, damit dieselbe Datei nach einem „Entfernen"
            // erneut gewählt werden kann — sonst löst `change` nicht aus.
            event.target.value = ''
          }}
        />

        {/* Der eingelesene Zustand ist die gute Nachricht und darf sich
            deshalb von der Einladung davor abheben. In --color-accent-text,
            nicht in --color-accent: Als Schrift verfehlt der Akzent auf den
            getönten Flächen 4,5:1 (siehe design.css). */}
        <p
          role="status"
          className={cn(
            'mr-auto min-w-0 text-[length:var(--text-body-sm-size)]',
            loaded === null || busy
              ? 'text-[var(--color-muted)]'
              : 'font-medium break-all text-[var(--color-accent-text)]',
          )}
        >
          {busy
            ? t('start.files.reading')
            : loaded === null
              ? t('start.files.none')
              : t('start.files.loaded', { name: loaded.fileName ?? t('start.files.fromDraft') })}
        </p>

        {/* Beide Knöpfe stehen zweimal auf der Seite (Anschreiben und
            Lebenslauf) und hießen sonst gleich. `aria-labelledby` mit einem
            Verweis auf den Knopf selbst und danach auf die Überschrift
            ergibt „Auswählen Anschreiben" — der sichtbare Text bleibt
            dabei Teil des Namens (WCAG 2.5.3). */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            id={chooseId}
            variant="secondary"
            size="sm"
            disabled={busy}
            aria-labelledby={`${chooseId} ${labelId}`}
            onClick={() => inputRef.current?.click()}
          >
            {loaded === null ? t('start.files.choose') : t('start.files.replace')}
          </Button>
          {loaded !== null && (
            <Button
              id={removeId}
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-labelledby={`${removeId} ${labelId}`}
              onClick={onClear}
            >
              {t('start.files.remove')}
            </Button>
          )}
        </div>
      </div>

      <p className={FIELD_HINT_CLASS}>{description}</p>

      {error !== undefined && (
        <p role="alert" className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
    </div>
  )
}
