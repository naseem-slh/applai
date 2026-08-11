import { useTranslation } from 'react-i18next'

// Platzhalter — Anbieter, Sprache, Anonymisierung, Wahrheitsmodus,
// Erscheinungsbild und Datenlöschung entstehen erst in Aufgabe 13.
export default function Settings() {
  const { t } = useTranslation()
  return (
    <main>
      <h1>{t('routes.settings.heading')}</h1>
    </main>
  )
}
