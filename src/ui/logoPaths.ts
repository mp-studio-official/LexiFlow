/**
 * Die Geometrie des LexiFlow-Zeichens – **eine** Quelle für alles.
 *
 * ## Herkunft
 *
 * Die Pfade stammen unverändert aus den beiden gelieferten Entwurfsdateien
 * („LexiFlow Logo – für Aubergine Hintergrund.svg“ und „… für Parchment
 * Hintergrund.svg“). Die Originale liegen lokal und außerhalb von Git; an ihnen
 * wird nichts geändert. Was hier steht, ist die bereinigte Projektfassung:
 *
 * - XML-Deklaration, DOCTYPE, `xmlns:xlink`, `xmlns:serif` und `xml:space`
 *   entfernt – Reste des Zeichenprogramms, die im Browser nichts tun.
 * - `stroke-linejoin` und `stroke-miterlimit` entfernt: Es gibt keine Kontur.
 * - `fill-rule`/`clip-rule: evenodd` bleiben, jetzt am Pfad statt am Wurzel-SVG.
 * - Die drei `matrix(1,0,0,1,x,y)` bleiben **wörtlich** stehen. Sie sind reine
 *   Verschiebungen; sie in `translate(…)` umzuschreiben wäre dasselbe Bild,
 *   aber ein Diff, das aussieht wie eine Änderung an der Form.
 *
 * ## Der beschnittene Ausschnitt
 *
 * Die Entwurfsdateien tragen `viewBox="0 0 492 602"`, die Form belegt darin nur
 * x 89,5 … 427,75 und y 128,5 … 537,75 – ringsum steht Weißraum. In einer 24 px
 * hohen Kopfzeile wurde das Zeichen dadurch sichtbar zu klein: Ein Drittel der
 * Höhe war Luft.
 *
 * Gemessen wurde die Fläche nicht geschätzt, sondern gerendert und an der
 * Alphakante ausgelesen – Kurven wölben sich über ihre Stützpunkte hinaus, und
 * eine Box aus den Pfaddaten allein hätte die Form angeschnitten.
 *
 * `81 120 356 426` legt einen Rand von rund 8,5 Einheiten um diese Fläche.
 * **Die Form selbst ist unangetastet**: kein Pfad, kein Verhältnis, keine
 * Skalierung wurde verändert – nur das Fenster, durch das man sie sieht.
 */

/** Der beschnittene Ausschnitt. Enthält die Form mit rund 8,5 Einheiten Luft. */
export const LOGO_VIEWBOX = '81 120 356 426';

/** Breite geteilt durch Höhe – das Zeichen ist hochkant, nicht quadratisch. */
export const LOGO_ASPECT = 356 / 426;

export interface LogoShape {
  /** Die Verschiebung aus der Entwurfsdatei, wörtlich übernommen. */
  transform: string;
  d: string;
}

/**
 * Die drei Flächen, in Zeichenreihenfolge.
 *
 * `back` ist das ruhige Element hinten, `front` die große gekippte Fläche,
 * `inner` der Durchblick darin. Welche Farbe welche Fläche trägt, entscheidet
 * die Variante – nicht diese Datei.
 */
export const LOGO_SHAPES: Readonly<Record<'back' | 'front' | 'inner', LogoShape>> = {
  back: {
    transform: 'matrix(1,0,0,1,87,198)',
    d: 'M2.514,267.495L3.956,10.496C3.956,10.496 4.096,5.953 8.035,3.216C11.881,0.543 18.544,1.383 18.544,1.383L90.562,18.33C90.562,18.33 89.004,31.989 88.973,39.502C88.366,183.953 115.66,211.973 112.469,222.595C112.126,223.738 197.287,248.892 197.287,248.892L197.327,323.331C197.327,323.331 197.984,334.31 190.218,338.222C183.793,341.458 172.416,338.67 172.416,338.67L11.33,283.925C11.33,283.925 5.035,281.559 3.898,278.666C2.429,274.928 2.514,267.495 2.514,267.495Z',
  },
  front: {
    transform: 'matrix(1,0,0,1,173,129)',
    d: 'M254.537,33.499C254.52,34.286 254.565,37.981 254.565,37.981L252.977,349.359C252.977,349.359 253.472,362.801 248.185,367.106C242.425,371.796 231.705,367.163 231.705,367.163L14.409,300.755C14.409,300.755 5.447,298.53 3.902,294.243C1.913,288.724 2.476,285.645 2.476,285.645L2.034,69.502C2.034,69.502 1.956,57.982 6.105,54.186C10.342,50.31 16.455,49.247 16.455,49.247L209.447,5.892C209.447,5.892 216.005,4.515 218.457,4.022C255.199,-3.361 254.708,-4.129 254.82,22.963C254.833,26.098 254.62,29.597 254.537,33.499Z',
  },
  inner: {
    transform: 'matrix(1,0,0,1,195,218)',
    d: 'M86.702,83.343L56.722,75.826L56.675,107.782L82.45,113.533C82.45,113.533 83.647,114.078 84.611,114.462C87.112,115.458 86.551,118.226 86.551,118.226L85.931,156.434C85.931,156.434 85.827,157.944 85.895,158.695C86.127,161.254 81.326,159.785 81.326,159.785L57.892,153.888L57.943,200.702C57.943,200.702 58.05,213.834 52.585,214.649C51.347,214.834 10.046,200.538 5.75,199.3C0.917,197.907 2.077,185.558 2.077,185.558L3.067,5.302C3.067,5.302 2.924,2.914 3.502,2.402C4.011,1.952 6.535,2.233 6.535,2.233L84.707,20.418C84.707,20.418 90.929,22.037 90.943,27.149C90.95,29.457 90.806,30.645 90.806,30.645L90.713,78.5C90.713,78.5 90.709,80.371 90.708,81.307C90.706,84.28 86.702,83.343 86.702,83.343Z',
  },
};

