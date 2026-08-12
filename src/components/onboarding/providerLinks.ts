import type { ProviderId } from '@/lib/storage/keyVault'

/**
 * Auswärtige Adressen, die die Einrichtung braucht.
 *
 * Sie stehen hier gebündelt und nicht in den Übersetzungsdateien: eine
 * Adresse ist kein Text, der sich übersetzen ließe, und ein toter Verweis
 * fiele in einer JSON-Datei niemandem auf. Alle werden ausschließlich als
 * gewöhnlicher Verweis angeboten, den der Nutzer anklickt — nichts davon
 * wird zur Laufzeit geladen (G1, G2).
 *
 * `keys` zeigt auf die Konsole des Anbieters (dort entsteht der Schlüssel),
 * `spendLimit` und `keyScope` auf die **Dokumentation** der jeweiligen
 * Einstellung. Das ist Absicht: Konsolenpfade wandern, Dokumentationsseiten
 * bleiben, und die Dokumentation nennt den Weg zur Einstellung ohnehin.
 *
 * Geprüft am 12.08.2026.
 */
export interface ProviderLinks {
  /** Seite, auf der ein Schlüssel angelegt wird. */
  readonly keys: string
  /** Dokumentation zum Ausgabenlimit des Anbieters. */
  readonly spendLimit: string
  /** Nur Google: Dokumentation zur Beschränkung eines Schlüssels auf die Gemini-API. */
  readonly keyScope?: string
  /**
   * Die Datenschutz- bzw. Nutzungsbestimmungen des Anbieters. Die
   * Datenschutzerklärung (Aufgabe 16) verweist darauf: Was mit einem
   * gesendeten Text geschieht, entscheidet der Anbieter, und die
   * Ansprechstelle dafür ist er selbst.
   */
  readonly privacy: string
  /** Anzeigename für den Verweis. */
  readonly label: string
}

export const PROVIDER_LINKS: Record<ProviderId, ProviderLinks> = {
  gemini: {
    label: 'Google Gemini',
    privacy: 'https://ai.google.dev/gemini-api/terms',
    keys: 'https://aistudio.google.com/apikey',
    // Google-Budgets warnen nur; das steht ausdrücklich auf dieser Seite und
    // ist der Grund für die Formulierung des Hinweises.
    spendLimit: 'https://cloud.google.com/billing/docs/how-to/budgets',
    keyScope: 'https://ai.google.dev/gemini-api/docs/api-key',
  },
  openai: {
    label: 'OpenAI',
    privacy: 'https://openai.com/policies/privacy-policy/',
    keys: 'https://platform.openai.com/api-keys',
    spendLimit: 'https://developers.openai.com/api/docs/guides/spend-limits',
  },
  anthropic: {
    label: 'Anthropic',
    privacy: 'https://www.anthropic.com/legal/privacy',
    keys: 'https://platform.claude.com/settings/keys',
    spendLimit: 'https://platform.claude.com/docs/en/manage-claude/workspaces',
  },
}
