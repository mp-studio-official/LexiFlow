import { Suspense, lazy, useMemo } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { readHostedConfig, type HostedConfigResult } from '../runtime/hostedConfig';
import { PrivacyPage } from '../routes/PrivacyPage';
import { LearnerShell, TeacherShell } from './PortalShell';
import { RequireArea } from './RequireArea';
import { SessionProvider } from './SessionContext';
import { JoinPage } from './pages/JoinPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { SetupPage } from './pages/SetupPage';
import type { Repositories } from '../application/repositories';

/**
 * Das Webportal.
 *
 * ## Der Stand in Phase 1
 *
 * Diese Datei wird von `src/main.tsx` **noch nicht** gerendert – dort läuft
 * weiterhin `App`, unverändert. Das ist Absicht: Phase 1 soll an der
 * bestehenden Anwendung nichts ändern, und ein Portal ohne Datenbank (Phase 2)
 * und ohne Anmeldung (Phase 3) wäre eine Umleitung ins Leere. Der Wechsel
 * geschieht in Phase 3, wenn es etwas gibt, wohin man wechseln kann.
 *
 * Bis dahin ist das hier trotzdem kein Papier: Die Tests rendern diese
 * Routen, und die Entwicklungsfassung läuft gegen `createFakeCloud`.
 *
 * ## Der Code-Split ist die eigentliche Zusage
 *
 * `TeacherArea` und `LearnerArea` werden `lazy` geladen. Eine lernende Person
 * fordert das Lehrkraftbündel nie an – nicht, weil eine Bedingung es
 * verbirgt, sondern weil keine Route in ihrem Weg es importiert. Das ist am
 * Netzwerkverlauf nachprüfbar, und ab Phase 8 prüft es der Build.
 */

const TeacherArea = lazy(() => import('./teacher/TeacherArea'));
const LearnerArea = lazy(() => import('./learner/LearnerArea'));

function Laedt({ was }: { was: string }) {
  return <p className="muted">{was} wird geladen …</p>;
}

/**
 * Die Routen.
 *
 * Als eigene Komponente ohne Router und ohne Provider – so kann ein Test sie
 * in einen `MemoryRouter` mit einer beliebigen Adresse hängen, statt den
 * `HashRouter` zu bemühen.
 */
export function HostedRoutes() {
  return (
    <Routes>
      {/* Öffentlich: Ohne diese vier käme niemand herein. */}
      <Route index element={<LandingPage />} />
      <Route path="anmelden" element={<LoginPage />} />
      <Route path="beitreten" element={<JoinPage />} />
      <Route path="wiederherstellen" element={<RecoveryPage />} />
      <Route path="datenschutz" element={<PrivacyPage />} />

      <Route
        element={
          <RequireArea area="learner">
            <LearnerShell />
          </RequireArea>
        }
      >
        <Route
          path="lernen/*"
          element={
            <Suspense fallback={<Laedt was="Der Lernbereich" />}>
              <LearnerArea />
            </Suspense>
          }
        />
      </Route>

      <Route
        element={
          <RequireArea area="teacher">
            <TeacherShell />
          </RequireArea>
        }
      >
        <Route
          path="kurse/*"
          element={
            <Suspense fallback={<Laedt was="Die Kurse" />}>
              <TeacherArea section="kurse" />
            </Suspense>
          }
        />
        <Route
          path="material/*"
          element={
            <Suspense fallback={<Laedt was="Das Material" />}>
              <TeacherArea section="material" />
            </Suspense>
          }
        />
        {/*
          Die Verwaltung liegt im Lehrkraftbündel, hat aber ihren eigenen
          Riegel: `admin` ist enger als `teacher`, und der äußere Riegel prüft
          nur den weiteren der beiden.
        */}
        <Route
          path="verwaltung/*"
          element={
            <RequireArea area="admin">
              <Suspense fallback={<Laedt was="Die Verwaltung" />}>
                <TeacherArea section="verwaltung" />
              </Suspense>
            </RequireArea>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * Das Portal mit Speichern und Router.
 *
 * `repositories` ist überschreibbar, damit ein Test die Fassade nicht durch
 * Modulersatz verbiegen muss – und damit ab Phase 3 die echten Adapter an
 * dieselbe Stelle treten können, ohne dass hier mehr als eine Zeile wechselt.
 */
export function HostedApp({
  repositories,
  config = readHostedConfig(import.meta.env as unknown as Record<string, string | undefined>),
}: {
  repositories?: Repositories;
  config?: HostedConfigResult;
} = {}) {
  /*
    Der Fallback ist ausdrücklich die kontrollierte Fälschung und nicht etwa
    ein Supabase-Client: Solange Phase 2 nicht steht, gibt es keinen, und ein
    Import „auf Vorrat“ wäre genau der Code, den die portablen Bündel nie
    enthalten dürfen.
  */
  const speicher = useMemo(() => repositories ?? createFakeCloud().repositories, [repositories]);

  if (!config.ok && !repositories) {
    /*
      Ohne Konfiguration und ohne übergebene Speicher gibt es nichts zu zeigen
      außer der Auskunft, was fehlt. Mit übergebenen Speichern – Test,
      Entwicklungsfassung – ist die Konfiguration schlicht nicht nötig.
    */
    return <SetupPage result={config} />;
  }

  return (
    <RepositoryProvider value={speicher}>
      <SessionProvider>
        <HashRouter>
          <HostedRoutes />
        </HashRouter>
      </SessionProvider>
    </RepositoryProvider>
  );
}
