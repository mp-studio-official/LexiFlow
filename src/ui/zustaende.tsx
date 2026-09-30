import type { ReactNode } from 'react';

/**
 * Die drei Zustandsbausteine für 5B — Laden, Titel, Fehler.
 *
 * ## Warum sie hier stehen und nicht in `components.tsx`
 *
 * `components.tsx` trägt die Bausteine, die heute in Benutzung sind. Diese
 * drei sind es noch nicht: Sie warten auf die Freigabe der Entwürfe. Sie
 * daneben zu legen hält beides auseinander — was das Produkt heute benutzt,
 * und was für den Umbau bereitliegt.
 *
 * ## Was sie ausdrücklich **nicht** tun
 *
 * Sie fassen `EmptyState` nicht an. Der ist in sieben Bereichen produktiv im
 * Einsatz — Lehrkraft- und Lernendenstart, Lernbereiche, Kurse, Pakete,
 * KI-Zugang —, und jede Vereinheitlichung änderte dort das Bild, bevor
 * irgendjemand einen Entwurf gesehen hat. Sie gehört deshalb in den Umbau des
 * jeweiligen Bildschirms, nicht in diesen Block.
 * `src/ui/EmptyState.unveraendert.test.tsx` hält fest, dass er unverändert
 * bleibt.
 *
 * ## Die drei, und woran man sie unterscheidet
 *
 * | Baustein | Frage | Rolle für Hilfsmittel |
 * | --- | --- | --- |
 * | `Skeleton` | „Es kommt gleich etwas." | `status`, höflich |
 * | `PageTitle` | „Wo bin ich, und was ist das hier?" | `h1` |
 * | `ErrorState` | „Es ging nicht — und so kommst du weiter." | `alert`, sofort |
 *
 * `EmptyState` beantwortet die vierte Frage: „Hier ist noch nichts, und so
 * fängt es an." Vier Zustände, vier Bausteine, keiner davon vertritt einen
 * anderen.
 */

/**
 * Ein Platzhalter, solange geladen wird.
 *
 * ## Warum Platzhalter und kein Kreisel
 *
 * Ein Kreisel sagt „warte"; ein Platzhalter sagt „hier kommt eine Liste, dort
 * ein Bild". Das Bild springt beim Eintreffen der Daten weniger, weil der
 * Platz schon steht — und wer die Seite kennt, liest schon vorher, wo was sein
 * wird.
 *
 * ## Warum trotzdem ein Satz für Hilfsmittel
 *
 * Graue Kästen sind für eine Bildschirmleserin nichts. Die Form ist deshalb
 * `aria-hidden`, und daneben steht ein Satz in einem höflichen Live-Bereich —
 * höflich, weil Laden keine Unterbrechung wert ist.
 */
export function Skeleton({
  lines = 3,
  variant = 'text',
  label = 'Wird geladen',
}: {
  /** Wie viele Zeilen die Ahnung hat. Bei `cover` ohne Bedeutung. */
  lines?: number;
  /** Wovon der Platzhalter eine Ahnung gibt. */
  variant?: 'text' | 'card' | 'cover';
  /** Was Hilfsmittel vorlesen. */
  label?: string;
}) {
  const zeilen = Math.max(1, Math.min(lines, 12));

  return (
    <div className={`skeleton skeleton--${variant}`} data-testid="skeleton">
      <div className="visually-hidden" role="status" aria-live="polite">
        {label}
      </div>
      {variant === 'cover' ? (
        <div className="skeleton__cover" aria-hidden="true" />
      ) : (
        <div className="skeleton__stack" aria-hidden="true">
          {Array.from({ length: zeilen }, (_, nummer) => (
            <div key={nummer} className="skeleton__line" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Der Kopf einer Seite.
 *
 * ## Warum das ein Baustein ist und keine Überschrift
 *
 * Weil an einem Seitenkopf mehr hängt als eine Zeile: die Einordnung darüber
 * („Kurs 7b"), der Titel, ein Satz dazu, und rechts die Handlungen. Heute
 * steht diese Anordnung in jedem Bildschirm einzeln — mal mit, mal ohne
 * Beschreibung, mal mit `h1`, mal mit `h2`. Genau solche Abweichungen sind es,
 * die eine Oberfläche uneinheitlich aussehen lassen, ohne dass man auf eine
 * einzelne Stelle zeigen könnte.
 *
 * Der Titel ist immer ein `h1`. Eine Seite hat eine Hauptüberschrift; dass sie
 * es ist, entscheidet nicht das Aussehen.
 */
export function PageTitle({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  /** Die Einordnung darüber — Kurs, Bereich, Schritt. */
  eyebrow?: ReactNode;
  /** Ein Satz, der den Titel erklärt. Kein Absatz. */
  description?: ReactNode;
  /** Was man hier tun kann. */
  actions?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div className="page-title__text">
        {eyebrow ? <p className="page-title__eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title__heading">{title}</h1>
        {description ? <p className="page-title__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-title__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * Etwas ist schiefgegangen — und was jetzt hilft.
 *
 * ## Warum getrennt von `EmptyState`
 *
 * Weil „hier ist noch nichts" und „es ging nicht" verschiedene Sätze sind und
 * verschiedene Antworten brauchen. Ein leerer Bereich lädt ein; ein Fehler
 * erklärt und bietet einen Ausweg. Beide in einen Baustein zu legen führt zu
 * einem, der beides halb kann.
 *
 * ## Warum `offline` ein eigener Ton ist
 *
 * Weil es kein Fehler ist. Wer im Bus übt, ist nicht kaputt — die Verbindung
 * ist weg, der Lernstand bleibt liegen und geht später hinaus. Dieselbe
 * Gestaltung wie für einen Serverfehler zu benutzen täuschte eine Dringlichkeit vor,
 * die es nicht gibt.
 */
export function ErrorState({
  title,
  children,
  action,
  tone = 'error',
  announce = true,
}: {
  title: string;
  /** Was passiert ist, in der Sprache der lesenden Person. */
  children?: ReactNode;
  /** Der Ausweg — erneut versuchen, zurück, woanders hin. */
  action?: ReactNode;
  tone?: 'error' | 'offline';
  /**
   * Ob Hilfsmittel den Fehler sofort ansagen.
   *
   * Voreingestellt ja: Ein Fehler, der beim Absenden erscheint, muss
   * ankommen. Steht er dagegen schon beim Öffnen der Seite da, ist er Teil des
   * Inhalts und keine Unterbrechung — dann `false`.
   */
  announce?: boolean;
}) {
  return (
    <div
      className={`error-state error-state--${tone}`}
      role={announce ? 'alert' : undefined}
      data-testid="error-state"
    >
      <h2 className="error-state__title">{title}</h2>
      {children ? <div className="error-state__text">{children}</div> : null}
      {action ? <div className="error-state__action">{action}</div> : null}
    </div>
  );
}
