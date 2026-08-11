import { useTranslation } from 'react-i18next'

// Platzhalter — die eigentliche Oberfläche (Ablegefelder, Bewerbungsliste)
// entsteht erst in Aufgabe 13. Die Überschrift kommt bewusst aus i18next,
// damit die Übersetzungsanbindung schon hier nachweisbar ist.
export default function Start() {
  const { t } = useTranslation()
  return (
    <main>
      <h1>{t('routes.start.heading')}</h1>
    </main>
  )
}
