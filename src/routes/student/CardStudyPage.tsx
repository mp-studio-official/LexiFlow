import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Announcer, Badge, Button, Card, Meter } from '../../ui/components';
import { LearnHeader } from './LearnHeader';
import { PackArt } from '../../ui/PackArt';
import { getPack } from '../../data/packRepo';
import { buildCardSet, hasExtras } from '../../domain/studyView';
import {
  DEFAULT_DIRECTION_CHOICE,
  DIRECTION_CHOICE_LABELS,
  directionChoicesFor,
  type DirectionChoice,
} from '../../domain/practiceDirection';
import { GRADE_LABELS } from '../../domain/cefr';
import type { VocabPack } from '../../domain/schema';
import { formatAnswers } from '../../domain/normalize';

/**
 * Karten ansehen – kein Test, keine Runde, keine Bewertung.
 *
 * Der Kartenmodus ist eine Lernhilfe: Vorderseite lesen, selbst überlegen,
 * Rückseite aufdecken, weitergehen. Genau deshalb fehlt hier alles, was eine
 * Leistung festhalten würde. Er ruft **weder `startSession` noch
 * `recordAnswer`**, fragt keine Fälligkeiten ab und ändert weder Fächer noch
 * Termine noch Rundenzähler. Aus `data/` wird nur `getPack` gelesen.
 *
 * Der Kartensatz ist flüchtig: Er lebt im Zustand dieser Seite und beginnt
 * beim Neuladen von vorn. Es entsteht keine Historie darüber, welche Karten
 * jemand angesehen hat.
 */

/** Ein neuer Seed – dieselbe Quelle wie bei der Rundenvorschau. */
function freshSeed(): number {
  return Date.now() >>> 0;
}

