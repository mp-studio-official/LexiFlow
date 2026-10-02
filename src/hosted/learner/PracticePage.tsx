import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import {
  alsLernstand,
  antwortEreignis,
  erneutRechnen,
} from '../../application/progressEvents';
import { buildTasksForTargets, planSession } from '../../domain/exercises';
import {
  createSessionState,
  currentItem,
  isFinished,
  remainingCount,
  submitVerdict,
  type SessionState,
} from '../../domain/session';
import { directionKey } from '../../domain/ids';
import { effectiveDirection, parseDirectionChoice } from '../../domain/practiceDirection';
import { isDue } from '../../domain/leitner';
import { istSchwierig } from '../../domain/schwierigeWoerter';
import { gingeVerloren } from '../../domain/rundenverlust';
import { gehenWenn, useAussenschutz, useDarfVerlassen, useVerlassenWache } from '../VerlassenSchutz';
import { Rueckfrage } from './Rueckfrage';
import './runde.css';
import { ExerciseView } from '../../routes/student/ExerciseView';
import { Alert, Button, Card } from '../../ui/components';
import type { AnswerCheckResult } from '../../domain/answerCheck';
import type { EntryProgress, VocabPack } from '../../domain/schema';
import type { ProgressEvent } from '../../application/repositories';

/**
 * Üben im Portal – mit einem Lernstand, der am Gerät nicht endet.
 *
 * ## Was hier neu ist und was nicht
 *
 * Nichts an der Übung selbst. Die Rundenplanung (`domain/exercises.ts`), der
 * Ablauf (`domain/session.ts`), die Aufgabenansicht (`ExerciseView`) und das
 * Leitner-Rechnen (`domain/leitner.ts`) stammen unverändert aus Sprint 1 und
 * laufen in jeder portablen Datei genauso. Neu ist allein, **wohin** der
 * Lernstand geht: über `ProgressRepository` statt in IndexedDB.
 *
 * Das ist der Grund, warum diese Seite kurz ist. Wäre sie lang, hieße das,
 * dass das Portal eine zweite Übung bekommen hätte – und zwei Übungen
 * bedeuteten zwei Vorstellungen davon, was jemand kann.
 *
 * ## Warum der Lernstand im Speicher mitgeführt wird
 *
 * Die nächste Aufgabe hängt vom Stand der vorigen ab. Ihn nach jeder Antwort
 * neu vom Server zu holen hieße, mitten in der Übung auf das Netz zu warten.
 * Gerechnet wird deshalb hier (mit derselben Funktion wie überall), gesendet
 * wird nebenher – und geht das Senden schief, steht es als Hinweis da, statt
 * still zu verschwinden.
 *
 * ## Was passiert, wenn zwei Geräte dieselbe Vokabel üben
 *
 * Der Server lehnt den zweiten Schreibvorgang ab und nennt die Fassung, die
 * er hat. Diese Seite lädt dann den frischen Stand, rechnet **dieselbe**
 * Bewertung mit **derselben** Domainfunktion noch einmal (`erneutRechnen`)
 * und sendet dasselbe Ereignis erneut. Die `eventId` bleibt dabei gleich –
 * deshalb zählt die Antwort trotzdem nur einmal.
 *
 * Gelöst wird das ohne ein Wort an die lernende Person. Ein Hinweis „dein
 * anderes Gerät war schneller" wäre eine Erklärung für ein Problem, das sie
 * nicht hat: Geübt hat sie, gezählt ist es, und der Stand stimmt danach.
 *
 * ## Warum die Seite lazy geladen wird
 *
 * Sie zieht die Aufgabenlogik ins Bündel. Eine Lehrkraft, die nur Material
 * verwaltet, lädt sie nie.
 */

/** Die Rundengröße im Portal – dieselbe Vorgabe wie ohne Konto. */
const RUNDENLAENGE = 10;

/**
 * Womit die Runde gefüllt wird, wenn der Übungsbereich sie geschickt hat.
 *
 * `auswahl=faellig` und `auswahl=schwierig` engen die geplanten Ziele auf
 * genau das ein, was die Karte versprochen hat. Ohne diese Einengung würde
 * „Schwierige Wörter" eine ganz normale gemischte Runde starten — die Karte
 * wäre eine Beschriftung ohne Wirkung, und das ist schlimmer als keine Karte.
 *
 * Alles Unbekannte bedeutet „keine Einengung". Eine erfundene Auswahl soll
 * keine leere Runde ergeben.
 */
const AUSWAHLEN = ['faellig', 'schwierig'] as const;
type Auswahl = (typeof AUSWAHLEN)[number];

