import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n/i18n'
import './styles/design.css'
import App from './App'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root-Element #root nicht gefunden')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
