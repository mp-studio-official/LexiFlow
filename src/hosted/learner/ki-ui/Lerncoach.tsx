import { useRef, useState } from 'react';
import { Alert, Button, Card } from '../../../ui/components';
import {
  AKTIONSTEXTE,
  COACH_AKTIONEN,
  type Coachaktion,
  type Coachanbieter,
  type Coachantwort,
  type Coachaufgabe,
} from './vertrag';
import './ki-ui.css';

/**
 * Der Lerncoach — vier Knöpfe, kein Chatfeld.
 *
 * ## Warum kein freies Eingabefeld
 *
 * Ein offenes Chatfeld ist ein offener Kanal: Was dort hineingeschrieben
 * wird, entscheidet niemand mehr vorher. Vier feste Handlungen sind
 * nachprüfbar — man kann aufschreiben, was jede von ihnen sendet, und es
 * stimmt dann auch.
 *
 * ## Warum der Hinweis vor dem ersten Aufruf steht
 *
 * Weil danach nichts mehr zurückzuholen ist. Die lernende Person soll
 * **vor** dem ersten Mal wissen, was hinausgeht — nicht in einer
 * Datenschutzerklärung, sondern an der Stelle, an der sie klickt.
 *
 * ## Warum dieser Baustein keinen Anbieter kennt
 *
 * Er bekommt einen übergeben. Welcher das ist, ob es einen gibt und ob er
 * freigegeben ist, entscheidet die Einbettung — hier wird nur gezeigt,
 * was daraus folgt. Deshalb kann dieselbe Komponente „nicht freigegeben",
 * „kein Anbieter" und „bereit" darstellen, ohne je etwas anzurufen.
 */

export type Coachzustand =
  | { readonly art: 'bereit' }
  | { readonly art: 'laedt'; readonly aktion: Coachaktion }
  | { readonly art: 'antwort'; readonly aktion: Coachaktion; readonly antwort: Coachantwort };

export interface LerncoachProps {
  readonly aufgabe: Coachaufgabe;
  /**
   * Ist die KI für diese Auslieferung überhaupt freigegeben?
   *
   * Im Pilot 0.1 ist sie es nicht, und das soll man sehen — eine
   * versteckte Funktion ist für niemanden eine Zusage.
   */
  readonly freigegeben: boolean;
  /** `undefined` heißt: freigegeben, aber niemand hat einen Zugang eingerichtet. */
  readonly anbieter?: Coachanbieter;
  /** Hat diese Person den Datenhinweis schon gesehen? */
  readonly hinweisGesehen: boolean;
  readonly aufHinweisVerstanden: () => void;
}

export function Lerncoach({
  aufgabe,
  freigegeben,
  anbieter,
  hinweisGesehen,
  aufHinweisVerstanden,
}: LerncoachProps) {
  const [zustand, setZustand] = useState<Coachzustand>({ art: 'bereit' });
  const laufend = useRef<AbortController | undefined>(undefined);

  if (!freigegeben) {
    return (
      <Alert tone="info" title="Lerncoach ist noch nicht freigegeben">
        <p>
          In dieser Fassung ist die KI-Unterstützung abgeschaltet. Üben, Hinweise und
          Fehlererklärungen funktionieren ohne sie vollständig.
        </p>
      </Alert>
    );
  }

  if (!anbieter) {
    return (
      <Alert tone="info" title="Kein Zugang eingerichtet">
        <p>
          Für den Lerncoach braucht die Schule einen eigenen API-Zugang — zum Beispiel die
          OpenAI API, die Anthropic Claude API, die Gemini API oder ein lokales Modell. Ein
          persönliches Abonnement eines Chatdienstes reicht dafür nicht: Es hat keine
          Schnittstelle, über die LexiFlow fragen könnte.
        </p>
      </Alert>
    );
  }

  if (!hinweisGesehen) {
    return (
      <Card className="ki-coach">
        <h3 className="ki-coach__titel">Bevor der Lerncoach das erste Mal antwortet</h3>
        <p>
          Gesendet wird nur, worum es gerade geht: die Vokabel, die Richtung, ein freigegebener
          Beispielsatz und deine eine Antwort. <strong>Nicht</strong> gesendet werden dein Name,
          deine Lern-ID, dein Kurs oder dein bisheriger Lernstand.
        </p>
        <p className="small muted">Antwortet: {anbieter.name}.</p>
        <Button variant="primary" onClick={aufHinweisVerstanden}>
          Verstanden
        </Button>
      </Card>
    );
  }

  async function frage(aktion: Coachaktion) {
    if (!anbieter) return;
    laufend.current?.abort();
    const steuerung = new AbortController();
    laufend.current = steuerung;
    setZustand({ art: 'laedt', aktion });
    const antwort = await anbieter.frage(aufgabe, aktion, steuerung.signal);
    if (steuerung.signal.aborted) return;
    setZustand({ art: 'antwort', aktion, antwort });
  }

  function abbrechen() {
    laufend.current?.abort();
    laufend.current = undefined;
    setZustand({ art: 'antwort', aktion: 'hinweis', antwort: { art: 'abgebrochen' } });
  }

  return (
    <Card className="ki-coach">
      <h3 className="ki-coach__titel">Lerncoach</h3>

      <ul className="ki-coach__aktionen">
        {COACH_AKTIONEN.map((aktion) => (
          <li key={aktion}>
            <Button
              small
              disabled={zustand.art === 'laedt'}
              onClick={() => {
                void frage(aktion);
              }}
            >
              {AKTIONSTEXTE[aktion]}
            </Button>
          </li>
        ))}
      </ul>

      {zustand.art === 'laedt' ? (
        <div className="ki-coach__laedt">
          <p role="status">{anbieter.name} wird gefragt …</p>
          <Button small variant="quiet" onClick={abbrechen}>
            Abbrechen
          </Button>
        </div>
      ) : null}

      {zustand.art === 'antwort' ? <Antwortfeld antwort={zustand.antwort} /> : null}
    </Card>
  );
}

function Antwortfeld({ antwort }: { antwort: Coachantwort }) {
  switch (antwort.art) {
    case 'text':
      return (
        <div className="ki-coach__antwort">
          <p>{antwort.text}</p>
          <p className="small muted ki-coach__fussnote">
            Maschinell erzeugt. Für richtig oder falsch zählt weiterhin die Prüfung in LexiFlow.
          </p>
        </div>
      );
    case 'verworfen':
      return (
        <Alert tone="warning" title="Antwort nicht verwendet">
          <p>{antwort.grund}</p>
        </Alert>
      );
    case 'rate-limit':
      return (
        <Alert tone="warning" title="Gerade zu viele Anfragen">
          <p>
            {antwort.wiederInSekunden === undefined
              ? 'Bitte später noch einmal.'
              : `Bitte in etwa ${antwort.wiederInSekunden} Sekunden noch einmal.`}
          </p>
        </Alert>
      );
    case 'nicht-erreichbar':
      return (
        <Alert tone="error" title="Der Zugang ist nicht erreichbar">
          <p>Das Üben geht ohne den Lerncoach genauso weiter.</p>
        </Alert>
      );
    case 'abgebrochen':
      return (
        <p className="small muted ki-coach__abbruch" role="status">
          Abgebrochen. Es wurde nichts übernommen.
        </p>
      );
  }
}
