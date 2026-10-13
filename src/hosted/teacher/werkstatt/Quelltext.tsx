import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { describeSelection } from '../../../import/sourcePick';
import type { SourceToken } from '../../../import/sourceTokens';
import './werkstatt.css';

/**
 * Der Quelltext als Werkzeug — die Portalfassung.
 *
 * ## Woher das kommt
 *
 * Aus `src/routes/teacher/SourceTextPane.tsx`. Uebernommen und nicht
 * importiert, weil das Portal und die Lehrkraftdatei zwei Baender sind:
 * Dort heissen die Klassen `split__*` und gehoeren zur Werkstatt der
 * portablen Datei, hier sind alle Regeln auf `.huelle` eingegrenzt
 * (`src/hosted/portal.test.ts`). Ein gemeinsamer Import haette eine
 * Komponente ergeben, die zwei Formensprachen kennen muss.
 *
 * Uebernommen ist die **Bedienung**, und die ist der eigentliche Wert
 * dieser Datei: Ein Tabstopp fuer den ganzen Text statt 220 Tabstopps,
 * Pfeiltasten von Wort zu Wort, Umschalt erweitert auf eine Wortgruppe,
 * Eingabe nimmt auf, Escape hebt auf. Woerter sind `<span>`, schon
 * aufgenommene sind `<mark>` — hervorgehobener Text mit Bezug, den ein
 * Screenreader ansagt, ohne eine Bedienrolle zu erfinden.
 *
 * ## Was hier nicht steht
 *
 * Kein Woerterbuch, kein Netz, kein Anbieter. Diese Datei bekommt fertige
 * Tokens und sagt, was angetippt wurde. `beschaeftigt` heisst im Portal deshalb
 * auch nicht „das Offline-Woerterbuch schlaegt nach" — das gibt es hier
 * nicht —, sondern „der Text wird gerade ausgewertet".
 */

export type WordState = 'taken' | 'listed' | 'open';

export interface QuelltextProps {
  tokens: readonly SourceToken[];
  /** Wie steht es um den Kandidaten hinter diesem Wort? */
  zustandVon: (candidateId: string) => WordState;
  /** Aufnehmen: Tokenindex von … bis, einschließlich. */
  aufAufnehmen: (from: number, to: number) => void;
  /**
   * Der Text wird gerade ausgewertet.
   *
   * Lesen und Markieren bleiben erlaubt, nur das Aufnehmen wartet: Eine
   * Zeile, die waehrend der Analyse entsteht, haette die Fundstellen und
   * Wortformen nicht, die zwei Sekunden spaeter dastehen — und niemand
   * truege sie nach.
   */
  beschaeftigt?: boolean;
}

