import { useTranslation } from 'react-i18next'

// Platzhalter — die Arbeitsfläche mit freier Markierung entsteht erst in
// Aufgabe 14.
export default function Editor() {
  const { t } = useTranslation()
  return (
    <main>
      <h1>{t('routes.editor.heading')}</h1>
    </main>
  )
}
