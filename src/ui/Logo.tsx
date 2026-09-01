import {
  LOGO_ASPECT,
  LOGO_LAYERS,
  LOGO_SHAPES,
  LOGO_VARIANTS,
  LOGO_VIEWBOX,
} from './logoPaths';

/**
 * Das Markenzeichen von LexiFlow – als Code, nicht als Bild.
 *
 * ## Die Bildidee
 *
 * Zwei geöffnete Flächen, die sich überlagern: hinten ein ruhiges, aufrechtes
 * Element, davor eine große gekippte Fläche, die sich wie eine umschlagende
 * Karte öffnet, und darin ein Durchblick, der die Form eines „F“ trägt. Aus der
 * Liste hinten wird vorn eine Karte.
 *
 * Die Pfade stammen seit Sprint 4B.1c aus den gelieferten Entwurfsdateien und
 * stehen in `logoPaths.ts`; dort steht auch, was daran bereinigt wurde und
 * warum der Ausschnitt beschnitten ist.
 *
 * ## Zwei Varianten, drei Farben
 *
 * `brand` ist die Fassung **für Parchment-Hintergrund** (Aubergine hinten,
 * Parchment als Durchblick), `on-dark` die Fassung **für Aubergine-Hintergrund**
 * (Parchment hinten, Aubergine als Durchblick). Es sind dieselben drei
 * Markenfarben in getauschten Rollen – nicht zwei verschiedene Zeichen. Welche
 * gilt, entscheidet allein der Untergrund.
 *
 * ## Warum keine Bitmap
 *
 * Alles sind Pfade mit einer sauberen `viewBox`: beliebig skalierbar,
 * monochrom verständlich (`tone="mono"`) und in der portablen Einzeldatei ohne
 * einen einzigen externen Request. Eine Rasterdatei wäre dort zusätzlich teuer
 * und würde auf dem Display der Lehrkraft ausfransen.
 *
 * ## Zugänglichkeit
 *
 * Dekorative Zeichen tragen `aria-hidden` und liegen neben echtem Text. Nur
 * wenn das Zeichen **allein** steht, bekommt es `role="img"` und einen Namen –
 * dann ist der Markenname sonst nirgends zu lesen.
 */

export type LogoTone = 'brand' | 'on-dark' | 'mono';

/**
 * Die einfarbige Fassung trennt die drei Flächen über die Deckkraft.
 *
 * Sie muss in `forced-colors`, im Schwarz-Weiß-Druck und als Faxvorlage
 * verständlich bleiben. Der Durchblick kann dort **nicht** einfach transparent
 * sein: Er liegt innerhalb der vorderen Fläche, ein Loch wäre also nur ein
 * heller Fleck auf ihr. Drei Abstufungen derselben Farbe halten die Form
 * zusammen.
 */
const MONO_OPACITY: Readonly<Record<(typeof LOGO_LAYERS)[number], number>> = {
  back: 0.45,
  front: 1,
  inner: 0.35,
};

function Mark({ tone }: { tone: LogoTone }) {
  const colours = tone === 'brand' ? LOGO_VARIANTS.onParchment : LOGO_VARIANTS.onAubergine;
  const mono = tone === 'mono';

  return (
    <>
      {LOGO_LAYERS.map((layer) => (
        <g key={layer} transform={LOGO_SHAPES[layer].transform}>
          <path
            d={LOGO_SHAPES[layer].d}
            fillRule="evenodd"
            clipRule="evenodd"
            fill={mono ? 'currentColor' : colours[layer]}
            {...(mono ? { fillOpacity: MONO_OPACITY[layer] } : {})}
          />
        </g>
      ))}
    </>
  );
}

export interface LogoMarkProps {
  /** Höhe in CSS-Pixeln. Die Breite folgt dem Seitenverhältnis des Zeichens. */
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
      width={Math.round(size * LOGO_ASPECT)}
      height={size}
      viewBox={LOGO_VIEWBOX}
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
 * und übersetzen, und er passt sich der ausgelieferten Schrift an. Weil der
 * Name damit sichtbar daneben steht, bleibt das Signet für Screenreader
 * dekorativ.
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
 * Wie das Zeichen in einer quadratischen Kachel sitzt.
 *
 * `scale` ist der Anteil der Kachelhöhe, den das Zeichen einnimmt. Für die
 * maskierbare Fassung ist er kleiner, weil das Betriebssystem dort eine eigene
 * Form ausstanzt und die Ecken verliert.
 */
export function tilePlacement(scale: number): string {
  const [x, y, width, height] = LOGO_VIEWBOX.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const factor = (64 * scale) / height;
  const left = (64 - width * factor) / 2;
  const top = (64 - height * factor) / 2;
  return `translate(${left.toFixed(3)} ${top.toFixed(3)}) scale(${factor.toFixed(5)}) translate(${-x} ${-y})`;
}

/** Anteil der Kachelhöhe für das normale App-Icon und das Favicon. */
export const TILE_SCALE = 0.62;

/**
 * Das App-Icon als eigenständiges Quadrat mit Hintergrund.
 *
 * Getrennt von `LogoMark`, weil ein Icon eine Fläche braucht: Auf einem
 * Homescreen liegt es sonst auf beliebigem Untergrund. Die Kachel ist
 * Aubergine – dort gilt die Variante für Aubergine-Hintergrund.
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
      <rect width="64" height="64" rx="14" fill={LOGO_VARIANTS.onAubergine.inner} />
      <g transform={tilePlacement(TILE_SCALE)}>
        <Mark tone="on-dark" />
      </g>
    </svg>
  );
}
