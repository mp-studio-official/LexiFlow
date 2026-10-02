import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Card, EmptyState } from '../../ui/components';
import type { Course, PackRevision } from '../../application/repositories';

/**
 * Der Lernbereich des Portals.
 *
 * ## Was hier schon funktioniert
 *
 * Die Kursliste. Sie liest über `CourseRepository` und weiß nicht, ob dahinter
 * eine Map oder Postgres liegt – genau dafür gibt es die Verträge. In Phase 1
 * liegt eine Map dahinter (siehe `fakeCloudRepositories.ts`); ab Phase 4 ist
 * es die Datenbank, ohne dass diese Datei sich ändert.
 *
 * ## Das Üben
 *
 * Seit Phase 6 dabei – in `PracticePage`, lazy geladen, weil es die
 * Aufgabenlogik ins Bündel zieht und eine Lehrkraft sie nie braucht. Die
 * Übung selbst ist dieselbe wie ohne Konto; nur der Lernstand geht ins Konto
 * statt in IndexedDB.
 */

const PracticePage = lazy(() => import('./PracticePage'));
import { UebenPage } from './UebenPage';
import { HeutePage } from './HeutePage';
import { FortschrittPage } from './FortschrittPage';
import { PaketAnsicht } from './PaketAnsicht';
import { Verbindungsfehler } from '../verbindung';

/*
  Die vier vorhandenen Ansichten (5B.15) — lazy, weil sie nur erreicht, wer
  eine davon wirklich öffnet. Sie stammen aus der Fassung ohne Konto und
  werden **unverändert** benutzt; was ihnen fehlt, ist allein die Herkunft des
  Pakets, und die reicht `PaketAnsicht` herein.
*/
const CardStudyPage = lazy(() =>
  import('../../routes/student/CardStudyPage').then((m) => ({ default: m.CardStudyPage })),
);
const SelfTestPage = lazy(() =>
  import('../../routes/student/SelfTestPage').then((m) => ({ default: m.SelfTestPage })),
);
const VocabBrowsePage = lazy(() =>
  import('../../routes/student/VocabBrowsePage').then((m) => ({ default: m.VocabBrowsePage })),
);
const FreePracticeSetupPage = lazy(() =>
  import('../../routes/student/FreePracticeSetupPage').then((m) => ({
    default: m.FreePracticeSetupPage,
  })),
);

