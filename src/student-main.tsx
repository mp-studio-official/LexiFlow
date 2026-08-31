import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readEmbeddedPackFromDocument, studentDatabaseName } from './portable/embedded';
import './styles/global.css';

/**
 * Einstiegspunkt der portablen Schülerdatei.
 *
 * Zwei Dinge müssen **vor** der Anwendung passieren, deshalb ist dieser Datei
 * die Reihenfolge wichtiger als die Kürze:
 *
 * 1. Das eingebettete Paket wird gelesen und gegen das Schema geprüft. Ist es
 *    beschädigt oder fehlt es, erscheint eine verständliche Seite statt eines
 *    weißen Fensters.
 * 2. Erst danach wird der Datenbankname gesetzt und die App **dynamisch**
 *    geladen. Ein statischer Import würde `data/db.ts` zuerst auswerten – dann
 *    stünde der Name schon fest (siehe dort).
 *
 * Ein Service Worker wird hier bewusst nirgends registriert: Unter `file://`
 * ist das nicht möglich, und diese Datei braucht keinen – sie ist vollständig.
 */

function mountRoot(): Root {
  const container = document.getElementById('root');
  if (!container) throw new Error('Wurzelelement #root nicht gefunden.');
  return createRoot(container);
}

function renderProblem(root: Root, title: string, lines: readonly string[]): void {
  root.render(
    <StrictMode>
      <div className="app app--portable">
        <div className="app-body">
          <main className="app-main" id="inhalt">
            <div className="stack">
              <p className="eyebrow">LexiFlow</p>
              <h1>{title}</h1>
              <div className="alert alert--error" role="alert">
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <p className="muted">
                Bitte wende dich an deine Lehrkraft – sie kann die Datei neu erzeugen. Es geht dabei
                nichts verloren: Die Datei enthält nur Vokabeln.
              </p>
            </div>
          </main>
        </div>
      </div>
    </StrictMode>,
  );
}

const root = mountRoot();
const embedded = readEmbeddedPackFromDocument();

if (!embedded.ok) {
  renderProblem(root, 'Diese Datei lässt sich nicht öffnen', embedded.errors);
} else {
  const pack = { meta: embedded.pack.meta, entries: embedded.pack.entries };
  const flags = globalThis as { __LEXIFLOW_DB__?: string; __LEXIFLOW_SINGLE_PACK__?: boolean };
  flags.__LEXIFLOW_DB__ = studentDatabaseName(pack.meta.id);
  // Diese Datei kennt genau ein Paket – die Oberfläche darf keine Bibliothek
  // versprechen, die es hier nicht gibt.
  flags.__LEXIFLOW_SINGLE_PACK__ = true;

  void import('./StudentApp')
    .then(({ StudentApp }) => {
      root.render(
        <StrictMode>
          <StudentApp pack={pack} />
        </StrictMode>,
      );
    })
    .catch(() => {
      renderProblem(root, 'Diese Datei ist unvollständig', [
        'Der Vokabeltrainer konnte nicht geladen werden.',
      ]);
    });
}
