import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '@/components/app/appContext'
import { cn } from '@/lib/utils'

/**
 * Der Rahmen um jede Ansicht: eine Kopfzeile über die volle Fensterbreite,
 * darunter der Inhalt.
 *
 * **Das Fenster ist die Seite.** Ab `lg` bekommt der Rahmen eine feste Höhe
 * und schneidet ab; geblättert wird nur noch innerhalb der Bereiche, die es
 * wirklich brauchen (die Arbeitsfläche im Brief, die Einstiegsseite in
 * ihren Spalten). Darunter, auf Telefon und Tablett, gilt wieder das
 * gewohnte Blättern der ganzen Seite — eine feste Höhe wäre dort
 * unbedienbar, sobald die Bildschirmtastatur aufgeht.
 *
 * Die Kopfzeile trägt den Ablauf: zwei Schritte, „Vorbereiten" und
 * „Anschreiben anpassen". Der zweite bleibt gesperrt, solange es keinen
 * Übergabestand gibt — dieselbe Bedingung, an der auch `RequireSession`
 * hängt, nur sichtbar gemacht, statt den Nutzer erst auf eine Umleitung
 * laufen zu lassen.
 *
 * Kein Umschalter für das Erscheinungsbild hier: Er steht in den
 * Einstellungen, zusammen mit allem anderen, was die Anwendung dauerhaft
 * merkt (`docs/spec.md`, „Erscheinungsbild").
 */

const LINK_CLASS =
  'focus-ring rounded-md px-1.5 py-2 text-[12.5px] md:px-3 md:text-[length:var(--text-body-sm-size)] ' +
  'text-[var(--color-muted)] transition-colors ' +
  'hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-text)]'

/** Schrittreiter. Die Ziffer sitzt in einer runden Marke davor und wird
 *  gefüllt, sobald der Schritt der aktuelle ist. */
function StepTab({
  to,
  step,
  label,
  disabled = false,
}: {
  to: string
  step: number
  label: string
  disabled?: boolean
}) {
  const { pathname } = useLocation()
  const active = pathname === to

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-[22px] shrink-0 place-items-center rounded-full',
          'border-[1.5px] text-[11px] font-bold tabular-nums transition-colors',
          active
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
            : 'border-[var(--color-control-border)] text-[var(--color-muted)]',
        )}
      >
        {step}
      </span>
      {/* Unter `md` tragen beide Schritte nur ihre Ziffer: Zusammen mit
          Datenschutz und Einstellungen passen zwei ausgeschriebene Namen
          dort nicht nebeneinander, und eine waagerecht rollende Kopfzeile
          sieht kaputt aus. Welcher Schritt der aktuelle ist, sagt die
          gefüllte Ziffer; **was** er ist, sagen die Überschriften der Seite
          darunter. Der Umschaltpunkt liegt bei `md` und nicht bei `sm`:
          Bei 640px kämen die Namen zurück, ohne dass der Platz dafür da
          wäre, und die Kopfzeile liefe über (nachgemessen: 755 auf 640).

          `sr-only` statt `hidden`: Die Ziffer ist `aria-hidden`, weil sie
          ohne den Namen nichts aussagt. Verschwände der Name zusätzlich aus
          dem Baum, hätte der Verweis überhaupt keinen — axe meldet das als
          `link-name`, und eine Vorlesesoftware liest „Link" und sonst
          nichts. So bleibt der Name lesbar und nimmt keinen Platz. */}
      <span className="truncate sr-only md:not-sr-only md:inline">{label}</span>
    </>
  )

  const shared =
    'focus-ring flex items-center gap-2.5 rounded-md px-2 py-2 md:px-3 ' +
    'text-[length:var(--text-body-sm-size)] font-medium transition-colors'

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={cn(shared, 'cursor-not-allowed text-[var(--color-muted)] opacity-45')}
      >
        {inner}
      </span>
    )
  }

  return (
    <NavLink
      to={to}
      end
      className={cn(
        shared,
        active
          ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-ink-strong)]'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-text)]',
      )}
    >
      {inner}
    </NavLink>
  )
}

