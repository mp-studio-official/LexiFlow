import { Fragment, Suspense, lazy, useState } from 'react';
import { Badge, Button } from '../../ui/components';
import {
  addSentence,
  confirmReview,
  hasBlockingError,
  moveSentence,
  needsReview,
  removeSentence,
  reviewIssues,
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

/**
 * Wie viel diese Tabelle zeigt.
 *
 * - `full` – der bisherige Umfang: Schwierigkeit, Themen-Tags, Notiz,
 *   akzeptierte Alternativantworten. So sieht sie auf allen Wegen aus, auf
 *   denen die Daten **schon existieren**: CSV, XLSX, Liste, Paketimport,
 *   Themenwerkstatt. Wer ein Paket mit gepflegten Tags öffnet, muss sie
 *   sehen und ändern können.
 * - `text` – der Textimport. Dort kennt niemand die Schwierigkeit eines aus
 *   einem Artikel gehobenen Wortes, und Themen-Tags stünden leer da. Beides
 *   auch nur aufgeklappt anzubieten hieße, nach Angaben zu fragen, die es
 *   nicht gibt.
 *
 * Der Unterschied ist **rein die Anzeige**. Die Felder bleiben im Modell und
 * im Austauschformat; ein Paket, das aus dem Textweg gespeichert und später
 * bearbeitet wird, zeigt sie wieder.
 */
export type DraftTableVariant = 'full' | 'text';

interface DraftTableProps {
  drafts: DraftRow[];
  onChange: (drafts: DraftRow[]) => void;
  /**
   * Lernkontext für den Satzassistenten. Fehlt er, gibt es die Tabelle wie
   * bisher – ganz ohne Modellhilfe.
   */
  sentenceContext?: LearningContext;
  /** Wie viel gezeigt wird. Standard ist der volle Umfang. */
  variant?: DraftTableVariant;
}

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

/**
 * Fünf Spalten, nicht neun.
 *
 * Schwierigkeit und Themen-Tags standen bis 4B.1 als eigene Spalten da und
 * drängten sich damit auf: zwei Pflichtfelder dem Anschein nach, die in
 * Wahrheit optional sind. Sie liegen jetzt im aufgeklappten Bereich, im
 * Textimport gar nicht.
 *
 * Mit 4B.2 kommen **Englisch und Deutsch in eine Spalte** – untereinander
 * statt nebeneinander. Vorher teilten sich zwei Textfelder, ein Auswahlfeld,
 * ein Knopf und eine Fehlerliste dieselbe Zeilenbreite; auf einem Laptop war
 * jedes Feld dadurch so schmal, dass „sich entschuldigen“ nicht hineinpasste.
 * Untereinander bekommt jedes die volle Spaltenbreite, und die Zeile liest
 * sich als das, was sie ist: **eine** Vokabel mit zwei Seiten.
 */
const COLUMN_COUNT = 5;

export function DraftTable({
  drafts,
  onChange,
  sentenceContext,
  variant = 'full',
}: DraftTableProps) {
  const full = variant === 'full';
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
          Schwierigkeit und Themen-Tags stehen unter „Beispielsatz anzeigen“.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Übernehmen</span>
              <span aria-hidden="true">✓</span>
            </th>
            <th scope="col">Vokabel</th>
            <th scope="col">Wortart</th>
            <th scope="col">Beispielsatz</th>
            <th scope="col">Status</th>
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
            /** Offener fachlicher Befund – der einzige Fall für „Bitte prüfen“. */
            const offen = needsReview(draft);
            /** Es gab einen Befund, und jemand hat ihn ausdrücklich abgehakt. */
            const bestaetigt = !offen && reviewIssues(draft).length > 0;

            return (
              <Fragment key={draft.id}>
                <tr
                  {...(state ? { 'data-state': state } : {})}
                  {...(isOpen ? { 'data-expanded': 'true' } : {})}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={draft.include}
                      aria-label={`${rowLabel} übernehmen`}
                      onChange={(event) => patch(draft.id, { include: event.target.checked })}
                    />
                  </td>
                  <td>
                    {/*
                      Der Flex-Container steckt **in** der Zelle, nicht in ihr
                      selbst. `display: flex` auf einem `<td>` nimmt die Zelle
                      aus dem Tabellenlayout: Der Browser erzeugt drumherum eine
                      anonyme Zelle, Zeilenhöhen und Trennlinien verrutschen, und
                      am Tabellenende steht ein leerer Kasten. Genau das war im
                      ersten Entwurf zu sehen.
                    */}
                    <div className="draft__word">
                      {/*
                        Englisch oben, Deutsch darunter – und beide beschriftet
                        wie bisher, damit eine Vorlesehilfe weiterhin sagt,
                        welche Seite gerade dran ist.
                      */}
                      <div className="draft__side">
                        {/*
                          `ENG` und `DE` vor dem Feld.

                          Untereinander sind die beiden Felder gleich breit und
                          gleich leer; welches die Vokabel und welches die
                          Antwort ist, stand nur im unsichtbaren Namen. Wer die
                          Tabelle überfliegt, hat die Reihenfolge damit
                          auswendig gelernt oder eben nicht.

                          `aria-hidden`: Die Felder tragen ihre Beschriftung
                          schon („Englisch, Zeile 3“). Das Kürzel doppelt sie
                          für die Augen, nicht für die Vorlesehilfe.
                        */}
                        <span className="draft__lang" aria-hidden="true">
                          ENG
                        </span>
                        <input
                          type="text"
                          value={draft.english}
                          id={`draft-english-${draft.id}`}
                          aria-label={`Englisch, Zeile ${index + 1}`}
                          onChange={(event) => patch(draft.id, { english: event.target.value })}
                        />
                      </div>
                      <div className="draft__side">
                        <span className="draft__lang" aria-hidden="true">
                          DE
                        </span>
                        <input
                          type="text"
                          value={draft.german}
                          id={`draft-german-${draft.id}`}
                          aria-label={`Deutsch, Zeile ${index + 1}`}
                          onChange={(event) => patch(draft.id, { german: event.target.value })}
                        />
                      </div>
                      {/*
                        Der Grund steht dort, wo man ihn behebt.

                        Bis 4B.1 stand in der Statusspalte eine Aufzählung aller
                        Meldungen – bei drei Hinweisen war die Spalte höher als
                        die ganze übrige Zeile und schob die Tabelle
                        auseinander. Jetzt sagt der Status **ob**, und hier steht
                        **was**, unmittelbar unter dem Feld, das es angeht.
                      */}
                      {draft.issues.length > 0 ? (
                        <ul className="draft__issues">
                          {draft.issues.map((issue, issueIndex) => (
                            <li key={issueIndex} className="small" data-level={issue.level}>
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </td>
                  <td className="draft__pos">
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
                      Seit 4B.2 sagt die Beschriftung auch, was der Klick tut:
                      anzeigen oder ausblenden, nicht „bearbeiten“ gegen
                      „schließen“.
                    */}
                    <Button
                      small
                      variant="quiet"
                      aria-expanded={isOpen}
                      aria-label={`Beispielsatz für ${rowLabel} ${isOpen ? 'ausblenden' : 'anzeigen'}`}
                      onClick={() => toggleDetails(draft.id)}
                    >
                      {isOpen ? 'Beispielsatz ausblenden' : `Beispielsatz anzeigen (${draft.sentences.length})`}
                    </Button>
                  </td>
                  <td>
                    <div className="draft__status">
                      {/*
                        Zwei Zustände, kurz und ohne Farbe als einziges Merkmal.
                        „Bitte prüfen“ statt „Fehler“: Eine fehlende Übersetzung
                        ist eine offene Aufgabe, kein Schaden.
                      */}
                      {/*
                        „Bitte prüfen“ steht nur noch dort, wo es etwas zu
                        entscheiden gibt.

                        Bis 4B.4 bekam jede Zeile mit irgendeiner Warnung diesen
                        Status – bei zwanzig Empfehlungen zwölf Stück, von denen
                        elf nichts zu entscheiden hatten. Die zwölfte ging darin
                        unter, und genau die war die wichtige.

                        Drei Zustände: ein echter Fehler (fehlendes Feld), eine
                        offene fachliche Frage, oder in Ordnung. Eine bestätigte
                        Zeile sagt, dass sie bestätigt wurde – sonst wüsste
                        niemand, ob er sie schon angesehen hat.
                      */}
                      {hasBlockingError(draft) ? (
                        <Badge tone="error">Bitte prüfen</Badge>
                      ) : offen ? (
                        <Badge tone="warning">Bitte prüfen</Badge>
                      ) : bestaetigt ? (
                        <Badge tone="success">Geprüft</Badge>
                      ) : (
                        <Badge tone="success">OK</Badge>
                      )}

                      {/*
                        Die Bestätigung ist eine fachliche Entscheidung, kein
                        Wegklicken. Deshalb steht im Namen, worum es geht, und
                        deshalb verfällt sie, sobald sich der beanstandete
                        Sachverhalt ändert (siehe `reviewFingerprint`).
                      */}
                      {offen ? (
                        <Button
                          small
                          id={`draft-confirm-${draft.id}`}
                          aria-label={`Befund zu „${rowLabel}“ als geprüft bestätigen`}
                          onClick={() => transform(draft.id, confirmReview)}
                        >
                          Als geprüft bestätigen
                        </Button>
                      ) : null}

                      <Button
                        small
                        variant="quiet"
                        onClick={() => apply(drafts.filter((item) => item.id !== draft.id))}
                        aria-label={`${rowLabel} entfernen`}
                      >
                        Entfernen
                      </Button>
                    </div>
                  </td>
                </tr>

                {isOpen ? (
                  <tr className="draft__detail-row">
                    <td colSpan={COLUMN_COUNT}>
                      <div className="details">
                        {/*
                          Im Textimport steht hier **nur** der Beispielsatz.

                          Schwierigkeit, Themen-Tags, Notiz und akzeptierte
                          Alternativantworten sind Angaben, die für ein aus einem
                          Artikel gehobenes Wort niemand hat. Sie auch nur
                          aufgeklappt anzubieten hieße, danach zu fragen. Auf allen
                          anderen Wegen – wo die Daten schon existieren – stehen sie
                          unverändert da.
                        */}
                        {full ? (
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
                        ) : null}

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
                                {/*
                                  Die deutsche Entsprechung steht im Textimport
                                  nur, wenn es sie gibt. Ein leeres Feld dort
                                  wäre eine Aufforderung, jeden Beispielsatz zu
                                  übersetzen – gebraucht wird das nicht.
                                */}
                                {full || sentence.german ? (
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
                                ) : null}
                              </div>
                              <div className="sentence__actions">
                                {/*
                                  Umsortieren gibt es nur, wo es mehr als einen
                                  Satz geben kann. Der Textimport bringt genau
                                  den einen Originalsatz mit.
                                */}
                                {full ? (
                                  <>
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
                                  </>
                                ) : null}
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
                                  {full ? '✕' : 'Entfernen'}
                                </Button>
                              </div>
                            </div>
                          ))}

                          {/*
                            Auch „hinzufügen“ und der Satzassistent bleiben dem
                            vollen Umfang vorbehalten. Im Textimport ist der
                            Beispielsatz der Originalsatz; ein zweiter, selbst
                            geschriebener wäre eine andere Aufgabe.
                          */}
                          {full ? (
                            <Button
                              small
                              aria-label={`Beispielsatz hinzufügen, ${rowLabel}`}
                              onClick={() => transform(draft.id, addSentence)}
                            >
                              Beispielsatz hinzufügen
                            </Button>
                          ) : null}

                          {full && sentenceContext ? (
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
