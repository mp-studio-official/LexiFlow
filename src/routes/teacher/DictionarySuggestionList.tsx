import { Badge, Button } from '../../ui/components';
import { Disclosure } from '../../ui/Disclosure';
import { GENDER_ARTICLES, type DictionarySense } from '../../dictionary/DictionaryProvider';
import { isQuestionable } from '../../dictionary/ranking';
import {
  partOfSpeechOfSource,
  type DictionarySuggestionSummary,
} from '../../import/dictionarySuggestions';
import { formatAnswers, splitAnswers } from '../../domain/normalize';
import type { PartOfSpeech } from '../../domain/schema';

/**
 * Die Wörterbuchtreffer zu einer Zeile der Kandidatenprüfung.
 *
 * Drei Dinge macht diese Ansicht ausdrücklich **nicht**: Sie trägt nichts von
 * selbst ein, sie versteckt keine Bedeutung und sie tut nicht so, als wäre eine
 * Wörterbuchauskunft eine geprüfte Antwort. Jede Übernahme ist ein Klick, und
 * jeder Klick betrifft genau das, was daneben steht.
 *
 * ## Was 4B.2 daran geändert hat
 *
 * **Zwei bis drei Chips statt einer Liste.** Vorher stand unter jeder
 * Empfehlung ein eigener Kasten mit allen Bedeutungen, Wortartzeilen,
 * Herkunftsangaben und Warnungen. Bei zehn Empfehlungen ergab das eine Seite,
 * auf der man scrollen musste, um die dritte Vokabel zu sehen. Jetzt stehen
 * die wahrscheinlichsten Antworten als anklickbare Chips direkt in der Karte;
 * alles Weitere liegt einen Klick tief unter „Weitere Bedeutungen anzeigen“.
 *
 * Versteckt ist dabei nichts: Der Aufklapper nennt die Zahl, und was er
 * enthält, ist dieselbe vollständige Auskunft wie vorher.
 *
 * **Das Semikolon trennt.** Bis Sprint 4B.1 verband „Alle N einsetzen“ die
 * Bedeutungen mit einem Komma – und ein Komma ist seit Phase 1 dieses Sprints
 * ein Zeichen **innerhalb** einer Antwort, kein Trenner. „Unfall, Notaufnahme“
 * wäre damit eine einzige, falsche Antwort geworden.
 *
 * **Die Wortart kommt mit.** Wer „der Verzicht“ auswählt, hat damit auch
 * gesagt, dass es ein Substantiv ist. Das Feld daneben leer zu lassen und die
 * Lehrkraft dieselbe Auskunft noch einmal treffen zu lassen, wäre Arbeit ohne
 * Erkenntnis.
 */

