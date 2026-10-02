import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Button, Card, EmptyState } from '../../ui/components';
import { ErrorState, PageTitle, Skeleton } from '../../ui/zustaende';
import type { Course, PackSummary } from '../../application/repositories';
import './start.css';

/**
 * Der Start einer Lehrkraft — die Seite, auf der sie nach dem Anmelden landet.
 *
 * ## Was hier ausdrücklich **nicht** steht
 *
 * Kein Lernstand. Nicht individuell, nicht aggregiert, nicht als Durchschnitt,
 * nicht als „12 von 25 haben angefangen", nicht als Übungszeit, Trefferquote
 * oder Rangliste. Das ist keine fehlende Funktion, sondern die Zusage, für die
 * es LexiFlow gibt: Lehrkräfte sehen, **wer** in ihren Kursen ist — nicht, wie
 * viel jemand geübt hat.
 *
 * Ein Dashboard ist der Ort, an dem solche Zahlen von selbst entstehen. Jede
 * einzelne wäre leicht zu bauen und schwer zurückzunehmen; deshalb steht der
 * Grund hier, am Ort der Versuchung, und `start.test.tsx` hält fest, dass
 * diese Datei den Lernstandspeicher nicht einmal anfragt.
 *
 * ## Woher die Zahlen kommen, die hier stehen
 *
 * Nur aus dem, was es gibt:
 *
 * | Angabe | Quelle |
 * | --- | --- |
 * | Kurse | `courses.myCourses()` |
 * | Mitglieder je Kurs | `courses.members(id)` — nur Anzahl, keine Namen |
 * | Lernpakete, Wörter, Veröffentlichungsstand | `packs.list()` |
 * | KI-Zugang eingerichtet | `ai.listConnections()` |
 *
 * Keine neue Datenquelle, keine Migration. Was sich daraus nicht ableiten
 * lässt, steht nicht da — und zwar auch nicht als leerer Kasten, der eine
 * Funktion andeutet, die es noch nicht gibt. Eine geplante Veröffentlichung
 * zum Beispiel: Es gibt kein `publish_at`, also gibt es sie nicht, also wird
 * sie nicht angedeutet.
 */

/** Ein Kurs mit seiner Mitgliederzahl — mehr wird über ihn nicht geladen. */
export interface KursZeile {
  kurs: Course;
  mitglieder?: number;
}

/**
 * Eine offene Stelle in einem eigenen Paketentwurf.
 *
 * **Nicht** eine Rückfrage von Lernenden und keine Nachricht: Lernende
 * schicken hierher nichts, und es gäbe auch keinen Kanal dafür. Gemeint sind
 * Lücken und Widersprüche im eigenen Material — ein Paket ohne Wörter, ein
 * Entwurf, der von seinem veröffentlichten Stand abweicht.
 */
interface OffeneStelle {
  paket: PackSummary;
  was: string;
}

function offeneStellen(pakete: readonly PackSummary[]): OffeneStelle[] {
  const gefunden: OffeneStelle[] = [];
  for (const paket of pakete) {
    if (paket.entryCount === 0) {
      gefunden.push({ paket, was: 'Noch kein Wort darin.' });
      continue;
    }
    if (paket.publishedRevision === undefined) {
      gefunden.push({ paket, was: 'Noch nicht veröffentlicht — Kurse sehen es nicht.' });
      continue;
    }
    if (paket.hasUnpublishedChanges) {
      gefunden.push({ paket, was: 'Der Entwurf weicht vom veröffentlichten Stand ab.' });
    }
  }
  return gefunden;
}

type Stand =
  | { art: 'laedt' }
  | { art: 'fehler'; offline: boolean }
  | { art: 'da'; kurse: KursZeile[]; pakete: PackSummary[]; kiEingerichtet: boolean };

/** Wie viele Kurse der Start nennt, bevor er auf die Kursliste verweist. */
const HOECHSTENS = 5;

export function StartPage() {
  const courses = useOptionalRepository('courses');
  const packs = useOptionalRepository('packs');
  const ai = useOptionalRepository('ai');
  const [stand, setzeStand] = useState<Stand>({ art: 'laedt' });

  const laden = useCallback(async () => {
    setzeStand({ art: 'laedt' });
    try {
      const kurse = courses ? await courses.myCourses() : [];
      const pakete = packs ? await packs.list() : [];

      /*
        Der KI-Zugang darf den Start nicht umwerfen. Wer keinen eingerichtet
        hat, bekommt hier oft einen Fehler vom Gateway — und das ist kein
        Fehler des Starts, sondern die Antwort „gibt es nicht".
      */
      let kiEingerichtet = false;
      if (ai) {
        try {
          kiEingerichtet = (await ai.listConnections()).some((zugang) => zugang.active);
        } catch {
          kiEingerichtet = false;
        }
      }

      const aktive = kurse.filter((kurs) => !kurs.archived).slice(0, HOECHSTENS);
      const zeilen: KursZeile[] = await Promise.all(
        aktive.map(async (kurs) => {
          /*
            Die Mitgliederzahl ist zulässig — sie sagt, wer im Kurs ist, nicht
            wie jemand lernt. Scheitert sie, bleibt der Kurs trotzdem stehen:
            ohne Zahl, nicht ohne Kurs.
          */
          if (!courses) return { kurs };
          try {
            return { kurs, mitglieder: (await courses.members(kurs.id)).length };
          } catch {
            return { kurs };
          }
        }),
      );

      setzeStand({ art: 'da', kurse: zeilen, pakete, kiEingerichtet });
    } catch {
      /*
        `navigator.onLine` sagt nicht zuverlässig, dass eine Verbindung
        besteht — aber zuverlässig, dass keine besteht. Genau in dieser
        Richtung wird es hier benutzt: für den Ton, nicht für die Entscheidung.
      */
      setzeStand({ art: 'fehler', offline: typeof navigator !== 'undefined' && !navigator.onLine });
    }
  }, [courses, packs, ai]);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <div className="stack">
      <PageTitle
        title="Start"
        description="Deine Kurse und dein Material auf einen Blick."
      />

      {stand.art === 'laedt' ? <Skeleton lines={4} label="Dein Start wird geladen" /> : null}

      {stand.art === 'fehler' ? (
        <ErrorState
          title={stand.offline ? 'Gerade keine Verbindung' : 'Der Start ist nicht abrufbar'}
          tone={stand.offline ? 'offline' : 'error'}
          announce={false}
          action={
            <Button onClick={() => void laden()}>Erneut versuchen</Button>
          }
        >
          <p style={{ margin: 0 }}>
            {stand.offline
              ? 'Kurse und Material stehen wieder da, sobald das Netz zurück ist. Es geht nichts verloren.'
              : 'Die Kurse und das Material ließen sich nicht laden.'}
          </p>
        </ErrorState>
      ) : null}

      {stand.art === 'da' ? (
        <StartInhalt kurse={stand.kurse} pakete={stand.pakete} kiEingerichtet={stand.kiEingerichtet} />
      ) : null}
    </div>
  );
}

