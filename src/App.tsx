import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from './components/app/AppLayout'
import { AppProvider } from './components/app/AppProvider'
import { RequireSession } from './components/app/RequireSession'
import Start from './routes/Start'
import Editor from './routes/Editor'
import Privacy from './routes/Privacy'
import Settings from './routes/Settings'

// Alle drei Ansichten liegen unter demselben Rahmen (Kopfzeile,
// Inhaltsbreite). Der gemeinsame Zustand — Speicher, Schlüsseltresor,
// Einstellungen — liegt eine Ebene höher, außerhalb des Routers: Er hängt
// an der Anwendung, nicht an der gerade sichtbaren Ansicht, und soll einen
// Wechsel zwischen ihnen unbeschadet überstehen.
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Start /> },
      {
        // Die Arbeitsfläche ist die einzige Ansicht, die einen Übergabestand
        // braucht. Ohne ihn geht es zurück auf die Einstiegsseite, statt sie
        // sich einen ausdenken zu lassen (siehe RequireSession).
        path: '/editor',
        element: (
          <RequireSession>
            <Editor />
          </RequireSession>
        ),
      },
      { path: '/settings', element: <Settings /> },
      // Datenschutz und Impressum: ohne Übergabestand erreichbar, weil man
      // sie lesen können muss, bevor man irgendetwas hochlädt.
      { path: '/datenschutz', element: <Privacy /> },
    ],
  },
])

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  )
}
