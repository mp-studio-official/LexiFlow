import { Suspense, lazy, useMemo } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RepositoryProvider } from '../application/RepositoryContext';
import { createFakeCloud } from '../application/fakeCloudRepositories';
import { createCloudRepositories } from '../cloud/createCloudRepositories';
import { readHostedConfig, type HostedConfigResult } from '../runtime/hostedConfig';
import { LearnerShell, PublicShell, TeacherShell } from './PortalShell';
import { RequireArea } from './RequireArea';
import { SessionProvider } from './SessionContext';
import { JoinPage } from './pages/JoinPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { NewPasswordPage } from './pages/NewPasswordPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { PortalPrivacyPage } from './pages/PortalPrivacyPage';
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
      {/* Öffentlich: Ohne diese käme niemand herein. */}
      <Route element={<PublicShell />}>
        <Route index element={<LandingPage />} />
        <Route path="anmelden" element={<LoginPage />} />
        <Route path="beitreten" element={<JoinPage />} />
        <Route path="wiederherstellen" element={<RecoveryPage />} />
        {/*
          Das Ziel des Verweises aus der Wiederherstellungs-E-Mail. Öffentlich,
          weil die Sitzung in diesem Moment erst entsteht – der Code aus der
          Adresse ist der Nachweis, nicht eine vorherige Anmeldung.
        */}
        <Route path="kennwort-neu" element={<NewPasswordPage />} />
        <Route path="datenschutz" element={<PortalPrivacyPage />} />
      </Route>

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
        <Route
          path="ki/*"
          element={
            <Suspense fallback={<Laedt was="Der KI-Bereich" />}>
              <TeacherArea section="ki" />
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
/** Aus der Umgebung: Soll statt der Cloud die kontrollierte Fälschung laufen? */
export function fälschungGewünscht(env: Record<string, unknown>): boolean {
  /*
    Nur auf ausdrückliche Ansage. Ein stiller Rückfall auf die Fälschung wäre
    die schlimmste Variante: Das Portal liefe, die Anmeldung funktionierte mit
    erfundenen Konten, und niemand merkte, dass nichts gespeichert wird.

    Die Fahne gilt bewusst auch in einem gebauten Bündel – die Ende-zu-Ende-
    Prüfungen brauchen ein Portal, das sich anmelden lässt, ohne dass je eine
    Anfrage hinausgeht. Der Preis dafür ist das Band unten: Eine so gebaute
    Auslieferung sagt auf jeder Seite, was sie ist.
  */
  return String(env['VITE_LEXIFLOW_FAKE_CLOUD'] ?? '') === '1';
}

/**
 * Das Band über einer Testfassung.
 *
 * Nicht dekorativ, sondern die Bedingung dafür, dass es die Fahne überhaupt
 * gibt: Eine Fassung mit erfundenen Konten, die aussieht wie das Portal, wäre
 * eine Falle – für die Person davor und für jeden, der einen Screenshot sieht.
 */
function Testband() {
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: '0.5rem 1rem',
        /*
          Aubergine mit Pergamentschrift und einer Tomatenkante – nicht
          Tomate mit Weiß. Das war der erste Entwurf, und er fiel in der
          Barrierefreiheitsprüfung durch: Weiß auf #FF2E2D ergibt rund 3,7:1
          und damit weniger als die geforderten 4,5:1. Ein Warnband, das
          manche Menschen nicht lesen können, ist kein Warnband.
        */
        background: 'var(--brand-aubergine, #2f092d)',
        color: 'var(--brand-parchment, #f8efe3)',
        borderBottom: '4px solid var(--brand-tomato, #ff2e2d)',
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      Testfassung ohne Server: erfundene Konten, nichts wird gespeichert.
    </p>
  );
}

export function HostedApp({
  repositories,
  env = import.meta.env as unknown as Record<string, unknown>,
  config = readHostedConfig(import.meta.env as unknown as Record<string, string | undefined>),
}: {
  repositories?: Repositories;
  /** Nur für Tests: die Bauzeitumgebung. */
  env?: Record<string, unknown>;
  config?: HostedConfigResult;
} = {}) {
  const fälschung = fälschungGewünscht(env);

  const speicher = useMemo<Repositories>(() => {
    if (repositories) return repositories;
    if (fälschung) return createFakeCloud().repositories;
    if (config.ok) {
      return createCloudRepositories({
        config: config.config,
        origin: window.location.origin,
        base: String(env['BASE_URL'] ?? '/'),
      });
    }
    // Ohne Konfiguration entsteht nichts – die Seite unten sagt, was fehlt.
    return {};
  }, [repositories, fälschung, config, env]);

  if (!config.ok && !repositories && !fälschung) {
    /*
      Ohne Konfiguration, ohne übergebene Speicher und ohne ausdrücklich
      gewünschte Fälschung gibt es nichts zu zeigen außer der Auskunft, was
      fehlt. Weiß bleiben wäre die schlechteste Antwort.
    */
    return <SetupPage result={config} />;
  }

  return (
    <RepositoryProvider value={speicher}>
      <SessionProvider>
        {fälschung ? <Testband /> : null}
        <HashRouter>
          <HostedRoutes />
        </HashRouter>
      </SessionProvider>
    </RepositoryProvider>
  );
}
