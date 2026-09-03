import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { PackArt } from './PackArt';

/**
 * Das gemeinsame Paketmuster – ab Sprint 4B.3 als **Block** (Entwurfsroute B).
 *
 * Eine Karte, drei Zusammenhänge: Materialfeed der Lehrkraft, Lernfeed der
 * Schülerinnen und Schüler, und beliebige Raster dazwischen. Die Hierarchie
 * ist überall dieselbe – Titel groß, Metadaten klein, genau eine klare Aktion.
 *
 * ## Warum Zeile und nicht Kachel
 *
 * Eine Kachelwand sieht auf einem Entwurfsbild besser aus und ist beim Suchen
 * schlechter: Die Augen springen in zwei Richtungen statt in einer. Der Block
 * behält deshalb die eine Leserichtung, bekommt aber eigene Fläche, eine
 * weiche Ecke und eine Kante in Aubergine. Jedes Paket ist ein Ding, das man
 * anfassen kann – und die Liste bleibt eine Liste.
 *
 * ## Klickbar ohne Verschachtelung
 *
 * Der Titel-Link spannt über `::after` eine unsichtbare Fläche über den
 * ganzen Block auf; `tools`, `actions` und `children` liegen mit `z-index`
 * darüber. So gibt es keine verschachtelten interaktiven Elemente und
 * trotzdem eine große Trefferfläche.
 *
 * ## Mit Motiv (Sprint 4B.6)
 *
 * Mit `art` bekommt der Block einen Bildkopf und wird zur redaktionellen
 * Karte. Das ist der Lernbereich: Dort steht eine Handvoll Pakete, und sie
 * sollen aussehen wie etwas, das man aufschlägt.
 *
 * Der Materialbereich der Lehrkraft bleibt ohne. Dort ist die Liste ein
 * Arbeitsmittel; ein Bildkopf je Zeile machte aus fünfzig Paketen eine
 * Bildergalerie, durch die man scrollt, statt einer Liste, in der man sucht.
 */

export interface PackCardProps {
  title: string;
  /**
   * Der Text, aus dem das Motiv entsteht – meistens der Titel.
   *
   * Fehlt er, gibt es keinen Bildkopf. Das ist kein Sonderfall, sondern die
   * zweite Bauform derselben Karte.
   */
  art?: string;
  /** Ziel des Titel-Links – der Block selbst ist damit anklickbar. */
  to: string;
  /** Kurze, präzise Metadaten. Wenige, gezielte – kein Badge-Salat. */
  meta: readonly string[];
  /** Optionaler Hinweis über dem Titel, z. B. „5 Vokabeln sind dran“. */
  flag?: string;
  /**
   * Die eine Zahl, die den Umfang nennt – rechts neben dem Titel, mit
   * Tabellenziffern. Getrennt von `meta`, weil sie beim Überfliegen einer
   * Liste die meistgesuchte Angabe ist.
   */
  count?: string;
  /** Zeichenschaltflächen rechts im Kopf, z. B. die beiden Downloads. */
  tools?: ReactNode;
  /** Fortschritt, Lernstand oder ein anderer ruhiger Zusatz. */
  children?: ReactNode;
  /** Aktionen; liegen über der Klickfläche des Titels. */
  actions?: ReactNode;
}

export function PackCard({
  title,
  art,
  to,
  meta,
  flag,
  count,
  tools,
  children,
  actions,
}: PackCardProps) {
  return (
    <article className={art ? 'pack-card pack-card--art' : 'pack-card'}>
      {art ? (
        <div className="pack-card__art">
          <PackArt seed={art} />
          {/*
            Der Hinweis liegt **auf** dem Motiv, nicht darunter.

            „5 Vokabeln sind dran“ ist die eine Auskunft, wegen der jemand die
            Liste überfliegt. Über dem Bild hat sie Platz und kostet keine
            Zeile; darunter schöbe sie den Titel nach unten.
          */}
          {flag ? <p className="pack-card__flag pack-card__flag--on-art">{flag}</p> : null}
        </div>
      ) : flag ? (
        <p className="pack-card__flag">{flag}</p>
      ) : null}

      <h3 className="pack-card__title">
        <Link className="pack-card__link" to={to}>
          {title}
        </Link>
      </h3>

      {count ? <span className="pack-card__count">{count}</span> : null}
      {tools ? <span className="pack-card__tools">{tools}</span> : null}

      {meta.length > 0 ? (
        <p className="pack-card__meta">
          {meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
      ) : null}

      {children ? <div className="pack-card__body">{children}</div> : null}

      {actions ? <div className="pack-card__actions">{actions}</div> : null}
    </article>
  );
}
