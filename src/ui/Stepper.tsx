import type { ReactNode } from 'react';

/**
 * Der Schrittanzeiger des Import-Assistenten.
 *
 * Zwei Dinge macht er gleichzeitig, und beide sind wichtig:
 *
 * - Er **zeigt**, wo man ist und was noch kommt. Das ist die klassische
 *   Aufgabe, und dafür genügten Textzeilen.
 * - Er **ist ein Weg zurück**. Wer im dritten Schritt merkt, dass die Auswahl
 *   nicht stimmt, klickt oben auf den zweiten – und findet ihn so vor, wie er
 *   ihn verlassen hat.
 *
 * Deshalb sind die Schritte echte Schaltflächen und keine Listenpunkte mit
 * einem Klickhandler: Tastatur, Screenreader und die Hilfstechnik des Systems
 * sollen ohne Umweg wissen, dass hier etwas passiert. Ein Schritt, der noch
 * nicht erreichbar ist, bleibt als `disabled` sichtbar – er verschwindet nicht,
 * denn er ist ja der Plan.
 */
export interface StepperItem<Id extends string> {
  id: Id;
  label: string;
  /**
   * Schon erreichbar? Erreichbar heißt: Dieser Schritt hat alles, was er
   * braucht. Vorwärts springt man damit nicht – die Voraussetzung dafür
   * entsteht erst durch die Arbeit im Schritt davor.
   */
  reachable: boolean;
  /** Kurzer Zusatz für die Hilfstechnik, etwa „abgeschlossen“. */
  note?: string;
}

export interface StepperProps<Id extends string> {
  steps: readonly StepperItem<Id>[];
  current: Id;
  onNavigate: (id: Id) => void;
  /** Beschriftung der Navigation – im Assistenten „Schritte“. */
  label?: string;
}

export function Stepper<Id extends string>({
  steps,
  current,
  onNavigate,
  label = 'Schritte',
}: StepperProps<Id>): ReactNode {
  return (
    <nav aria-label={label} className="steps-nav">
      <ol className="steps">
        {steps.map((step, index) => {
          const isCurrent = step.id === current;
          return (
            <li key={step.id}>
              {/*
                Der zugängliche Name trägt die Nummer mit: „Schritt 2:
                Empfehlungen generieren“.

                Ohne sie hieße der Stepper-Knopf genauso wie die Hauptaktion im
                Schritt – zweimal „Text analysieren“ auf einer Seite, zwei ganz
                verschiedene Dinge. Sichtbar bleibt die Nummer, was sie ist:
                eine Ziffer im Kreis.
              */}
              <button
                type="button"
                className="steps__step"
                aria-label={`Schritt ${index + 1}: ${step.label}${
                  step.note ? ` – ${step.note}` : ''
                }${step.reachable ? '' : ' – noch nicht erreichbar'}`}
                aria-current={isCurrent ? 'step' : undefined}
                disabled={!step.reachable}
                onClick={() => onNavigate(step.id)}
              >
                <span className="steps__number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="steps__label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
