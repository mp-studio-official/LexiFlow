import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Button } from '../../ui/components';
import { ErrorState, Skeleton } from '../../ui/zustaende';
import { directionKey } from '../../domain/ids';
import type { EntryProgress, VocabPack } from '../../domain/schema';
import './ueben.css';

/**
 * Das Gerüst der vier wiederverwendeten Übungsansichten (5B.15).
 *
 * ## Was es tut und was es ausdrücklich nicht tut
 *
 * Es holt **ein** Paket — und zwar nur, wenn es der angemeldeten Person im
 * genannten Kurs wirklich zugewiesen ist — samt eigenem Lernstand, und reicht
 * beides an die bestehende Ansicht weiter. Mehr nicht: keine zweite
 * Übungslogik, keine zweite Darstellung, keine eigene Bewertung.
 *
 * Die Prüfung ist keine Oberflächenhöflichkeit. `publishedForCourse` liefert
 * ausschließlich, was in diesem Kurs zugewiesen und nicht zurückgezogen ist;
 * steht das angefragte Paket nicht darin, gibt es hier nichts zu sehen —
 * auch dann nicht, wenn jemand die Adresse von Hand tippt.
 *
 * ## Warum nur der eigene Lernstand
 *
 * `myEntryProgress` hat keinen Parameter für eine andere Person. Es gibt hier
 * also nicht nur keine fremden Stände, es gibt keinen Weg zu ihnen.
 */
export interface Paketdaten {
  pack: VocabPack;
  staende: ReadonlyMap<string, EntryProgress>;
}

export function PaketAnsicht({
  kinder,
  was,
}: {
  /** Die eigentliche Ansicht — bekommt Paket und Stände, sobald sie da sind. */
  kinder: (daten: Paketdaten) => ReactNode;
  /** Wofür geladen wird, für den Ladetext. */
  was: string;
}) {
  const { courseId = '', packId = '' } = useParams();
  const publication = useOptionalRepository('publication');
  const progress = useOptionalRepository('progress');
  const [stand, setzeStand] = useState<
    { art: 'laedt' } | { art: 'fehler'; offline: boolean; text: string } | ({ art: 'da' } & Paketdaten)
  >({ art: 'laedt' });

  const laden = useCallback(async () => {
    setzeStand({ art: 'laedt' });
    if (!publication || !progress) {
      setzeStand({ art: 'fehler', offline: false, text: 'In dieser Fassung gibt es das Üben im Konto nicht.' });
      return;
    }
    try {
      const zugewiesen = await publication.publishedForCourse(courseId);
      const gefunden = zugewiesen.find((eintrag) => eintrag.packId === packId);
      if (!gefunden) {
        setzeStand({
          art: 'fehler',
          offline: false,
          text: 'Dieses Paket liegt nicht (mehr) in diesem Kurs.',
        });
        return;
      }
      const eigene = await progress.myEntryProgress(courseId, packId);
      setzeStand({
        art: 'da',
        pack: gefunden.pack,
        staende: new Map(eigene.map((e) => [directionKey(e.entryId, e.direction), e])),
      });
    } catch {
      setzeStand({
        art: 'fehler',
        offline: typeof navigator !== 'undefined' && !navigator.onLine,
        text: 'Das Paket ließ sich nicht laden.',
      });
    }
  }, [publication, progress, courseId, packId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (stand.art === 'laedt') return <Skeleton lines={4} label={`${was} wird geladen`} />;
  if (stand.art === 'fehler') {
    return (
      <ErrorState
        title={stand.offline ? 'Gerade keine Verbindung' : 'Nicht verfügbar'}
        tone={stand.offline ? 'offline' : 'error'}
        announce={false}
        action={<Button onClick={() => void laden()}>Erneut versuchen</Button>}
      >
        <p style={{ margin: 0 }}>{stand.text}</p>
      </ErrorState>
    );
  }
  /*
    Die Klasse ist kein Schmuck: Sie ist der Ort, an dem das Portal seine
    eigenen Tippziele setzt, ohne die Ansicht selbst anzufassen. Dieselben
    Ansichten laufen in der Fassung ohne Konto und in der portablen Datei
    weiter unverändert — dort gilt diese Regel nicht.
  */
  return <div className="ueben-ansicht">{kinder({ pack: stand.pack, staende: stand.staende })}</div>;
}
