import { NavLink, Outlet, Link } from 'react-router-dom';

/**
 * App-Shell im Creator-Studio-Zuschnitt (Sprint 3A).
 *
 * Zwei Navigationen, eine Wahrheit: Auf breiten Fenstern steht eine ruhige,
 * schmale Seitenspalte neben dem Inhalt, auf schmalen eine erreichbare Leiste
 * am unteren Rand. Immer sichtbar ist genau eine von beiden – die jeweils
 * andere ist per `display: none` auch aus dem Accessibility-Baum entfernt,
 * damit Screenreader die drei Bereiche nicht doppelt vorfinden.
 *
 * Die Navigation ist bewusst zurückhaltend: Der Inhalt trägt die Seite.
 */

interface NavItem {
  to: string;
  label: string;
  /** Kurzer Zusatz für die Seitenspalte – erklärt den Bereich, ohne zu dozieren. */
  hint: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/lernen', label: 'Lernen', hint: 'Deine Pakete und Runden' },
  { to: '/material', label: 'Erstellen', hint: 'Material aus Text, Liste oder Thema' },
  { to: '/datenschutz', label: 'Daten', hint: 'Was hier bleibt und was nicht' },
];

export function AppShell() {
  return (
    <div className="app">
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>

      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" to="/">
            LexiFlow <span>Vocab Studio</span>
          </Link>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-nav" aria-label="Hauptnavigation">
          <ul className="app-nav__list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink className="app-nav__link" to={item.to}>
                  <span className="app-nav__mark" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="app-nav__note">
            Alles bleibt auf diesem Gerät. Keine Konten, keine Auswertung, keine Werbung.
          </p>
        </nav>

        <main className="app-main" id="inhalt" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <footer className="app-footer">
        <div className="app-footer__inner">
          <p style={{ margin: 0 }}>
            Freiwillige Lernhilfe. Alle Lernstände bleiben auf diesem Gerät.
          </p>
          <p style={{ margin: 0 }}>
            Keine Konten, keine Auswertung durch Lehrkräfte, keine Werbung.
          </p>
        </div>
      </footer>

      <nav className="bottom-nav" aria-label="Bereichsnavigation">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} className="bottom-nav__link" to={item.to}>
            <span className="bottom-nav__mark" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
