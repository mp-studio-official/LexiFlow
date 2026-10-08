import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Button } from '../../ui/components';
import { Fortschritt, LeererZustand } from '../../ui/bausteine';
import { ErrorState, PageTitle, Skeleton } from '../../ui/zustaende';
import { WOCHENTAGE } from './heuteDaten';
import { zeitzonenliste } from './Zeitzonenfrage';
import { zeitzonenVorschlag } from '../../domain/zeitzone';
import { WOCHENZIEL_MAX, WOCHENZIEL_MIN } from '../../domain/zeitzone';
import { fortschrittsbild, type Fortschrittsbild, type Kursmaterial } from './fortschrittDaten';
import './fortschritt.css';

/**
 * „Mein Fortschritt" (5B.6).
 *
 * ## Die acht Abschnitte
 *
 * Lernserie · Längste Serie · Diese Woche · Wochenziel · Beherrscht und
 * offen · Nach Kurs und Paket · Schwierige Wörter · Zeitzone. Alle acht sind
 * immer da, auch bei einem frischen Konto.
 *
 * ## Was hier nicht steht
 *
 * Keine Lernzeit (E25), keine Rangliste, keine Herzen, kein Vergleich mit
 * anderen, keine Lehrkraftauswertung. Was jemand hier sieht, ist
 * ausschließlich der eigene Lernstand — `allMyEntryProgress()` hat keinen
 * Parameter für eine andere Person, und es gibt keinen zweiten Weg.
 *
 * ## Der Ton
 *
 * Ein Ziel ist eine Absicht, keine Pflicht. „Noch 2 Tage" statt „2 Tage
 * Rückstand"; eine leere Liste schwieriger Wörter ist ein gutes Ergebnis und
 * wird auch so benannt.
 */

type Stand =
  | { art: 'laedt' }
  | { art: 'fehler'; offline: boolean }
  | { art: 'da'; bild: Fortschrittsbild };

export function FortschrittPage() {
  const courses = useOptionalRepository('courses');
  const publication = useOptionalRepository('publication');
  const uebersicht = useOptionalRepository('progressOverview');
  const lerntage = useOptionalRepository('learningDays');
  const einstellungen = useOptionalRepository('learnerSettings');
  const [stand, setzeStand] = useState<Stand>({ art: 'laedt' });

  const laden = useCallback(async () => {
    setzeStand({ art: 'laedt' });
    if (!courses || !publication || !uebersicht || !lerntage || !einstellungen) {
      setzeStand({ art: 'fehler', offline: false });
      return;
    }
    try {
      const kurse = await courses.myCourses();
      const material: Kursmaterial[] = [];
      for (const kurs of kurse) {
        material.push({ kurs, fassungen: await publication.publishedForCourse(kurs.id) });
      }

      const [staende, kalender, tage, meine] = await Promise.all([
        uebersicht.allMyEntryProgress(),
        lerntage.myCalendar(),
        lerntage.myLearningDays(),
        einstellungen.mySettings(),
      ]);

      setzeStand({
        art: 'da',
        bild: fortschrittsbild({ material, staende, kalender, lerntage: tage, einstellungen: meine }),
      });
    } catch {
      setzeStand({ art: 'fehler', offline: typeof navigator !== 'undefined' && !navigator.onLine });
    }
  }, [courses, publication, uebersicht, lerntage, einstellungen]);

  useEffect(() => {
    void laden();
  }, [laden]);

  /*
    Nach einer Änderung wird **alles** neu geladen, nicht nur der geänderte
    Wert. Bei der Zeitzone ist das keine Bequemlichkeit: Sie verschiebt die
    Tagesgrenze, und damit ändern sich Kalender, Woche und Serie — die
    rechnet der Server, nicht diese Seite.
  */
  const zielSetzen = useCallback(
    async (tage: number | undefined) => {
      await einstellungen!.setWeeklyGoalDays(tage);
      await laden();
    },
    [einstellungen, laden],
  );

  const zoneSetzen = useCallback(
    async (zone: string) => {
      await einstellungen!.confirmTimeZone(zone);
      await laden();
    },
    [einstellungen, laden],
  );

  return (
    <div className="stack">
      <PageTitle
        title="Mein Fortschritt"
        description="Was du schon kannst – und was noch offen ist."
      />

      {stand.art === 'laedt' ? <Skeleton lines={6} label="Dein Fortschritt wird geladen" /> : null}

      {stand.art === 'fehler' ? (
        <ErrorState
          title={stand.offline ? 'Gerade keine Verbindung' : 'Dein Fortschritt ist nicht abrufbar'}
          tone={stand.offline ? 'offline' : 'error'}
          announce={false}
          action={<Button onClick={() => void laden()}>Erneut versuchen</Button>}
        >
          <p style={{ margin: 0 }}>
            {stand.offline
              ? 'Sobald das Netz zurück ist, steht hier wieder, wie weit du bist.'
              : 'Deine Kurse, Pakete und Lernstände ließen sich nicht laden.'}
          </p>
        </ErrorState>
      ) : null}

      {stand.art === 'da' ? (
        <FortschrittInhalt bild={stand.bild} zielSetzen={zielSetzen} zoneSetzen={zoneSetzen} />
      ) : null}
    </div>
  );
}

