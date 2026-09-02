import { useId, useState, type ReactNode } from 'react';

/**
 * Ein beschrifteter Aufklapper – zu, bis jemand ihn öffnet.
 *
 * ## Warum nicht `<details>`
 *
 * `<details>/<summary>` wäre weniger Code und ist trotzdem der schlechtere
 * Weg: Der Öffnungszustand liegt dann im DOM statt im Zustand der Ansicht,
 * Safari und Chrome animieren unterschiedlich, und der Inhalt steht auch
 * zugeklappt im Dokument – ein Screenreader liest ihn dann mit vor. Genau das
 * soll ein zugeklappter Hinweis **nicht** tun.
 *
 * Hier wird der Inhalt erst gerendert, wenn er offen ist. Was zu ist, ist auch
 * für die Vorlesehilfe zu.
 *
 * ## Was er vom `InfoDisclosure` unterscheidet
 *
 * Das **i** ist eine Fußnote neben einer Überschrift: ein Symbol, ein Panel,
 * das über dem Inhalt schwebt. Dieser hier ist ein Abschnitt im Fluss der
 * Seite – mit sichtbarer Beschriftung, weil er nicht nur erklärt, sondern
 * auch Inhalt und Aktionen tragen kann („Frühere Empfehlungen (4)“).
 *
 * ## Der Zustand steckt nicht in der Farbe
 *
 * Offen oder zu sagt das Dreieck, das sich dreht – und `aria-expanded`. Die
 * Beschriftung bleibt dieselbe, damit die Schaltfläche zwischen zwei Klicks
 * nicht ihren Namen wechselt.
 */
export interface DisclosureProps {
  /** Die sichtbare Beschriftung, z. B. „Frühere Empfehlungen“. */
  summary: string;
  /** Eine Zahl dahinter, in Klammern. Weggelassen, wenn sie nichts sagt. */
  count?: number | undefined;
  /** Ein Satz unter der Beschriftung, auch im zugeklappten Zustand sichtbar. */
  hint?: string | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Disclosure({
  summary,
  count,
  hint,
  defaultOpen = false,
  children,
}: DisclosureProps): ReactNode {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="disclosure" data-open={open ? '' : undefined}>
      <button
        type="button"
        className="disclosure__summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="disclosure__caret" aria-hidden="true" />
        <span>
          {summary}
          {count === undefined ? '' : ` (${count})`}
        </span>
      </button>
      {hint ? <p className="disclosure__hint small muted">{hint}</p> : null}
      {open ? (
        <div className="disclosure__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default Disclosure;
