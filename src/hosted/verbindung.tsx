import type { ReactNode } from 'react';

import { Button } from '../ui/components';
import { ErrorState } from '../ui/zustaende';

/**
 * Das Portal braucht das Netz – und sagt das, wenn es fehlt (Pilot 0.1).
 *
 * ## Der Zustand, den es vorher gab
 *
 * Eine Seite lud, die Abfrage scheiterte, und zurück blieb eine leere Liste.
 * Die Oberfläche sagte dann „noch keine Kurse" – und das ist nicht nur
 * unschön, es ist **unwahr**. Wer das liest, glaubt, es gebe nichts, und
 * fängt an, etwas anzulegen, das längst da ist.
 *
 * Für Pilot 0.1 gilt deshalb: Jede Ansicht, die Daten holt, hat drei
 * Ausgänge – Inhalt, Platzhalter, Verbindungsfehler. Keinen vierten, und vor
 * allem keinen stillen.
 *
 * ## Warum kein Offlinebetrieb
 *
 * Weil der getrennte Offlineweg schon existiert: die portable Lerndatei,
 * ohne Konto und ohne Netz. Eine zweite, halbe Offlinefähigkeit im Portal
 * wäre die schlechtere von beiden – sie müsste Lernstände zwischenlagern und
 * später zusammenführen, und genau dort entstehen die Fehler, die niemand
 * bemerkt.
 */

/**
 * Hat das Gerät gerade keine Verbindung?
 *
 * `navigator.onLine` ist ein schwacher Zeuge: Er sagt zuverlässig „nein",
 * aber sein „ja" bedeutet nur, dass es eine Netzwerkschnittstelle gibt – ein
 * WLAN ohne Internet meldet `true`. Deshalb entscheidet er hier nur über den
 * **Ton**, nie darüber, ob ein Fehler vorliegt.
 */
export function istOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Der Verbindungsfehler mit dem Ausweg daneben.
 *
 * `erneut` ist Pflicht und nicht wahlfrei: Ein Fehler ohne Ausweg ist eine
 * Sackgasse, und die einzige Handlung, die hier immer hilft, ist es noch
 * einmal zu versuchen.
 */
export function Verbindungsfehler({
  erneut,
  was,
  children,
}: {
  /** Was die Schaltfläche auslöst. Lädt dieselbe Ansicht noch einmal. */
  erneut: () => void;
  /** Worum es ging – „Die Kurse", „Dein Fortschritt". Steht im Satz. */
  was: string;
  /** Ein zusätzlicher Satz, wenn die Ansicht einen braucht. */
  children?: ReactNode;
}) {
  const offline = istOffline();
  return (
    <ErrorState
      title={offline ? 'Keine Verbindung' : 'Nicht erreichbar'}
      tone={offline ? 'offline' : 'error'}
      action={<Button onClick={erneut}>Erneut versuchen</Button>}
    >
      <p>
        {offline
          ? `${was} ließ sich nicht laden – dein Gerät ist gerade offline. Das Portal braucht eine Verbindung.`
          : `${was} ließ sich nicht laden. Das kann an der Verbindung liegen oder am Server.`}
      </p>
      {children}
    </ErrorState>
  );
}
