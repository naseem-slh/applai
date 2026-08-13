import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Field, FIELD_HINT_CLASS } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Input'
import type { ReapplyMode } from '@/lib/domain/reapply'

/**
 * Die nächste Bewerbung beginnt hier: neue Anzeige einfügen, Betriebsart
 * wählen, fertig.
 *
 * **Die Betriebsart ist der Knopf, nicht ein Schalter darüber.** „Schnell
 * übernehmen" und „Varianten zeigen" stehen gleichrangig nebeneinander;
 * beide starten denselben Durchlauf und unterscheiden sich allein darin, ob
 * er an jeder Stelle anhält. Ein vorgeschalteter Umschalter würde eine
 * Entscheidung zu einer Einstellung machen, die man erst sucht und dann
 * vergisst.
 *
 * **Die Kosten stehen vor dem Klick, nicht danach.** Eine Anfrage für die
 * Anzeige, dazu eine je vorgemerkter Stelle — der Nutzer bezahlt sie bei
 * seinem eigenen Anbieter und soll die Zahl kennen, bevor sie anfällt.
 * Dasselbe Versprechen macht die Lückenliste an ihrem Knopf schon.
 *
 * **Nicht wiedergefundene Stellen werden hier gemeldet, nicht im Lauf.** Ob
 * ein Anker im hochgeladenen Anschreiben wieder sitzt, steht vor der ersten
 * Anfrage fest. Diese Auskunft mitten in einen laufenden Durchlauf zu
 * stellen, hieße den Nutzer für etwas anzuhalten, das er ohnehin nur zur
 * Kenntnis nehmen kann.
 */

export interface ReapplyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Wie viele vorgemerkte Stellen der Durchlauf abarbeiten wird. */
  markCount: number
  /** Wie viele Anker im Anschreiben nicht wiedergefunden wurden. */
  unresolvedCount: number
  onStart: (jobAdText: string, mode: ReapplyMode) => void
}

export function ReapplyDialog({
  open,
  onOpenChange,
  markCount,
  unresolvedCount,
  onStart,
}: ReapplyDialogProps) {
  const { t } = useTranslation()
  const fieldId = useId()
  const [text, setText] = useState('')

  const ready = text.trim() !== ''

  const start = (mode: ReapplyMode) => {
    if (!ready) return
    onStart(text.trim(), mode)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Der eingetippte Text überlebt das Schließen nicht: Wer den Dialog
        // wegklickt, hat sich gegen diesen Durchlauf entschieden, und ein
        // beim nächsten Öffnen noch dastehender Anzeigentext wäre eine
        // Zusage, die niemand gegeben hat.
        if (!next) setText('')
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogTitle>{t('editor.reapply.heading')}</DialogTitle>
        <DialogDescription>{t('editor.reapply.description')}</DialogDescription>

        <Field
          id={`${fieldId}-job-ad`}
          label={t('editor.reapply.jobAdLabel')}
          className="mt-4"
        >
          {(control) => (
            <Textarea
              {...control}
              value={text}
              rows={8}
              onChange={(event) => setText(event.target.value)}
              className="min-h-[10rem]"
            />
          )}
        </Field>

        <div className={`mt-3 flex flex-col gap-1 ${FIELD_HINT_CLASS}`}>
          <span>{t('editor.reapply.marks', { count: markCount })}</span>
          {unresolvedCount > 0 && (
            <span>{t('editor.reapply.unresolved', { count: unresolvedCount })}</span>
          )}
          {/* Die Anzeige selbst ist die eine Anfrage über den Stellen. */}
          <span>{t('editor.reapply.cost', { count: markCount + 1 })}</span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('editor.reapply.cancel')}
          </Button>
          <Button variant="secondary" disabled={!ready} onClick={() => start('waehlen')}>
            {t('editor.reapply.choose')}
          </Button>
          <Button disabled={!ready} onClick={() => start('schnell')}>
            {t('editor.reapply.fast')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