/**
 * Die acht Abschnitte ohne Laden, Fehler und Speicher.
 *
 * Getrennt und ausgeführt, damit die Breitenmessung sie mit festen Daten in
 * einen echten Browser rendern kann.
 */
export function FortschrittInhalt({
  bild,
  zielSetzen,
  zoneSetzen,
}: {
  bild: Fortschrittsbild;
  zielSetzen: (tage: number | undefined) => Promise<void> | void;
  zoneSetzen: (zone: string) => Promise<void> | void;
}) {
  return (
    <div className="fortschritt">
      <Serienteil bild={bild} />
      <Wocheteil bild={bild} />
      <Zielteil bild={bild} speichern={zielSetzen} />
      <Beherrschtteil bild={bild} />
      <Kursteil bild={bild} />
      <Schwierigteil bild={bild} />
      <Zeitzonenteil bild={bild} speichern={zoneSetzen} />
    </div>
  );
}

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
    <section
      className="fortschritt__bereich"
      aria-labelledby={`fortschritt-${kennung}`}
      data-bereich={kennung}
    >
      <h2 className="fortschritt__titel" id={`fortschritt-${kennung}`}>
        {titel}
      </h2>
      {children}
    </section>
  );
}

/** Der Satz, der an drei Stellen dasselbe sagt: ohne Zeitzone keine Zahl. */
function OhneZeitzone({ was }: { was: string }) {
  return (
    <p className="fortschritt__unbeziffert">
      {was} zeigen wir erst, wenn deine Zeitzone feststeht – sonst wüssten wir
      nicht, wann bei dir ein Tag beginnt. Du kannst sie unten eintragen.
    </p>
  );
}

/* ----------------------------------------- 1 und 2: die beiden Serien ---- */

function Serienteil({ bild }: { bild: Fortschrittsbild }) {
  const serie = bild.serie;
  return (
    <Bereich titel="Lernserie" kennung="serie">
      {serie ? (
        <>
          <p className="fortschritt__zahl">
            <strong>{serie.laenge}</strong>{' '}
            {serie.laenge === 1 ? 'Lerntag' : 'Lerntage'} in Folge
          </p>
          <p className="fortschritt__text">
            {serie.laenge === 0
              ? 'Heute ist ein guter Tag, um wieder anzufangen.'
              : serie.heuteGeschafft
                ? 'Heute ist geschafft.'
                : 'Heute fehlen noch ein paar Aufgaben.'}
          </p>
          {/*
            Die längste Serie steht hier immer – anders als auf „Heute", wo
            sie Nebensache ist. Das ist der Ort, an dem jemand nachsieht, was
            er schon geschafft hat (§ 4.5), und dort gehört sie hin, auch
            wenn sie gerade dieselbe Zahl ist.
          */}
          <p className="fortschritt__neben">
            Am längsten: <strong>{serie.laengste}</strong>{' '}
            {serie.laengste === 1 ? 'Lerntag' : 'Lerntage'} in Folge
          </p>
          <p className="fortschritt__neben">
            {serie.ruhetageUebrig === 0
              ? 'Diese Woche sind deine beiden Ruhetage aufgebraucht.'
              : `Diese Woche hast du noch ${serie.ruhetageUebrig} ${
                  serie.ruhetageUebrig === 1 ? 'Ruhetag' : 'Ruhetage'
                }.`}
          </p>
        </>
      ) : (
        <OhneZeitzone was="Deine Lernserie" />
      )}
    </Bereich>
  );
}

/* ------------------------------------------------- 3: diese Woche -------- */

