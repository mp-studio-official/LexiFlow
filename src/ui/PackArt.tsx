import { useId } from 'react';

import { packMotif, type PackMotif } from './packMotif';

/**
 * Das Motiv eines Pakets, gezeichnet.
 *
 * Die Entscheidung, **welches** Motiv, steht in `packMotif.ts` und lässt sich
 * ohne Rendern prüfen. Hier steht nur, wie es aussieht.
 *
 * Der Name der Nachbardatei ist mit Bedacht ein anderer und nicht bloß eine
 * andere Schreibung: Auf macOS und Windows wären `./packArt` und `./PackArt`
 * derselbe Pfad – siehe `packMotif.ts`.
 *
 * ## Warum SVG und nicht CSS
 *
 * Verläufe und Kreise gingen auch mit `background-image`. Bögen, Fächer und
 * ein Punktraster gehen nicht – und ein Motivsatz, bei dem die Hälfte in CSS
 * und die andere Hälfte in Markup steht, ist zwei Systeme.
 *
 * `viewBox` mit `preserveAspectRatio="xMidYMid slice"`: Das Motiv füllt jede
 * Fläche – vom breiten Kartenkopf bis zum schmalen Streifen auf der Lernkarte –
 * und behält dabei seine Form. Mit `none` füllte es ebenso, verzerrte aber
 * alles: Aus dem Punktraster wurden Ellipsen.
 *
 * ## Farben
 *
 * Ausschließlich die drei des Projekts, und zwar über die Token: Ändert sich
 * die Palette, ändern sich die Motive mit. Eine zweite Farbdefinition wäre
 * eine zweite Wahrheit.
 *
 * ## Zugänglichkeit
 *
 * `aria-hidden` und `focusable="false"`. Das Motiv trägt keine Auskunft; es
 * vorzulesen wäre Lärm vor dem Titel, um den es geht.
 */

export interface PackArtProps {
  /** Der Titel des Pakets – aus ihm entsteht das Motiv. */
  seed: string;
  /** Zusätzliche Klasse, etwa für die Größe der Fläche. */
  className?: string;
}

/** Die Marken­farben als Token – nie als Hexwert. */
const GROUND: Record<PackMotif['ground'], { from: string; to: string }> = {
  aubergine: { from: 'var(--brand-aubergine)', to: 'var(--nav)' },
  tomato: { from: 'var(--brand-tomato)', to: 'var(--brand-aubergine)' },
};

/**
 * Die Zeichnung je Komposition, in einem 100 × 100-Feld.
 *
 * Zwei Farben: `light` trägt die Komposition, `accent` setzt genau **einen**
 * Akzent. Der Akzent ist der Unterschied zwischen einem Muster und einem
 * Motiv – ohne ihn sind alle sechs Kompositionen dieselbe stille Fläche in
 * zwei Helligkeiten.
 *
 * Welche Farbe der Akzent hat, hängt am Grundton: Auf Aubergine ist es
 * Tomate, auf Tomate wäre Tomate unsichtbar – dort ist es Parchment in voller
 * Deckung. Eine dritte Farbe kommt nicht dazu.
 */
