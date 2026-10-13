import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Button, Card, Field } from '../../ui/components';
import { GRADES, type Grade, suggestCefrLevel } from '../../domain/cefr';
import { newId } from '../../domain/ids';
import { LEARNING_DIRECTIONS, type LearningDirection, type VocabPack } from '../../domain/schema';
import { Verbindungsfehler } from '../verbindung';
import { Werkstatt } from './werkstatt/Werkstatt';
import {
  type GepruefterEntwurf,
  type Werkstattstand,
  anfang,
  werkstattZug,
} from './werkstatt/zustand';

/**
 * Die Werkstatt im Portal, verdrahtet.
 *
 * ## Warum die Verdrahtung hier liegt und nicht in `werkstatt/`
 *
 * Weil `src/integrationsgrenze.test.ts` den Bausteinen verbietet, sich
 * selbst ein Repository, eine Sitzung oder einen Router zu holen — und das
 * zu Recht: Ein Baustein, der sich seine Daten selbst besorgt, lässt sich
 * nur noch im ganzen Portal prüfen. Diese Seite ist die eine Stelle, an der
 * beides zusammenkommt.
 *
 * ## Warum nichts von allein veröffentlicht wird
 *
 * „Veröffentlichen" friert eine Fassung ein, „zuweisen" legt sie vor eine
 * Lerngruppe. Beides sind Entscheidungen einer Lehrkraft über etwas, das
 * danach andere sehen. Ein Assistent, der am Ende beides selbst tut, nimmt
 * ihr die Entscheidung in dem Moment ab, in dem sie am wenigsten damit
 * rechnet — nämlich beim Speichern.
 *
 * Deshalb: Der letzte Schritt der Werkstatt **speichert einen Entwurf**.
 * Was danach möglich ist, steht als Satz daneben, und der Weg dorthin ist
 * ein Verweis, kein Automatismus.
 */

type Seitenstand =
  | { readonly art: 'werkstatt' }
  | { readonly art: 'speichert' }
  | { readonly art: 'fehler'; readonly meldung: string }
  | { readonly art: 'gespeichert'; readonly titel: string; readonly anzahl: number };

/**
 * Die Angaben, die ein Paket über den Titel hinaus braucht.
 *
 * `PackMeta` verlangt Jahrgang, Niveau und Richtung. Der Jahrgang lässt
 * sich aus einer Vokabelliste nicht ablesen, und das GeR-Niveau hängt an
 * ihm. Sie werden deshalb **gefragt** statt geraten: Eine Klasse 7, die in
 * Wahrheit eine 9 ist, fällt niemandem auf und sortiert das Paket trotzdem
 * falsch ein.
 */
interface Angaben {
  readonly grade: Grade;
  readonly direction: LearningDirection;
}

const RICHTUNGSTEXTE: Readonly<Record<LearningDirection, string>> = {
  'en-de': 'Englisch → Deutsch',
  'de-en': 'Deutsch → Englisch',
  both: 'Beide Richtungen',
};

