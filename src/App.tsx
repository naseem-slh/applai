import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Start from './routes/Start'
import Editor from './routes/Editor'
import Settings from './routes/Settings'

const router = createBrowserRouter([
  { path: '/', element: <Start /> },
  { path: '/editor', element: <Editor /> },
  { path: '/settings', element: <Settings /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
