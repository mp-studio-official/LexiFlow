import { NavLink, Outlet, Link } from 'react-router-dom';
import { Logo, LogoMark } from './Logo';
import { APP_CLAIM } from '../pwa/manifest';

/**
 * App-Shell als **Werkbank** (Sprint 4B.3, Entwurfsroute B).
 *
 * ## Was sich gegenüber dem Creator-Studio geändert hat
 *
 * Vorher: eine ganzbreite Kopfzeile in Aubergine, darunter eine schwebende,
 * abgerundete Navigationsfläche *innerhalb* der Inhaltsspalte. Zwei dunkle
 * Flächen übereinander, dazwischen ein Streifen Papier – und die Marke stand
 * ganz oben allein in einer Zeile, die sonst nichts tat.
 *
 * Jetzt: **eine** dunkle Fläche, bündig am linken Fensterrand, über die volle
 * Höhe. Sie trägt das Zeichen oben links und die drei Bereiche darunter. Der
 * Rest ist Papier. Das ist der Unterschied zwischen einer Website mit
 * Navigation und einem Werkzeug mit einem Ort für die Arbeit.
 *
 * ## Warum die Schiene nicht 56 px schmal ist
 *
 * Im Entwurf war sie das, mit senkrecht gestellten Beschriftungen. Senkrechte
 * Schrift liest sich messbar langsamer, und die drei Bereiche verlieren dabei
 * ihre Erklärungen („Deine Pakete und Runden“). Übernommen ist deshalb die
 * **Haltung** – eine durchgehende dunkle Kante statt eines schwebenden
 * Kastens –, nicht die Breite. Wer den Entwurf danebenlegt, sieht dieselbe
 * Seite; wer ihn liest, sieht sie schneller.
 *
 * ## Zwei Navigationen, eine Wahrheit
 *
 * Auf schmalen Fenstern bleibt die Leiste am unteren Rand, unverändert.
 * Sichtbar ist immer genau eine von beiden; die andere ist per `display: none`
 * auch aus dem Accessibility-Baum entfernt, damit eine Vorlesehilfe die drei
 * Bereiche nicht doppelt vorfindet.
 */

interface NavItem {
  to: string;
  label: string;
  /** Kurzer Zusatz für die Schiene – erklärt den Bereich, ohne zu dozieren. */
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

      {/*
        Die schmale Kopfzeile bleibt – aber nur für schmale Fenster. Auf
        breiten trägt die Schiene das Zeichen, und eine zweite Marke darüber
        wäre eine Dopplung.
      */}
      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" to="/" aria-label="LexiFlow – Startseite">
            <Logo tone="on-dark" size={28} />
          </Link>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-nav" aria-label="Hauptnavigation">
          {/*
            Das Zeichen oben links, und es tut etwas: Es führt zur Startseite.
            Ein Markenzeichen in einer Ecke, das nichts tut, ist eine verpasste
            Gelegenheit.
          */}
          <Link className="app-nav__brand" to="/" aria-label="LexiFlow – Startseite">
            <LogoMark size={30} tone="on-dark" />
            <span className="app-nav__wordmark">LexiFlow</span>
          </Link>

          <ul className="app-nav__list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                {/*
                  `aria-label` hält den Namen kurz: „Lernen“, nicht „Lernen
                  Deine Pakete und Runden“. Der Zusatz ist für das Auge da –
                  wer die Schaltfläche per Sprache anspricht oder in einer
                  Elementliste sucht, will den Ort, nicht seine Erklärung.
                */}
                <NavLink className="app-nav__link" to={item.to} aria-label={item.label}>
                  <span className="app-nav__mark" aria-hidden="true" />
                  <span className="app-nav__text">
                    <span className="app-nav__label">{item.label}</span>
                    <span className="app-nav__hint">{item.hint}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="app-nav__note">
            Alles bleibt auf diesem Gerät. Keine Konten, keine Auswertung, keine Werbung.
          </p>
        </nav>

        <div className="app-work">
          <main className="app-main" id="inhalt" tabIndex={-1}>
            <Outlet />
          </main>

          <footer className="app-footer">
            <div className="app-footer__inner">
              <p className="app-footer__claim">{APP_CLAIM}</p>
              <p style={{ margin: 0 }}>
                Freiwillige Lernhilfe. Alle Lernstände bleiben auf diesem Gerät.
              </p>
              <p style={{ margin: 0 }}>
                Keine Konten, keine Auswertung durch Lehrkräfte, keine Werbung.
              </p>
            </div>
          </footer>
        </div>
      </div>

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
