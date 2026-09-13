import { Route, Routes } from 'react-router-dom';
import { Alert, Card } from '../../ui/components';
import { CourseDetailPage } from './CourseDetailPage';
import { CoursesPage } from './CoursesPage';

/**
 * Der Lehrkraftbereich des Portals – das eine Bündel, das Lernende nie holen.
 *
 * ## Warum diese Datei heute fast leer ist
 *
 * Sie ist der **Ankerpunkt für den Code-Split**, und der muss stehen, bevor
 * etwas darin liegt. Alles, was ab Phase 4 hinzukommt – Kursverwaltung,
 * Einladungen, Paketveröffentlichung, das KI-Gateway – wird von hier aus
 * importiert und landet damit in genau diesem Bündel.
 *
 * Wäre der Split erst am Ende eingezogen worden, hätte jede Ansicht dazwischen
 * ihre Importe irgendwo abgelegt, und das Entflechten wäre die Art Arbeit, bei
 * der man am Ende die Zusage aufgibt, statt sie einzulösen.
 *
 * ## Warum ein `section`-Wert und keine eigenen `Routes`
 *
 * Drei Adressen führen hierher: `/kurse`, `/material`, `/verwaltung`. Ein
 * eigener `Routes`-Block müsste raten, unter welcher von ihnen er gerade
 * hängt – und riete beim ersten Versuch falsch, weil unter jeder von ihnen der
 * Restpfad leer ist und damit `index` greift. Der Abschnitt kommt deshalb von
 * dort, wo er bekannt ist: aus der Route. Eigene Unterrouten bekommt jeder
 * Abschnitt in seiner Phase, dann innerhalb seiner eigenen Datei.
 */

export const TEACHER_SECTIONS = ['kurse', 'material', 'verwaltung'] as const;
export type TeacherSection = (typeof TEACHER_SECTIONS)[number];

interface Platz {
  titel: string;
  phase: string;
  text: string;
}

const PLAETZE: Readonly<Record<TeacherSection, Platz>> = {
  kurse: {
    titel: 'Kurse',
    phase: 'Phase 4',
    text: 'Lerngruppen anlegen, Einladungscodes ausgeben und zurückziehen, Mitglieder sehen und entfernen.',
  },
  material: {
    titel: 'Material',
    phase: 'Phase 5',
    text: 'Pakete im Konto anlegen, aus der lokalen Fassung übernehmen, als unveränderliche Revision veröffentlichen und einem Kurs zuweisen.',
  },
  verwaltung: {
    titel: 'Verwaltung',
    phase: 'Phase 3',
    text: 'Konten und Rollen. Auch hier gilt: keine Einsicht in individuelle Lernstände – die gibt es in keiner Rolle.',
  },
};

export function TeacherArea({ section }: { section: TeacherSection }) {
  if (section === 'kurse') {
    /*
      Der erste Abschnitt mit eigenen Unterseiten. Er bekommt deshalb einen
      eigenen `Routes`-Block – innerhalb von `/kurse/*`, wo der Restpfad
      eindeutig ist. Die anderen Abschnitte bekommen ihren, wenn sie Inhalt
      haben; einer auf Vorrat wäre eine Route ohne Ziel.
    */
    return (
      <Routes>
        <Route index element={<CoursesPage />} />
        <Route path=":courseId" element={<CourseDetailPage />} />
      </Routes>
    );
  }

  const platz = PLAETZE[section];

  return (
    <div className="stack">
      <h1>{platz.titel}</h1>
      <Alert tone="info" title={`Kommt in ${platz.phase}`}>
        {platz.text}
      </Alert>
      <Card quiet>
        <p style={{ margin: 0 }}>
          Bis dahin bleibt die portable Lehrkraftdatei der vollständige Weg: Sie kann alles, was
          LexiFlow heute kann, und braucht dafür kein Konto.
        </p>
      </Card>
    </div>
  );
}

export default TeacherArea;
