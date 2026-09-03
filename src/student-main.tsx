import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readEmbeddedAreaFromDocument, studentDatabaseName } from './portable/embedded';
import { areaPacks } from './domain/learningArea';
import './styles/global.css';

/**
 * Einstiegspunkt der portablen Schülerdatei.
 *
 * Zwei Dinge müssen **vor** der Anwendung passieren, deshalb ist dieser Datei
 * die Reihenfolge wichtiger als die Kürze:
 *
 * 1. Der eingebettete Lernbereich wird gelesen und gegen das Schema geprüft.
 *    Ist er beschädigt oder fehlt er, erscheint eine verständliche Seite statt
 *    eines weißen Fensters.
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
const embedded = readEmbeddedAreaFromDocument();

if (!embedded.ok) {
  renderProblem(root, 'Diese Datei lässt sich nicht öffnen', embedded.errors);
} else {
  const packs = areaPacks(embedded.area);
  const flags = globalThis as {
    __LEXIFLOW_DB__?: string;
    __LEXIFLOW_SINGLE_PACK__?: boolean;
    __LEXIFLOW_PORTABLE_AREA__?: boolean;
  };
  /*
    Der Lernstand hängt am **Bereich** und nicht am Paket. Für eine Datei mit
    einem einzigen Paket ist das dieselbe Kennung wie früher – deshalb findet
    eine Neuausgabe den Stand der vorigen Datei wieder.
  */
  flags.__LEXIFLOW_DB__ = studentDatabaseName(embedded.area.id);
  /*
    Zwei Kennzeichnungen, weil es zwei verschiedene Fragen sind:

    - `SINGLE_PACK`: Gibt es hier überhaupt etwas zum Zurückgehen? Bei einem
      Paket ist eine Liste „Alle Pakete“ eine Seite mit einer Zeile.
    - `PORTABLE_AREA`: Wo liegt diese Liste? In der Lehrkraftanwendung unter
      `/lernen`, in dieser Datei auf der Startseite – `/lernen` gibt es hier
      gar nicht.
  */
  flags.__LEXIFLOW_SINGLE_PACK__ = packs.length === 1;
  flags.__LEXIFLOW_PORTABLE_AREA__ = true;

  void import('./StudentApp')
    .then(({ StudentApp }) => {
      root.render(
        <StrictMode>
          <StudentApp area={embedded.area} packs={packs} />
        </StrictMode>,
      );
    })
    .catch(() => {
      renderProblem(root, 'Diese Datei ist unvollständig', [
        'Der Vokabeltrainer konnte nicht geladen werden.',
      ]);
    });
}