export function AppLayout() {
  const { t } = useTranslation()
  const { session } = useApp()
  const { pathname } = useLocation()

  // Einstiegsseite und Arbeitsfläche regeln ihre Höhe selbst: Beide sind
  // Spaltenaufbauten, in denen die Bereiche für sich blättern, während die
  // Seite als Ganzes stehen bleibt. Alles Übrige ist fortlaufender Text.
  const ownsHeight = pathname === '/' || pathname === '/editor'

  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:overflow-hidden">
      {/* `overflow-x-auto` ohne sichtbaren Balken ist die Rückfallebene: Wenn
          die Kopfzeile auf einem sehr schmalen Gerät doch einmal nicht passt,
          bleibt jeder Knopf erreichbar, statt abgeschnitten zu werden. */}
      <header
        className={cn(
          'flex h-[58px] shrink-0 items-center gap-1.5 px-2 md:gap-4 md:px-5',
          'border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]',
          'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        <Link
          to="/"
          className="focus-ring flex shrink-0 items-center gap-2.5 rounded-md font-semibold tracking-[-0.01em] text-[var(--color-ink-strong)]"
        >
          {/* Feste Masse am Bild, damit die Kopfzeile nicht springt, sobald
              es eintrifft. `alt=""`, weil der Schriftzug daneben denselben
              Namen schon traegt: zweimal „Applai" waere fuer Hilfsmittel
              nur Laerm. Die Datei liegt im Projekt (G2), nicht bei einem
              fremden Host. */}
          <img
            src="/logo.webp"
            alt=""
            width={28}
            height={26}
            className="h-[26px] w-[28px] shrink-0"
          />
          {/* `sr-only` statt `hidden`: Das Logo davor traegt keine
              Textalternative, also truege der Verweis auf die Einstiegsseite
              sonst gar keinen Namen. Sichtbar wird der Schriftzug erst ab
              `md`, wo die Kopfzeile den Platz dafuer hat. */}
          <span className="sr-only md:not-sr-only md:inline">{t('app.name')}</span>
        </Link>

        <nav aria-label={t('nav.label')} className="shrink-0">
          <ul className="flex items-center gap-1">
            <li>
              <StepTab to="/" step={1} label={t('nav.start')} />
            </li>
            <li>
              {/* Gesperrt ohne Übergabestand — dieselbe Bedingung wie in
                  RequireSession, nur vorher sichtbar. */}
              <StepTab
                to="/editor"
                step={2}
                label={t('nav.editor')}
                disabled={session === null}
              />
            </li>
          </ul>
        </nav>

        <span className="flex-1" />

        {/* Datenschutz und Einstellungen stehen rechts und sind von jeder
            Ansicht aus erreichbar, gehören aber nicht zum Ablauf und tragen
            deshalb keine Ziffer. */}
        <Link to="/datenschutz" className={cn(LINK_CLASS, 'shrink-0 whitespace-nowrap')}>
          {t('nav.privacy')}
        </Link>
        <Link to="/settings" className={cn(LINK_CLASS, 'shrink-0 whitespace-nowrap')}>
          {t('nav.settings')}
        </Link>
      </header>

      {/* Wer blättert, entscheidet die Ansicht, nicht der Rahmen.

          Die Einstiegsseite regelt ihre Höhe selbst: zwei Spalten, die für
          sich blättern, während die Seite als Ganzes stehen bleibt. Bekäme
          sie hier zusätzlich einen Scrollbereich, gäbe es zwei ineinander.

          Alle übrigen Ansichten sind fortlaufender Text und blättern wie
          gewohnt — sonst schneidet der Rahmen sie ab, ohne dass man an den
          Rest herankommt. */}
      <main
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          ownsHeight ? '' : 'overflow-y-auto',
        )}
      >
        <Outlet />
      </main>
    </div>
  )
}
