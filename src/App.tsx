import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from './components/app/AppLayout'
import { AppProvider } from './components/app/AppProvider'
import Start from './routes/Start'
import Editor from './routes/Editor'
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
      { path: '/editor', element: <Editor /> },
      { path: '/settings', element: <Settings /> },
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
