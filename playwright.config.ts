import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4173',
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
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
