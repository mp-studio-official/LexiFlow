import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Button } from '../../ui/components';
import { Fortschritt, LeererZustand } from '../../ui/bausteine';
import { ErrorState, PageTitle, Skeleton } from '../../ui/zustaende';
import type { Kalenderstand } from '../../application/repositories';
import { WOCHENTAGE, heutebild, type Heutebild, type Paketzeile } from './heuteDaten';
import { Zeitzonenfrage } from './Zeitzonenfrage';
import './heute.css';

/**
 * „Heute" — die Startseite der lernenden Person (5B.4).
 *
 * ## Die sieben Bereiche aus § 4.1
 *
 * Weiterlernen · Fällige Wiederholungen · Meine Kurse · Zuletzt verwendet ·
 * Diese Woche · Lernserie · Ziele. Alle sieben sind immer da — auch bei einem
 * frischen Konto. Ein Bereich, der bei leeren Daten verschwindet, macht aus
 * einem Anfang eine kaputte Seite.
 *
 * ## Nur echte Zahlen
 *
 * Keine Lernzeit (E25), keine Schätzung, kein Platzhalterwert. Fälligkeiten
 * und zuletzt benutzte Pakete kommen aus `progressOverview`, die Lerntage aus
 * `learningDays` — beide ohne einen Parameter, mit dem sich etwas hindrehen
 * ließe. Wo eine Zahl fehlt, fehlt sie sichtbar.
 *
 * ## Die Zeitzone
 *
 * Fehlt sie, steht oben eine ruhige Frage (E27) — kein Dialog, kein Riegel.
 * Drei der sieben Bereiche bleiben dann unbeziffert und sagen auch, warum;
 * die anderen vier funktionieren vollständig.
 *
 * ## Eine Abfrage statt einer Kaskade
 *
 * `myDueOverview()` liefert alle Kurse und Pakete auf einmal. Die Titel
 * kommen danach je Kurs — nicht je Paket: Eine Kaskade über Pakete wüchse
 * mit dem Material, eine über Kurse mit den Kursen, und davon hat eine
 * lernende Person zwei bis fünf.
 */

type Stand =
  | { art: 'laedt' }
  | { art: 'fehler'; offline: boolean }
  | { art: 'da'; bild: Heutebild; kalender: Kalenderstand };

