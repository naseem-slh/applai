import { MIN_PASSPHRASE_LENGTH, isPaidKey, type ProviderId } from '@/lib/storage/keyVault'

/**
 * Prüfung des Einrichtungsformulars — dieselben Regeln, die der Tresor beim
 * Speichern erzwingt, nur eine Schicht früher und mit übersetztem Text.
 *
 * Warum doppelt: `KeyVault.save()` wirft feste deutsche Zeichenketten
 * (`keyVault.ts`, `assertUsablePassphrase`). Die dürfen nicht in die
 * Oberfläche durchgereicht werden — G8 verlangt jeden sichtbaren Text über
 * i18next, und eine `error.message` ist weder übersetzt noch für den Nutzer
 * geschrieben. Diese Datei benennt deshalb dieselben Fälle als
 * Übersetzungsschlüssel. **Der Tresor bleibt die durchsetzende Instanz**;
 * hier wird nur erklärt, was er ablehnen würde, bevor der Nutzer auf
 * „Speichern" drückt.
 *
 * Die Doppelung ist bewusst und wird von einem Test gehalten
 * (`validateKeyForm.test.ts`): jeder hier abgelehnte Fall muss auch am
 * echten Tresor scheitern.
 */

/** Felder des Formulars, an denen ein Mangel hängen kann. */
export type KeyFormField = 'apiKey' | 'billing' | 'passphrase' | 'passphraseConfirm'

export interface KeyFormIssue {
  readonly field: KeyFormField
  /** Schlüssel unterhalb von `onboarding.key.errors` (G8). */
  readonly messageKey: string
  /** Interpolationswerte für i18next, heute nur die Mindestlänge. */
  readonly values?: Readonly<Record<string, number>>
}

export interface KeyFormValues {
  readonly provider: ProviderId
  readonly apiKey: string
  /**
   * Antwort auf die Abrechnungsfrage bei Google. `null` heißt „noch nicht
   * beantwortet" — ausdrücklich kein `false`, weil eine Voreinstellung hier
   * eine Vermutung wäre und eine falsche Vermutung einen kostenpflichtigen
   * Schlüssel ohne Passwort ablegen würde.
   */
  readonly billingActive: boolean | null
  readonly passphrase: string
  readonly passphraseConfirm: string
}

/**
 * Muss die Abrechnungsfrage gestellt werden?
 *
 * Nur bei Google und nur, wenn der eingegebene Schlüssel nicht schon von
 * sich aus als kostenpflichtig erkennbar ist: Ein Google-Schlüssel sieht mit
 * und ohne aktivierte Abrechnung identisch aus, in der heutigen Form
 * (`AQ.…`) wie in der älteren (`AIza…`); `isPaidKey` erfindet dazu nichts
 * (siehe `keyVault.ts`). Also fragt die Oberfläche.
 *
 * Absichtlich unabhängig davon, ob schon ein Schlüssel eingegeben wurde:
 * Die Frage steht damit von Anfang an da, statt beim ersten Zeichen
 * aufzuspringen. Beantwortet werden muss sie erst, wenn ein Schlüssel da
 * ist — das entscheidet `validateKeyForm`, nicht diese Funktion.
 */
export function needsBillingQuestion(provider: ProviderId, apiKey: string): boolean {
  return provider === 'gemini' && !isPaidKey(provider, apiKey)
}

/**
 * Ist ein Passwort Pflicht? Entweder weil der Schlüssel selbst
 * kostenpflichtig ist (OpenAI, Anthropic, jedes `sk-…` — auch im
 * Gemini-Feld), oder weil der Nutzer die Abrechnung bestätigt hat.
 */
export function requiresPassphrase(values: KeyFormValues): boolean {
  return isPaidKey(values.provider, values.apiKey) || values.billingActive === true
}

/** Siehe `hasControlCharacter` in `keyVault.ts` — dieselbe Prüfung, dieselbe Begründung. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Liefert alle Mängel in der Reihenfolge der Felder. Leer heißt: der Tresor
 * würde diese Eingabe annehmen.
 */
export function validateKeyForm(values: KeyFormValues): KeyFormIssue[] {
  const issues: KeyFormIssue[] = []
  const apiKey = values.apiKey.trim()

  if (apiKey.length === 0) {
    issues.push({ field: 'apiKey', messageKey: 'emptyKey' })
  } else if (hasControlCharacter(apiKey)) {
    issues.push({ field: 'apiKey', messageKey: 'controlCharacters' })
  }

  if (apiKey.length > 0 && needsBillingQuestion(values.provider, values.apiKey) && values.billingActive === null) {
    issues.push({ field: 'billing', messageKey: 'billingUnanswered' })
  }

  if (!requiresPassphrase(values)) return issues

  const { passphrase } = values
  if (passphrase.length === 0) {
    issues.push({ field: 'passphrase', messageKey: 'passphraseRequired' })
    return issues
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    issues.push({
      field: 'passphrase',
      messageKey: 'passphraseTooShort',
      values: { min: MIN_PASSPHRASE_LENGTH },
    })
  } else if (new Set(passphrase).size === 1) {
    issues.push({ field: 'passphrase', messageKey: 'passphraseRepeated' })
  } else if (apiKey.toLowerCase().includes(passphrase.toLowerCase())) {
    issues.push({ field: 'passphrase', messageKey: 'passphraseInKey' })
  }

  // Die Wiederholung wird erst geprüft, wenn das Passwort selbst taugt —
  // sonst stünden zwei Meldungen an einem Feld, von denen die zweite nur
  // eine Folge der ersten ist.
  if (issues.every((issue) => issue.field !== 'passphrase') && passphrase !== values.passphraseConfirm) {
    issues.push({ field: 'passphraseConfirm', messageKey: 'passphraseMismatch' })
  }

  return issues
}
