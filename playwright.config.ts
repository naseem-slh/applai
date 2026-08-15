import { defineConfig, devices } from '@playwright/test'

/**
 * Der Port des Vorschau-Servers, wählbar über `PLAYWRIGHT_PORT`.
 *
 * An diesem Projekt wird aus mehreren Arbeitsbäumen zugleich gearbeitet.
 * Mit einem festen Port und `reuseExistingServer` griffe ein Lauf sonst
 * stillschweigend auf den Vorschau-Server eines **anderen** Arbeitsbaums zu
 * und prüfte dessen Build — ein grüner Lauf, der nichts über den eigenen
 * Stand aussagt. In CI bleibt es beim Vorgabewert.
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Die Anwendung wählt die Oberflächensprache nach der Browsersprache vor
    // (G8). Ohne feste Vorgabe hinge der Test daran, wie die Maschine
    // eingestellt ist, auf der er läuft.
    locale: 'de-DE',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // e2e-Tests laufen gegen den produktiven Build (npm run preview), nicht
  // gegen den Dev-Server — nur dort gilt die strenge CSP (siehe vite.config.ts).
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
