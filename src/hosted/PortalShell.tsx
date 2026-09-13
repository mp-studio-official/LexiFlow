import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useOptionalRepository, useRuntimeMode } from '../application/RepositoryContext';
import { Copyright } from '../ui/Copyright';
import { Logo, LogoMark } from '../ui/Logo';
import { mayEnter } from '../runtime/access';
import { useSession } from './SessionContext';

/**
 * Die Hüllen des Portals – zwei, und sie unterscheiden sich nicht nur im Menü.
 *
 * ## Warum zwei Shells und nicht eine mit Bedingungen
 *
 * Eine gemeinsame Shell mit `{istLehrkraft && <Werkstatt/>}` sieht sparsamer
 * aus und ist es nicht: Der Lehrkraftteil läge dann im selben Bündel wie der
 * Lernteil, und die Zusage „eine lernende Person bekommt die Werkstatt nicht“
 * hinge an einer Bedingung statt an einem Import. Getrennte Shells erlauben
 * das, worauf es ankommt – der Lehrkraftbereich wird **lazy** geladen und
 * kommt bei Lernenden nie an.
 *
 * ## Was beide gemeinsam haben
 *
 * Die Marke, das Sprungziel, die Fußzeile. Das steht hier, damit es sich nicht
 * auseinanderentwickelt.
 */

interface NavPunkt {
  to: string;
  label: string;
  hint: string;
}

function Rahmen({ nav, hinweis }: { nav: readonly NavPunkt[]; hinweis: string }) {
  const auth = useOptionalRepository('auth');
  const { status } = useSession();
  const navigate = useNavigate();

  return (
    <div className="app">
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>

      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" to="/" aria-label="LexiFlow – Startseite">
            <Logo tone="on-dark" size={28} />
          </Link>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-nav" aria-label="Hauptnavigation">
          <Link className="app-nav__brand" to="/" aria-label="LexiFlow – Startseite">
            <LogoMark size={30} tone="on-dark" />
            <span className="app-nav__wordmark">LexiFlow</span>
          </Link>

          <ul className="app-nav__list">
            {nav.map((punkt) => (
              <li key={punkt.to}>
                <NavLink className="app-nav__link" to={punkt.to} aria-label={punkt.label}>
                  <span className="app-nav__mark" aria-hidden="true" />
                  <span className="app-nav__text">
                    <span className="app-nav__label">{punkt.label}</span>
                    <span className="app-nav__hint">{punkt.hint}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>

          <p className="app-nav__note">{hinweis}</p>

          {status === 'angemeldet' && auth ? (
            <button
              type="button"
              className="app-nav__link"
              onClick={() => {
                void auth.signOut().then(() => navigate('/', { replace: true }));
              }}
            >
              <span className="app-nav__text">
                <span className="app-nav__label">Abmelden</span>
              </span>
            </button>
          ) : null}
        </nav>

        <div className="app-work">
          <main className="app-main" id="inhalt" tabIndex={-1}>
            <Outlet />
          </main>

          <footer className="app-footer">
            <div className="app-footer__inner">
              <p style={{ margin: 0 }}>{hinweis}</p>
              <Copyright />
            </div>
          </footer>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Bereichsnavigation">
        {nav.map((punkt) => (
          <NavLink key={punkt.to} className="bottom-nav__link" to={punkt.to}>
            <span className="bottom-nav__mark" aria-hidden="true" />
            {punkt.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const LERN_NAV: readonly NavPunkt[] = [
  { to: '/lernen', label: 'Lernen', hint: 'Deine Kurse und Pakete' },
  { to: '/beitreten', label: 'Beitreten', hint: 'Neuer Kurs per Code' },
  { to: '/datenschutz', label: 'Daten', hint: 'Was gespeichert wird' },
];

/**
 * Die Hülle für Lernende.
 *
 * Sie enthält keinen Verweis auf die Werkstatt – nicht, weil er versteckt
 * wäre, sondern weil `LERN_NAV` ihn nicht kennt und das lazy geladene
 * Lehrkraftbündel hier nie angefordert wird.
 */
export function LearnerShell() {
  return (
    <Rahmen
      nav={LERN_NAV}
      hinweis="Dein Lernstand gehört dir. Lehrkräfte sehen nicht, wie oft du geübt hast."
    />
  );
}

const LEHR_NAV: readonly NavPunkt[] = [
  { to: '/kurse', label: 'Kurse', hint: 'Lerngruppen und Einladungen' },
  { to: '/material', label: 'Material', hint: 'Pakete erstellen und veröffentlichen' },
  { to: '/lernen', label: 'Lernen', hint: 'Dein eigenes Üben' },
  { to: '/datenschutz', label: 'Daten', hint: 'Was gespeichert wird' },
];

const VERWALTUNG: NavPunkt = { to: '/verwaltung', label: 'Verwaltung', hint: 'Konten und Rollen' };

/** Die Hülle für Lehrkräfte – mit Werkstatt, und für die Verwaltung einem Punkt mehr. */
export function TeacherShell() {
  const { role } = useSession();
  const mode = useRuntimeMode();
  const nav = mayEnter({ role, area: 'admin', mode }) ? [...LEHR_NAV, VERWALTUNG] : LEHR_NAV;

  return (
    <Rahmen
      nav={nav}
      hinweis="Du siehst, wer in deinen Kursen ist – nicht, wie viel jemand geübt hat."
    />
  );
}
