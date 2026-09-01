import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Erklärender Text hinter einem kleinen runden **i**.
 *
 * Der Datenschutzhinweis der Textwerkstatt ist wichtig und lang. Beides
 * zugleich geht nicht: Steht er offen, liest ihn nach dem zweiten Mal niemand
 * mehr und er verdrängt das Textfeld nach unten; versteckt man ihn, ist er
 * nicht mehr da. Ein beschrifteter Knopf („Was passiert mit meinem Text?“) war
 * der erste Versuch und auch der falsche: Er stand als eigene Zeile im Weg und
 * sah aus wie eine Aktion, die man ausführen soll.
 *
 * Ein **i** neben der Überschrift ist die richtige Größe für diese Sache. Es
 * sagt „hier steht noch etwas“ und beansprucht nichts.
 *
 * Was das barrierefrei macht, ist kein Detail, sondern die ganze Sache:
 *
 * - `aria-label` trägt den Namen, den das Symbol nicht hat.
 * - `aria-expanded` sagt vor dem Klick, ob offen oder zu ist.
 * - `aria-controls` verbindet Schaltfläche und Bereich.
 * - **Escape schließt** und gibt den Fokus zurück. Wer mit der Tastatur
 *   arbeitet, darf nicht in einem geöffneten Kasten festsitzen.
 * - Ein zweiter Klick auf das **i** schließt ebenso, ein Klick daneben auch.
 * - Die Klickfläche ist mindestens 44 × 44 px groß, obwohl das Symbol
 *   kleiner ist. Ein 20-px-Ziel trifft auf einem Telefon niemand zuverlässig.
 *
 * Der Inhalt wird erst gerendert, wenn er offen ist. Ein zugeklappter
 * Hinweistext, den ein Screenreader trotzdem vorliest, wäre das Gegenteil von
 * dem, was hier beabsichtigt ist.
 */
export interface InfoDisclosureProps {
  /**
   * Der zugängliche Name des **i**-Knopfes, z. B. „Hinweis zur
   * Textverarbeitung“. Sichtbar ist nur das Symbol.
   */
  label: string;
  /** Überschrift über dem geöffneten Bereich. */
  title?: string;
  children: ReactNode;
}

export function InfoDisclosure({ label, title, children }: InfoDisclosureProps): ReactNode {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function close(returnFocus: boolean): void {
      setOpen(false);
      if (returnFocus) buttonRef.current?.focus();
    }

    function onKeyDown(event: KeyboardEvent): void {
      // Der Fokus kann im Kasten stehen; Escape gehört ihm trotzdem.
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    }

    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      // Ein Klick woanders ist eine Entscheidung für das Andere – der Fokus
      // wandert dorthin und wird nicht zurückgerissen.
      close(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="info" ref={wrapperRef}>
      <button
        type="button"
        ref={buttonRef}
        className="info__button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="info__mark" aria-hidden="true">
          i
        </span>
      </button>
      {open ? (
        <div className="info__panel" id={panelId} role="group" aria-label={title ?? label}>
          {title ? <strong className="info__title">{title}</strong> : null}
          {children}
          <div className="row">
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              Schließen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
