import type { SVGProps } from 'react';

/**
 * Die Zeichen im Werkzeug (Sprint 4B.3, Entwurfsroute B).
 *
 * ## Warum inline und nicht als Sprite
 *
 * Der Entwurf benutzt `<use href="#i-download">` mit einem Symbol-Vorrat am
 * Dokumentanfang. Das ist im Produkt zwei Gefahren: Ein Sprite muss überall
 * im Baum stehen, wo ein Zeichen auftaucht – auch in der portablen Datei und
 * in jedem Testbaum –, und `<use href="#…">` bricht in Safari, sobald die
 * Seite eine `<base>`-Angabe hat oder unter `file://` läuft. Ein paar Pfade
 * doppelt im Bündel sind billiger als eine Klasse von Fehlern, die nur auf
 * fremden Geräten auftritt.
 *
 * ## Warum die Zeichen nie allein stehen
 *
 * Ein Pfeil nach unten heißt „herunterladen“ – aber welche Datei? Deshalb
 * trägt jedes Zeichen hier `aria-hidden`, und der Name kommt von der
 * Schaltfläche darum herum (`IconButton` verlangt ihn). Wer mit den Augen
 * arbeitet, sieht ein Zeichen; wer hört, hört „Unit 7 als Lerndatei
 * herunterladen“.
 */

export type IconName =
  | 'download'
  | 'package'
  | 'upload'
  | 'print'
  | 'table'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'plus'
  | 'stack';

/** Die Pfade, gezeichnet auf einem 24er-Raster mit 1,7 px Strich. */
const PATHS: Record<IconName, readonly string[]> = {
  download: ['M12 3v11', 'm7.5 10 4.5 4.5 4.5-4.5', 'M4 17.5v1A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-1'],
  upload: ['M12 15V4', 'm7.5 8.5 4.5-4.5 4.5 4.5', 'M4 17.5v1A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-1'],
  package: ['M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5z', 'M3.5 7.5 12 12l8.5-4.5M12 12v9'],
  print: ['M7 8V3h10v5', 'M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2', 'M7 15h10v6H7z'],
  table: ['M3.5 5.5h17v13h-17z', 'M3.5 10h17', 'M9.5 10v8.5'],
  'arrow-right': ['M5 12h13', 'm12.5 6.5 5.5 5.5-5.5 5.5'],
  'arrow-up': ['M12 19V6', 'm6.5 11.5 5.5-5.5 5.5 5.5'],
  'arrow-down': ['M12 5v13', 'm6.5 12.5 5.5 5.5 5.5-5.5'],
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  /*
    Der Lernbereich: mehrere Blätter übereinander. Dieselbe Bildidee wie die
    Sache selbst – eine Datei, in der mehrere Pakete liegen.
  */
  stack: ['M12 3 3.5 7 12 11l8.5-4z', 'm3.5 12 8.5 4 8.5-4', 'm3.5 16.5 8.5 4 8.5-4'],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Kantenlänge in `rem`-nahen Pixeln; Vorgabe passt zu einer Textzeile. */
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
