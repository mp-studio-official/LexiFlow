import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Erklärender Text, der nicht dauernd im Weg steht.
 *
 * Der Datenschutzhinweis der Textwerkstatt ist wichtig und lang. Beides
 * zugleich geht nicht: Steht er offen, liest ihn nach dem zweiten Mal niemand
 * mehr und er verdrängt das Textfeld nach unten; versteckt man ihn, ist er
 * nicht mehr da. Also: eine Schaltfläche, die sagt, was dahinter steckt, und
 * ein Bereich, der auf Klick erscheint.
 *
 * Was das barrierefrei macht, ist kein Detail, sondern die ganze Sache:
 *
 * - `aria-expanded` sagt vor dem Klick, ob offen oder zu ist.
 * - `aria-controls` verbindet Schaltfläche und Bereich, damit die Hilfstechnik
 *   den Sprung anbietet.
 * - **Escape schließt** und gibt den Fokus zurück. Wer mit der Tastatur
 *   arbeitet, darf nicht in einem geöffneten Kasten festsitzen.
 * - Ein Klick daneben schließt ebenfalls – das erwartet man von etwas, das
 *   über dem Inhalt liegt.
 *
 * Der Inhalt wird erst gerendert, wenn er offen ist. Ein zugeklappter
 * Hinweistext, den ein Screenreader trotzdem vorliest, wäre das Gegenteil von
 * dem, was hier beabsichtigt ist.
 */
export interface InfoDisclosureProps {
  /** Beschriftung der Schaltfläche, z. B. „Was passiert mit meinem Text?“. */
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
    <div className="disclosure" ref={wrapperRef}>
      <button
        type="button"
        ref={buttonRef}
        className="btn btn--quiet btn--small disclosure__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      {open ? (
        <div className="disclosure__panel" id={panelId} role="group" aria-label={title ?? label}>
          {title ? <strong className="disclosure__title">{title}</strong> : null}
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
