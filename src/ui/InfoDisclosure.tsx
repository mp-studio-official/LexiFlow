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
   * Der zugängliche Name des Auslösers, z. B. „Hinweis zur Textverarbeitung“.
   * Sichtbar ist nur das Symbol – oder das, was `trigger` zeigt.
   */
  label: string;
  /** Überschrift über dem geöffneten Bereich. */
  title?: string;
  /**
   * Was den Kasten öffnet. Fehlt es, ist es das runde **i**.
   *
   * Seit 4B.5 ist der Auslöser auch einmal etwas anderes: In der Prüftabelle
   * ist es die Statusplakette selbst („Bitte prüfen“). Sie steht ohnehin da,
   * sie ist die Auskunft, um die es geht, und ein zweites Symbol daneben wäre
   * ein zweiter Weg zur selben Antwort.
   */
  trigger?: ReactNode;
  /** Klassen des Auslösers, wenn er nicht das runde **i** ist. */
  triggerClassName?: string;
  /**
   * Zusätzlich beim Überfahren öffnen.
   *
   * Ausdrücklich **zusätzlich**: Klick und Tastatur bleiben der Hauptweg, und
   * der Inhalt ist auf einem Telefon ohne Maus vollständig erreichbar. Ein
   * Hinweis, den nur eine Maus erreicht, wäre auf einem iPad keiner.
   *
   * Beim Verlassen schließt sich nur, was das Überfahren geöffnet hat: Wer
   * geklickt hat, hat sich entschieden, und eine Entscheidung nimmt die
   * Mausbewegung nicht zurück.
   */
  openOnHover?: boolean;
  /** Zusätzliche Klasse am Rahmen – etwa für die Lage des Kastens. */
  className?: string;
  children: ReactNode;
}

export function InfoDisclosure({
  label,
  title,
  trigger,
  triggerClassName,
  openOnHover = false,
  className,
  children,
}: InfoDisclosureProps): ReactNode {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(false);
  /**
   * Klappt der Kasten nach oben auf?
   *
   * Unten auf der Seite – etwa in den letzten Zeilen der Prüftabelle, direkt
   * über der klebenden Leiste – ist unterhalb des Auslösers kein Platz. Ein
   * Kasten, der dort nach unten aufgeht, steht zur Hälfte außerhalb des
   * Fensters, und man muss scrollen, um einen Satz zu lesen.
   *
   * Gemessen wird beim Öffnen, nicht beim Rendern: Vorher steht der Auslöser
   * noch gar nicht dort, wo er beim Klick stehen wird.
   */
  const [flip, setFlip] = useState(false);
  /** Geöffnet durch Überfahren – dann schließt das Verlassen wieder. */
  const byHover = useRef(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    const platz = window.innerHeight - rect.bottom;
    // 14 rem ist die Höhe, unter der ein zweizeiliger Hinweis anfängt zu
    // klemmen. Genauer geht es nicht, ohne den Kasten erst zu rendern.
    setFlip(platz > 0 && platz < 14 * 16 && rect.top > 14 * 16);
  }, [open]);

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
    <div
      className={['info', className].filter(Boolean).join(' ')}
      ref={wrapperRef}
      {...(flip && open ? { 'data-flip': 'up' } : {})}
      {...(openOnHover
        ? {
            onMouseEnter: () => {
              if (!open) {
                byHover.current = true;
                setOpen(true);
              }
            },
            onMouseLeave: () => {
              if (byHover.current) {
                byHover.current = false;
                setOpen(false);
              }
            },
          }
        : {})}
    >
      <button
        type="button"
        ref={buttonRef}
        className={triggerClassName ?? 'info__button'}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          /*
            Ein Klick auf etwas, das beim Überfahren schon aufging, **pinnt**
            es fest – er schließt es nicht.

            Mit der Maus kommt vor jedem Klick ein `mouseenter`. Ein blindes
            Umschalten machte den Kasten damit im selben Moment wieder zu, in
            dem jemand ihn festhalten wollte: Er ginge auf, und der Klick
            nähme ihn zurück.
          */
          if (byHover.current) {
            byHover.current = false;
            setOpen(true);
            return;
          }
          setOpen((current) => !current);
        }}
      >
        {trigger ?? (
          <span className="info__mark" aria-hidden="true">
            i
          </span>
        )}
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