/**
 * Der Inhalt ohne Laden, Fehler und Speicher — nur Daten hinein, Bild heraus.
 *
 * Getrennt und ausgeführt, weil er so **messbar** wird: Die Breitenmessung in
 * `scripts/start-messen.mjs` rendert ihn mit festen Daten in einen echten
 * Browser und fragt nach Überlauf und Tippzielen. Mit den Hooks darin ginge
 * das nicht — ein serverseitiges Rendern sähe immer nur den Ladezustand, und
 * gemessen würde ein Skelett.
 */
export function StartInhalt({
  kurse,
  pakete,
  kiEingerichtet,
}: {
  kurse: KursZeile[];
  pakete: PackSummary[];
  kiEingerichtet: boolean;
}) {
  const stellen = offeneStellen(pakete);

  return (
    <>
      <Card>
        <h2>Kurse</h2>
        {kurse.length === 0 ? (
          /*
            Kein leerer Kasten mit einer Null darin: Wer noch keinen Kurs hat,
            braucht die Erklärung, was ein Kurs ist, und den ersten Schritt.
          */
          <EmptyState title="Noch kein Kurs">
            <p>
              Ein Kurs ist eine Lerngruppe. Nach dem Anlegen gibt es einen Einladungscode zum
              Vorlesen.
            </p>
            <Link className="start__ziel" to="/kurse">Ersten Kurs anlegen</Link>
          </EmptyState>
        ) : (
          <>
            <ul className="stack stack--tight">
              {kurse.map(({ kurs, mitglieder }) => (
                <li key={kurs.id} className="start__zeile">
                  <Link className="start__ziel" to={`/kurse/${kurs.id}`}>
                    {kurs.title}
                  </Link>
                  {mitglieder === undefined ? null : (
                    <span className="muted">
                      {mitglieder === 1 ? '1 Mitglied' : `${mitglieder} Mitglieder`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Link className="start__ziel" to="/kurse">Alle Kurse</Link>
          </>
        )}
      </Card>

      <Card>
        <h2>Lernpakete</h2>
        {pakete.length === 0 ? (
          <EmptyState title="Noch kein Lernpaket">
            <p>
              Ein Lernpaket ist eine Wortliste. Veröffentlicht wird sie als unveränderlicher
              Stand, den ein Kurs dann sieht.
            </p>
            <Link className="start__ziel" to="/material">Lernpaket erstellen</Link>
          </EmptyState>
        ) : (
          <>
            <p>
              {pakete.length === 1 ? '1 Lernpaket' : `${pakete.length} Lernpakete`} ·{' '}
              {pakete.filter((paket) => paket.publishedRevision !== undefined).length}{' '}
              veröffentlicht
            </p>
            <Link className="start__ziel" to="/material">Material öffnen</Link>
          </>
        )}
      </Card>

      {stellen.length > 0 ? (
        <Card>
          <h2>Offene Stellen</h2>
          <p className="small muted">
            Lücken und Widersprüche in deinen eigenen Entwürfen. Keine Rückfragen von Lernenden —
            die gibt es hier nicht.
          </p>
          <ul className="stack stack--tight">
            {stellen.map(({ paket, was }) => (
              <li key={paket.id} className="start__zeile">
                <Link className="start__ziel" to="/material">
                  {paket.title}
                </Link>
                <span className="muted">{was}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {kiEingerichtet ? null : (
        /*
          Neutral, nicht als Fehler: LexiFlow funktioniert ohne KI vollständig.
          Ein roter Kasten an dieser Stelle behauptete, etwas sei kaputt.
        */
        <Card quiet>
          <h2>KI-Zugang</h2>
          <p>
            Noch kein KI-Zugang eingerichtet. LexiFlow funktioniert auch ohne — die KI hilft nur
            beim Erstellen von Lernpaketen.
          </p>
          <Link className="start__ziel" to="/einstellungen">Einstellungen öffnen</Link>
        </Card>
      )}
    </>
  );
}

export default StartPage;
