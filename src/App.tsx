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
          <Route path="material/:packId" element={<PackEditorPage />} />

          <Route path="lernen" element={<StudentHomePage />} />
          <Route path="lernen/:packId" element={<PackDetailPage />} />
          <Route path="lernen/:packId/uebung" element={<SessionPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </HashRouter>
    </ProviderRegistry>
  );
}