function leseAuswahl(wert: string | null): Auswahl | undefined {
  return (AUSWAHLEN as readonly string[]).includes(wert ?? '') ? (wert as Auswahl) : undefined;
}

function passtZurAuswahl(
  auswahl: Auswahl | undefined,
  stand: EntryProgress | undefined,
  jetzt: Date,
): boolean {
  if (!auswahl) return true;
  if (!stand) return false;
  return auswahl === 'faellig' ? isDue(stand, jetzt) : istSchwierig(stand);
}

export function PracticePage() {
  const { courseId, packId } = useParams();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const richtungswahl = parseDirectionChoice(suche.get('richtung'));
  const auswahl = leseAuswahl(suche.get('auswahl'));
  const publication = useOptionalRepository('publication');
  const progress = useOptionalRepository('progress');

  const [pack, setPack] = useState<VocabPack | undefined>(undefined);
  const [state, setState] = useState<SessionState | undefined>(undefined);
  const [ergebnis, setErgebnis] = useState<AnswerCheckResult | null>(null);
  const [fehler, setFehler] = useState('');
  const [ladefehler, setLadefehler] = useState('');
  const [gezaehlt, setGezaehlt] = useState(0);
  const [naechste, setNaechste] = useState<string | undefined>(undefined);
  /*
    E14: Was gerade im Antwortfeld steht und noch nicht abgeschickt ist. Die
    Aufgabe meldet es; hier liegt es, weil der Ausgang es braucht.
  */
  const [entwurf, setEntwurf] = useState('');
  const [rueckfrage, setRueckfrage] = useState<{ aufloesen: (darf: boolean) => void } | null>(null);
  const feldRef = useRef<HTMLDivElement>(null);

  /*
    Der Lernstand als Verweis und nicht als Zustand: Er wird zwischen zwei
    Aufgaben gelesen und geschrieben, aber er soll nichts neu zeichnen. Als
    `useState` löste jede Antwort ein zusätzliches Rendern aus, mitten in der
    Eingabe der nächsten.
  */
  const staende = useRef(new Map<string, EntryProgress>());

  const laden = useCallback(async () => {
    if (!publication || !progress || !courseId || !packId) return;
    try {
      const zugewiesen = await publication.publishedForCourse(courseId);
      const gefunden = zugewiesen.find((eintrag) => eintrag.packId === packId);
      if (!gefunden) {
        setLadefehler('Dieses Paket liegt nicht (mehr) in diesem Kurs.');
        return;
      }

      const vorhandene = await progress.myEntryProgress(courseId, packId);
      staende.current = new Map(
        vorhandene.map((eintrag) => [directionKey(eintrag.entryId, eintrag.direction), eintrag]),
      );

      await progress.beginSession(courseId, packId);

      /*
        Planen und Aufgaben bauen getrennt, statt mit `buildSession` in einem
        Schritt: Der Plan trägt `nextDueAt`, und ohne ihn stünde am Ende einer
        leeren Runde „0 Antworten" statt „das Nächste ist morgen fällig".
      */
      /*
        Die gewählte Richtung wird zur **wirksamen** Paketrichtung — nicht zu
        einem zweiten Planungspfad. Bei einem Paket mit nur einer Richtung
        führt `effectiveDirection` eine abweichende Wahl still zurück; eine
        Auswahl mit einer gültigen Option wäre eine Attrappe.
      */
      const richtung = effectiveDirection(gefunden.pack.meta.direction, richtungswahl);
      const jetzt = new Date();
      const plan = planSession(gefunden.pack.entries, staende.current, richtung, RUNDENLAENGE);

      const ziele = plan.targets.filter((ziel) =>
        passtZurAuswahl(auswahl, staende.current.get(directionKey(ziel.entry.id, ziel.direction)), jetzt),
      );

      setErgebnis(null);
      setFehler('');
      setGezaehlt(0);
      setNaechste(plan.nextDueAt);
      setPack(gefunden.pack);
      setState(
        createSessionState(
          buildTasksForTargets(ziele, gefunden.pack.entries, staende.current, [], Math.random),
        ),
      );
    } catch (error) {
      setLadefehler(error instanceof Error ? error.message : 'Die Runde ließ sich nicht laden.');
    }
  }, [publication, progress, courseId, packId, richtungswahl, auswahl]);

  useEffect(() => {
    void laden();
  }, [laden]);

  /*
    ------------------------------------------------------------------ E14
    Die Frage „ginge etwas verloren?" wird **einmal** beantwortet
    (`domain/rundenverlust.ts`) und von jedem Ausgang benutzt: „Runde
    beenden", „Abmelden", Browser-Zurück, Neuladen, Schließen.

    Die Haken stehen vor den frühen Rückgaben weiter unten — React verlangt
    dieselbe Reihenfolge in jedem Durchlauf, und ein Ladezustand darf den
    Schutz nicht abmelden.
  */
  const aufgabeOffen = Boolean(state && currentItem(state) && !isFinished(state));
  const verlust = gingeVerloren({ aufgabeOffen, ergebnisSteht: ergebnis !== null, entwurf });

  const fragen = useCallback(
    () =>
      new Promise<boolean>((aufloesen) => {
        setRueckfrage({ aufloesen });
      }),
    [],
  );

  const zurueckZumKurs = useCallback(() => {
    navigate(`/lernen/kurs/${courseId ?? ''}`);
  }, [navigate, courseId]);

  useVerlassenWache(verlust, fragen);
  useAussenschutz(verlust, fragen, zurueckZumKurs);

  /*
    Der Ausgang, den die Runde selbst anbietet — über **denselben** Durchgang
    wie „Abmelden". Nicht `fragen()` direkt: Dann stünde hier eine zweite
    Entscheidung darüber, wann gefragt wird, und sie liefe irgendwann
    auseinander mit der aus der Hülle.
  */
  const darfVerlassen = useDarfVerlassen();
  const beenden = useCallback(() => {
    gehenWenn(darfVerlassen(), zurueckZumKurs);
  }, [darfVerlassen, zurueckZumKurs]);

  /*
    Der Fokus geht an das Feld, in dem die Eingabe steht — nicht an den Anfang
    der Seite. Wer „Hierbleiben" wählt, will weitertippen.

    Gerufen wird das **nach** dem Schließen (`nachBleiben`): Ein modales
    `<dialog>` gibt den Fokus beim Schließen an seinen Öffner zurück und
    überschriebe jede frühere Entscheidung.
  */
  const insFeld = useCallback(() => {
    feldRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  }, []);

  /** „Hierbleiben": schließen, nichts verwerfen. */
  const hierbleiben = useCallback(() => {
    rueckfrage?.aufloesen(false);
    setRueckfrage(null);
  }, [rueckfrage]);

  /** „Runde beenden": verwirft **nur** die aktuelle Eingabe. */
  const doch = useCallback(() => {
    rueckfrage?.aufloesen(true);
    setRueckfrage(null);
    setEntwurf('');
  }, [rueckfrage]);

  if (!publication || !progress) {
    return <Alert tone="info">In dieser Fassung gibt es das Üben im Konto nicht.</Alert>;
  }
  if (ladefehler) return <Alert tone="error">{ladefehler}</Alert>;
  if (!pack || !state) return <p className="muted">Die Runde wird vorbereitet …</p>;

  const aufgabe = currentItem(state);

  async function beantworten(gepruefte: AnswerCheckResult) {
    const laufend = currentItem(state!);
    if (!laufend) return;
    setErgebnis(gepruefte);

    const schluessel = directionKey(laufend.task.entryId, laufend.task.direction);
    const { event, nachher } = antwortEreignis({
      courseId: courseId!,
      packId: packId!,
      entryId: laufend.task.entryId,
      direction: laufend.task.direction,
      outcome: gepruefte.verdict,
      vorher: staende.current.get(schluessel),
    });
    staende.current.set(schluessel, nachher);
    setGezaehlt((bisher) => bisher + 1);

    await senden(event);
  }

  async function senden(event: ProgressEvent) {
    try {
      const konflikte = await progress!.recordEvents([event]);
      if (konflikte.length > 0) await aufloesen(event);
      setFehler('');
    } catch {
      /*
        Ehrlich statt still: Wer weiterübt, während nichts ankommt, hätte am
        Ende eine Runde geübt, die es nirgends gibt. Der Hinweis bleibt
        stehen, bis wieder etwas durchgeht.
      */
      setFehler(
        'Deine letzte Antwort konnte nicht gespeichert werden. Prüfe deine Verbindung – geübt hast du sie trotzdem.',
      );
    }
  }

  /**
   * Einen abgelehnten Schreibvorgang auflösen.
   *
   * Genau ein zweiter Versuch. Ein dritter wäre eine Schleife, und in der
   * Lage, in der er nötig wäre – ein drittes Gerät, das im selben Moment übt –
   * ist der Lernstand ohnehin gleich wieder offen. Bleibt es beim Konflikt,
   * steht der Hinweis da; die nächste Runde liest den Stand neu.
   */
  async function aufloesen(event: ProgressEvent) {
    const frisch = await progress!.myEntryProgress(courseId!, packId!);
    const schluessel = directionKey(event.entryId, event.direction);
    const stand = frisch.find(
      (eintrag) => directionKey(eintrag.entryId, eintrag.direction) === schluessel,
    );

    const zweiterVersuch = erneutRechnen(event, stand);
    const offen = await progress!.recordEvents([zweiterVersuch]);
    if (offen.length > 0) throw new Error('Der Lernstand ist gerade nicht zu setzen.');

    // Die Runde rechnet ab jetzt auf dem Stand weiter, der wirklich im Konto
    // steht – sonst wäre die nächste Antwort der nächste Konflikt.
    staende.current.set(schluessel, alsLernstand(zweiterVersuch));
  }

  function weiter() {
    if (!ergebnis) return;
    setState(submitVerdict(state!, ergebnis.verdict).state);
    setErgebnis(null);
  }

  /*
    Der sichtbare Ausgang heißt „Runde beenden" (E14) und ist ein Knopf, kein
    Verweis: Er entscheidet erst, ob gefragt werden muss. Ein `<a href>` wäre
    mit der mittleren Maustaste oder „in neuem Tab öffnen" an jeder Rückfrage
    vorbei.
  */
  const ausgang = (
    <div className="row" style={{ margin: 0 }}>
      <Button variant="quiet" className="runde__ausgang" onClick={beenden}>
        Runde beenden
      </Button>
    </div>
  );

  /*
    Die Rückfrage steht immer im Baum und ist nur dann offen, wenn wirklich
    etwas verloren ginge. Ein `<dialog>`, das erst beim Öffnen entsteht, hätte
    im selben Durchlauf noch keine Referenz, und `showModal()` liefe ins
    Leere — genau einmal, und zwar beim ersten Mal.
  */
  const nachfrage = (
    <Rueckfrage
      offen={rueckfrage !== null}
      aufBleiben={hierbleiben}
      aufBeenden={doch}
      nachBleiben={insFeld}
    />
  );

  if (!aufgabe || isFinished(state)) {
    return (
      <div className="stack">
        {ausgang}
        <h1>{gezaehlt === 0 ? 'Gerade nichts fällig' : 'Runde beendet'}</h1>
        <Card>
          <p style={{ marginTop: 0 }}>
            {gezaehlt === 0
              ? `Gerade ist in „${pack.meta.title}" nichts fällig.`
              : `${gezaehlt} ${gezaehlt === 1 ? 'Antwort' : 'Antworten'} in „${pack.meta.title}".`}
          </p>
          {/*
            Der Satz, der eine leere Runde erklärt, statt sie als Fehler
            aussehen zu lassen: Wer gerade alles geübt hat, soll lesen, wann
            es weitergeht – nicht rätseln, warum nichts kommt.
          */}
          {naechste ? (
            <p className="small muted" style={{ margin: 0 }}>
              Das Nächste ist am {new Date(naechste).toLocaleDateString('de-DE')} wieder dran.
            </p>
          ) : null}
          <p className="small muted" style={{ marginBottom: 0 }}>
            Dein Lernstand liegt in deinem Konto. Auf einem anderen Gerät machst du dort weiter, wo
            du hier aufgehört hast.
          </p>
        </Card>
        {fehler ? <Alert tone="error">{fehler}</Alert> : null}
        <div className="row">
          <Button variant="primary" onClick={() => void laden()}>
            Noch eine Runde
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {nachfrage}
      {ausgang}
      <h1>{pack.meta.title}</h1>
      <p className="small muted" style={{ margin: 0 }}>
        Noch {remainingCount(state)} in dieser Runde
      </p>

      {fehler ? <Alert tone="error">{fehler}</Alert> : null}

      <Card>
        <div ref={feldRef}>
          <ExerciseView
            key={aufgabe.id}
            task={aufgabe.task}
            result={ergebnis}
            onDraftChange={setEntwurf}
            onSubmit={(gepruefte) => {
              void beantworten(gepruefte);
            }}
          />
        </div>

        {ergebnis ? (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <Alert tone={ergebnis.verdict === 'correct' ? 'success' : 'info'}>
              {ergebnis.verdict === 'correct'
                ? 'Richtig.'
                : `Richtig wäre: ${ergebnis.expected.join(' · ')}`}
            </Alert>
            <div className="row">
              <Button variant="primary" onClick={weiter} autoFocus>
                Weiter
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default PracticePage;
