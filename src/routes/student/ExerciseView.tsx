import { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/components';
import { checkAnswer, checkChoice, type AnswerCheckResult } from '../../domain/answerCheck';
import type { ClozeTask, ExerciseTask, MultipleChoiceTask } from '../../domain/exercises';
import { formatAnswers } from '../../domain/normalize';

export interface ExerciseViewProps {
  task: ExerciseTask;
  result: AnswerCheckResult | null;
  /**
   * `given` ist die Eingabe, so wie sie abgeschickt wurde.
   *
   * Der Lernplan braucht sie nicht – er zeigt sein Feedback sofort. Der
   * Selbsttest zeigt es erst am Ende und muss deshalb festhalten, was
   * tatsächlich dastand.
   */
  onSubmit: (result: AnswerCheckResult, given: string) => void;
  /**
   * Was gerade im Antwortfeld steht und noch nicht abgeschickt ist.
   *
   * Nur die Runde im Portal braucht das: Sie muss wissen, ob beim Verlassen
   * etwas verloren ginge (E14). Alle anderen Aufrufer lassen es weg, und dann
   * passiert nichts — der Entwurf bleibt, wo er entsteht.
   *
   * Auswahlaufgaben melden nichts: Dort ist das Antippen zugleich das
   * Abschicken, es gibt keinen Zwischenzustand.
   */
  onDraftChange?: (draft: string) => void;
}

const DIRECTION_HINT: Record<'en-de' | 'de-en', string> = {
  'en-de': 'Übersetze ins Deutsche',
  'de-en': 'Übersetze ins Englische',
};

export function ExerciseView(props: ExerciseViewProps) {
  switch (props.task.kind) {
    case 'flashcard':
      return <Flashcard {...props} />;
    case 'multiple-choice':
      return <MultipleChoice {...props} task={props.task} />;
    case 'open-translation':
      return <OpenTranslation {...props} />;
    case 'cloze-bank':
    case 'cloze-free':
      return <Cloze {...props} task={props.task} />;
  }
}

// ---------------------------------------------------------------- Karteikarte

function Flashcard({ task, result, onSubmit }: ExerciseViewProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="stack">
      <p className="prompt-note">{DIRECTION_HINT[task.direction]} · Karteikarte</p>
      <p className="prompt">{task.prompt}</p>

      {revealed ? (
        <p className="prompt" style={{ fontSize: '1.25rem', fontWeight: 500 }}>
          {task.expected.join(' · ')}
        </p>
      ) : null}

      {result ? null : revealed ? (
        <div className="row">
          <Button
            variant="primary"
            onClick={() => onSubmit({ verdict: 'correct', expected: task.expected }, '')}
          >
            Gewusst
          </Button>
          <Button onClick={() => onSubmit({ verdict: 'wrong', expected: task.expected }, '')}>
            Noch nicht gewusst
          </Button>
        </div>
      ) : (
        <Button variant="primary" onClick={() => setRevealed(true)} autoFocus>
          Lösung anzeigen
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Multiple Choice

function MultipleChoice({
  task,
  result,
  onSubmit,
}: ExerciseViewProps & { task: MultipleChoiceTask }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) return;
    function onKey(event: KeyboardEvent): void {
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < task.options.length) {
        const option = task.options[index];
        if (option) {
          setChosen(option);
          onSubmit(checkChoice(option, task.expected), option);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [task, result, onSubmit]);

  function stateOf(option: string): 'correct' | 'wrong' | undefined {
    if (!result) return undefined;
    if (task.expected.includes(option)) return 'correct';
    return option === chosen ? 'wrong' : undefined;
  }

  return (
    <div className="stack">
      <p className="prompt-note">{DIRECTION_HINT[task.direction]} · Multiple Choice</p>
      <p className="prompt" id={`prompt-${task.id}`}>
        {task.prompt}
      </p>
      <div className="options" ref={groupRef} role="group" aria-labelledby={`prompt-${task.id}`}>
        {task.options.map((option, index) => (
          <button
            key={option}
            type="button"
            className="option"
            disabled={result !== null}
            {...(stateOf(option) ? { 'data-state': stateOf(option) } : {})}
            onClick={() => {
              setChosen(option);
              onSubmit(checkChoice(option, task.expected), option);
            }}
          >
            <span className="option__key" aria-hidden="true">
              {index + 1}
            </span>
            <span>{option}</span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Tipp: Die Tasten 1 bis {task.options.length} wählen direkt aus.
      </p>
    </div>
  );
}

// ---------------------------------------------------------- Offene Übersetzung

function OpenTranslation({ task, result, onSubmit, onDraftChange }: ExerciseViewProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [task.id]);

  /*
    Der Entwurf wird gemeldet, nicht abgefragt: Wer ihn braucht, bekommt ihn
    bei jeder Änderung. Beim Aufgabenwechsel meldet die neue Aufgabe sofort
    ihren leeren Stand — `ExerciseView` hängt am Aufgabenschlüssel, also
    entsteht sie neu.

    Gemeldet wird **das Getippte**, auch nach dem Abschicken. Dass danach
    nichts mehr verloren gehen kann, liegt nicht daran, dass das Feld leer
    wäre — es steht ja noch da —, sondern daran, dass die Antwort gespeichert
    ist. Diese Unterscheidung trifft `gingeVerloren`, nicht diese Zeile.
  */
  useEffect(() => {
    onDraftChange?.(value);
  }, [value, onDraftChange]);

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (result) return;
        onSubmit(checkAnswer(value, task.expected), value);
      }}
    >
      <p className="prompt-note">{DIRECTION_HINT[task.direction]} · freie Eingabe</p>
      <p className="prompt">{task.prompt}</p>
      <label className="visually-hidden" htmlFor={`answer-${task.id}`}>
        Deine Übersetzung von {task.prompt}
      </label>
      <input
        id={`answer-${task.id}`}
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        disabled={result !== null}
        onChange={(event) => setValue(event.target.value)}
      />
      {result ? null : (
        <Button type="submit" variant="primary" disabled={value.trim().length === 0}>
          Antwort prüfen
        </Button>
      )}
    </form>
  );
}

// ------------------------------------------------------------------ Lückensatz

function Cloze({ task, result, onSubmit, onDraftChange }: ExerciseViewProps & { task: ClozeTask }) {
  const [value, setValue] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const withBank = task.kind === 'cloze-bank';

  useEffect(() => {
    if (!withBank) inputRef.current?.focus();
  }, [task.id, withBank]);

  /* Nur die freie Lücke hat einen Entwurf; die Wortbank schickt beim Tippen ab. */
  useEffect(() => {
    onDraftChange?.(withBank ? '' : value);
  }, [value, withBank, onDraftChange]);

  const gapText = result ? (result.matched ?? task.expected[0] ?? '') : '_____';

  return (
    <div className="stack">
      <p className="prompt-note">
        Lückensatz {withBank ? 'mit Wortbank' : 'ohne Wortbank'} · setze das passende
        englische Wort ein
      </p>
      <p className="cloze">
        {task.before}
        <span className="cloze__gap">{gapText}</span>
        {task.after}
      </p>
      {task.translation ? <p className="muted small">{task.translation}</p> : null}
      <p className="muted small" style={{ marginTop: '-0.4rem' }}>
        Bedeutung: {formatAnswers(task.entry.germanAnswers)}
      </p>

      {withBank ? (
        <div className="options" role="group" aria-label="Wortbank">
          {(task.bank ?? []).map((option, index) => (
            <button
              key={option}
              type="button"
              className="option"
              disabled={result !== null}
              {...(result
                ? task.expected.includes(option)
                  ? { 'data-state': 'correct' as const }
                  : option === chosen
                    ? { 'data-state': 'wrong' as const }
                    : {}
                : {})}
              onClick={() => {
                setChosen(option);
                onSubmit(checkChoice(option, task.expected), option);
              }}
            >
              <span className="option__key" aria-hidden="true">
                {index + 1}
              </span>
              <span>{option}</span>
            </button>
          ))}
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (result) return;
            onSubmit(checkAnswer(value, task.expected), value);
          }}
        >
          <label className="visually-hidden" htmlFor={`cloze-${task.id}`}>
            Fehlendes Wort im Satz
          </label>
          <input
            id={`cloze-${task.id}`}
            ref={inputRef}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            disabled={result !== null}
            onChange={(event) => setValue(event.target.value)}
          />
          {result ? null : (
            <Button type="submit" variant="primary" disabled={value.trim().length === 0}>
              Antwort prüfen
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
