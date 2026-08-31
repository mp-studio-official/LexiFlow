import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Announcer, Badge, Button, Card } from '../../ui/components';
import { getPack } from '../../data/packRepo';
import {
  BROWSE_DIRECTION_LABELS,
  browseDirectionsFor,
  buildStudyCard,
  filterEntries,
} from '../../domain/studyView';
import { GRADE_LABELS } from '../../domain/cefr';
import { DIRECTION_LABELS, type TaskDirection, type VocabPack } from '../../domain/schema';

/**
 * Vokabeln in Ruhe durchsehen.
 *
 * Diese Ansicht fragt nichts ab und bewertet nichts. Sie zeigt alle Vokabeln
 * des Pakets – unabhängig von Fächern, Fälligkeiten und Freischaltungen – und
 * überlässt es den Lernenden, wann sie eine Antwort sehen wollen.
 *
 * Sie **schreibt nichts**: kein `startSession`, kein `recordAnswer`, keine
 * Fälligkeit, kein Rundenzähler. Aus `data/` wird ausschließlich `getPack`
 * benutzt, also nur gelesen. Was hier aufgedeckt wurde, ist nach dem Neuladen
 * wieder zu – es entsteht keine Historie darüber, wer was angesehen hat.
 */

export function VocabBrowsePage() {
  const { packId = '' } = useParams();

  const [pack, setPack] = useState<VocabPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<TaskDirection>('en-de');
  const [query, setQuery] = useState('');
  /** Nur im Speicher dieser Seite: welche Antworten gerade offen sind. */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const loaded = await getPack(packId);
      if (!active) return;
      setPack(loaded ?? null);
      if (loaded) setDirection(browseDirectionsFor(loaded.meta.direction)[0] ?? 'en-de');
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [packId]);

  const entries = pack?.entries ?? [];
  const visible = useMemo(() => filterEntries(entries, query), [entries, query]);
  const cards = useMemo(
    () => visible.map((entry) => buildStudyCard(entry, direction)),
    [visible, direction],
  );

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

  const directions = browseDirectionsFor(pack.meta.direction);
  const allRevealed = cards.length > 0 && cards.every((card) => revealed.has(card.id));
  const noneRevealed = cards.every((card) => !revealed.has(card.id));

  function toggle(id: string, prompt: string): void {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setStatus(`Antwort für ${prompt} verborgen.`);
      } else {
        next.add(id);
        setStatus(`Antwort für ${prompt} angezeigt.`);
      }
      return next;
    });
  }

  function revealAll(): void {
    setRevealed(new Set(cards.map((card) => card.id)));
    setStatus(`Alle ${cards.length} Antworten angezeigt.`);
  }

  function hideAll(): void {
    setRevealed(new Set());
    setStatus('Alle Antworten verborgen.');
  }

  /** Ein Richtungswechsel dreht die Karten um – offene Antworten passten dann nicht mehr. */
  function chooseDirection(next: TaskDirection): void {
    setDirection(next);
    setRevealed(new Set());
    setStatus(`Richtung ${DIRECTION_LABELS[next]}. Alle Antworten wieder verborgen.`);
  }

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Durchsehen</p>
        <h1>{pack.meta.title}</h1>
        <p className="muted small">
          {GRADE_LABELS[pack.meta.grade]} · {pack.meta.cefrLevel} · {entries.length} Vokabeln ·
          Diese Ansicht verändert deinen Lernstand nicht.
        </p>
      </div>

      <Announcer message={status} />

      <Card quiet>
        <div className="browse-controls">
          {directions.length > 1 ? (
            <fieldset className="browse-controls__directions">
              <legend className="small">Richtung</legend>
              {directions.map((option) => (
                <label className="checkbox" key={option}>
                  <input
                    type="radio"
                    name="browse-direction"
                    value={option}
                    checked={direction === option}
                    onChange={() => chooseDirection(option)}
                  />
                  <span>{BROWSE_DIRECTION_LABELS[option]}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="field browse-controls__search">
            <label htmlFor="browse-search">Suchen</label>
            <input
              id="browse-search"
              type="search"
              value={query}
              placeholder="Wort, Bedeutung oder Thema"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="row">
            <Button small onClick={revealAll} disabled={cards.length === 0 || allRevealed}>
              Alle Antworten anzeigen
            </Button>
            <Button small onClick={hideAll} disabled={noneRevealed}>
              Alle Antworten verbergen
            </Button>
          </div>
        </div>
      </Card>

      {cards.length === 0 ? (
        <Alert tone="info">
          {entries.length === 0
            ? 'Dieses Paket enthält keine Vokabeln.'
            : 'Keine passende Vokabel gefunden.'}
        </Alert>
      ) : (
        <ul className="browse-list">
          {cards.map((card) => {
            const open = revealed.has(card.id);
            return (
              <li className="browse-item" key={card.id}>
                <div className="browse-item__head">
                  <h2 className="browse-item__prompt">{card.prompt}</h2>
                  <Button
                    small
                    variant={open ? 'quiet' : 'default'}
                    aria-expanded={open}
                    aria-controls={`antwort-${card.id}`}
                    onClick={() => toggle(card.id, card.prompt)}
                  >
                    {open ? `Antwort für ${card.prompt} verbergen` : `Antwort für ${card.prompt} anzeigen`}
                  </Button>
                </div>

                {/*
                  Verborgen heißt verborgen: Das `hidden`-Attribut nimmt den
                  Bereich auch aus dem Accessibility-Tree. Nur optisch
                  auszublenden hieße, ihn Screenreadern zu verraten.
                */}
                <div className="browse-item__answer" id={`antwort-${card.id}`} hidden={!open}>
                  <p className="browse-item__solution">{card.answer}</p>

                  {card.alternatives.length > 0 ? (
                    <p className="small muted">Auch richtig: {card.alternatives.join(' · ')}</p>
                  ) : null}

                  {card.partOfSpeech ? <Badge>{card.partOfSpeech}</Badge> : null}

                  {card.example ? (
                    <p className="browse-item__example">
                      „{card.example}“
                      {card.exampleTranslation ? (
                        <span className="small muted"> – {card.exampleTranslation}</span>
                      ) : null}
                    </p>
                  ) : null}

                  {card.notes ? <p className="small muted">{card.notes}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="row">
        <Link className="btn" to={`/lernen/${packId}`}>
          Zurück zum Paket
        </Link>
        <Link className="btn" to={`/lernen/${packId}/karten`}>
          Mit Karten lernen
        </Link>
      </div>
    </div>
  );
}

export default VocabBrowsePage;
