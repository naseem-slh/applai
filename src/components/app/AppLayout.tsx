import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Der Rahmen um jede Ansicht: eine Kopfzeile mit dem Namen der Anwendung
 * und den zwei Zielen, die es gibt, darunter der Inhalt.
 *
 * Bewusst schmal gehalten. Die Anwendung hat drei Ansichten, von denen eine
 * (die Arbeitsfläche) erst über die Einstiegsseite erreichbar ist — eine
 * Navigationsleiste mit Untermenüs wäre Beiwerk. Die Kopfzeile bleibt
 * einzeilig und niedrig, damit die Arbeitsfläche in Aufgabe 14 den Platz
 * bekommt, den ein Dokument braucht.
 *
 * Kein Umschalter für das Erscheinungsbild hier: Er steht in den
 * Einstellungen, zusammen mit allem anderen, was die Anwendung dauerhaft
 * merkt (`docs/spec.md`, „Erscheinungsbild").
 */

const NAV_LINK_CLASS =
  'focus-ring rounded-sm px-2 py-1 text-sm text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent)]'

export function AppLayout() {
  const { t } = useTranslation()

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Link
            to="/"
            className="focus-ring rounded-sm font-semibold tracking-[-0.01em] text-[var(--color-ink-strong)]"
          >
            {t('app.name')}
          </Link>
          <nav aria-label={t('nav.label')}>
            <ul className="flex items-center gap-2">
              <li>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    cn(NAV_LINK_CLASS, isActive && 'font-medium text-[var(--color-accent)]')
                  }
                >
                  {t('nav.start')}
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    cn(NAV_LINK_CLASS, isActive && 'font-medium text-[var(--color-accent)]')
                  }
                >
                  {t('nav.settings')}
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
      {/* Datenschutz und Impressum stehen in der Fußzeile, nicht in der
          Kopfzeile: Sie müssen von jeder Seite aus erreichbar sein (und sind
          es damit auch), gehören aber nicht zu den Zielen, zwischen denen
          jemand während der Arbeit wechselt. */}
      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-end px-4 py-4">
          <Link to="/datenschutz" className={NAV_LINK_CLASS}>
            {t('nav.privacy')}
          </Link>
        </div>
      </footer>
    </div>
  )
}
