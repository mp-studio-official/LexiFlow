import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProviderRegistry } from './providers/ProviderContext';
import { AppShell } from './ui/AppShell';
import { HomePage } from './routes/HomePage';
import { PrivacyPage } from './routes/PrivacyPage';
import { TeacherHomePage } from './routes/teacher/TeacherHomePage';
import { ImportWizardPage } from './routes/teacher/ImportWizardPage';
import { PackEditorPage } from './routes/teacher/PackEditorPage';
import { StudentHomePage } from './routes/student/StudentHomePage';
import { PackDetailPage } from './routes/student/PackDetailPage';
import { SessionPage } from './routes/student/SessionPage';

/**
 * Durchsehen und Karten laden erst beim Aufruf.
 *
 * Beide Ansichten sind freiwillige Lernwege, die nicht jede Sitzung öffnet –
 * und beide sollen weder die Startseite noch die Lehrkraft-Werkstätten
 * vergrößern.
 */
const VocabBrowsePage = lazy(() => import('./routes/student/VocabBrowsePage'));
const CardStudyPage = lazy(() => import('./routes/student/CardStudyPage'));
const SelfTestPage = lazy(() => import('./routes/student/SelfTestPage'));
const FreePracticeSetupPage = lazy(() => import('./routes/student/FreePracticeSetupPage'));

/**
 * Die Vokabelliste lädt erst, wenn jemand sie aufruft.
 *
 * Sie ist eine Nebenfunktion – wichtig, wenn man sie braucht, und sonst
 * Gewicht. Vor allem aber wandert sie in **jede** portable Datei; dort zählt
 * jedes Kilobyte doppelt, weil die Datei per E-Mail weitergegeben wird.
 */
const PackListPage = lazy(() => import('./routes/PackListPage'));

/**
 * Die Lernbereiche laden erst beim Aufruf.
 *
 * Sie gehören in die Lehrkraftanwendung und nur dorthin – eine große Funktion,
 * die eine Lehrkraft ein paarmal im Halbjahr braucht. Sie soll die Startseite
 * nicht vergrößern.
 */
const LearningAreaPage = lazy(() => import('./routes/teacher/LearningAreaPage'));

/**
 * Der optionale Gemini-Assistent lädt erst, wenn jemand ihn einrichtet.
 *
 * `lazy` ist hier nicht nur eine Größenfrage. Diese Route ist die einzige
 * Stelle, die den Gemini-Anbieter überhaupt importiert – der ganze Zweig samt
 * Endpunkt, Schlüsselverwaltung und Anfragebau landet damit in einem eigenen
 * Bündel. `StudentApp.tsx` kennt die Route nicht, und die portable Lern-Datei
 * bekommt so weder Anbietercode noch die Adresse zu sehen. Ein Artefakttest
 * hält das fest.
 */
const AssistantSettingsPage = lazy(() => import('./routes/teacher/AssistantSettingsPage'));

/**
 * `HashRouter` statt `BrowserRouter`: Die App wird statisch ausgeliefert
 * (z. B. GitHub Pages) und muss auch beim direkten Aufruf einer Unterseite
 * funktionieren – ohne Server-Rewrite.
 */
export function App() {
  return (
    <ProviderRegistry>
      <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="datenschutz" element={<PrivacyPage />} />

          <Route path="material" element={<TeacherHomePage />} />
          <Route path="material/import" element={<ImportWizardPage />} />
          {/*
            Die Lernbereiche liegen **vor** `material/:packId` – sonst läse
            der Router „lernbereiche“ als Paketkennung und zeigte einen
            Paketeditor für ein Paket, das es nicht gibt.
          */}
          <Route
            path="material/lernbereiche/neu"
            element={
              <Suspense fallback={<p className="muted">Lernbereich wird geladen …</p>}>
                <LearningAreaPage />
              </Suspense>
            }
          />
          <Route
            path="material/lernbereiche/:areaId"
            element={
              <Suspense fallback={<p className="muted">Lernbereich wird geladen …</p>}>
                <LearningAreaPage />
              </Suspense>
            }
          />
          {/* Ebenfalls vor `material/:packId` – siehe oben. */}
          <Route
            path="material/assistent"
            element={
              <Suspense fallback={<p className="muted">Einstellungen werden geladen …</p>}>
                <AssistantSettingsPage />
              </Suspense>
            }
          />
          <Route path="material/:packId" element={<PackEditorPage />} />
          <Route
            path="material/:packId/liste"
            element={
              <Suspense fallback={<p className="muted">Vokabelliste wird geladen …</p>}>
                <PackListPage area="teacher" />
              </Suspense>
            }
          />

          <Route path="lernen" element={<StudentHomePage />} />
          <Route path="lernen/:packId" element={<PackDetailPage />} />
          <Route
            path="lernen/:packId/liste"
            element={
              <Suspense fallback={<p className="muted">Vokabelliste wird geladen …</p>}>
                <PackListPage area="student" />
              </Suspense>
            }
          />
          <Route path="lernen/:packId/uebung" element={<SessionPage />} />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </HashRouter>
    </ProviderRegistry>
  );
}
