import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Die Hülle eines Formularfeldes: Beschriftung oben, darunter das
 * Bedienelement, darunter Fehler und Hinweis — mit den Verweisen, die eine
 * Vorlesesoftware braucht.
 *
 * Bis Aufgabe 13b stand das als lokales `TextField` in `KeySetup.tsx`.
 * Herausgezogen, weil die Einstiegsseite und die Einstellungen dieselbe
 * Anordnung brauchen und ein zweites, leicht abweichendes Feld genau die
 * Sorte Unterschied wäre, die niemand bemerkt, bis eine Beschriftung fehlt.
 *
 * Zwei Regeln, die hier eingebaut und nicht dem Aufrufer überlassen sind
 * (siehe DESIGN.md, Abschnitt „Eingabefelder"):
 *
 * - **Der Fehler steht vor dem Hinweis**, sichtbar und in
 *   `aria-describedby`. Beim Fokussieren soll zuerst gesagt werden, was zu
 *   tun ist, und danach die Regel.
 * - **Ein Platzhalter ersetzt nie die Beschriftung.** Das Feld bekommt sie
 *   über `<label for>`; nur Bedienelemente, die ein `<label>` nicht
 *   benennen kann (der Auslöser der Auswahlliste ist ein `<button>`),
 *   bekommen sie über `aria-labelledby` — dafür `labelledBy`.
 */

/** Beschriftung eines Feldes — und dieselbe Klasse an den
 *  Zwischenüberschriften eines Formulars. Sie sollen gliedern, nicht rufen. */
export const FIELD_LABEL_CLASS = 'font-medium text-[var(--color-ink)]'

/** Erklärender Satz unter einem Feld. Gedämpft, und damit nur auf
 *  `surface` oder `surface-raised` zulässig (Kontrastregel in DESIGN.md). */
export const FIELD_HINT_CLASS =
  'text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-muted)]'

/** Meldung unter einem beanstandeten Feld. */
export const FIELD_ERROR_CLASS =
  'text-[length:var(--text-body-sm-size)] leading-[var(--text-body-sm-leading)] text-[var(--color-error)]'

/**
 * Was das Bedienelement von der Hülle übernimmt. Bewusst genau die
 * Attributnamen, die im DOM landen — damit sich das Objekt unverändert
 * ausbreiten lässt (`{...aria}`) und nichts umbenannt werden muss.
 */
export interface FieldControlProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
  'aria-labelledby': string | undefined
}

export interface FieldProps {
  /** Wurzel der Kennungen. Feld, Hinweis und Fehler leiten sich davon ab. */
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string
  /**
   * Beschriftung als `<span id>` statt `<label for>` — für Bedienelemente,
   * die ein `<label>` nicht benennt. Das Kind bekommt dann
   * `aria-labelledby` gesetzt.
   */
  labelledBy?: boolean
  className?: string
  children: (control: FieldControlProps) => ReactNode
}

export function Field({ id, label, hint, error, labelledBy = false, className, children }: FieldProps) {
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error === undefined ? null : errorId, hint === undefined ? null : hintId]
    .filter((entry): entry is string => entry !== null)
    .join(' ')

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {labelledBy ? (
        <span id={labelId} className={FIELD_LABEL_CLASS}>
          {label}
        </span>
      ) : (
        <label htmlFor={id} className={FIELD_LABEL_CLASS}>
          {label}
        </label>
      )}
      {children({
        id,
        'aria-invalid': error !== undefined,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-labelledby': labelledBy ? labelId : undefined,
      })}
      {error !== undefined && (
        <p id={errorId} className={FIELD_ERROR_CLASS}>
          {error}
        </p>
      )}
      {hint !== undefined && (
        <p id={hintId} className={FIELD_HINT_CLASS}>
          {hint}
        </p>
      )}
    </div>
  )
}