export function CardStudyPage() {
  const { packId = '' } = useParams();

  const [pack, setPack] = useState<VocabPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<DirectionChoice>(DEFAULT_DIRECTION_CHOICE);
  const [seed, setSeed] = useState(freshSeed);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** `true`, sobald über die letzte Karte hinausgegangen wurde. */
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState('');
  const deckRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await getPack(packId);
      if (!active) return;
      setPack(loaded ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId]);

  const cards = useMemo(() => {
    if (!pack) return [];
    return buildCardSet(pack.entries, {
      packDirection: pack.meta.direction,
      choice,
      seed,
    });
  }, [pack, choice, seed]);

  if (loading) return <p className="muted">Paket wird geladen …</p>;
  if (!pack) {
    return (
      <div className="stack">
        <h1>Paket nicht gefunden</h1>
        <Link className="btn" to="/lernen">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const choices = directionChoicesFor(pack.meta.direction);
  const card = cards[index];

  function restart(nextSeed = seed, message = 'Von vorn.'): void {
    setSeed(nextSeed);
    setIndex(0);
    setFlipped(false);
    setFinished(false);
    setStatus(message);
  }

  function goNext(): void {
    if (index + 1 >= cards.length) {
      setFinished(true);
      setFlipped(false);
      setStatus('Du hast alle Karten angesehen.');
      return;
    }
    setIndex((current) => current + 1);
    // Die nächste Karte beginnt immer verdeckt – sonst wäre sie schon verraten.
    setFlipped(false);
  }

  function goPrevious(): void {
    if (index === 0) return;
    setIndex((current) => current - 1);
    setFlipped(false);
  }

  function shuffleDeck(): void {
    restart(freshSeed(), 'Karten neu gemischt. Der Satz beginnt von vorn.');
  }

  function chooseDirection(next: DirectionChoice): void {
    setChoice(next);
    setIndex(0);
    setFlipped(false);
    setFinished(false);
    setStatus(`Richtung ${DIRECTION_CHOICE_LABELS[next]}. Der Kartensatz beginnt von vorn.`);
  }

  /**
   * Tastatur **nur im Kartenbereich**.
   *
   * Bewusst kein `window`-Listener: Der würde auch dann feuern, wenn jemand in
   * einem Suchfeld tippt oder mit den Pfeiltasten eine Seite scrollt. Der
   * Bereich ist fokussierbar, und nur dort gelten die Tasten.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    // Aktive Schaltflächen behalten Leertaste und Enter für sich.
    const onButton = event.target instanceof HTMLButtonElement;

    if ((event.key === ' ' || event.key === 'Enter') && !onButton) {
      event.preventDefault();
      setFlipped((current) => !current);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrevious();
    }
  }

  /*
    Im Kartenmodus fehlt „Mit Karten lernen“ mit Absicht: Eine Schaltfläche,
    die auf die gerade geöffnete Seite zeigt, wäre keine Hilfe.
  */
  const header = (
    <LearnHeader
      eyebrow="Karten"
      title={pack.meta.title}
      packId={packId}
      showCards={false}
      status={
        <>
          {GRADE_LABELS[pack.meta.grade]} · {pack.meta.cefrLevel} · Diese Ansicht verändert deinen
          Lernstand nicht.
        </>
      }
    />
  );

  const directionChooser =
    choices.length > 0 ? (
      <fieldset className="browse-controls__directions">
        <legend className="small">Richtung</legend>
        {choices.map((option) => (
          <label className="checkbox" key={option}>
            <input
              type="radio"
              name="card-direction"
              value={option}
              checked={choice === option}
              onChange={() => chooseDirection(option)}
            />
            <span>{DIRECTION_CHOICE_LABELS[option]}</span>
          </label>
        ))}
      </fieldset>
    ) : null;

  if (cards.length === 0) {
    return (
      <div className="stack">
        {header}
        <Card>
          <p>Dieses Paket enthält keine Vokabeln zum Ansehen.</p>
        </Card>
      </div>
    );
  }

  if (finished || !card) {
    return (
      <div className="stack">
        {header}
        <Announcer message={status} />
        <Card>
          <h2>Du hast alle Karten angesehen.</h2>
          <p className="muted">
            {cards.length} {cards.length === 1 ? 'Karte' : 'Karten'} in dieser Runde. Nichts davon
            wurde gespeichert oder bewertet.
          </p>
          <div className="row" style={{ marginTop: '1rem' }}>
            <Button variant="primary" onClick={() => restart(seed, 'Noch einmal von vorn.')}>
              Noch einmal
            </Button>
            <Button onClick={shuffleDeck}>Neu mischen</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      {header}
      <Announcer message={status} />

      {directionChooser ? <Card quiet>{directionChooser}</Card> : null}

      <div className="card-deck__meta">
        <span>
          Karte {index + 1} von {cards.length}
        </span>
        <Badge>{card.directionLabel}</Badge>
      </div>
      <Meter value={index} max={cards.length} label="Fortschritt im Kartensatz" />

      {/*
        Ein Stapel, keine Fläche (Sprint 4B.6).

        Vorher war die Karte ein großes weißes Rechteck mit einem Wort in der
        Mitte – funktional richtig und kein Gegenstand. Der Rahmen legt jetzt
        zwei angedeutete Blätter dahinter: Man sieht, dass man in einem Stapel
        steht und dass es weitergeht.

        Die Blätter sind `::before` und `::after` des Rahmens, keine Elemente.
        Sie tragen nichts vor und stehen deshalb in keinem Baum.
      */}
      <div className="deck">
        <div
          className="card-deck"
          ref={deckRef}
          tabIndex={0}
          role="group"
          aria-roledescription="Lernkarte"
          aria-label={`Karte ${index + 1} von ${cards.length}: ${card.prompt}`}
          onKeyDown={handleKeyDown}
        >
          {/*
            Der Kopf der Karte trägt das Motiv des Pakets.

            Es ist derselbe Streifen wie auf der Paketkarte, nur schmal: Wer
            zwischen zwei Paketen wechselt, sieht am Bild, in welchem er ist,
            bevor er den Titel oben liest.
          */}
          <div className="card-deck__art">
            <PackArt seed={pack.meta.title} />
          </div>

          <span className="card-deck__index" aria-hidden="true">
            {index + 1}/{cards.length}
          </span>

          <p className="card-deck__prompt">{card.prompt}</p>

          {/* Verdeckt heißt verdeckt – auch für Screenreader. */}
          <div className="card-deck__answer" id="karte-antwort" hidden={!flipped}>
            <p className="card-deck__solution">{card.answer}</p>

            {hasExtras(card) ? (
              <div className="card-deck__extras">
                {card.alternatives.length > 0 ? (
                  <p className="small muted">Auch richtig: {formatAnswers(card.alternatives)}</p>
                ) : null}
                {card.partOfSpeech ? <Badge>{card.partOfSpeech}</Badge> : null}
                {card.example ? (
                  <p className="card-deck__example">
                    „{card.example}“
                    {card.exampleTranslation ? (
                      <span className="small muted"> – {card.exampleTranslation}</span>
                    ) : null}
                  </p>
                ) : null}
                {card.notes ? <p className="small muted">{card.notes}</p> : null}
              </div>
            ) : null}
          </div>

          {!flipped ? (
            <p className="small muted card-deck__hint">
              Überlege in Ruhe – decke die Lösung erst dann auf.
            </p>
          ) : null}
        </div>
      </div>

      <div className="row card-deck__controls">
        <Button onClick={goPrevious} disabled={index === 0}>
          Vorherige Karte
        </Button>
        <Button
          variant="primary"
          aria-expanded={flipped}
          aria-controls="karte-antwort"
          onClick={() => setFlipped((current) => !current)}
        >
          {flipped ? 'Antwort verbergen' : 'Antwort anzeigen'}
        </Button>
        <Button onClick={goNext}>Nächste Karte</Button>
      </div>

      <div className="row">
        <Button small onClick={shuffleDeck}>
          Karten mischen
        </Button>
        <Button small onClick={() => restart(seed, 'Von vorn.')} disabled={index === 0 && !flipped}>
          Von vorn beginnen
        </Button>
      </div>

      <p className="small muted">
        Tastatur: Leertaste oder Enter dreht die Karte um, Pfeil rechts und links wechseln sie.
      </p>
    </div>
  );
}

export default CardStudyPage;
