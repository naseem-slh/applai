import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Room } from '@/components/app/Room'
import { useInputModality } from '@/components/app/useInputModality'
import { cn } from '@/lib/utils'

/**
 * Der Rahmen um jede Ansicht — und der ist in dieser Welt kein Balken mehr,
 * sondern ein Raum: ein liniertes DIN-A4-Blatt, auf dem die Ansichten wie
 * Aufkleber liegen (siehe `Room`).
 *
 * **Es gibt keine gemeinsame Kopfzeile mehr.** Jede Ansicht baut ihre eigene,
 * weil jede eine andere braucht: Die Einstiegsseite zeigt die Marke groß und
 * allein, die Arbeitsfläche stellt sie links neben die Wahl der Unterlage und
 * das Zahnrad, Datenschutz und Einstellungen setzen sie zwischen einen
 * Zurück-Knopf und den freien Rand. Ein Balken, der all das zugleich sein
 * müsste, wäre überall ein Kompromiss.
 *
 * **Der Schrittanzeiger ist weg.** Er zählte Schritte, die sich von selbst
 * zählen: Auf der Einstiegsseite steht, was fehlt; auf der Arbeitsfläche
 * steht der Brief. Eine Ziffer davor sagte nichts dazu.
 *
 * **Was der Rahmen trotzdem trägt, sind die zwei Verweise, die von überall
 * erreichbar sein müssen.** Die Attrappen kennen sie nicht — sie sind
 * Einzelseiten und haben nie modelliert, wie man zwischen ihnen wechselt.
 * Der Datenschutz trägt das Impressum, und das muss nach § 5 DDG von jeder
 * Seite aus erreichbar sein; die Einstellungen wären sonst nur über die
 * Arbeitsfläche zu finden, die ohne Unterlagen gesperrt ist. Sie stehen
 * deshalb als eine ruhige Zeile am Fuß des Blattes: sichtbar, aber leiser als
 * alles, was auf der Karte darüber passiert.
 */

const FOOTER_LINK_CLASS = cn(
  'focus-ring rounded-control px-1 py-0.5 transition-colors',
  'text-[length:var(--text-caption-size)] text-[var(--muted)]',
  'hover:text-[var(--accent-text)] hover:underline',
)

function AppFooter() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <footer className="mt-auto flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 pt-2 pb-3 sm:gap-x-4 sm:px-4 sm:pb-4 short:pt-1 short:pb-2">
      {pathname === '/datenschutz' ? null : (
        <Link to="/datenschutz" className={FOOTER_LINK_CLASS}>
          {t('nav.privacy')}
        </Link>
      )}
      {pathname === '/settings' ? null : (
        <Link to="/settings" className={FOOTER_LINK_CLASS}>
          {t('nav.settings')}
        </Link>
      )}
    </footer>
  )
}

export function AppLayout() {
  // Einmal für die ganze Anwendung: Woher der Fokus kam, entscheidet, ob ein
  // Textfeld den Ring bekommt (siehe `useInputModality`).
  useInputModality()

  return (
    <>
      <Room />
      {/* Der Raum liegt auf z-0, alles Bedienbare eine Ebene darüber. Mehr
          Ebenen vergibt die Anwendung nicht, außer den Überlagerungen auf
          z-50 (siehe DESIGN.md, Höhenstaffelung). */}
      <div className="relative z-[1] flex min-h-[100dvh] flex-col">
        <Outlet />
        <AppFooter />
      </div>
    </>
  )
}