export function HeutePage() {
  const courses = useOptionalRepository('courses');
  const publication = useOptionalRepository('publication');
  const uebersicht = useOptionalRepository('progressOverview');
  const lerntage = useOptionalRepository('learningDays');
  const einstellungen = useOptionalRepository('learnerSettings');
  const [stand, setzeStand] = useState<Stand>({ art: 'laedt' });

  const laden = useCallback(async () => {
    setzeStand({ art: 'laedt' });
    if (!courses || !publication || !uebersicht || !lerntage || !einstellungen) {
      /*
        In einer Fassung ohne Konto gibt es diese Seite nicht. Sie trotzdem
        mit leeren Daten zu zeichnen wäre eine Behauptung über einen
        Lernstand, den niemand führt.
      */
      setzeStand({ art: 'fehler', offline: false });
      return;
    }
    try {
      const kurse = (await courses.myCourses()).filter((kurs) => !kurs.archived);
      const titel = new Map<string, string>();
      for (const kurs of kurse) {
        for (const revision of await publication.publishedForCourse(kurs.id)) {
          titel.set(`${kurs.id}::${revision.packId}`, revision.pack.meta.title);
        }
      }

      const [zeilen, kalender, tage, meine] = await Promise.all([
        uebersicht.myDueOverview(),
        lerntage.myCalendar(),
        lerntage.myLearningDays(),
        einstellungen.mySettings(),
      ]);

      setzeStand({
        art: 'da',
        kalender,
        bild: heutebild({
          uebersicht: zeilen,
          kurse,
          paketTitel: titel,
          kalender,
          lerntage: tage,
          einstellungen: meine,
        }),
      });
    } catch {
      setzeStand({ art: 'fehler', offline: typeof navigator !== 'undefined' && !navigator.onLine });
    }
  }, [courses, publication, uebersicht, lerntage, einstellungen]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const bestaetigen = useCallback(
    async (zone: string) => {
      await einstellungen!.confirmTimeZone(zone);
      await laden();
    },
    [einstellungen, laden],
  );

  return (
    <div className="stack">
      <PageTitle title="Heute" description="Was heute dran ist – und wie deine Woche läuft." />

      {stand.art === 'laedt' ? <Skeleton lines={6} label="Dein Tag wird geladen" /> : null}

      {stand.art === 'fehler' ? (
        <ErrorState
          title={stand.offline ? 'Gerade keine Verbindung' : 'Heute ist gerade nicht abrufbar'}
          tone={stand.offline ? 'offline' : 'error'}
          announce={false}
          action={<Button onClick={() => void laden()}>Erneut versuchen</Button>}
        >
          <p style={{ margin: 0 }}>
            {stand.offline
              ? 'Sobald das Netz zurück ist, steht hier wieder, was heute dran ist.'
              : 'Deine Kurse, Pakete und Lerntage ließen sich nicht laden.'}
          </p>
        </ErrorState>
      ) : null}

      {stand.art === 'da' ? (
        <>
          {stand.kalender.bestaetigt ? null : <Zeitzonenfrage bestaetigen={bestaetigen} />}
          <HeuteInhalt bild={stand.bild} zeitzoneBestaetigt={stand.kalender.bestaetigt} />
        </>
      ) : null}
    </div>
  );
}

/**
 * Die sieben Bereiche ohne Laden, Fehler und Speicher — Daten hinein, Bild
 * heraus.
 *
 * Getrennt und ausgeführt, damit die Breitenmessung sie mit festen Daten in
 * einen echten Browser rendern kann. Mit den Hooks darin sähe eine Messung
 * immer nur das Skelett.
 */
export function HeuteInhalt({
  bild,
  zeitzoneBestaetigt,
}: {
  bild: Heutebild;
  zeitzoneBestaetigt: boolean;
}) {
  return (
    <div className="heute">
      <Weiterlernen paket={bild.weiterlernen} />
      <Faellig zeilen={bild.faellig} gesamt={bild.faelligGesamt} />
      <MeineKurse bild={bild} />
      <Zuletzt zeilen={bild.zuletzt} />
      <DieseWoche bild={bild} bestaetigt={zeitzoneBestaetigt} />
      <Lernserie bild={bild} bestaetigt={zeitzoneBestaetigt} />
      <Ziele bild={bild} bestaetigt={zeitzoneBestaetigt} />
    </div>
  );
}

/** Ein Abschnitt der Seite. Alle sieben sind gleich gebaut und immer da. */
function Bereich({
  titel,
  kennung,
  children,
}: {
  titel: string;
  kennung: string;
  children: React.ReactNode;
}) {
  return (
    <section className="heute__bereich" aria-labelledby={`heute-${kennung}`} data-bereich={kennung}>
      <h2 className="heute__titel" id={`heute-${kennung}`}>
        {titel}
      </h2>
      {children}
    </section>
  );
}

/** Der Weg in ein Paket. Immer eine echte Route – nie ein toter Verweis. */
function uebenWeg(paket: Paketzeile): string {
  return `/ueben/karten/${paket.courseId}/${paket.packId}`;
}

function Weiterlernen({ paket }: { paket: Paketzeile | undefined }) {
  return (
    <Bereich titel="Weiterlernen" kennung="weiterlernen">
      {paket ? (
        <div className="heute-weiter">
          <p className="heute-weiter__kurs">{paket.kurstitel}</p>
          <p className="heute-weiter__paket">{paket.titel}</p>
          <p className="heute-weiter__zahl">
            {paket.dueCount > 0
              ? `${paket.dueCount} ${paket.dueCount === 1 ? 'Wort' : 'Wörter'} fällig`
              : 'Nichts fällig – du kannst trotzdem weiterüben.'}
          </p>
          <Link className="btn btn--primary heute__ziel" to={uebenWeg(paket)}>
            Weiterlernen
          </Link>
        </div>
      ) : (
        <LeererZustand titel="Noch nichts angefangen">
          Sobald du ein Paket geübt hast, geht es hier weiter, wo du aufgehört hast.
        </LeererZustand>
      )}
    </Bereich>
  );
}

function Faellig({ zeilen, gesamt }: { zeilen: Paketzeile[]; gesamt: number }) {
  return (
    <Bereich titel="Fällige Wiederholungen" kennung="faellig">
      {zeilen.length === 0 ? (
        /*
          Ruhig und ohne Ermahnung (Konzept 4.3): Nichts fällig ist ein gutes
          Ergebnis, kein Rückstand.
        */
        <LeererZustand titel="Nichts fällig">
          Gerade wartet nichts auf dich. Üben kannst du trotzdem jederzeit.
        </LeererZustand>
      ) : (
        <>
          <p className="heute-faellig__summe">
            {gesamt} {gesamt === 1 ? 'Wort wartet' : 'Wörter warten'} auf eine Wiederholung.
          </p>
          <ul className="heute-liste">
            {zeilen.map((zeile) => (
              <li className="heute-liste__zeile" key={`${zeile.courseId}::${zeile.packId}`}>
                <Link className="heute__ziel" to={uebenWeg(zeile)}>
                  {zeile.titel}
                </Link>
                <span className="heute-liste__zahl">{zeile.dueCount}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Bereich>
  );
}

function MeineKurse({ bild }: { bild: Heutebild }) {
  return (
    <Bereich titel="Meine Kurse" kennung="kurse">
      {bild.kurse.length === 0 ? (
        <LeererZustand
          titel="Noch in keinem Kurs"
          aktion={
            <Link className="btn btn--primary heute__ziel" to="/beitreten">
              Mit einem Code beitreten
            </Link>
          }
        >
          Deine Lehrkraft gibt dir einen Code. Damit kommst du in deinen Kurs.
        </LeererZustand>
      ) : (
        <ul className="heute-liste">
          {bild.kurse.map((kurs) => (
            <li className="heute-liste__zeile" key={kurs.id}>
              <Link className="heute__ziel" to="/lernen">
                {kurs.title}
              </Link>
              {kurs.schoolYear ? (
                <span className="heute-liste__nebensache">{kurs.schoolYear}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Bereich>
  );
}

function Zuletzt({ zeilen }: { zeilen: Paketzeile[] }) {
  return (
    <Bereich titel="Zuletzt verwendet" kennung="zuletzt">
      {zeilen.length === 0 ? (
        <LeererZustand titel="Noch nichts geübt">
          Hier stehen später die Pakete, die du zuletzt in der Hand hattest.
        </LeererZustand>
      ) : (
        <ul className="heute-liste">
          {zeilen.map((zeile) => (
            <li className="heute-liste__zeile" key={`${zeile.courseId}::${zeile.packId}`}>
              <Link className="heute__ziel" to={uebenWeg(zeile)}>
                {zeile.titel}
              </Link>
              <span className="heute-liste__nebensache">{zeile.kurstitel}</span>
            </li>
          ))}
        </ul>
      )}
    </Bereich>
  );
}

/** Der Satz, der an drei Stellen dasselbe sagt: ohne Zeitzone keine Zahl. */
function OhneZeitzone({ was }: { was: string }) {
  return (
    <p className="heute__unbeziffert">
      {was} zeigen wir erst, wenn deine Zeitzone feststeht – sonst wüssten wir
      nicht, wann bei dir ein Tag beginnt.
    </p>
  );
}

function DieseWoche({ bild, bestaetigt }: { bild: Heutebild; bestaetigt: boolean }) {
  return (
    <Bereich titel="Diese Woche" kennung="woche">
      {bestaetigt ? (
        <ol className="heute-woche">
          {bild.woche.map((tag, i) => (
            <li
              className="heute-woche__tag"
              key={tag.localDay}
              data-lerntag={tag.lerntag ? 'ja' : 'nein'}
              data-kuenftig={tag.kuenftig ? 'ja' : 'nein'}
              data-heute={tag.heute ? 'ja' : 'nein'}
            >
              <span className="heute-woche__buchstabe" aria-hidden="true">
                {WOCHENTAGE[i]}
              </span>
              <span className="heute-woche__punkt" aria-hidden="true" />
              <span className="visually-hidden">
                {WOCHENTAGE[i]}:{' '}
                {tag.kuenftig
                  ? 'noch nicht dran'
                  : tag.lerntag
                    ? `Lerntag, ${tag.taskCount} Aufgaben`
                    : `${tag.taskCount} Aufgaben`}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <OhneZeitzone was="Deine Woche" />
      )}
    </Bereich>
  );
}

function Lernserie({ bild, bestaetigt }: { bild: Heutebild; bestaetigt: boolean }) {
  const serie = bild.serie;
  return (
    <Bereich titel="Lernserie" kennung="serie">
      {bestaetigt && serie ? (
        <>
          <p className="heute-serie__zahl">
            <strong>{serie.laenge}</strong> {serie.laenge === 1 ? 'Lerntag' : 'Lerntage'} in Folge
          </p>
          {/*
            Der Ton (Konzept 4.3). Keine Herzen, kein Countdown, keine
            Mahnung — und bei null Tagen kein „Du hast deine Serie
            verloren", sondern ein Satz, der nach vorn zeigt.
          */}
          <p className="heute-serie__text">
            {serie.laenge === 0
              ? 'Heute ist ein guter Tag, um wieder anzufangen.'
              : serie.heuteGeschafft
                ? 'Heute ist geschafft.'
                : 'Heute fehlen noch ein paar Aufgaben.'}
          </p>
          <p className="heute-serie__ruhe">
            {serie.ruhetageUebrig === 0
              ? 'Diese Woche sind deine beiden Ruhetage aufgebraucht.'
              : `Diese Woche hast du noch ${serie.ruhetageUebrig} ${
                  serie.ruhetageUebrig === 1 ? 'Ruhetag' : 'Ruhetage'
                }.`}
          </p>
          {/*
            Die längste bisherige Serie (§ 4.5) – als Nebensache, nicht als
            Messlatte. Sie steht nur da, wenn sie etwas anderes sagt als die
            aktuelle: „Am längsten: 3" neben „3 Lerntage in Folge" wäre
            dieselbe Zahl zweimal, und die zweite läse sich wie ein Soll.
          */}
          {serie.laengste > serie.laenge ? (
            <p className="heute-serie__laengste">
              Am längsten warst du {serie.laengste} Tage in Folge dabei.
            </p>
          ) : null}
        </>
      ) : (
        <OhneZeitzone was="Deine Lernserie" />
      )}
    </Bereich>
  );
}

function Ziele({ bild, bestaetigt }: { bild: Heutebild; bestaetigt: boolean }) {
  return (
    <Bereich titel="Ziele" kennung="ziele">
      {bild.wochenziel === undefined ? (
        <LeererZustand titel="Kein Wochenziel">
          Du kannst dir vornehmen, an wie vielen Tagen pro Woche du lernen
          willst. Eingestellt wird das unter „Mein Fortschritt".
        </LeererZustand>
      ) : bestaetigt && bild.lerntageDerWoche !== undefined ? (
        <Fortschritt
          label="Lerntage diese Woche"
          wert={bild.lerntageDerWoche}
          max={bild.wochenziel}
          einheit="Tagen"
          ton="gut"
        />
      ) : (
        <OhneZeitzone was="Deinen Wochenfortschritt" />
      )}
    </Bereich>
  );
}
