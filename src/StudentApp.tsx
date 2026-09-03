import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StudentShell } from './portable/StudentShell';
import { PortableHomePage } from './portable/PortableHomePage';
import { PackDetailPage } from './routes/student/PackDetailPage';
import { SessionPage } from './routes/student/SessionPage';
import { savePack } from './data/packRepo';
import { checkStorage, type StorageState } from './portable/storage';
import type { VocabPack } from './domain/schema';

const VocabBrowsePage = lazy(() => import('./routes/student/VocabBrowsePage'));
const CardStudyPage = lazy(() => import('./routes/student/CardStudyPage'));
const SelfTestPage = lazy(() => import('./routes/student/SelfTestPage'));
const FreePracticeSetupPage = lazy(() => import('./routes/student/FreePracticeSetupPage'));
const PackListPage = lazy(() => import('./routes/PackListPage'));

/**
 * Die portable Schüleranwendung.
 *
 * Sie versteckt die Lehrkraftseiten nicht – sie kennt sie nicht. `ImportWizard`,
 * `PackEditor`, `TeacherHome`, die Themenwerkstatt und die gesamte
 * Provider-Registrierung (Übersetzung, Sprachmodell) werden hier **nicht
 * importiert** und landen deshalb auch nicht im Bündel. Ein Aufruf von
 * `#/material` endet auf der Startseite, weil es diese Route nicht gibt.
 *
 * Alles Übrige ist dieselbe Anwendung: dieselben Routen, dieselben Komponenten,
 * dieselbe Domänenlogik. Der Schülerteil ist kein reduzierter Nachbau.
 */
export function StudentApp({ pack }: { pack: VocabPack }) {
  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState<StorageState>('unbekannt');

  useEffect(() => {
    let active = true;
    void (async () => {
      const check = await checkStorage();
      if (!active) return;
      setStorage(check.state);

      if (check.state === 'verfuegbar') {
        /*
          Das eingebettete Paket in die lokale Datenbank legen – damit laufen
          alle bestehenden Seiten unverändert weiter. `savePack` gleicht ab
          statt zu überschreiben: Bei einer erneut geöffneten Datei bleiben die
          Lernstände unveränderter Vokabeln erhalten.
        */
        try {
          await savePack(pack);
        } catch {
          if (active) setStorage('gesperrt');
        }
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [pack]);

  if (!ready) return <p className="muted">LexiFlow wird vorbereitet …</p>;

  if (storage === 'gesperrt') {
    return (
      <div className="app app--portable">
        <div className="app-body">
          <main className="app-main" id="inhalt">
            <div className="stack">
              <h1>{pack.meta.title}</h1>
              <div className="alert alert--warning" role="status">
                <strong>Kein dauerhafter Speicher</strong>
                <p style={{ margin: '0.4rem 0 0' }}>
                  Dieser Browser lässt für diese Datei keinen dauerhaften Speicher zu. Das Üben
                  funktioniert trotzdem – aber der Lernstand ist beim Schließen weg. Am
                  zuverlässigsten läuft die Datei in Chrome, Edge oder Firefox.
                </p>
              </div>
              <p className="muted">
                Deine Vokabeln stehen trotzdem bereit: Du kannst sie durchsehen und mit Karten
                lernen, ohne dass etwas gespeichert werden muss.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const packId = pack.meta.id;

  return (
    <HashRouter>
      <Routes>
        <Route element={<StudentShell title="Vokabeltrainer" storage={storage} />}>
          <Route index element={<PortableHomePage packId={packId} />} />
          <Route path="lernen/:packId" element={<PackDetailPage />} />
          <Route path="lernen/:packId/uebung" element={<SessionPage />} />
          <Route
            path="lernen/:packId/liste"
            element={
              <Suspense fallback={<p className="muted">Vokabelliste wird geladen …</p>}>
                <PackListPage area="student" />
              </Suspense>
            }
          />
          <Route
            path="lernen/:packId/durchsehen"
            element={
              <Suspense fallback={<p className="muted">Vokabelliste wird geladen …</p>}>
                <VocabBrowsePage />
              </Suspense>
            }
          />
          <Route
            path="lernen/:packId/karten"
            element={
              <Suspense fallback={<p className="muted">Karten werden geladen …</p>}>
                <CardStudyPage />
              </Suspense>
            }
          />
          <Route
            path="lernen/:packId/selbsttest"
            element={
              <Suspense fallback={<p className="muted">Selbsttest wird geladen …</p>}>
                <SelfTestPage />
              </Suspense>
            }
          />
          <Route
            path="lernen/:packId/frei"
            element={
              <Suspense fallback={<p className="muted">Einrichtung wird geladen …</p>}>
                <FreePracticeSetupPage />
              </Suspense>
            }
          />
          {/* Alles Unbekannte – auch jede Lehrkraftadresse – endet hier. */}
          <Route path="lernen" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
