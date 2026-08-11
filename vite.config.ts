import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Muss Wort für Wort mit public/_headers übereinstimmen (siehe G3, G2).
// Der Entwicklungsserver von Vite injiziert Inline-Skripte, deshalb gilt diese
// strenge Policy nur für den produktiven Build — siehe transformIndexHtml
// unten, das die Policy ausschließlich bei `vite build` einfügt.
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"

// `frame-ancestors` wird von Browsern in einem <meta http-equiv>-Tag ignoriert
// (nur per HTTP-Header wirksam, siehe public/_headers) — die übrigen
// Direktiven greifen auch in der lokalen Vorschau (`vite preview`).
function cspMetaTag(): Plugin {
  return {
    name: 'applai-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), cspMetaTag()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
