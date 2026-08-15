import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from './appContext'

/**
 * Der Wächter vor der Arbeitsfläche: Ohne Übergabestand der Einstiegsseite
 * gibt es dort nichts zu tun, also geht es zurück auf die Einstiegsseite.
 *
 * `/editor` ist eine angemeldete Route und damit von Hand erreichbar (Lesezeichen,
 * getippte Adresse, Neuladen nach einem Absturz). `session` ist reiner
 * Arbeitsspeicher und überlebt kein Neuladen. Ohne diesen Wächter stünde die
 * Arbeitsfläche vor einem Stand, den es nicht gibt, und müsste sich einen
 * ausdenken. Genau daraus entstünde wieder ein leerer `userName` und damit
 * der Schaden, den Übergabe 1 verbietet (siehe `StartSession`).
 *
 * `replace`: Der Versuch soll keinen Eintrag im Verlauf hinterlassen, sonst
 * landete der Zurück-Knopf wieder auf derselben Umleitung.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useApp()
  if (session === null) return <Navigate to="/" replace />
  return <>{children}</>
}