function Kursliste() {
  const courses = useOptionalRepository('courses');
  const [kurse, setKurse] = useState<Course[] | undefined>(undefined);
  const [fehler, setFehler] = useState(false);
  /*
    `versuch` zählt die Anläufe und ist die ganze Mechanik hinter „Erneut
    versuchen": Er steht in den Abhängigkeiten des Effekts, also läuft der
    Effekt noch einmal. Ein `laden()` daneben wäre eine zweite Stelle, an
    der dasselbe passiert.
  */
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    if (!courses) return;
    let aktiv = true;
    setFehler(false);
    void courses
      .myCourses()
      .then((gefunden) => {
        if (aktiv) setKurse(gefunden);
      })
      .catch(() => {
        if (aktiv) setFehler(true);
      });
    return () => {
      aktiv = false;
    };
  }, [courses, versuch]);

  if (!courses) {
    return <Alert tone="info">In dieser Fassung gibt es keine Kurse.</Alert>;
  }
  if (fehler) {
    return <Verbindungsfehler was="Deine Kurse" erneut={() => setVersuch((bisher) => bisher + 1)} />;
  }
  if (!kurse) return <p className="muted">Kurse werden geladen …</p>;

  if (kurse.length === 0) {
    return (
      <EmptyState title="Noch kein Kurs">
        <p>
          Du bist noch in keiner Lerngruppe. Mit dem Code deiner Lehrkraft geht es los:{' '}
          <Link to="/beitreten">Mit Code beitreten</Link>.
        </p>
      </EmptyState>
    );
  }

  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
      {kurse.map((kurs) => (
        <li key={kurs.id}>
          <Card>
            <h2 style={{ marginTop: 0 }}>
              <Link to={`/lernen/kurs/${kurs.id}`}>{kurs.title}</Link>
            </h2>
            {kurs.description ? <p>{kurs.description}</p> : null}
            {kurs.schoolYear ? <p className="small muted">Schuljahr {kurs.schoolYear}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Kurs() {
  const { courseId } = useParams();
  const courses = useOptionalRepository('courses');
  const publication = useOptionalRepository('publication');
  const [kurs, setKurs] = useState<Course | undefined>(undefined);
  const [pakete, setPakete] = useState<PackRevision[] | undefined>(undefined);

  useEffect(() => {
    if (!courses || !courseId) return;
    let aktiv = true;
    void courses.getCourse(courseId).then((gefunden) => {
      if (aktiv) setKurs(gefunden);
    });
    if (publication) {
      void publication
        .publishedForCourse(courseId)
        .then((gefunden) => {
          if (aktiv) setPakete(gefunden);
        })
        .catch(() => {
          if (aktiv) setPakete([]);
        });
    }
    return () => {
      aktiv = false;
    };
  }, [courses, publication, courseId]);

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        <Link to="/lernen">Zurück zu deinen Kursen</Link>
      </p>
      <h1>{kurs?.title ?? 'Kurs'}</h1>
      {kurs?.archived ? (
        <Alert tone="info" title="Dieser Kurs ist abgeschlossen">
          Du kannst weiter üben, und dein Lernstand läuft mit. Neue Pakete kommen hier keine mehr
          dazu.
        </Alert>
      ) : null}

      {pakete === undefined ? <p className="muted">Pakete werden geladen …</p> : null}

      {pakete !== undefined && pakete.length === 0 ? (
        <EmptyState title="Noch keine Vokabeln">
          <p style={{ marginBottom: 0 }}>
            Deine Lehrkraft hat diesem Kurs noch kein Paket gegeben. Sobald eines da ist, steht es
            hier.
          </p>
        </EmptyState>
      ) : null}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {(pakete ?? []).map((paket) => (
          <li key={paket.packId}>
            <Card>
              <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>{paket.pack.meta.title}</h2>
              <p className="small muted" style={{ margin: 0 }}>
                {paket.pack.entries.length} Vokabeln · Klasse {paket.pack.meta.grade}
              </p>
              <p style={{ marginBottom: 0 }}>
                <Link to={`/lernen/kurs/${courseId ?? ''}/ueben/${paket.packId}`}>Üben</Link>
              </p>
            </Card>
          </li>
        ))}
      </ul>

      {pakete !== undefined && pakete.length > 0 ? (
        <Alert tone="info" title="Dein Lernstand liegt in deinem Konto">
          {/*
            Der Satz, der den Unterschied zum kontofreien LexiFlow erklärt –
            und zugleich der einzige Grund, warum es das Konto gibt. Ohne ihn
            wüsste niemand, warum er sich anmelden sollte.
          */}
          Was du hier übst, steht auf jedem Gerät, auf dem du dich anmeldest. Deine Lehrkraft sieht
          ihn nicht – sie sieht nur, welche Pakete es gibt.
        </Alert>
      ) : null}
    </div>
  );
}

export const LEARNER_SECTIONS = ['heute', 'fortschritt', 'lernen', 'ueben'] as const;
export type LearnerSection = (typeof LEARNER_SECTIONS)[number];

/**
 * Freies Üben im Portal — dieselbe Planungsseite, andere Rundenadresse.
 *
 * Die Seite baut die Parameter (`mode`, `kinds`, `length`, `seed`,
 * `direction`); wohin sie gehören, weiß nur das Portal. Deshalb kommt die
 * Adresse von hier und die Planung von dort.
 */
function FreiesUeben() {
  const { courseId = '', packId = '' } = useParams();
  return (
    <PaketAnsicht
      was="Das freie Üben"
      kinder={({ pack, staende }) => (
        <FreePracticeSetupPage
          pack={pack}
          staende={staende}
          zurueck="/ueben"
          rundenAdresse={(teil) => `/lernen/kurs/${courseId}/ueben/${packId}${teil}`}
        />
      )}
    />
  );
}

export function LearnerArea({ section = 'lernen' }: { section?: LearnerSection }) {
  /*
    „Heute" ist **eine** Seite, kein Bereich mit Unterseiten — deshalb kein
    eigener `Routes`-Block. Was von hier aus weitergeht, sind Adressen, die
    es schon gibt: `/ueben/...` und `/lernen`.
  */
  if (section === 'heute') return <HeutePage />;

  // Auch „Mein Fortschritt" ist eine Seite, kein Bereich mit Unterseiten.
  if (section === 'fortschritt') return <FortschrittPage />;

  if (section === 'ueben') {
    /*
      Kein eigener `Routes`-Block mit Unterseiten: Der Übungsbereich ist eine
      Seite. Die Runden liegen weiterhin unter `/lernen/kurs/...`, wo das
      Paket herkommt — eine zweite Adresse für dieselbe Runde wäre ein
      zweiter Weg zum selben Ort.
    */
    return (
      <Routes>
        <Route index element={<UebenPage />} />
        {/*
          Die vier wiederverwendeten Wege. Jeder trägt Kurs **und** Paket in
          der Adresse: Ohne den Kurs ließe sich die Zuweisung nicht prüfen,
          und genau sie entscheidet, ob hier etwas zu sehen ist.
        */}
        <Route
          path="karten/:courseId/:packId"
          element={
            <Suspense fallback={<p className="muted">Die Karteikarten werden geladen …</p>}>
              <PaketAnsicht
                was="Die Karteikarten"
                kinder={({ pack }) => <CardStudyPage pack={pack} zurueck="/ueben" />}
              />
            </Suspense>
          }
        />
        <Route
          path="selbsttest/:courseId/:packId"
          element={
            <Suspense fallback={<p className="muted">Der Selbsttest wird geladen …</p>}>
              <PaketAnsicht
                was="Der Selbsttest"
                kinder={({ pack }) => <SelfTestPage pack={pack} zurueck="/ueben" />}
              />
            </Suspense>
          }
        />
        <Route
          path="liste/:courseId/:packId"
          element={
            <Suspense fallback={<p className="muted">Die Vokabelliste wird geladen …</p>}>
              <PaketAnsicht
                was="Die Vokabelliste"
                kinder={({ pack }) => <VocabBrowsePage pack={pack} zurueck="/ueben" />}
              />
            </Suspense>
          }
        />
        <Route
          path="frei/:courseId/:packId"
          element={
            <Suspense fallback={<p className="muted">Das freie Üben wird geladen …</p>}>
              <FreiesUeben />
            </Suspense>
          }
        />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        index
        element={
          <div className="stack">
            <h1>Deine Kurse</h1>
            <Kursliste />
          </div>
        }
      />
      <Route path="kurs/:courseId" element={<Kurs />} />
      <Route
        path="kurs/:courseId/ueben/:packId"
        element={
          <Suspense fallback={<p className="muted">Die Übung wird geladen …</p>}>
            <PracticePage />
          </Suspense>
        }
      />
    </Routes>
  );
}

export default LearnerArea;
