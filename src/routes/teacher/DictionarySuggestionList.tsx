import { useState } from 'react';
import { Badge, Button } from '../../ui/components';
import { GENDER_ARTICLES, type DictionarySense } from '../../dictionary/DictionaryProvider';
import { isQuestionable } from '../../dictionary/ranking';
import {
  VISIBLE_SENSE_LIMIT,
  type DictionarySuggestionSummary,
} from '../../import/dictionarySuggestions';

/**
 * Die Wörterbuchtreffer zu einer Zeile der Kandidatenprüfung.
 *
 * Drei Dinge macht diese Ansicht ausdrücklich **nicht**: Sie trägt nichts von
 * selbst ein, sie versteckt keine Bedeutung und sie tut nicht so, als wäre eine
 * Wörterbuchauskunft eine geprüfte Antwort. Jede Übernahme ist ein Klick, und
 * jeder Klick betrifft genau das, was daneben steht.
 */

function genderLabel(gender: 'm' | 'f' | 'n' | undefined): string | undefined {
  return gender ? GENDER_ARTICLES[gender] : undefined;
}

function senseLabel(sense: DictionarySense): string {
  return sense.sense === '—' ? 'ohne nähere Angabe' : sense.sense;
}

export interface DictionarySuggestionListProps {
  label: string;
  summary: DictionarySuggestionSummary;
  /** Was gerade als deutsche Antwort im Feld steht. */
  current: string;
  /** Übernimmt genau diese Antwort. Mehrere werden mit Komma verbunden. */
  onAccept: (german: string) => void;
  /** Hinweis, dass ein Wort derselben Familie schon vorgeschlagen wurde. */
  family?: string | undefined;
}

export function DictionarySuggestionList({
  label,
  summary,
  current,
  onAccept,
  family,
}: DictionarySuggestionListProps) {
  const [expanded, setExpanded] = useState(false);

  const senses = summary.entries.flatMap((entry) =>
    entry.senses
      .filter((sense) => sense.suggestions.length)
      .map((sense) => ({ entry, sense })),
  );
  const visible = expanded ? senses : senses.slice(0, VISIBLE_SENSE_LIMIT);
  const hidden = senses.length - visible.length;

  /** Mehrere Bedeutungen zusammen übernehmen – als Komma-Liste, wie im Editor. */
  function acceptAll(values: readonly string[]) {
    const merged = [...new Set([...current.split(',').map((part) => part.trim()), ...values])]
      .filter(Boolean)
      .join(', ');
    onAccept(merged);
  }

  return (
    <div className="dictionary" aria-label={`Wörterbuchvorschläge für ${label}`}>
      <p className="dictionary__head small">
        <Badge>Offline-Wörterbuch</Badge>{' '}
        {summary.viaLemma ? <span className="muted">Grundform „{summary.viaLemma}“ · </span> : null}
        <span className="muted">
          {senses.length === 1 ? 'eine Bedeutung' : `${senses.length} Bedeutungen`}
        </span>
      </p>

      {family ? (
        <p className="small muted dictionary__note">
          Gehört zur selben Wortfamilie wie „{family}“ – vermutlich reicht eine der beiden Formen im
          Paket.
        </p>
      ) : null}

      <ul className="dictionary__senses">
        {visible.map(({ entry, sense }) => {
          const words = sense.suggestions.map((suggestion) => suggestion.german);
          const zweifelhaft = isQuestionable(sense);
          return (
            <li key={`${entry.headword}-${entry.partOfSpeech}-${sense.sense}`} className="dictionary__sense">
              <p className="dictionary__meta small muted">
                {entry.partOfSpeech ? <span className="dictionary__pos">{entry.partOfSpeech}</span> : null}{' '}
                {senseLabel(sense)}
                {sense.via ? (
                  <>
                    {' · '}
                    <span title={`Diese Bedeutung stammt aus dem Eintrag „${sense.via}“.`}>
                      über „{sense.via}“
                    </span>
                  </>
                ) : null}
              </p>

              <p className="dictionary__words">
                {sense.suggestions.map((suggestion, index) => (
                  <span key={suggestion.german} className="dictionary__word">
                    {index > 0 ? <span aria-hidden="true"> · </span> : null}
                    <button
                      type="button"
                      className="dictionary__pick"
                      /*
                        „einsetzen“, nicht „übernehmen“: Die Checkbox der Zeile
                        heißt „<Wort> übernehmen“, und eine Suche nach diesem
                        Namen fand sonst neun Elemente statt einem. Ein
                        zugänglicher Name muss auch dann eindeutig bleiben, wenn
                        jemand nur einen Teil davon kennt.
                      */
                      aria-label={`„${suggestion.german}“ als Antwort für ${label} einsetzen`}
                      onClick={() => acceptAll([suggestion.german])}
                    >
                      {suggestion.german}
                    </button>
                    {genderLabel(suggestion.gender) ? (
                      <span className="dictionary__gender"> ({genderLabel(suggestion.gender)})</span>
                    ) : null}
                    {suggestion.qualifier ? (
                      <span className="muted"> [{suggestion.qualifier}]</span>
                    ) : null}
                    {suggestion.register?.length ? (
                      <Badge tone="warning">{suggestion.register.join(', ')}</Badge>
                    ) : null}
                  </span>
                ))}
              </p>

              {zweifelhaft ? (
                <p className="small dictionary__warn">
                  Nur markierte oder sehr fachliche Entsprechungen – vor der Übernahme prüfen.
                </p>
              ) : null}

              {words.length > 1 ? (
                <Button
                  small
                  variant="quiet"
                  aria-label={`Alle ${words.length} Bedeutungen dieser Gruppe als Antwort für ${label} einsetzen`}
                  onClick={() => acceptAll(words)}
                >
                  Alle {words.length} einsetzen
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <Button small variant="quiet" onClick={() => setExpanded(true)}>
          Weitere {hidden} {hidden === 1 ? 'Bedeutung' : 'Bedeutungen'} anzeigen
        </Button>
      ) : null}
    </div>
  );
}
