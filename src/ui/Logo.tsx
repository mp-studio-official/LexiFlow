/**
 * Das Markenzeichen von LexiFlow – als Code, nicht als Bild.
 *
 * ## Die Bildidee
 *
 * Zwei geöffnete Flächen, die sich überlagern: hinten eine ruhige
 * Aubergine-Fläche, davor eine leicht gekippte Tomato-Fläche, die sich wie
 * eine Tür oder eine umschlagende Karte öffnet. Die helle Innenfläche in
 * Parchment ist der Durchblick – aus der Liste hinten wird vorn eine Karte.
 *
 * Zwei Dinge unterscheiden es bewusst von einem generischen Dokumentsymbol:
 * Die vordere Fläche ist ein **Trapez**, kein Rechteck – sie steht schräg im
 * Raum und wirkt geöffnet. Und die Innenfläche sitzt außermittig, wodurch die
 * Form eine Richtung bekommt statt symmetrisch zu ruhen.
 *
 * ## Warum keine Bitmap
 *
 * Alles sind Pfade mit einer sauberen `viewBox`: beliebig skalierbar,
 * monochrom verständlich (`variant="mono"`) und bei 16 px noch lesbar, weil
 * die Form aus genau drei Flächen besteht. Eine aus einer Vorlage
 * ausgeschnittene Rasterdatei wäre in der portablen Einzeldatei zusätzlich
 * teuer und würde auf dem Display der Lehrkraft ausfransen.
 *
 * ## Zugänglichkeit
 *
 * Dekorative Zeichen tragen `aria-hidden` und liegen neben echtem Text. Nur
 * die vollständige Wortmarke ist selbst ein Bild mit Namen (`role="img"` und
 * `<title>`), weil dort der Markenname die einzige Beschriftung ist.
 */

export type LogoTone = 'brand' | 'on-dark' | 'mono';

interface Palette {
  back: string;
  front: string;
  inner: string;
  accent: string;
}

/**
 * Drei Fassungen, damit das Zeichen überall trägt: farbig auf Papier, hell auf
 * Aubergine und einfarbig (Druck, Fax, `forced-colors`).
 */
const PALETTES: Readonly<Record<LogoTone, Palette>> = {
  brand: { back: '#3B0F3F', front: '#E63946', inner: '#F8EFE3', accent: '#FF8A3D' },
  'on-dark': { back: '#F8EFE3', front: '#E63946', inner: '#3B0F3F', accent: '#FF8A3D' },
  mono: { back: 'currentColor', front: 'currentColor', inner: 'transparent', accent: 'currentColor' },
};

/**
 * Die Geometrie des Signets, einmal definiert.
 *
 * Koordinaten in einem 64×64-Feld. Die hintere Fläche ist ein abgerundetes
 * Rechteck, die vordere ein Trapez mit derselben Rundung – zusammen ergeben
 * sie die zwei geöffneten Flächen.
 */
function Mark({ tone }: { tone: LogoTone }) {
  const palette = PALETTES[tone];
  const mono = tone === 'mono';

  return (
    <g>
      {/* Hintere Fläche: die Liste, ruhig und aufrecht. */}
      <rect x="4" y="8" width="30" height="42" rx="6" fill={palette.back} />
      {/* Vordere Fläche: die Karte, geöffnet und leicht gekippt. */}
      <path
        d="M26 16 L58 12 Q60 11.7 60 13.7 L60 50.3 Q60 52.3 58 52 L26 48 Q24 47.7 24 45.7 L24 18.3 Q24 16.3 26 16 Z"
        fill={palette.front}
        {...(mono ? { fillOpacity: 0.55 } : {})}
      />
      {/* Der Durchblick – außermittig, damit die Form eine Richtung bekommt. */}
      <rect x="34" y="22" width="12" height="20" rx="3" fill={palette.inner} />
      {/* Ein einzelner warmer Akzent an der Öffnungskante. */}
      {mono ? null : <rect x="24" y="20" width="3" height="24" rx="1.5" fill={palette.accent} />}
    </g>
  );
}

export interface LogoMarkProps {
  /** Kantenlänge in CSS-Pixeln. */
  size?: number;
  tone?: LogoTone;
  className?: string;
  /**
   * Nur setzen, wenn das Zeichen **allein** steht und etwas benennen muss.
   * Neben sichtbarem Text bleibt es dekorativ.
   */
  title?: string;
}

/** Das Signet allein – für Navigation, Icons und kompakte Kopfzeilen. */
export function LogoMark({ size = 32, tone = 'brand', className, title }: LogoMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      {...(title
        ? { role: 'img', 'aria-label': title }
        : { 'aria-hidden': true, focusable: false })}
    >
      {title ? <title>{title}</title> : null}
      <Mark tone={tone} />
    </svg>
  );
}

export interface LogoProps {
  tone?: LogoTone;
  className?: string;
  /** Höhe des Signets; die Wortmarke skaliert mit. */
  size?: number;
  /**
   * Der zugängliche Name der Wortmarke. `undefined` heißt: Der Name steht
   * schon als sichtbarer Text daneben, das Zeichen ist dann dekorativ.
   */
  label?: string;
}

/**
 * Die horizontale Wortmarke: Signet plus Schriftzug.
 *
 * Der Schriftzug ist **Text**, kein Pfad – er lässt sich markieren, vorlesen
 * und übersetzen, und er passt sich der ausgelieferten Schrift an. Gesetzt
 * wird er in der Displayschrift mit der schwersten verfügbaren Stärke; steht
 * Satoshi lokal zur Verfügung, sieht man Satoshi, sonst Manrope.
 */
export function Logo({ tone = 'brand', className, size = 30, label = 'LexiFlow' }: LogoProps) {
  return (
    <span className={['logo', `logo--${tone}`, className].filter(Boolean).join(' ')}>
      <LogoMark size={size} tone={tone} />
      <span className="logo__word">{label}</span>
    </span>
  );
}

/**
 * Das App-Icon als eigenständiges Quadrat mit Hintergrund.
 *
 * Getrennt von `LogoMark`, weil ein Icon eine Fläche braucht: Auf einem
 * Homescreen liegt es sonst auf beliebigem Untergrund.
 */
export function LogoAppIcon({ size = 64, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: false })}
    >
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" rx="14" fill="#3B0F3F" />
      <g transform="translate(32 32) scale(0.72) translate(-32 -32)">
        <Mark tone="on-dark" />
      </g>
    </svg>
  );
}
