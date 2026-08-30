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

/** Warmes Papier – identisch mit `--canvas`. */
export const BRAND_CANVAS = '#faf7f2';

/** Fast schwarze, minimal warme Tinte – identisch mit `--ink`. */
export const BRAND_INK = '#14120f';

/** Persimmon-Signal – identisch mit `--accent`. */
export const BRAND_ACCENT = '#e2542a';

/**
 * Farben, die es in dieser App nicht mehr geben darf.
 * Sie stammen aus der Fassung vor „Editorial Signal“.
 */
export const RETIRED_BRAND_COLORS = ['#1f4d6b', '#1c4f6e', '#8fc4e2', '#f6f7f9'] as const;

export const APP_NAME = 'LexiFlow – Vocab Studio';
export const APP_SHORT_NAME = 'LexiFlow';
export const APP_DESCRIPTION =
  'Freiwillige Lernhilfe für englische Vokabeln. Alle Daten bleiben lokal im Browser.';

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
    theme_color: BRAND_CANVAS,
    categories: ['education'],
    icons: APP_ICONS.map((icon) => ({ ...icon })),
  };
}
