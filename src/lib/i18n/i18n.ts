import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['de', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const FALLBACK_LANGUAGE: SupportedLanguage = 'de'

// Vorauswahl aus navigator.language (z. B. "de-DE", "en-US" → "de"/"en").
// Unbekannte Browsersprachen fallen auf Deutsch zurück (G8).
function detectInitialLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return FALLBACK_LANGUAGE
  const primary = navigator.language?.slice(0, 2).toLowerCase()
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as SupportedLanguage)
    : FALLBACK_LANGUAGE
}

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: {
    escapeValue: false, // React entschärft bereits, siehe react-i18next-Doku
  },
})

export default i18n