export function Quelltext({
  tokens,
  zustandVon,
  aufAufnehmen,
  beschaeftigt = false,
}: QuelltextProps): React.JSX.Element {
  const helpId = useId();
  const docRef = useRef<HTMLDivElement>(null);

  /** Die Tokenindizes aller Wörter – nur sie sind ansteuerbar. */
  const words = useMemo(
    () => tokens.flatMap((token, index) => (token.isWord ? [index] : [])),
    [tokens],
  );

  /**
   * Wo die Markierung begann und wo sie gerade endet.
   *
   * Zwei Werte statt „Anfang und Länge“: Beim Erweitern nach links wandert das
   * Ende vor den Anfang, und die Markierung soll trotzdem dieselbe bleiben.
   * `null` heißt: Es wurde noch nichts angesteuert.
   */
  const [anchor, setAnchor] = useState<number | null>(null);
  const [head, setHead] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  /*
    Dieselben zwei Werte noch einmal als Ref – und das ist kein Versehen.

    `focusWord` löst `focus` **synchron** aus, mitten im Tastendruck. Der
    `onFocus`-Behandler läuft damit, bevor React den neuen Zustand gesetzt hat,
    und sähe dort noch die alten Werte: Er hielte den programmatischen
    Fokuswechsel für einen fremden und setzte die gerade erweiterte Markierung
    auf ein einzelnes Wort zurück. Umschalt und Pfeiltaste täten dann nichts.
  */
  const anchorRef = useRef<number | null>(null);
  const headRef = useRef<number | null>(null);

  const setSelection = useCallback((nextAnchor: number | null, nextHead: number | null): void => {
    anchorRef.current = nextAnchor;
    headRef.current = nextHead;
    setAnchor(nextAnchor);
    setHead(nextHead);
  }, []);

  /** Der Tabstopp: das angesteuerte Wort, sonst das erste. */
  const active = head ?? words[0] ?? null;
  const from = anchor === null || head === null ? null : Math.min(anchor, head);
  const to = anchor === null || head === null ? null : Math.max(anchor, head);
  const selectionText =
    from === null || to === null ? '' : describeSelection(tokens, from, to);
  const multiword = from !== null && to !== null && from !== to;

  // Eine neue Zerlegung heißt: anderer Text. Eine Markierung, die auf alte
  // Indizes zeigt, wäre danach an einer beliebigen Stelle.
  useEffect(() => {
    setSelection(null, null);
  }, [tokens, setSelection]);

  const focusWord = useCallback((index: number): void => {
    const element = docRef.current?.querySelector<HTMLElement>(`[data-word="${index}"]`);
    element?.focus();
  }, []);

  /** Ein Schritt in der Wortliste – begrenzt, nicht umlaufend. */
  const step = useCallback(
    (current: number, direction: 1 | -1): number => {
      const position = words.indexOf(current);
      if (position < 0) return words[0] ?? current;
      const next = position + direction;
      return words[Math.min(Math.max(next, 0), words.length - 1)] ?? current;
    },
    [words],
  );

  const describe = useCallback(
    (index: number, extended: string): string => {
      if (extended.includes(' ')) return `Markiert: ${extended}`;
      const token = tokens[index];
      if (!token) return '';
      const state = token.candidateId ? zustandVon(token.candidateId) : 'open';
      if (state === 'taken') return `${token.text} – wird übernommen`;
      if (state === 'listed') return `${token.text} – steht in der Liste, Übersetzung fehlt`;
      return token.text;
    },
    [tokens, zustandVon],
  );

  const moveTo = useCallback(
    (index: number, extend: boolean): void => {
      const current = anchorRef.current;
      const nextAnchor = extend && current !== null ? current : index;
      setSelection(nextAnchor, index);
      focusWord(index);
      setAnnouncement(
        describe(
          index,
          describeSelection(tokens, Math.min(nextAnchor, index), Math.max(nextAnchor, index)),
        ),
      );
    },
    [describe, focusWord, setSelection, tokens],
  );

  const take = useCallback((): void => {
    if (from === null || to === null) return;
    if (beschaeftigt) {
      setAnnouncement('Der Text wird gerade ausgewertet. Gleich noch einmal versuchen.');
      return;
    }
    aufAufnehmen(from, to);
  }, [beschaeftigt, from, to, aufAufnehmen]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (active === null) return;
    const extend = event.shiftKey;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        moveTo(step(active, 1), extend);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        moveTo(step(active, -1), extend);
        return;
      case 'Home':
        event.preventDefault();
        moveTo(words[0] ?? active, extend);
        return;
      case 'End':
        event.preventDefault();
        moveTo(words[words.length - 1] ?? active, extend);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        take();
        return;
      case 'Escape':
        if (multiword) {
          event.preventDefault();
          setSelection(active, active);
          setAnnouncement(`Markierung aufgehoben. ${describe(active, '')}`);
        }
        return;
      default:
    }
  }

  return (
    <>
      <p id={helpId} className="visually-hidden">
        Ein Tabstopp für den ganzen Text. Pfeiltaste links und rechts gehen von Wort zu Wort.
        Umschalt und Pfeiltaste erweitern die Markierung auf eine Wortgruppe wie „depend on“.
        Eingabetaste nimmt die Markierung in die Empfehlungen auf oder springt zur vorhandenen
        Zeile. Escape hebt die Erweiterung auf.
      </p>

      <div
        ref={docRef}
        className="werkstatt__quelltext"
        role="group"
        aria-label="Analysierter Text"
        aria-describedby={helpId}
        onKeyDown={onKeyDown}
      >
        {tokens.map((token, index) => {
          if (!token.isWord) return <span key={index}>{token.text}</span>;

          const state = token.candidateId ? zustandVon(token.candidateId) : 'open';
          const selected = from !== null && to !== null && index >= from && index <= to;
          const props = {
            'data-word': index,
            'data-state': state,
            className: 'werkstatt__wort',
            tabIndex: index === active ? 0 : -1,
            /*
              Umschalt und Klicken darf den Fokus nicht versetzen.

              Sonst käme zuerst `focus` – und der Behandler darunter hielte das
              für einen gewöhnlichen Klick und setzte die Markierung auf dieses
              eine Wort zurück. Der Klick erweiterte dann nichts mehr. Genau so
              verhält sich auch eine Textmarkierung: Der Anfang bleibt, wo er
              war.
            */
            onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
              if (event.shiftKey && anchorRef.current !== null) event.preventDefault();
            },
            onFocus: () => {
              // Nur ein Fokus, der **nicht** von `moveTo` kommt: ein Klick oder
              // der Tabulator. Der Vergleich läuft über die Ref, weil der
              // Zustand hier noch der von vor dem Tastendruck ist.
              if (headRef.current !== index) {
                setSelection(index, index);
                setAnnouncement(describe(index, ''));
              }
            },
            onClick: (event: React.MouseEvent<HTMLElement>) => {
              const start = anchorRef.current;
              if (event.shiftKey && start !== null) {
                setSelection(start, index);
                setAnnouncement(
                  `Markiert: ${describeSelection(tokens, Math.min(start, index), Math.max(start, index))}`,
                );
                return;
              }
              setSelection(index, index);
              if (beschaeftigt) {
                setAnnouncement(
                  'Der Text wird gerade ausgewertet. Gleich noch einmal versuchen.',
                );
                return;
              }
              aufAufnehmen(index, index);
            },
            ...(selected && multiword ? { 'data-selected': 'true' } : {}),
          };

          return state === 'open' ? (
            <span key={index} {...props}>
              {token.text}
            </span>
          ) : (
            <mark key={index} {...props}>
              {token.text}
            </mark>
          );
        })}
      </div>

      {/*
        Der Knopf für die Wortgruppe.

        Mit der Tastatur reicht die Eingabetaste. Mit der Maus gäbe es sonst
        keinen Weg: Umschalt und Klicken erweitert die Markierung, aber irgendwo
        muss man sie auch übernehmen können – und ein zweiter Klick ins Wort
        machte aus der Gruppe wieder ein einzelnes Wort.
      */}
      {multiword ? (
        <p className="werkstatt__aufnehmen">
          <button type="button" className="btn btn--secondary btn--small" onClick={take} disabled={beschaeftigt}>
            „{selectionText}“ aufnehmen
          </button>
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </>
  );
}

