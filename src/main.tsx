import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n/i18n'
import './styles/design.css'
// Nur beim Drucken wirksam (`@media print`): Wer Strg+P drückt, soll
// ausschließlich den Brief auf dem Papier finden. Der PDF-Export läuft
// nicht mehr hierüber, sondern über `src/lib/export/pdf/`.
import './lib/export/print.css'
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
