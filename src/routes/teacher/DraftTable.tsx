import { Fragment, Suspense, lazy, useState } from 'react';
import { Badge, Button } from '../../ui/components';
import {
  addSentence,
  hasBlockingError,
  moveSentence,
  removeSentence,
  updateSentence,
  validateDrafts,
  type DraftRow,
} from '../../import/draft';
import { PART_OF_SPEECH, PART_OF_SPEECH_LABELS, type PartOfSpeech } from '../../domain/schema';
import type { LearningContext } from '../../import/enrichment';

/**
 * Der Satzassistent wird erst geladen, wenn wirklich ein Detailbereich offen
 * ist. Schülerinnen und Schüler bekommen ihn nie zu sehen – und zahlen ihn
 * deshalb auch nicht mit.
 */
const SentenceAssistant = lazy(() => import('./SentenceAssistant'));

interface DraftTableProps {
  drafts: DraftRow[];
  onChange: (drafts: DraftRow[]) => void;
  /**
   * Lernkontext für den Satzassistenten. Fehlt er, gibt es die Tabelle wie
   * bisher – ganz ohne Modellhilfe.
   */
  sentenceContext?: LearningContext;
}

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

/**
 * Sieben Spalten, nicht neun.
 *
 * Schwierigkeit und Themen-Tags standen bisher als eigene Spalten in der
 * Tabelle und drängten sich damit auf: zwei Pflichtfelder dem Anschein nach,
 * die in Wahrheit optional sind und die für eine aus einem Text übernommene
 * Vokabel niemand kennt. Sie sind nicht verschwunden – sie stehen jetzt dort,
 * wo man sie sucht, wenn man sie will: im aufgeklappten Bereich der Zeile.
 */
const COLUMN_COUNT = 7;