/** Die Reihenfolge, in der die Flächen übereinanderliegen. */
export const LOGO_LAYERS = ['back', 'front', 'inner'] as const;

/**
 * Die beiden ausgelieferten Varianten.
 *
 * Es sind dieselben drei Markenfarben in getauschten Rollen. Welche wo gilt,
 * hängt allein am Untergrund: `onAubergine` gehört in die dunkle Kopfzeile und
 * Navigation, `onParchment` auf helle Flächen.
 */
export const LOGO_VARIANTS = {
  onParchment: { back: '#2F092D', front: '#FF2E2D', inner: '#F8EFE3' },
  onAubergine: { back: '#F8EFE3', front: '#FF2E2D', inner: '#2F092D' },
} as const;

/**
 * Die gelieferte Schwarzweiß-Fassung („LexiFlow Logo – S:W“).
 *
 * Sie steht **absichtlich nicht** in `LOGO_VARIANTS`: Dort stehen die beiden
 * Markenfassungen, aus denen die Assets unter `public/` entstehen. Dies hier
 * ist keine dritte Markenfarbe, sondern dieselbe Form für Papier.
 *
 * ## Warum feste Grauwerte und nicht `currentColor`
 *
 * Der bisherige Weg – eine Farbe mit drei Deckkraftstufen – war falsch, und
 * zwar sichtbar: Der Durchblick lag mit 35 % auf einer voll deckenden Fläche
 * und wurde dadurch nicht heller, sondern dunkler. Das „F“ verschwand. Und wo
 * die vordere Fläche über der hinteren liegt, addierten sich zwei
 * halbdurchlässige Schichten zu einem dritten, dunkleren Ton, den es im
 * Entwurf nicht gibt.
 *
 * Die drei Werte sind deshalb aus der gelieferten Datei ausgelesen, nicht
 * gewählt: hintere Fläche 20/20/20, vordere 92/92/92, Durchblick weiß. Sie
 * decken vollständig und liegen sauber übereinander.
 *
 * `currentColor` bleibt der Fassung `mono` vorbehalten – die gehört in
 * Schaltflächen und in den Modus mit erzwungenen Farben, wo das Zeichen die
 * Farbe des Textes annehmen **muss**.
 */
export const LOGO_BLACK_AND_WHITE = {
  back: '#141414',
  front: '#5C5C5C',
  /*
    Die Vorlage exportiert 254/255/255. Das ist ein Rundungsrest des
    Zeichenprogramms und keine Farbe; auf Papier ist der Durchblick das Blatt.
  */
  inner: '#FFFFFF',
} as const;

/** Die Dateinamen der beiden Projektassets unter `public/`. */
export const LOGO_ASSETS = {
  onAubergine: 'lexiflow-mark-on-aubergine.svg',
  onParchment: 'lexiflow-mark-on-parchment.svg',
} as const;

/**
 * Baut eine der beiden Assetdateien – zeichengenau.
 *
 * Die Dateien unter `public/` liegen im Repository, damit sie ein Favicon oder
 * ein Downloadziel sein können. Erzeugt werden sie aus **dieser** Datei, und
 * `src/ui/logoAssets.test.ts` vergleicht Datei und Erzeugnis Zeichen für
 * Zeichen. So können die beiden nicht auseinanderlaufen.
 */
export function buildLogoAsset(variant: keyof typeof LOGO_VARIANTS): string {
  const colours = LOGO_VARIANTS[variant];
  const layers = LOGO_LAYERS.map(
    (layer) =>
      `  <g transform="${LOGO_SHAPES[layer].transform}">\n` +
      `    <path fill="${colours[layer]}" fill-rule="evenodd" clip-rule="evenodd" d="${LOGO_SHAPES[layer].d}"/>\n` +
      `  </g>`,
  ).join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" role="img" aria-labelledby="lexiflow-mark-title">\n` +
    `  <title id="lexiflow-mark-title">LexiFlow</title>\n` +
    `${layers}\n` +
    `</svg>\n`
  );
}
