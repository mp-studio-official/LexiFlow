import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Alert, Announcer, Button } from '../../../ui/components';
import { geminiReady } from '../assistant';
import { describeTransmission, type GeminiCapability } from '../capabilities';
import { GeminiError } from '../errors';

/**
 * Ein Knopf, der etwas ins Netz schickt – und alles, was davorgehört.
 *
 * ## Der Satz steht vor dem Klick, nicht danach
 *
 * Ein Hinweis, der erst nach dem Absenden erscheint, ist keine Aufklärung,
 * sondern eine Mitteilung. `describeTransmission` steht deshalb **neben** dem
 * Knopf und ist immer sichtbar: was hinausgeht, dass kein vollständiger
 * Quelltext dabei ist, und dass Kontingente und Kosten des Google-Kontos
 * gelten. Er kommt aus derselben Tabelle, aus der auch der Anfragebau liest –
 * eine Beschreibung, die neben dem Code liegt, statt über ihn zu behaupten.
 *
 * ## Ohne Schlüssel ist hier nichts
 *
 * Kein ausgegrauter Knopf, keine Werbung für eine Funktion, die man erst
 * einrichten müsste: Ist kein Schlüssel eingetragen, rendert diese Komponente
 * gar nichts. Wer Gemini nicht will, soll an keiner Stelle daran erinnert
 * werden, dass es das gibt.
 *
 * ## Wiederholt wird nach einem Klick
 *
 * Auch im Fehlerfall gibt es keinen automatischen zweiten Versuch. Der Knopf
 * „Noch einmal versuchen“ erscheint nur bei Fehlern, bei denen das überhaupt
 * Aussicht hat (`retryable`) – bei einem falschen Schlüssel wäre er eine
 * Einladung, fünfmal dasselbe zu tun.
 */

export interface GeminiActionProps {
  capability: GeminiCapability;
  /** Beschriftung des Knopfes – sie nennt Gemini beim Namen. */
  label: string;
  /** Eindeutiger zugänglicher Name, meist mit der Zeile darin. */
  ariaLabel: string;
  disabled?: boolean;
  /** Was der Klick auslöst. Fehler wirft er; das Anzeigen übernimmt diese Komponente. */
  run: (signal: AbortSignal) => Promise<void>;
  /** Die Vorschläge, sobald es welche gibt. */
  children?: ReactNode;
}

export function GeminiAction({
  capability,
  label,
  ariaLabel,
  disabled = false,
  run,
  children,
}: GeminiActionProps) {
  /*
    Einmal beim Einhängen gelesen und nicht bei jedem Rendern: Der Schlüssel
    ändert sich auf einer anderen Seite, und ein Wechsel dorthin hängt diese
    Ansicht ohnehin neu ein.
  */
  const [ready] = useState(() => geminiReady());
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function start(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus('Die Anfrage läuft.');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await run(controller.signal);
      setStatus('Ein Vorschlag liegt vor. Er wurde noch nicht übernommen.');
    } catch (caught: unknown) {
      /*
        Nur die deutsche Meldung aus `errors.ts`. Ein durchgereichter fremder
        Fehler kann eine Adresse, einen Antwortrumpf oder den Schlüssel
        enthalten.
      */
      const fehler =
        caught instanceof GeminiError
          ? { message: caught.message, retryable: caught.retryable }
          : { message: 'Die Anfrage ist fehlgeschlagen. Es wurde nichts übernommen.', retryable: true };
      setError(fehler);
      setStatus('Die Anfrage ist fehlgeschlagen.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  /*
    Nach den Hooks und vor dem Markup: Die Reihenfolge der Hooks bleibt damit
    in jedem Rendern dieselbe, auch wenn der Schlüssel fehlt.
  */
  if (!ready) return null;

  return (
    <div className="gemini-action">
      <Announcer message={status} />

      <div className="row">
        <Button
          small
          disabled={disabled || busy}
          aria-busy={busy}
          aria-label={ariaLabel}
          onClick={() => void start()}
        >
          {busy ? 'Gemini wird gefragt …' : label}
        </Button>
        {busy ? (
          <Button small variant="quiet" onClick={() => abortRef.current?.abort()}>
            Abbrechen
          </Button>
        ) : null}
      </div>

      <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
        {describeTransmission(capability)}
      </p>

      {error ? (
        <Alert tone="error">
          {error.message}
          {error.retryable ? (
            <>
              {' '}
              <Button small disabled={busy} onClick={() => void start()}>
                Noch einmal versuchen
              </Button>
            </>
          ) : null}
        </Alert>
      ) : null}

      {children}
    </div>
  );
}