export function DraftTable({ drafts, onChange, sentenceContext }: DraftTableProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  function apply(next: DraftRow[]): void {
    onChange(validateDrafts(next));
  }

  function patch(id: string, changes: Partial<DraftRow>): void {
    apply(drafts.map((draft) => (draft.id === id ? { ...draft, ...changes } : draft)));
  }

  function transform(id: string, fn: (draft: DraftRow) => DraftRow): void {
    apply(drafts.map((draft) => (draft.id === id ? fn(draft) : draft)));
  }

  function toggleDetails(id: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="table-wrap">
      <table>
        <caption className="visually-hidden">
          Vorschau der erkannten Vokabeln. Alle Felder sind bearbeitbar; Beispielsätze,
          Schwierigkeit und Themen-Tags stehen unter „Beispielsatz bearbeiten“.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Übernehmen</span>
              <span aria-hidden="true">✓</span>
            </th>
            <th scope="col">Englisch</th>
            <th scope="col">Deutsch</th>
            <th scope="col">Wortart</th>
            <th scope="col">Beispielsatz</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visually-hidden">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft, index) => {
            const state = hasBlockingError(draft)
              ? 'error'
              : draft.duplicateOf
                ? 'duplicate'
                : undefined;
            const rowLabel = draft.english || `Zeile ${index + 1}`;
            const isOpen = expanded.has(draft.id);

            return (
              <Fragment key={draft.id}>
                <tr {...(state ? { 'data-state': state } : {})}>
                  <td>
                    <input
                      type="checkbox"
                      checked={draft.include}
                      aria-label={`${rowLabel} übernehmen`}
                      onChange={(event) => patch(draft.id, { include: event.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={draft.english}
                      aria-label={`Englisch, Zeile ${index + 1}`}
                      onChange={(event) => patch(draft.id, { english: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={draft.german}
                      aria-label={`Deutsch, Zeile ${index + 1}`}
                      onChange={(event) => patch(draft.id, { german: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={draft.partOfSpeech}
                      aria-label={`Wortart, Zeile ${index + 1}`}
                      onChange={(event) =>
                        patch(draft.id, { partOfSpeech: event.target.value as PartOfSpeech | '' })
                      }
                    >
                      <option value="">–</option>
                      {PART_OF_SPEECH.map((pos) => (
                        <option key={pos} value={pos}>
                          {PART_OF_SPEECH_LABELS[pos]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {/*
                      „Details“ sagte nichts. Fast immer geht es um den
                      Beispielsatz – und wer ihn sucht, soll ihn benannt finden.
                    */}
                    <Button
                      small
                      variant="quiet"
                      aria-expanded={isOpen}
                      aria-label={`Beispielsatz für ${rowLabel} ${isOpen ? 'schließen' : 'bearbeiten'}`}
                      onClick={() => toggleDetails(draft.id)}
                    >
                      {isOpen ? 'Schließen' : 'Beispielsatz bearbeiten'} ({draft.sentences.length})
                    </Button>
                  </td>
                  <td>
                    {draft.issues.length === 0 ? (
                      <Badge tone="success">ok</Badge>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                        {draft.issues.map((issue, issueIndex) => (
                          <li key={issueIndex} className="small">
                            <Badge tone={issue.level === 'error' ? 'error' : 'warning'}>
                              {issue.level === 'error' ? 'Fehler' : 'Hinweis'}
                            </Badge>{' '}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    <Button
                      small
                      variant="quiet"
                      onClick={() => apply(drafts.filter((item) => item.id !== draft.id))}
                      aria-label={`${rowLabel} entfernen`}
                    >
                      Entfernen
                    </Button>
                  </td>
                </tr>

                {isOpen ? (
                  <tr>
                    <td colSpan={COLUMN_COUNT}>
                      <div className="details">
                        <div className="field-grid">
                          <div className="field">
                            <label htmlFor={`accepted-${draft.id}`}>
                              Akzeptierte englische Alternativantworten
                            </label>
                            <input
                              id={`accepted-${draft.id}`}
                              type="text"
                              value={draft.acceptedEnglish}
                              placeholder="z. B. to apologize, apologise"
                              onChange={(event) =>
                                patch(draft.id, { acceptedEnglish: event.target.value })
                              }
                            />
                            <span className="field__hint">
                              Durch Komma getrennt. Nur diese Schreibungen gelten zusätzlich als
                              richtig – es gibt keine automatische Synonymerkennung.
                            </span>
                          </div>
                          <div className="field">
                            <label htmlFor={`notes-${draft.id}`}>Notiz</label>
                            <input
                              id={`notes-${draft.id}`}
                              type="text"
                              value={draft.notes}
                              onChange={(event) => patch(draft.id, { notes: event.target.value })}
                            />
                            <span className="field__hint">
                              Wird nach der Antwort als Hinweis angezeigt.
                            </span>
                          </div>
                          <div className="field">
                            <label htmlFor={`difficulty-${draft.id}`}>Schwierigkeit</label>
                            <select
                              id={`difficulty-${draft.id}`}
                              value={draft.difficulty}
                              onChange={(event) =>
                                patch(draft.id, {
                                  difficulty:
                                    event.target.value === ''
                                      ? ''
                                      : (Number(event.target.value) as 1 | 2 | 3 | 4 | 5),
                                })
                              }
                            >
                              <option value="">–</option>
                              {DIFFICULTIES.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            <span className="field__hint">
                              1 = sehr leicht bis 5 = sehr schwer. Freiwillig – LexiFlow errät sie
                              nicht.
                            </span>
                          </div>
                          <div className="field">
                            <label htmlFor={`tags-${draft.id}`}>Themen-Tags</label>
                            <input
                              id={`tags-${draft.id}`}
                              type="text"
                              value={draft.tags}
                              placeholder="z. B. City life"
                              onChange={(event) => patch(draft.id, { tags: event.target.value })}
                            />
                            <span className="field__hint">Durch Komma getrennt.</span>
                          </div>
                        </div>

                        <fieldset className="sentences">
                          <legend>Beispielsätze ({draft.sentences.length})</legend>
                          {draft.sentences.length === 0 ? (
                            <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
                              Noch kein Beispielsatz. Für Lückensätze wird ein englischer Satz
                              benötigt, der das Stichwort enthält.
                            </p>
                          ) : null}

                          {draft.sentences.map((sentence, sentenceIndex) => (
                            <div className="sentence" key={sentence.id}>
                              <span className="sentence__index" aria-hidden="true">
                                {sentenceIndex + 1}
                              </span>
                              <div className="sentence__fields">
                                <input
                                  type="text"
                                  value={sentence.english}
                                  aria-label={`Beispielsatz ${sentenceIndex + 1} Englisch, ${rowLabel}`}
                                  placeholder="Englischer Satz mit dem Stichwort"
                                  onChange={(event) =>
                                    transform(draft.id, (current) =>
                                      updateSentence(current, sentence.id, {
                                        english: event.target.value,
                                      }),
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={sentence.german}
                                  aria-label={`Beispielsatz ${sentenceIndex + 1} Deutsch, ${rowLabel}`}
                                  placeholder="Deutsche Entsprechung (optional)"
                                  onChange={(event) =>
                                    transform(draft.id, (current) =>
                                      updateSentence(current, sentence.id, {
                                        german: event.target.value,
                                      }),
                                    )
                                  }
                                />
                              </div>
                              <div className="sentence__actions">
                                <Button
                                  small
                                  variant="quiet"
                                  disabled={sentenceIndex === 0}
                                  aria-label={`Beispielsatz ${sentenceIndex + 1} nach oben, ${rowLabel}`}
                                  onClick={() =>
                                    transform(draft.id, (current) =>
                                      moveSentence(current, sentence.id, -1),
                                    )
                                  }
                                >
                                  ↑
                                </Button>
                                <Button
                                  small
                                  variant="quiet"
                                  disabled={sentenceIndex === draft.sentences.length - 1}
                                  aria-label={`Beispielsatz ${sentenceIndex + 1} nach unten, ${rowLabel}`}
                                  onClick={() =>
                                    transform(draft.id, (current) =>
                                      moveSentence(current, sentence.id, 1),
                                    )
                                  }
                                >
                                  ↓
                                </Button>
                                <Button
                                  small
                                  variant="quiet"
                                  aria-label={`Beispielsatz ${sentenceIndex + 1} entfernen, ${rowLabel}`}
                                  onClick={() =>
                                    transform(draft.id, (current) =>
                                      removeSentence(current, sentence.id),
                                    )
                                  }
                                >
                                  ✕
                                </Button>
                              </div>
                            </div>
                          ))}

                          <Button
                            small
                            aria-label={`Beispielsatz hinzufügen, ${rowLabel}`}
                            onClick={() => transform(draft.id, addSentence)}
                          >
                            Beispielsatz hinzufügen
                          </Button>

                          {sentenceContext ? (
                            <Suspense
                              fallback={
                                <p className="small muted" role="status">
                                  Satzassistent wird geladen …
                                </p>
                              }
                            >
                              <SentenceAssistant
                                draft={draft}
                                context={sentenceContext}
                                rowLabel={rowLabel}
                                onChange={(next) => transform(draft.id, () => next)}
                              />
                            </Suspense>
                          ) : null}
                        </fieldset>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