function marks(
  variant: PackMotif['variant'],
  ground: PackMotif['ground'],
): React.JSX.Element {
  const light = 'var(--brand-parchment)';
  const accent = ground === 'aubergine' ? 'var(--brand-tomato)' : 'var(--brand-parchment)';

  switch (variant) {
    /*
      Bögen: konzentrische Viertelkreise aus einer Ecke. Die Strichstärke
      nimmt nach außen ab – sonst wird die Ecke zur Scheibe.
    */
    case 'arcs':
      return (
        <g fill="none" strokeLinecap="round">
          {[26, 44, 62, 80, 98].map((radius, index) => (
            <path
              key={radius}
              d={`M 0 ${radius} A ${radius} ${radius} 0 0 0 ${radius} 0`}
              stroke={light}
              strokeWidth={7 - index}
              opacity={0.62 - index * 0.09}
            />
          ))}
          <path
            d="M 0 44 A 44 44 0 0 0 44 0"
            stroke={accent}
            strokeWidth="6"
            opacity={0.9}
          />
        </g>
      );

    /* Bänder: drei Diagonalen unterschiedlicher Breite, eine davon voll. */
    case 'bands':
      return (
        <g>
          <path d="M -20 100 L 40 -20 L 62 -20 L 2 100 Z" fill={light} opacity={0.16} />
          <path d="M 30 100 L 90 -20 L 98 -20 L 38 100 Z" fill={light} opacity={0.38} />
          <path d="M 66 100 L 126 -20 L 140 -20 L 80 100 Z" fill={light} opacity={0.11} />
          <path d="M 22 100 L 82 -20 L 88 -20 L 28 100 Z" fill={accent} opacity={0.92} />
        </g>
      );

    /*
      Horizont: eine große Scheibe über einer Kante. Der Klassiker – und der
      einzige Fall, in dem eine Form nach etwas aussieht. Das ist erlaubt,
      solange sie nichts behauptet.
    */
    case 'horizon':
      return (
        <g>
          <circle cx="50" cy="46" r="30" fill={accent} opacity={0.95} />
          <circle cx="50" cy="46" r="38" fill="none" stroke={light} strokeWidth="1.4" opacity={0.45} />
          <rect x="-10" y="72" width="120" height="2" fill={light} opacity={0.7} />
          <rect x="-10" y="83" width="120" height="1" fill={light} opacity={0.3} />
        </g>
      );

    /* Raster: Punkte, nach unten rechts ausdünnend. */
    case 'grid':
      return (
        <g>
          {Array.from({ length: 7 }, (_, row) =>
            Array.from({ length: 7 }, (_, column) => {
              // Genau ein Punkt trägt den Akzent – und immer derselbe.
              const marked = row === 2 && column === 4;
              return (
                <circle
                  key={`${row}-${column}`}
                  cx={10 + column * 13.5}
                  cy={10 + row * 13.5}
                  r={marked ? 5.4 : 2.9 - (row + column) * 0.14}
                  fill={marked ? accent : light}
                  opacity={marked ? 0.95 : 0.62 - (row + column) * 0.035}
                />
              );
            }),
          )}
        </g>
      );

    /* Wellen: zwei weiche Kurven übereinander, die untere gefüllt. */
    case 'waves':
      return (
        <g>
          <path
            d="M -10 62 C 20 40, 45 84, 70 58 S 110 40, 120 52 L 120 110 L -10 110 Z"
            fill={light}
            opacity={0.2}
          />
          <path
            d="M -10 52 C 22 30, 46 74, 72 48 S 112 30, 120 42"
            fill="none"
            stroke={accent}
            strokeWidth="3.2"
            opacity={0.95}
          />
          <path
            d="M -10 40 C 22 18, 46 62, 72 36 S 112 18, 120 30"
            fill="none"
            stroke={light}
            strokeWidth="1.6"
            opacity={0.55}
          />
        </g>
      );

    /* Fächer: Strahlen aus einem Punkt außerhalb der Fläche. */
    case 'rays':
    default:
      return (
        <g strokeLinecap="round">
          {Array.from({ length: 9 }, (_, index) => {
            const angle = -18 + index * 15;
            const radians = (angle * Math.PI) / 180;
            // Der mittlere Strahl trägt den Akzent.
            const marked = index === 4;
            return (
              <line
                key={angle}
                x1={6}
                y1={104}
                x2={6 + Math.cos(radians) * 150}
                y2={104 - Math.sin(radians) * 150}
                stroke={marked ? accent : light}
                strokeWidth={marked ? 4 : index % 3 === 0 ? 2.4 : 1.1}
                opacity={marked ? 0.95 : index % 3 === 0 ? 0.5 : 0.26}
              />
            );
          })}
        </g>
      );
  }
}

export function PackArt({ seed, className }: PackArtProps): React.JSX.Element {
  const art = packMotif(seed);
  const id = useId();
  const gradientId = `${id}-ground`;
  const tones = GROUND[art.ground];

  return (
    <svg
      className={['packart', className].filter(Boolean).join(' ')}
      viewBox="0 0 100 100"
      /*
        `slice` statt `none`: Ein Kreis bleibt ein Kreis.

        Mit `none` füllte das Motiv jede Fläche, verzerrte aber alles – aus dem
        Punktraster wurden Ellipsen und aus der Scheibe ein Oval. `slice`
        skaliert gleichmäßig und schneidet den Überstand ab; bei einer
        abstrakten Komposition ist der Schnitt kein Verlust.
      */
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-variant={art.variant}
      data-ground={art.ground}
    >
      <defs>
        {/*
          Der Verlauf läuft diagonal und nicht senkrecht: Eine waagerechte
          Kante quer durch die Karte sähe aus wie ein zweites Element.
        */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tones.from} />
          <stop offset="100%" stopColor={tones.to} />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#${gradientId})`} />
      {/*
        Gedreht wird nur die Zeichnung, nicht die Fläche – sonst stünde die
        Ecke des Verlaufs bei jeder zweiten Karte woanders und die Liste
        flackerte.
      */}
      {/*
        Erst drehen, dann heranrücken – beides um die Mitte. Die Reihenfolge
        ist gleichgültig, solange derselbe Punkt beides trägt; stünde einer der
        beiden woanders, wanderte die Komposition beim Skalieren aus dem Bild.
      */}
      <g transform={`rotate(${art.rotation} 50 50) scale(${art.scale}) translate(${(50 / art.scale) - 50} ${(50 / art.scale) - 50})`}>
        {marks(art.variant, art.ground)}
      </g>
    </svg>
  );
}