/** So viele Bedeutungen stehen als Chips direkt in der Karte. */
export const INLINE_CHIP_LIMIT = 3;

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
  /**
   * Übernimmt genau diese Antwort. Mehrere werden mit **Semikolon** verbunden;
   * die Wortart kommt aus dem Eintrag, zu dem der Klick gehörte.
   */
  onAccept: (german: string, partOfSpeech?: PartOfSpeech) => void;
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
  const senses = summary.entries.flatMap((entry) =>
    entry.senses
      .filter((sense) => sense.suggestions.length)
      .map((sense) => ({ entry, sense })),
  );

  /**
   * Die Chips: die ersten Wörter der ersten Bedeutungen, ohne Wiederholung.
   *
   * Bewusst über Bedeutungen hinweg und nicht innerhalb einer: Wer „bank“
   * nachschlägt, soll *Bank* und *Ufer* nebeneinander sehen und nicht drei
   * Synonyme für dasselbe.
   */
  const chips: { german: string; partOfSpeech: PartOfSpeech | undefined; sense: string }[] = [];
  for (const { entry, sense } of senses) {
    const first = sense.suggestions[0];
    if (!first) continue;
    if (chips.some((chip) => chip.german === first.german)) continue;
    chips.push({
      german: first.german,
      partOfSpeech: partOfSpeechOfSource(entry.partOfSpeech),
      sense: senseLabel(sense),
    });
    if (chips.length >= INLINE_CHIP_LIMIT) break;
  }

  const hidden = senses.length - chips.length;

  /**
   * Antworten zusammenführen – mit Semikolon, ohne Dubletten.
   *
   * `splitAnswers` und `formatAnswers` sind dieselben Funktionen, die auch der
   * Editor und der Export benutzen. Hier eine eigene Trennung zu schreiben
   * hieße, die Regel an zwei Stellen zu pflegen; genau daran ist die alte
   * Komma-Fassung gescheitert.
   */
  function accept(values: readonly string[], partOfSpeech?: PartOfSpeech): void {
    const merged = formatAnswers([...new Set([...splitAnswers(current), ...values])]);
    onAccept(merged, partOfSpeech);
  }

  return (
    <div className="dictionary" aria-label={`Wörterbuchvorschläge für ${label}`}>
      <p className="dictionary__chips">
        <span className="dictionary__origin small muted">Wörterbuch:</span>
        {chips.map((chip) => (
          <button
            key={chip.german}
            type="button"
            className="chip"
            /*
              „einsetzen“, nicht „übernehmen“: Die Zeile selbst hat einen Knopf
              „Vorschlag übernehmen“, und eine Suche nach diesem Namen fand
              sonst neun Elemente statt einem. Ein zugänglicher Name muss auch
              dann eindeutig bleiben, wenn jemand nur einen Teil davon kennt.
            */
            aria-label={`„${chip.german}“ als Antwort für ${label} einsetzen`}
            title={chip.sense}
            onClick={() => accept([chip.german], chip.partOfSpeech)}
          >
            {chip.german}
          </button>
        ))}
        {summary.viaLemma ? (
          <span className="small muted">· Grundform „{summary.viaLemma}“</span>
        ) : null}
      </p>

      {family ? (
        <p className="small muted dictionary__note">
          Gehört zur selben Wortfamilie wie „{family}“ – vermutlich reicht eine der beiden Formen im
          Paket.
        </p>
      ) : null}

      {/*
        Die Beschriftung sagt, was dahinterliegt – und wie viel. „Weitere
        Bedeutungen anzeigen (4)“ ist eine Auskunft; „Details“ wäre keine.
        Steht schon alles als Chip da, führt derselbe Aufklapper zu den Angaben
        dazu: Wortart, Genus, Markierung, Herkunft.
      */}
      {senses.length > 0 ? (
        <Disclosure
          summary={hidden > 0 ? 'Weitere Bedeutungen anzeigen' : 'Alle Bedeutungen anzeigen'}
          {...(hidden > 0 ? { count: hidden } : {})}
        >
          <ul className="dictionary__senses">
            {senses.map(({ entry, sense }) => {
              const words = sense.suggestions.map((suggestion) => suggestion.german);
              const part = partOfSpeechOfSource(entry.partOfSpeech);
              const zweifelhaft = isQuestionable(sense);
              return (
                <li
                  key={`${entry.headword}-${entry.partOfSpeech}-${sense.sense}`}
                  className="dictionary__sense"
                >
                  <p className="dictionary__meta small muted">
                    {entry.partOfSpeech ? (
                      <span className="dictionary__pos">{entry.partOfSpeech}</span>
                    ) : null}{' '}
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
                    {sense.suggestions.map((suggestion) => (
                      <span key={suggestion.german} className="dictionary__word">
                        <button
                          type="button"
                          className="chip"
                          aria-label={`„${suggestion.german}“ als Antwort für ${label} einsetzen`}
                          onClick={() => accept([suggestion.german], part)}
                        >
                          {suggestion.german}
                        </button>
                        {genderLabel(suggestion.gender) ? (
                          <span className="dictionary__gender">
                            {' '}
                            ({genderLabel(suggestion.gender)})
                          </span>
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
                      onClick={() => accept(words, part)}
                    >
                      Alle {words.length} einsetzen
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}
