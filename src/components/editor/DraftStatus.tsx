import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FIELD_HINT_CLASS } from '@/components/ui/Field'
import { cn } from '@/lib/utils'
import type { DraftSaveState } from './useDraftAutosave'

/**
 * „Gesichert vor …" — und die drei anderen Sätze, die dieselbe Zeile sagen
 * kann.
 *
 * Die Anzeige folgt genau dem, was `useDraftAutosave` beobachtet hat, und
 * behauptet nichts darüber hinaus. Vor dem ersten Sichern steht dort die
 * Zusage („sichert automatisch"), während des Sicherns der Vorgang, danach
 * die Zeit **seit dem erfolgreichen** Schreiben — und wenn es fehlschlägt,
 * steht die Zeitangabe nicht mehr da. Eine relative Zeit, die weiterläuft,
 * während nichts mehr gespeichert wird, wäre schlimmer als gar keine
 * Anzeige: Sie beruhigt genau dann, wenn Anlass zur Sorge besteht.
 *
 * **Warum die Sätze kurz sind.** Sie stehen in der Leiste über dem Brief,
 * neben der Markierung. Ausgeschrieben („Wird alle 20 Sekunden gesichert.",
 * „7 Anfragen in dieser Sitzung") brauchte die rechte Gruppe 533 px und
 * zwang die Reihe unterhalb von etwa 1600 px Fensterbreite zum Umbruch. Der
 * genaue Abstand von 20 Sekunden ist dabei aus der Oberfläche verschwunden;
 * er stand dort als Zusage, nicht als Zustand. Die Fehlermeldung bleibt
 * ausgeschrieben: Sie ist selten und muss vollständig dastehen.
 */

/** Wie oft die relative Zeitangabe nachgezogen wird. */
const TICK_MS = 10_000

/** Unterhalb dieser Spanne heißt es „gerade gesichert" statt „vor x Sekunden". */
const JUST_NOW_SECONDS = 10

export interface DraftStatusProps {
  state: DraftSaveState
  className?: string
}

export function DraftStatus({ state, className }: DraftStatusProps) {
  const { t, i18n } = useTranslation()
  const [, setTick] = useState(0)
  const savedAt = state.status === 'saved' ? state.at : null

  useEffect(() => {
    if (savedAt === null) return
    const timer = window.setInterval(() => setTick((value) => value + 1), TICK_MS)
    return () => window.clearInterval(timer)
  }, [savedAt])

  const language = i18n.resolvedLanguage ?? 'de'
  const failed = state.status === 'failed'

  return (
    // `role="status"` und nicht `role="alert"`: Das Sichern läuft von
    // selbst, nicht auf eine Handlung des Nutzers hin. Höfliches Ansagen
    // ist hier richtig, Unterbrechen nicht.
    <p
      role="status"
      className={cn(
        FIELD_HINT_CLASS,
        failed && 'font-medium text-[var(--color-error)]',
        className,
      )}
    >
      {message(state, savedAt, language, t)}
    </p>
  )
}

function message(
  state: DraftSaveState,
  savedAt: number | null,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (state.status) {
    case 'idle':
      return t('editor.draft.idle')
    case 'saving':
      return t('editor.draft.saving')
    case 'failed':
      return t('editor.draft.failed')
    case 'saved': {
      const elapsed = Math.max(0, Date.now() - (savedAt ?? 0))
      if (elapsed < JUST_NOW_SECONDS * 1000) return t('editor.draft.savedJustNow')
      return t('editor.draft.saved', { when: relativeTime(elapsed, language) })
    }
  }
}

/**
 * „vor 2 Minuten" / „2 minutes ago" über `Intl.RelativeTimeFormat` — keine
 * eigene Zeitbibliothek (G9) und keine selbst gebauten Pluralformen.
 *
 * Sekunden werden auf zehn gerundet: Die Anzeige wird alle zehn Sekunden
 * nachgezogen, eine genauere Zahl wäre die meiste Zeit falsch.
 */
function relativeTime(elapsedMs: number, language: string): string {
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 60) return format.format(-Math.floor(seconds / 10) * 10, 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return format.format(-minutes, 'minute')
  return format.format(-Math.floor(minutes / 60), 'hour')
}
