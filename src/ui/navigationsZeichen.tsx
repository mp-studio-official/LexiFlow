import type { SVGProps } from 'react';

import type { Zeichen } from './navigation';

/**
 * Die Zeichen der Navigation — neun Stück, selbst gezeichnet.
 *
 * ## Warum nicht `Icon.tsx`
 *
 * Weil `Icon` produktiv ist: zehn Zeichen, die heute auf Bildschirmen stehen,
 * und ein Renderer, der ausschließlich `<path>` kennt. Die Navigationszeichen
 * brauchen Kreise und Rechtecke — ein Kopf ist ein Kreis, und als Pfad
 * geschrieben ist er zwei Bögen, die niemand mehr liest. `Icon` dafür
 * umzubauen hieße, die Datei anzufassen, die zehn bestehende Zeichen trägt.
 * Dieselbe Entscheidung wie bei `LeererZustand` neben `EmptyState` in 5B.1.
 *
 * ## Warum selbst gezeichnet
 *
 * Keine Emoji, keine Plattformzeichen. Ein Emoji sieht auf jedem
 * Betriebssystem anders aus — manchmal bunt, manchmal flach, manchmal
 * doppelt so breit —, und auf dem Gerät, auf dem es schiefgeht, sieht es
 * niemand aus dem Projekt. Ein Zeichen, dessen Aussehen man nicht kennt,
 * kann man nicht gegen 44 px und nicht gegen Kontrast prüfen.
 *
 * ## Form trägt, nicht Farbe
 *
 * Jedes Zeichen zeichnet in `currentColor` und bringt keine eigene Farbe mit.
 * Der aktive Eintrag ist deshalb nie **nur** farbig anders: Die Hülle setzt
 * Fläche, umgekehrten Kontrast und einen Akzentstrich — drei Merkmale, von
 * denen keines Farbe allein ist (5B.2c).
 *
 * ## Der Name steht nicht hier
 *
 * Jedes SVG ist `aria-hidden`. Was vorgelesen wird, hängt am Link darum herum
 * — ein Zeichen allein heißt nichts, und „Grafik" vorzulesen hilft niemandem.
 */

type Form =
  | { readonly art: 'pfad'; readonly d: string }
  | { readonly art: 'kreis'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly art: 'rechteck';
      readonly x: number;
      readonly y: number;
      readonly breite: number;
      readonly hoehe: number;
      readonly rund: number;
    }
  /** Ein gefüllter Punkt — die einzige Stelle, an der etwas nicht Kontur ist. */
  | { readonly art: 'punkt'; readonly cx: number; readonly cy: number; readonly r: number };

const pfad = (d: string): Form => ({ art: 'pfad', d });

/**
 * Die Geometrie, auf einem 24er-Raster.
 *
 * Übernommen aus den freigegebenen Entwürfen — mit **einer** Ausnahme, die
 * unten bei `lernen` steht.
 */