function Wocheteil({ bild }: { bild: Fortschrittsbild }) {
  return (
    <Bereich titel="Diese Woche" kennung="woche">
      {bild.woche.length > 0 ? (
        <>
          <ol className="fortschritt-woche">
            {bild.woche.map((tag, i) => (
              <li
                className="fortschritt-woche__tag"
                key={tag.localDay}
                data-lerntag={tag.lerntag ? 'ja' : 'nein'}
                data-kuenftig={tag.kuenftig ? 'ja' : 'nein'}
                data-heute={tag.heute ? 'ja' : 'nein'}
              >
                <span className="fortschritt-woche__buchstabe" aria-hidden="true">
                  {WOCHENTAGE[i]}
                </span>
                <span className="fortschritt-woche__punkt" aria-hidden="true" />
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
          <p className="fortschritt__text">
            {bild.lerntageDerWoche === 1
              ? '1 Lerntag diese Woche.'
              : `${bild.lerntageDerWoche ?? 0} Lerntage diese Woche.`}
          </p>
        </>
      ) : (
        <OhneZeitzone was="Deine Woche" />
      )}
    </Bereich>
  );
}

/* --------------------------------------------------- 4: das Wochenziel -- */

/**
 * Das Wochenziel – Lerntage je Woche, 1 bis 7, oder keines (E26).
 *
 * ## Warum kein Schieberegler und keine Minuten
 *
 * Minuten scheiden mit E25 aus. Ein Schieberegler mit sieben Rasten ist mit
 * dem Finger schwer zu treffen und für Hilfsmittel schlechter als eine
 * Auswahlliste, die jede Möglichkeit beim Namen nennt.
 *
 * ## Warum „Kein Ziel" in derselben Liste steht
 *
 * Weil es eine der Möglichkeiten ist und kein Sonderfall. Ein eigener Knopf
 * „Ziel löschen" daneben machte aus dem Abschalten eine Handlung mit
 * Beigeschmack.
 */
function Zielteil({
  bild,
  speichern,
}: {
  bild: Fortschrittsbild;
  speichern: (tage: number | undefined) => Promise<void> | void;
}) {
  const feldId = useId();
  const [wahl, setzeWahl] = useState<string>(
    bild.wochenziel === undefined ? '' : String(bild.wochenziel),
  );
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState('');
  const geaendert = wahl !== (bild.wochenziel === undefined ? '' : String(bild.wochenziel));

  async function sichern() {
    setzeLaeuft(true);
    setzeFehler('');
    try {
      await speichern(wahl === '' ? undefined : Number(wahl));
    } catch {
      setzeFehler('Dein Ziel wurde nicht gespeichert. Versuch es gleich noch einmal.');
    } finally {
      setzeLaeuft(false);
    }
  }

  return (
    <Bereich titel="Wochenziel" kennung="ziel">
      {bild.wochenziel === undefined ? (
        <p className="fortschritt__text">
          Du kannst dir vornehmen, an wie vielen Tagen pro Woche du lernen
          willst. Freiwillig – ohne Ziel funktioniert hier alles genauso.
        </p>
      ) : bild.lerntageDerWoche === undefined ? (
        <OhneZeitzone was="Deinen Wochenfortschritt" />
      ) : (
        <Fortschritt
          label="Lerntage diese Woche"
          /*
            Gedeckelt für den Balken, damit er nicht über sein Ende
            hinauswächst — die echte Zahl steht daneben im Satz und bleibt
            lesbar, auch wenn sie größer ist als das Ziel.
          */
          wert={Math.min(bild.lerntageDerWoche, bild.wochenziel)}
          max={bild.wochenziel}
          einheit="Tagen"
          ton="gut"
        />
      )}

      {bild.wochenziel !== undefined && bild.lerntageDerWoche !== undefined ? (
        <p className="fortschritt__neben">
          {bild.lerntageDerWoche >= bild.wochenziel
            ? `Geschafft – ${bild.lerntageDerWoche} von ${bild.wochenziel} Tagen.`
            : `Noch ${bild.wochenziel - bild.lerntageDerWoche} ${
                bild.wochenziel - bild.lerntageDerWoche === 1 ? 'Tag' : 'Tage'
              } bis zu deinem Ziel.`}
        </p>
      ) : null}

      <div className="fortschritt-feld">
        <label className="fortschritt-feld__label" htmlFor={feldId}>
          Lerntage pro Woche
        </label>
        <select
          className="fortschritt-feld__eingabe"
          id={feldId}
          value={wahl}
          onChange={(ereignis) => setzeWahl(ereignis.target.value)}
        >
          <option value="">Kein Ziel</option>
          {Array.from({ length: WOCHENZIEL_MAX - WOCHENZIEL_MIN + 1 }, (_, i) => i + WOCHENZIEL_MIN).map(
            (tage) => (
              <option key={tage} value={String(tage)}>
                {tage} {tage === 1 ? 'Tag' : 'Tage'}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="fortschritt-feld__knoepfe">
        <Button variant="primary" onClick={() => void sichern()} disabled={laeuft || !geaendert}>
          Ziel speichern
        </Button>
      </div>
      {fehler ? (
        <p className="fortschritt__fehler" role="alert">
          {fehler}
        </p>
      ) : null}
    </Bereich>
  );
}

/* ------------------------------------------ 5: beherrscht und offen ----- */

function Beherrschtteil({ bild }: { bild: Fortschrittsbild }) {
  const { beherrscht, offen, gesamt } = bild.gesamt;
  return (
    <Bereich titel="Beherrscht und offen" kennung="beherrscht">
      {gesamt === 0 ? (
        <LeererZustand titel="Noch keine Vokabeln">
          Sobald in einem deiner Kurse ein Lernpaket liegt, steht hier, wie
          weit du bist.
        </LeererZustand>
      ) : (
        <>
          <Fortschritt
            label="Beherrschte Vokabeln"
            wert={beherrscht}
            max={gesamt}
            einheit="Wörtern"
            ton="gut"
          />
          <p className="fortschritt__neben">
            {/*
              „Beherrscht" heißt hier Fach 4 oder 5 in allen aktiven
              Richtungen — eine andere Schwelle als „sicher gelernt" (Fach 5)
              in den Übungsansichten. Der Satz sagt das in Worten, damit
              niemand zwei Zahlen vergleicht, die verschiedene Fragen
              beantworten.
            */}
            {beherrscht} sitzen schon, {offen} sind noch offen. Offen heißt
            auch: noch nicht geübt.
          </p>
        </>
      )}
    </Bereich>
  );
}

/* ------------------------------------------ 6: nach Kurs und Paket ------ */

function Kursteil({ bild }: { bild: Fortschrittsbild }) {
  return (
    <Bereich titel="Nach Kurs und Paket" kennung="kurse">
      {bild.kurse.length === 0 ? (
        <LeererZustand
          titel="Noch in keinem Kurs"
          aktion={
            <Link className="btn btn--primary fortschritt__ziel" to="/beitreten">
              Mit einem Code beitreten
            </Link>
          }
        >
          Deine Lehrkraft gibt dir einen Code. Damit kommst du in deinen Kurs.
        </LeererZustand>
      ) : (
        <ul className="fortschritt-kurse">
          {bild.kurse.map((kurs) => (
            <li className="fortschritt-kurse__kurs" key={kurs.courseId}>
              <h3 className="fortschritt-kurse__titel">{kurs.titel}</h3>
              {kurs.pakete.length === 0 ? (
                <p className="fortschritt__neben">In diesem Kurs liegt noch kein Lernpaket.</p>
              ) : (
                <ul className="fortschritt-kurse__pakete">
                  {kurs.pakete.map((paket) => (
                    <li className="fortschritt-kurse__paket" key={paket.packId}>
                      <Fortschritt
                        label={paket.titel}
                        wert={paket.stand.beherrscht}
                        max={Math.max(1, paket.stand.gesamt)}
                        einheit="Wörtern"
                        ton="gut"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Bereich>
  );
}

/* ------------------------------------------ 7: schwierige Wörter -------- */

function Schwierigteil({ bild }: { bild: Fortschrittsbild }) {
  return (
    <Bereich titel="Schwierige Wörter" kennung="schwierig">
      {bild.schwierige.length === 0 ? (
        /*
          Ruhig und ohne Defizitton (Konzept 4.3): Keine schwierigen Wörter
          ist ein gutes Ergebnis. Kein Rot, keine Warnung.
        */
        <LeererZustand titel="Gerade hakt nichts">
          Hier stehen Wörter, bei denen es mehrmals danebenging und die noch
          nicht sitzen. Zurzeit ist keines dabei.
        </LeererZustand>
      ) : (
        <ul className="fortschritt-schwierig">
          {bild.schwierige.map((wort) => (
            <li className="fortschritt-schwierig__zeile" key={wort.schluessel}>
              <span className="fortschritt-schwierig__wort">{wort.wort}</span>
              <span className="fortschritt-schwierig__herkunft">
                {wort.paket} · {wort.kurs} ·{' '}
                {wort.richtung === 'en-de' ? 'Englisch → Deutsch' : 'Deutsch → Englisch'}
              </span>
              <Link className="fortschritt__ziel" to={wort.weg}>
                Üben
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bereich>
  );
}

/* ------------------------------------------ 8: die Zeitzone ------------- */

/**
 * Die Zeitzone bearbeiten (E27).
 *
 * ## Dieselbe Zusage wie auf „Heute"
 *
 * Der Browser darf vorschlagen, gespeichert wird erst nach ausdrücklichem
 * Klick. Ein anderes Gerät überschreibt nichts: Was hier steht, ist der
 * **gespeicherte** Wert, und die Auswahl beginnt bei ihm.
 *
 * ## Warum es „Abbrechen" gibt und was es tut
 *
 * Es setzt die Auswahl auf den gespeicherten Wert zurück und speichert
 * nichts. Ohne diesen Weg bliebe eine versehentlich geänderte Auswahl stehen
 * und sähe aus wie der aktuelle Zustand — ein unbestätigter Wert, der wie
 * ein bestätigter aussieht, ist genau das, was E27 ausschließt.
 */
function Zeitzonenteil({
  bild,
  speichern,
}: {
  bild: Fortschrittsbild;
  speichern: (zone: string) => Promise<void> | void;
}) {
  const feldId = useId();
  const vorschlag = bild.timeZone === undefined ? zeitzonenVorschlag() : undefined;
  const anfang = bild.timeZone ?? vorschlag ?? '';
  const [wahl, setzeWahl] = useState(anfang);
  const [laeuft, setzeLaeuft] = useState(false);
  const [fehler, setzeFehler] = useState('');
  const geaendert = wahl !== (bild.timeZone ?? '');

  async function sichern() {
    if (wahl === '') return;
    setzeLaeuft(true);
    setzeFehler('');
    try {
      await speichern(wahl);
    } catch {
      /*
        Die Datenbank hat den Wert abgelehnt — er ist nicht gespeichert, und
        die Seite darf ihn nicht so zeigen, als wäre er es. Deshalb bleibt
        oben der alte Wert stehen und hier erscheint der Satz.
      */
      setzeFehler('Diese Zeitzone wurde nicht gespeichert. Sie ist unverändert geblieben.');
    } finally {
      setzeLaeuft(false);
    }
  }

  return (
    <Bereich titel="Zeitzone" kennung="zeitzone">
      <p className="fortschritt__text">
        {bild.timeZone === undefined ? (
          <>
            Noch nicht festgelegt. Daraus ergibt sich, wann bei dir ein Tag
            beginnt – ohne sie zeigen wir deine Serie und deine Woche nicht an.
          </>
        ) : (
          <>
            Gespeichert: <strong className="fortschritt__wert">{bild.timeZone}</strong>
          </>
        )}
      </p>
      {vorschlag !== undefined ? (
        <p className="fortschritt__neben">Dein Gerät meint: {vorschlag}</p>
      ) : null}

      <div className="fortschritt-feld">
        {/*
          „Deine Zeitzone" und nicht „Zeitzone": Der Abschnitt heisst schon
          so, und zwei Dinge mit demselben Namen sind für eine
          Bildschirmleserin zwei Dinge mit demselben Namen — die Überschrift
          des Abschnitts und das Feld darin.
        */}
        <label className="fortschritt-feld__label" htmlFor={feldId}>
          Deine Zeitzone
        </label>
        <select
          className="fortschritt-feld__eingabe"
          id={feldId}
          value={wahl}
          onChange={(ereignis) => setzeWahl(ereignis.target.value)}
        >
          {/*
            Ohne gespeicherten Wert und ohne Vorschlag beginnt die Auswahl
            bei „Zeitzone auswählen" – nicht bei einer Voreinstellung, die
            ein versehentlicher Klick zur Bestätigung machte (E27).
          */}
          {wahl === '' ? <option value="">Zeitzone auswählen</option> : null}
          {zeitzonenliste(bild.timeZone ?? vorschlag).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>

      <div className="fortschritt-feld__knoepfe">
        <Button
          variant="primary"
          onClick={() => void sichern()}
          disabled={laeuft || wahl === '' || !geaendert}
        >
          Zeitzone speichern
        </Button>
        {geaendert ? (
          <Button variant="quiet" onClick={() => setzeWahl(bild.timeZone ?? '')}>
            Abbrechen
          </Button>
        ) : null}
      </div>
      {fehler ? (
        <p className="fortschritt__fehler" role="alert">
          {fehler}
        </p>
      ) : null}
    </Bereich>
  );
}
