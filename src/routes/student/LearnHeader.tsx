import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button } from '../../ui/components';

/**
 * Der gemeinsame Kopf aller Lernansichten.
 *
 * Links steht, wo man ist: Kontext, Titel, gegebenenfalls eine kurze
 * Statuszeile. Rechts stehen die beiden Wege hinaus – „Zurück zum Paket“ und
 * „Mit Karten lernen“. Vorher lagen sie am **Ende** der Seite: Wer mitten in
 * einer Runde umsteigen wollte, musste erst an allen Aufgaben vorbeiscrollen.
 *
 * ## Link oder Schaltfläche
 *
 * Reine Navigation ist ein `<a>` – mittlere Maustaste, „in neuem Tab öffnen“
 * und die Statusleiste des Browsers funktionieren dann wie überall sonst. Nur
 * wenn vor dem Verlassen eine Rückfrage nötig ist, weil sonst eine begonnene
 * Runde verloren ginge, wird daraus eine `<button>`: Ein Link, der erst fragt,
 * wäre ein Link, der lügt.
 *
 * Die Rückfrage erscheint als Meldung unter dem Kopf, nicht als
 * `window.confirm` – ein Systemdialog blockiert das Fenster, ist nicht
 * gestaltbar und in einer portablen Datei besonders unangenehm.
 */

export interface LearnHeaderProps {
  /** Kleiner Kontexthinweis über dem Titel. */
  eyebrow: string;
  title: string;
  /** Optionale kurze Statuszeile unter dem Titel. */
  status?: ReactNode;
  packId: string;
  /**
   * `false` im Kartenmodus selbst: Eine Schaltfläche, die auf die gerade
   * geöffnete Seite zeigt, ist keine Hilfe, sondern eine Irreführung.
   */
  showCards?: boolean;
  /**
   * `true`, solange eine begonnene Runde beim Verlassen verloren ginge.
   * In Ergebnis- und Einrichtungsansichten bleibt es `false` – dort gibt es
   * nichts zu verlieren, und eine Rückfrage wäre reine Reibung.
   */
  confirmLeave?: boolean;
  /** Was in der Rückfrage steht. */
  confirmTitle?: string;
  confirmText?: string;
}

export function LearnHeader({
  eyebrow,
  title,
  status,
  packId,
  showCards = true,
  confirmLeave = false,
  confirmTitle = 'Runde wirklich verlassen?',
  confirmText = 'Deine bisherigen Antworten in dieser Runde gehen dann verloren. Dein Lernstand bleibt unverändert.',
}: LearnHeaderProps) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  const packUrl = `/lernen/${packId}`;
  const cardsUrl = `/lernen/${packId}/karten`;

  const actions: { label: string; to: string }[] = [
    { label: 'Zurück zum Paket', to: packUrl },
    ...(showCards ? [{ label: 'Mit Karten lernen', to: cardsUrl }] : []),
  ];

  return (
    <div className="learn-header">
      <div className="learn-header__bar">
        <div className="learn-header__titles">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {status ? <p className="muted small learn-header__status">{status}</p> : null}
        </div>

        <nav className="learn-header__actions" aria-label="Lernnavigation">
          {actions.map((action) =>
            confirmLeave ? (
              <Button key={action.to} small onClick={() => setPending(action.to)}>
                {action.label}
              </Button>
            ) : (
              <Link key={action.to} className="btn btn--small" to={action.to}>
                {action.label}
              </Link>
            ),
          )}
        </nav>
      </div>

      {pending ? (
        <Alert tone="warning" title={confirmTitle}>
          {confirmText}
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <Button small variant="primary" onClick={() => navigate(pending)}>
              Ja, verlassen
            </Button>
            <Button small variant="quiet" onClick={() => setPending(null)}>
              Weitermachen
            </Button>
          </div>
        </Alert>
      ) : null}
    </div>
  );
}
