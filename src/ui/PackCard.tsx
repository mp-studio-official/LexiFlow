import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Das gemeinsame Kartenmuster für Vokabelpakete (Sprint 3A).
 *
 * Eine Karte, drei Zusammenhänge: Materialfeed der Lehrkraft, Lernfeed der
 * Schülerinnen und Schüler, und beliebige Raster dazwischen. Die Hierarchie
 * ist überall dieselbe – Titel groß, Metadaten klein, genau eine klare Aktion.
 *
 * **Klickbar ohne Verschachtelung.** Der Titel-Link spannt über
 * `::after` eine unsichtbare Fläche über die ganze Karte auf; weitere
 * Bedienelemente liegen in `.pack-card__actions` darüber. So gibt es keine
 * verschachtelten interaktiven Elemente und trotzdem eine große Trefferfläche.
 */

export interface PackCardProps {
  title: string;
  /** Ziel des Titel-Links – die Karte selbst ist damit anklickbar. */
  to: string;
  /** Kurze, präzise Metadaten. Wenige, gezielte – kein Badge-Salat. */
  meta: readonly string[];
  /** Optionaler Hinweis über dem Titel, z. B. „5 Vokabeln sind dran“. */
  flag?: string;
  /** Fortschritt, Lernstand oder ein anderer ruhiger Zusatz. */
  children?: ReactNode;
  /** Aktionen; liegen über der Klickfläche des Titels. */
  actions?: ReactNode;
}

export function PackCard({ title, to, meta, flag, children, actions }: PackCardProps) {
  return (
    <article className="pack-card">
      {flag ? <p className="pack-card__flag">{flag}</p> : null}

      <h3 className="pack-card__title">
        <Link className="pack-card__link" to={to}>
          {title}
        </Link>
      </h3>

      {meta.length > 0 ? (
        <p className="pack-card__meta">
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      ) : null}

      {children}

      {actions ? <div className="pack-card__actions">{actions}</div> : null}
    </article>
  );
}