export function WerkstattPage() {
  const packs = useOptionalRepository('packs');
  const navigate = useNavigate();

  const [stand, setzeStand] = useState<Werkstattstand>(anfang);
  const [seite, setzeSeite] = useState<Seitenstand>({ art: 'werkstatt' });
  const [angaben, setzeAngaben] = useState<Angaben>({ grade: '7', direction: 'en-de' });

  const zug = useCallback((naechster: Parameters<typeof werkstattZug>[1]) => {
    setzeStand((bisher) => werkstattZug(bisher, naechster));
  }, []);

  /**
   * Die Datei lesen und dem Automaten übergeben.
   *
   * Der Automat liest nicht selbst: Ein `File` gibt es nur im Browser, und
   * eine Zustandsfunktion, die auf das Dateisystem wartet, lässt sich nicht
   * mehr als Funktion prüfen.
   */
  const dateiLesen = useCallback(
    async (datei: File) => {
      zug({ art: 'datei-gewaehlt', name: datei.name });
      try {
        const inhalt = /\.xlsx$/i.test(datei.name)
          ? await datei.arrayBuffer()
          : await datei.text();
        zug({
          art: 'datei-gelesen',
          quelle: { art: 'datei', name: datei.name, groesse: datei.size, inhalt },
        });
      } catch {
        zug({
          art: 'lesen-gescheitert',
          grund: `„${datei.name}" ließ sich nicht öffnen. Vielleicht ist die Datei gerade in einem anderen Programm.`,
        });
      }
    },
    [zug],
  );

  async function anlegen(entwurf: GepruefterEntwurf) {
    if (!packs) return;
    setzeSeite({ art: 'speichert' });
    const jetzt = new Date().toISOString();
    const paket: VocabPack = {
      meta: {
        id: newId(),
        title: entwurf.titel,
        topic: '',
        grade: angaben.grade,
        cefrLevel: suggestCefrLevel(angaben.grade),
        /*
          Nicht überschrieben: Das Niveau kommt hier aus dem Jahrgang und
          sonst nirgendwoher. `true` hiesse, jemand habe es bewusst
          abweichend gesetzt — das wäre eine Behauptung über eine
          Entscheidung, die niemand getroffen hat.
        */
        cefrLevelOverridden: false,
        direction: angaben.direction,
        createdAt: jetzt,
        updatedAt: jetzt,
      },
      entries: [...entwurf.eintraege],
    };

    try {
      await packs.saveDraft(paket);
      setzeSeite({ art: 'gespeichert', titel: entwurf.titel, anzahl: entwurf.eintraege.length });
    } catch (fehler) {
      setzeSeite({
        art: 'fehler',
        meldung:
          fehler instanceof Error ? fehler.message : 'Das Lernpaket wurde nicht gespeichert.',
      });
    }
  }

  if (!packs) {
    return <Alert tone="info">In dieser Fassung gibt es keine Lernpakete im Konto.</Alert>;
  }

  if (seite.art === 'gespeichert') {
    return (
      <div className="stack">
        <h1>Lernpaket angelegt</h1>
        <Alert tone="success" title={`„${seite.titel}" liegt als Entwurf in deinem Konto`}>
          <p>
            {seite.anzahl === 1 ? 'Eine Vokabel' : `${seite.anzahl} Vokabeln`} übernommen. Der
            Entwurf gehört vorerst dir allein — niemand in einer Lerngruppe sieht ihn.
          </p>
        </Alert>
        <Card>
          <h2 className="werkstatt__titel">Was als Nächstes möglich ist</h2>
          <ol className="stack stack--tight">
            <li>
              <strong>Veröffentlichen.</strong> Dabei wird der heutige Stand als unveränderliche
              Fassung eingefroren.
            </li>
            <li>
              <strong>Einer Lerngruppe geben.</strong> Erst danach sehen Lernende das Paket.
            </li>
          </ol>
          <p className="small muted">
            Beides entscheidest du auf der Seite „Lernpakete“ — hier passiert nichts von allein.
          </p>
          <div className="row">
            <Link className="btn btn--primary" to="/pakete">
              Zu den Lernpaketen
            </Link>
            <Button
              variant="quiet"
              onClick={() => {
                setzeStand(anfang());
                setzeSeite({ art: 'werkstatt' });
              }}
            >
              Noch eines anlegen
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (seite.art === 'fehler') {
    return (
      <div className="stack">
        <h1>Neues Lernpaket</h1>
        {/*
          Der Entwurf in `stand` bleibt stehen: Wer eine Liste von hundert
          Vokabeln geprüft hat, soll sie nach einem Verbindungsabbruch nicht
          noch einmal einfügen.
        */}
        <Verbindungsfehler
          was="Das Lernpaket"
          erneut={() => setzeSeite({ art: 'werkstatt' })}
        >
          <p className="small muted">{seite.meldung}</p>
        </Verbindungsfehler>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="seitenkopf">
        <div className="seitenkopf__text">
          <h1>Neues Lernpaket</h1>
          <p className="muted">
            Liste einfügen oder Datei wählen — das Format wird erkannt.
          </p>
        </div>
        <div className="seitenkopf__aktionen">
          <Button variant="quiet" onClick={() => navigate('/pakete')}>
            Abbrechen
          </Button>
        </div>
      </div>

      {stand.schritt === 'vorschau' ? (
        <Card>
          <div className="werkstatt__felder">
            <Field label="Jahrgang" hint="Bestimmt das vorgeschlagene GeR-Niveau.">
              {(props) => (
                <select
                  {...props}
                  value={angaben.grade}
                  onChange={(ereignis) =>
                    setzeAngaben((bisher) => ({
                      ...bisher,
                      grade: ereignis.target.value as Grade,
                    }))
                  }
                >
                  {GRADES.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Abfragerichtung">
              {(props) => (
                <select
                  {...props}
                  value={angaben.direction}
                  onChange={(ereignis) =>
                    setzeAngaben((bisher) => ({
                      ...bisher,
                      direction: ereignis.target.value as LearningDirection,
                    }))
                  }
                >
                  {LEARNING_DIRECTIONS.map((richtung) => (
                    <option key={richtung} value={richtung}>
                      {RICHTUNGSTEXTE[richtung]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </Card>
      ) : null}

      <Werkstatt
        stand={stand}
        aufZug={zug}
        aufDatei={(datei) => {
          void dateiLesen(datei);
        }}
        aufFertig={(entwurf) => {
          void anlegen(entwurf);
        }}
        gibtAb={seite.art === 'speichert'}
      />
    </div>
  );
}

export default WerkstattPage;
