import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import type { TruthMode } from '@/lib/storage/adapter'

/**
 * Die Wahrheitsgrenze, dort einstellbar, wo sie wirkt.
 *
 * Sie steht auch in den Einstellungen (Aufgabe 13c) — und gehört trotzdem
 * hierher: Sie ist keine Voreinstellung, die man einmal trifft, sondern eine
 * Entscheidung je Textstelle. Wer merkt, dass ihm zu einer Anforderung
 * nichts Belegtes einfällt, wechselt für diesen einen Absatz in den freien
 * Modus und danach zurück. Beide Stellen schreiben denselben Wert
 * (`Settings.truthMode`), es gibt keine zweite Quelle.
 *
 * **Der Wechsel nach `free` fragt nach.** Das ist die einzige Einstellung
 * der Anwendung, die G10 aufweicht: Ab hier darf das Modell Aussagen
 * erzeugen, die durch die Unterlagen nicht gedeckt sind. Der Dialog sagt,
 * was das heißt und was danach gilt (Markierung, Einzelbestätigung,
 * Exportsperre) — und er ist eine Nachfrage, kein Hinweis: Ohne
 * ausdrückliche Zustimmung bleibt der bisherige Modus stehen.
 *
 * Zurück nach `strict` oder `bridge` geht ohne Nachfrage. Eine Rückkehr zur
 * strengeren Regel braucht keine Warnung — sie nimmt nichts weg, was
 * bereits im Brief steht (die Markierungen bleiben, siehe
 * `useUnbackedClaims`), sie erzeugt nur nichts Neues mehr.
 */

const TRUTH_MODES: readonly TruthMode[] = ['strict', 'bridge', 'free']

export interface TruthModeSwitchProps {
  value: TruthMode
  onChange: (next: TruthMode) => void
}

export function TruthModeSwitch({ value, onChange }: TruthModeSwitchProps) {
  const { t } = useTranslation()
  const id = useId()
  const [asking, setAsking] = useState(false)

  function handleValueChange(next: string): void {
    const mode = next as TruthMode
    if (mode === value) return
    if (mode === 'free') {
      setAsking(true)
      return
    }
    onChange(mode)
  }

  return (
    <>
      {/* In einer Karte wie jeder andere Bereich der Spalte: Ein
          Bedienelement, das frei auf dem linierten Blatt läge, hätte als
          einziges keine Fläche unter sich. */}
      <Card variant="default" padding="md" asChild>
        <Field id={id} label={t('editor.truthMode.label')} labelledBy className="w-full">
          {({ id: fieldId, ...aria }) => (
            <Select value={value} onValueChange={handleValueChange}>
              <SelectTrigger id={fieldId} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRUTH_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`settings.truthMode.options.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </Card>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogTitle>{t('editor.truthMode.free.heading')}</DialogTitle>
          <DialogDescription>{t('editor.truthMode.free.intro')}</DialogDescription>
          <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-[var(--ink)]">
            <li>{t('editor.truthMode.free.marked')}</li>
            <li>{t('editor.truthMode.free.confirm')}</li>
            <li>{t('editor.truthMode.free.export')}</li>
          </ul>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {t('editor.truthMode.free.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAsking(false)
                onChange('free')
              }}
            >
              {t('editor.truthMode.free.confirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