const ZEICHNUNG: Readonly<Record<Zeichen, readonly Form[]>> = {
  /* Ein Haus: der Ort, an dem man anfängt. */
  start: [
    pfad('M3.5 10.5 12 3.5l8.5 7'),
    pfad('M5.5 9.6V20h13V9.6'),
    pfad('M9.8 20v-5.4h4.4V20'),
  ],

  /*
    Kurse sind **Menschen**, keine Mappe und kein Ordner. Eine Lerngruppe ist
    das, was sie ist: Personen. Das unterscheidet sie auf den ersten Blick von
    allem, was Fläche und Stapel ist.
  */
  kurse: [
    { art: 'kreis', cx: 9, cy: 8, r: 3.2 },
    pfad('M2.8 20c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6'),
    pfad('M16.4 5.4a3.2 3.2 0 0 1 0 6'),
    pfad('M17.6 14.8c2.2.6 3.6 2.5 3.6 5.2'),
  ],

  /* Lernpakete: gestapelte Flächen — mehrere Dinge, aufeinander. */
  pakete: [
    { art: 'rechteck', x: 3, y: 4, breite: 12.5, hoehe: 9, rund: 2.4 },
    pfad('M7 16.2h11.2a2 2 0 0 0 2-2V7.4'),
    pfad('M10 19.6h8.8'),
  ],

  /* Ein Funke, kein Roboter und kein Gehirn. */
  ki: [
    pfad('M12 3.2c.9 3.6 2 4.7 5.6 5.6-3.6.9-4.7 2-5.6 5.6-.9-3.6-2-4.7-5.6-5.6 3.6-.9 4.7-2 5.6-5.6Z'),
    pfad('M17.8 15.2c.4 1.6.9 2.1 2.5 2.5-1.6.4-2.1.9-2.5 2.5-.4-1.6-.9-2.1-2.5-2.5 1.6-.4 2.1-.9 2.5-2.5Z'),
  ],

  /* Zwei Schieberegler — Einstellungen, nicht ein Zahnrad wie überall. */
  einstellungen: [
    pfad('M3.4 7.2h4.2M12.6 7.2h8'),
    { art: 'kreis', cx: 10, cy: 7.2, r: 2.4 },
    pfad('M3.4 16.8h8.2M16.6 16.8h4'),
    { art: 'kreis', cx: 14, cy: 16.8, r: 2.4 },
  ],

  /* Eine Sonne: heute, dieser Tag. */
  heute: [
    { art: 'kreis', cx: 12, cy: 12, r: 4 },
    pfad(
      'M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6',
    ),
  ],

  /*
    **Die eine Abweichung vom Entwurf.**
    Dort trägt „Lernen" dieselbe Zeichnung wie „Lernpakete" — Zeichen für
    Zeichen dieselbe. Aufgefallen ist das erst beim Übertragen; im Entwurf
    stehen die beiden nie nebeneinander, weil sie zu verschiedenen Rollen
    gehören, und zwei gleiche Bilder in zwei verschiedenen Leisten sieht
    niemand.
    Hier ist es trotzdem falsch: „Lernpakete" ist ein Vorrat, „Lernen" ist
    eine Tätigkeit. Deshalb ein aufgeschlagenes Buch mit Bund in der Mitte —
    dieselbe Familie (Fläche), eine andere Silhouette.
  */
  lernen: [
    pfad('M12 6.6v13'),
    pfad('M12 6.6C10.2 5.2 7.8 4.6 4.2 4.6v12.2c3.6 0 6 .6 7.8 2'),
    pfad('M12 6.6c1.8-1.4 4.2-2 7.8-2v12.2c-3.6 0-6 .6-7.8 2'),
  ],

  /* Eine Zielscheibe: üben heißt treffen wollen. */
  ueben: [
    { art: 'kreis', cx: 12, cy: 12, r: 8.4 },
    { art: 'kreis', cx: 12, cy: 12, r: 4.4 },
    { art: 'punkt', cx: 12, cy: 12, r: 1.2 },
  ],

  /* Drei steigende Säulen. Keine Kurve — eine Kurve hieße Vergleich. */
  fortschritt: [pfad('M4.4 19.6V13'), pfad('M12 19.6V8.4'), pfad('M19.6 19.6V4.2')],
};

export interface NavigationsZeichenProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  zeichen: Zeichen;
  /** Kantenlänge in px. 23 ist die Größe in der Icon-Leiste. */
  groesse?: number;
}

export function NavigationsZeichen({
  zeichen,
  groesse = 23,
  ...rest
}: NavigationsZeichenProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={groesse}
      height={groesse}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-zeichen={zeichen}
      {...rest}
    >
      {ZEICHNUNG[zeichen].map((form, nummer) => {
        const key = `${form.art}-${nummer}`;
        if (form.art === 'pfad') return <path key={key} d={form.d} />;
        if (form.art === 'kreis') {
          return <circle key={key} cx={form.cx} cy={form.cy} r={form.r} />;
        }
        if (form.art === 'punkt') {
          return (
            <circle key={key} cx={form.cx} cy={form.cy} r={form.r} fill="currentColor" stroke="none" />
          );
        }
        return (
          <rect
            key={key}
            x={form.x}
            y={form.y}
            width={form.breite}
            height={form.hoehe}
            rx={form.rund}
          />
        );
      })}
    </svg>
  );
}

/** Die Geometrie, für die Prüfungen. Kein Produktivcode liest sie. */
export function zeichnungVon(zeichen: Zeichen): readonly Form[] {
  return ZEICHNUNG[zeichen];
}