/**
 * Wie der Text zu bedienen ist – der Inhalt hinter dem **i**.
 *
 * Bis 4B.5 stand er als Legende unter dem Textfeld: drei Zeilen, die man
 * einmal liest, unter einem Feld, dessen Höhe ohnehin knapp ist. Hinter dem
 * **i** neben „Dein Text“ steht dasselbe, kostet aber keine Höhe – und ist per
 * Klick, Tastatur und auf einem Telefon erreichbar, nicht nur per Maus.
 *
 * Er lebt hier und nicht in der Ansicht daneben: Was der Text kann, weiß diese
 * Datei, und eine Erklärung, die anderswo gepflegt wird, veraltet.
 */
export function Quelltextlegende(): React.JSX.Element {
  return (
    <>
      <p style={{ margin: 0 }}>
        <mark className="werkstatt__wort" data-state="taken" aria-hidden="true">
          Wort
        </mark>{' '}
        heißt <strong>übernommen</strong>,{' '}
        <mark className="werkstatt__wort" data-state="listed" aria-hidden="true">
          Wort
        </mark>{' '}
        heißt <strong>steht in der Liste, Übersetzung fehlt</strong>.
      </p>
      <p style={{ margin: 0 }}>
        Klicken nimmt ein Wort dazu; ein Klick auf ein schon markiertes Wort führt zu seiner
        Zeile. Umschalt und Klicken markiert eine Wortgruppe wie „depend on“.
      </p>
      <p style={{ margin: 0 }}>
        Mit der Tastatur: ein Tabstopp für den ganzen Text, Pfeiltasten von Wort zu Wort,
        Umschalt und Pfeiltaste erweitern, Eingabetaste nimmt auf, Escape hebt die Markierung
        auf.
      </p>
    </>
  );
}
