import { useTranslation } from 'react-i18next'

// Platzhalter — die Arbeitsfläche mit freier Markierung entsteht erst in
// Aufgabe 14.
//
// Kein eigenes `<main>`: Das steht einmal in `AppLayout` um den `<Outlet />`
// (wie bei der Einstiegsseite und den Einstellungen). Ein zweites darin wäre
// ungültiges HTML und ein zweiter Orientierungspunkt für Vorlesesoftware.
export default function Editor() {
  const { t } = useTranslation()
  return <h1>{t('routes.editor.heading')}</h1>
}
