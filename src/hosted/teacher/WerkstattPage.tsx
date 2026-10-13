import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOptionalRepository } from '../../application/RepositoryContext';
import { Alert, Button, Card, Field } from '../../ui/components';
import { GRADES, type Grade, suggestCefrLevel } from '../../domain/cefr';
import { newId } from '../../domain/ids';
import { LEARNING_DIRECTIONS, type LearningDirection, type VocabPack } from '../../domain/schema';
import { Verbindungsfehler } from '../verbindung';
import { erkenneQuelle } from '../../import/universal';
import { Textwerkstatt } from './werkstatt/Textwerkstatt';
import { Werkstatt } from './werkstatt/Werkstatt';
import { TEXTVORSCHLAEGE, baueAnfrage, leseAntwort } from './werkstatt/kivertrag';
import {
  type Textstand,
  type Textzug,
  textZug,
  textanfang,
} from './werkstatt/textzustand';
import {
  type GepruefterEntwurf,
  type Werkstattstand,
  type Werkstattzug,
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
 *
 * ## Warum hier zwei Automaten stehen
 *
 * Weil es zwei Sachen sind. Eine Vokabelliste wird **gelesen** — Zeilen,
 * Spalten, fertig. Ein Fließtext wird **analysiert** und danach Wort für
 * Wort mit der Lehrkraft besprochen. Beides in einen Automaten zu
 * zwängen hiesse, in jedem Zug zu fragen, welcher Fall gerade gilt.
 *
 * Diese Seite ist die Weiche: Sie fragt `erkenneQuelle`, und was
 * Fließtext ist, geht gar nicht erst in den Listenweg. Die Erkennung
 * steht dabei an **einer** Stelle — würde die Weiche eigene Regeln
 * anwenden, gäbe es zwei Meinungen darüber, was ein Text ist.
 *
 * ## Warum der KI-Aufruf hier liegt
 *
 * Weil `src/integrationsgrenze.test.ts` ihn den Bausteinen verbietet,
 * und weil es im Portal genau einen Weg zu einem Modell gibt:
 * `AiGateway.invoke` und dahinter die Serverfunktion mit Tresor und
 * Rollenprüfung. Fehlt `repositories.ai` — im Pilotbetrieb entfernt ihn
 * `ohneGesperrteKi` —, bekommt die Textwerkstatt keinen Rückruf und
 * zeigt die Karte gar nicht erst.
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
  const ai = useOptionalRepository('ai');
  const navigate = useNavigate();

  const [stand, setzeStand] = useState<Werkstattstand>(anfang);
  const [textstand, setzeTextstand] = useState<Textstand>(textanfang);
  const [seite, setzeSeite] = useState<Seitenstand>({ art: 'werkstatt' });
  const [angaben, setzeAngaben] = useState<Angaben>({ grade: '7', direction: 'en-de' });

  const textzug = useCallback((naechster: Textzug) => {
    setzeTextstand((bisher) => textZug(bisher, naechster));
  }, []);

  /**
   * Die Weiche.
   *
   * Ein Zug, der Text mitbringt, wird vorher gefragt: Prosa oder Liste?
   * Prosa geht in die Textwerkstatt, alles andere seinen gewohnten Weg.
   */
  const zug = useCallback(
    (naechster: Werkstattzug) => {
      if (naechster.art === 'text-eingefuegt') {
        if (erkenneQuelle({ art: 'text', text: naechster.text }).art === 'fliesstext') {
          setzeTextstand(textZug(textanfang(), { art: 'text-analysiert', text: naechster.text }));
          return;
        }
      }
      if (naechster.art === 'datei-gelesen' && typeof naechster.quelle !== 'string') {
        const erkennung = erkenneQuelle(naechster.quelle);
        if (erkennung.art === 'fliesstext' && naechster.quelle.art === 'datei') {
          const inhalt = naechster.quelle.inhalt;
          if (typeof inhalt === 'string') {
            setzeStand(anfang());
            setzeTextstand(textZug(textanfang(), { art: 'text-analysiert', text: inhalt }));
            return;
          }
        }
      }
      setzeStand((bisher) => werkstattZug(bisher, naechster));
    },
    [],
  );

  /**
   * Übersetzungsvorschläge holen — der einzige Netzweg dieser Seite.
   *
   * Erst auf Klick, nie beim Öffnen. Die Verbindungen werden ebenfalls
   * erst hier gelesen: Eine Liste, die beim Öffnen geladen wird, ist ein
   * Serveraufruf für einen Knopf, den vielleicht niemand drückt.
   */
  const vorschlaegeHolen = useCallback(async () => {
    if (!ai) return;
    textzug({ art: 'ki-gestartet' });
    const anfrage = baueAnfrage(textstand.zeilen, {
      grade: angaben.grade,
      cefrLevel: suggestCefrLevel(angaben.grade),
    });
    if (anfrage.candidates.length === 0) {
      textzug({ art: 'ki-vorschlaege', vorschlaege: [] });
      return;
    }
    try {
      const verbindungen = await ai.listConnections();
      const passend = verbindungen.find(
        (verbindung) => verbindung.active && verbindung.capabilities.includes(TEXTVORSCHLAEGE),
      );
      if (!passend) {
        textzug({
          art: 'ki-gescheitert',
          grund:
            'Es ist keine KI-Verbindung hinterlegt, die Übersetzungsvorschläge anbietet. Unter „Einstellungen“ lässt sich eine anlegen.',
        });
        return;
      }
      const antwort = await ai.invoke({
        connectionId: passend.id,
        capability: TEXTVORSCHLAEGE,
        payload: anfrage,
      });
      textzug({ art: 'ki-vorschlaege', vorschlaege: leseAntwort(antwort) });
    } catch (fehler) {
      textzug({
        art: 'ki-gescheitert',
        grund:
          fehler instanceof Error ? fehler.message : 'Der KI-Zugang ist gerade nicht erreichbar.',
      });
    }
  }, [ai, angaben.grade, textstand.zeilen, textzug]);

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
                setzeTextstand(textanfang());
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

  const imText = textstand.schritt === 'analysiert';

  return (
    <div className="stack">
      <div className="seitenkopf">
        <div className="seitenkopf__text">
          <h1>Neues Lernpaket</h1>
          <p className="muted">
            {imText
              ? 'Aus deinem Text — ausgewählt und geprüft wird von dir.'
              : 'Text, Liste oder Datei einfügen — die Quelle wird erkannt.'}
          </p>
        </div>
        <div className="seitenkopf__aktionen">
          <Button variant="quiet" onClick={() => navigate('/pakete')}>
            Abbrechen
          </Button>
        </div>
      </div>

      {stand.schritt === 'vorschau' || imText ? (
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

      {imText ? (
        <Textwerkstatt
          stand={textstand}
          aufZug={textzug}
          aufFertig={(entwurf) => {
            void anlegen(entwurf);
          }}
          {...(ai
            ? {
                aufVorschlaege: () => {
                  void vorschlaegeHolen();
                },
              }
            : {})}
          gibtAb={seite.art === 'speichert'}
        />
      ) : (
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
      )}
    </div>
  );
}

export default WerkstattPage;
