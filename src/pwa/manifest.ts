/**
 * Die PWA-Identität an einer Stelle (Sprint 3A.1).
 *
 * `vite.config.ts` reicht dieses Objekt an `vite-plugin-pwa` weiter; die Tests
 * lesen dasselbe Objekt. So kann die Marke im Manifest nicht auseinanderlaufen
 * mit dem, was geprüft wird.
 *
 * Die Farben kommen aus `styles/tokens.css`: warmes Papier als Fläche, Tinte
 * als Marke. Das alte Schulblau ist vollständig verschwunden.
 */

/** Warmes Papier – identisch mit `--canvas` / Parchment. */
export const BRAND_CANVAS = '#f8efe3';

/** Aubergine – Tinte, Navigation, primäre Aktion und Markenfläche. */
export const BRAND_INK = '#2f092d';

/** Tomato – die Akzentfarbe der Marke. */
export const BRAND_ACCENT = '#ff2e2d';

/**
 * Die Marke besteht aus **diesen dreien**. Mehr gibt es nicht.
 *
 * Der Test in `branding.test.ts` prüft die ausgelieferten Dateien gegen genau
 * diese Liste – eine vierte Markenfarbe müsste erst hier stehen, bevor sie
 * irgendwo erscheinen kann.
 */
export const BRAND_COLORS = [BRAND_INK, BRAND_ACCENT, BRAND_CANVAS] as const;

/**
 * Farben, die es in dieser App nicht mehr geben darf.
 *
 * `#1f4d6b` und Verwandte stammen aus der Fassung vor „Editorial Signal“,
 * `#14120f`/`#e2542a` aus der Fassung davor (Sprint 3A bis 4A.1b). Mit
 * Sprint 4B.1c kommen die Töne der zweiten Editorial-Fassung dazu: die alte
 * Aubergine `#3b0f3f`, die alte Tomato `#e63946`, das ganz entfallene Orange
 * `#ff8a3d` und die beiden Parchment-Abweichungen `#faefe2` und `#f6ece1` aus
 * den gelieferten Logodateien.
 *
 * `#2b0c2b` stand nie in diesem Projekt; es steht hier, weil es in der
 * Markenanweisung als überholter Wert genannt wurde und der Test dann auch
 * beweisen kann, dass es nicht hereinkommt.
 */
export const RETIRED_BRAND_COLORS = [
  '#1f4d6b',
  '#1c4f6e',
  '#8fc4e2',
  '#f6f7f9',
  '#14120f',
  '#e2542a',
  '#c3d63a',
  '#3b0f3f',
  '#e63946',
  '#ff8a3d',
  '#2b0c2b',
  '#faefe2',
  '#f6ece1',
] as const;

/**
 * Der Markenclaim. Er steht an genau drei Stellen – Lehrkraft-Startseite,
 * Schüler-Start und Fußzeile – und nicht auf jeder Unterseite.
 */
export const APP_CLAIM = 'Einfach ins Lernen kommen.';

export const APP_NAME = 'LexiFlow – Vokabeln lernen';
export const APP_SHORT_NAME = 'LexiFlow';
export const APP_DESCRIPTION =
  'Einfach ins Lernen kommen. Freiwillige Lernhilfe für englische Vokabeln – alle Daten bleiben lokal im Browser.';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: 'any' | 'maskable';
}

/**
 * Die maskierbare Fassung ist eine **eigene Datei**: Sie trägt die Marke auf
 * 56 % skaliert und randlos, damit sie in jeder Ausstanzform vollständig in der
 * Sicherheitszone liegt. Dieselbe Datei für `any` und `maskable` zu verwenden
 * hätte die Marke an den Rändern abgeschnitten.
 */
export const APP_ICONS: readonly ManifestIcon[] = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: 'icons/icon-512-maskable.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

export const PWA_ASSETS: readonly string[] = [
  'favicon.svg',
  ...APP_ICONS.map((icon) => icon.src),
];

/** Baut das Manifest; `base` kommt aus der Deployment-Konfiguration. */
export function buildManifest(base: string) {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    lang: 'de',
    dir: 'ltr' as const,
    start_url: base,
    scope: base,
    display: 'standalone' as const,
    background_color: BRAND_CANVAS,
    theme_color: BRAND_INK,
    categories: ['education'],
    icons: APP_ICONS.map((icon) => ({ ...icon })),
  };
}
