import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Card } from '@/components/ui/Card'

/**
 * Die Sprach-Nachfrage: In welcher Sprache soll das Anschreiben stehen?
 *
 * `docs/spec.md`: „Zielsprache = Sprache der Anzeige. **Nachfrage nur bei
 * Abweichung.**" Beides ist wörtlich zu nehmen:
 *
 * - **Stimmen Anzeige und Brief überein, erscheint nichts.** Kein Dialog,
 *   keine Bestätigung, keine Zeile in der Oberfläche. Das ist der
 *   Regelfall, und der Regelfall darf nicht nach einer Entscheidung fragen.
 * - **Bei Abweichung wird gefragt, nicht gehandelt.** Die Sprache der
 *   Anzeige ist der Vorschlag; das Umschreiben würde den markierten Text
 *   dann erst übersetzen und danach anpassen (zwei getrennte Schritte,
 *   Aufgabe 11). Ohne Nachfrage übersetzte eine englische Anzeige den
 *   deutschen Brief, obwohl die Bewerberin ihn vielleicht bewusst auf
 *   Deutsch geschrieben hat.
 *
 * **Der Hinweis auf die Gepflogenheiten** erscheint nur beim Vorschlag
 * Englisch: Foto, Geburtsdatum und Anschrift sind im englischsprachigen
 * Raum unüblich und in manchen Ländern ein Grund, die Bewerbung
 * auszusortieren. Er steht **im** Dialog, bei der Entscheidung, für die er
 * zählt — nicht als Meldung danach.
 *
 * Der Dialog erscheint **einmal**. Wer sich entschieden hat, soll die Frage
 * nicht bei jedem Rendern erneut bekommen; wer die Sprache später doch
 * wechseln will, tut das über dieselbe Entscheidung an anderer Stelle
 * (heute: erneut die Arbeitsfläche betreten). Das Merken übernimmt der
 * Aufrufer, weil dort auch die Zielsprache selbst liegt.
 */

export interface LanguagePromptProps {
  open: boolean
  /** Die Sprache der Stellenanzeige — der Vorschlag. */
  adLanguage: 'de' | 'en'
  /** Die erkannte Sprache des vorhandenen Anschreibens. */
  letterLanguage: 'de' | 'en'
  /** Die getroffene Entscheidung. Beide Wege schließen den Dialog. */
  onDecide: (target: 'de' | 'en') => void
}

export function LanguagePrompt({
  open,
  adLanguage,
  letterLanguage,
  onDecide,
}: LanguagePromptProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape oder ein Klick daneben ist keine Zustimmung: Es bleibt bei
        // der Sprache, in der der Brief schon steht.
        if (!next) onDecide(letterLanguage)
      }}
    >
      <DialogContent>
        <DialogTitle>{t('editor.language.heading')}</DialogTitle>
        <DialogDescription>
          {t('editor.language.intro', {
            ad: t(`editor.language.names.${adLanguage}`),
            letter: t(`editor.language.names.${letterLanguage}`),
          })}
        </DialogDescription>

        {adLanguage === 'en' && (
          <Card variant="subtle" padding="md" className="mt-4">
            <p className="text-[length:var(--text-body-sm-size)] font-medium text-[var(--color-ink)]">
              {t('editor.language.customs.heading')}
            </p>
            <p className="mt-1 text-[length:var(--text-body-sm-size)] text-[var(--color-ink)]">
              {t('editor.language.customs.body')}
            </p>
          </Card>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onDecide(letterLanguage)}>
            {t('editor.language.keep', { language: t(`editor.language.names.${letterLanguage}`) })}
          </Button>
          <Button variant="primary" onClick={() => onDecide(adLanguage)}>
            {t('editor.language.switch', { language: t(`editor.language.names.${adLanguage}`) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
