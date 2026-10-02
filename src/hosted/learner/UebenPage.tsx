import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Button, Card, EmptyState } from '../../ui/components';
import { ErrorState, PageTitle, Skeleton } from '../../ui/zustaende';
import { directionKey } from '../../domain/ids';
import { formkarten, wegZu, type Formkarte, type Paketstand } from '../../domain/uebungsformen';
import type { EntryProgress } from '../../domain/schema';
import './ueben.css';

/**
 * „Üben" — die Auswahl nach Übungsform, nicht nach Kurs.
 *
 * ## Warum die Form zuerst kommt
 *
 * Wer üben will, denkt „ich will die schwierigen wiederholen", nicht „ich
 * will Kurs 7b". Der Kurs ist die Ablage, nicht die Absicht. Die Karte nennt
 * deshalb die Form; das Paket wählt man darin, mit der Zahl daneben, die sagt,
 * wie viel dort auf einen wartet.
 *
 * ## Was hier nicht steht
 *
 * Karten, deren Weg heute nicht funktioniert. Keine ausgegraute, keine mit
 * „bald", keine mit null dahinter. Welche Karte entsteht, entscheidet
 * `src/domain/uebungsformen.ts` aus den vorliegenden Daten — fällt die
 * Voraussetzung weg, fällt die Karte, ohne dass hier jemand eine zweite Liste
 * nachpflegt.
 *
 * Karteikarten und Lückentexte fehlen deshalb: Die Aufgabenformen gibt es,
 * aber das Portal hat keinen Einstieg, der eine Form auswählt — es plant eine
 * gemischte Runde. Das stellt **5B.15** her. Zeitformen brauchen ein
 * Datenmodell, das es nicht gibt; kleine Spiele sind nicht Teil von 5B.
 *
 * ## Ausschließlich eigene Daten
 *
 * `progress.myEntryProgress` hat keinen Parameter für eine andere Person, und
 * dieser Bildschirm fragt nichts anderes. Es gibt hier keine Zahl über
 * jemanden sonst — auch keine aggregierte.
 */

type Stand =
  | { art: 'laedt' }
  | { art: 'fehler'; offline: boolean }
  | { art: 'da'; karten: Formkarte[]; pakete: number };

export function UebenPage() {
  const courses = useOptionalRepository('courses');
  const publication = useOptionalRepository('publication');
  const progress = useOptionalRepository('progress');
  const [stand, setzeStand] = useState<Stand>({ art: 'laedt' });

  const laden = useCallback(async () => {
    setzeStand({ art: 'laedt' });
    if (!courses || !publication || !progress) {
      setzeStand({ art: 'da', karten: [], pakete: 0 });
      return;
    }
    try {
      const kurse = (await courses.myCourses()).filter((kurs) => !kurs.archived);
      const pakete: Paketstand[] = [];

      for (const kurs of kurse) {
        const zugewiesen = await publication.publishedForCourse(kurs.id);
        for (const revision of zugewiesen) {
          const eigene = await progress.myEntryProgress(kurs.id, revision.packId);
          const staende = new Map<string, EntryProgress>(
            eigene.map((eintrag) => [directionKey(eintrag.entryId, eintrag.direction), eintrag]),
          );
          pakete.push({
            courseId: kurs.id,
            packId: revision.packId,
            titel: revision.pack.meta.title,
            direction: revision.pack.meta.direction,
            entries: revision.pack.entries,
            staende,
          });
        }
      }

      setzeStand({ art: 'da', karten: formkarten(pakete), pakete: pakete.length });
    } catch {
      setzeStand({ art: 'fehler', offline: typeof navigator !== 'undefined' && !navigator.onLine });
    }
  }, [courses, publication, progress]);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <div className="stack">
      <PageTitle title="Üben" description="Such dir aus, was du üben willst." />

      {stand.art === 'laedt' ? <Skeleton lines={4} label="Deine Übungswege werden geladen" /> : null}

      {stand.art === 'fehler' ? (
        <ErrorState
          title={stand.offline ? 'Gerade keine Verbindung' : 'Die Übungswege sind nicht abrufbar'}
          tone={stand.offline ? 'offline' : 'error'}
          announce={false}
          action={<Button onClick={() => void laden()}>Erneut versuchen</Button>}
        >
          <p style={{ margin: 0 }}>
            {stand.offline
              ? 'Sobald das Netz zurück ist, steht hier wieder, was du üben kannst.'
              : 'Deine Kurse und Pakete ließen sich nicht laden.'}
          </p>
        </ErrorState>
      ) : null}

      {stand.art === 'da' && stand.karten.length === 0 ? (
        <EmptyState title={stand.pakete === 0 ? 'Noch nichts zum Üben' : 'Gerade nichts offen'}>
          {stand.pakete === 0 ? (
            <p>
              Sobald in einem deiner Kurse ein Lernpaket liegt, kannst du hier üben.
            </p>
          ) : (
            /*
              Ruhig und ohne Ermahnung (Konzept 4.3): Nichts fällig ist ein
              gutes Ergebnis, kein Rückstand.
            */
            <p>Nichts ist fällig, und nichts hakt. Du kannst trotzdem jederzeit ein Paket üben.</p>
          )}
          <Link className="ueben__ziel" to="/lernen">
            Zu deinen Kursen
          </Link>
        </EmptyState>
      ) : null}

      {stand.art === 'da' ? <UebenInhalt karten={stand.karten} /> : null}
    </div>
  );
}

/**
 * Die Karten ohne Laden, Fehler und Speicher — nur Daten hinein, Bild heraus.
 *
 * Getrennt und ausgeführt, damit die Breitenmessung sie mit festen Daten in
 * einen echten Browser rendern kann (`scripts/start-messen.mjs`). Mit den
 * Hooks darin sähe ein serverseitiges Rendern immer nur das Skelett.
 */
export function UebenInhalt({ karten }: { karten: readonly Formkarte[] }) {
  return (
    <>
      {karten.map((karte) => (
        <Formkachel key={karte.form} karte={karte} />
      ))}
    </>
  );
}

function Formkachel({ karte }: { karte: Formkarte }) {
  return (
    <Card>
      <h2>{karte.titel}</h2>
      <p>{karte.satz}</p>
      <ul className="stack stack--tight">
        {karte.ziele.map((ziel) => (
          <li key={`${ziel.courseId}:${ziel.packId}`} className="ueben__zeile">
            <Link className="ueben__ziel" to={wegZu(karte.form, ziel)}>
              {ziel.titel}
            </Link>
            <span className="muted">{ziel.anzahl}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default UebenPage;
