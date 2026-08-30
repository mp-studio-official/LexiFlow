import { NavLink, Outlet, Link } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="app">
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" to="/">
            LexiFlow <span>Vokabeltrainer</span>
          </Link>
          <nav className="app-nav" aria-label="Hauptnavigation">
            <NavLink to="/lernen">Lernen</NavLink>
            <NavLink to="/material">Material erstellen</NavLink>
            <NavLink to="/datenschutz">Daten &amp; Datenschutz</NavLink>
          </nav>
        </div>
      </header>

      <main className="app-main" id="inhalt" tabIndex={-1}>
        <Outlet />
      </main>

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
    </div>
  );
}
