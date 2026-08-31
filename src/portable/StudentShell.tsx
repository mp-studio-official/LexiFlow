import { Link, Outlet } from 'react-router-dom';
import { Alert } from '../ui/components';
import { Logo } from '../ui/Logo';
import { storageNotice, type StorageState } from './storage';

/**
 * Die Hülle der portablen Schülerdatei.
 *
 * Bewusst **nicht** die `AppShell`: Diese Datei hat keine Lehrkraft-Bereiche,
 * die man verstecken müsste – sie enthält sie gar nicht. Eine Navigation mit
 * genau einem Ziel wäre Zierrat, deshalb steht hier nur die Marke, der Inhalt
 * und ein ehrlicher Hinweis auf den Speicherort des Lernstands.
 */
export function StudentShell({
  title,
  storage,
}: {
  title: string;
  storage: StorageState;
}) {
  return (
    <div className="app app--portable">
      <a className="skip-link" href="#inhalt">
        Zum Inhalt springen
      </a>

      <header className="app-header">
        <div className="app-header__inner">
          <Link className="brand" to="/" aria-label={`LexiFlow – ${title}`}>
            <Logo tone="on-dark" size={28} />
            <span className="brand__suffix">{title}</span>
          </Link>
        </div>
      </header>

      <div className="app-body">
        <main className="app-main" id="inhalt" tabIndex={-1}>
          {storage === 'gesperrt' ? (
            <Alert tone="warning" title="Kein dauerhafter Speicher">
              {storageNotice('gesperrt')}
            </Alert>
          ) : null}
          <Outlet />
        </main>
      </div>

      <footer className="app-footer">
        <div className="app-footer__inner">
          <p style={{ margin: 0 }}>
            Diese Datei arbeitet vollständig auf deinem Gerät. Sie sendet nichts, sie braucht kein
            Konto und kein Internet.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            {storage === 'gesperrt' ? storageNotice('gesperrt') : storageNotice('verfuegbar')}
          </p>
        </div>
      </footer>
    </div>
  );
}
