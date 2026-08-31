import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bettet das Favicon als Data-URL ein.
 *
 * Ein `<link rel="icon" href="favicon.svg">` wäre in einer portablen Datei ein
 * Verweis ins Leere: Unter `file://` liegt daneben keine `favicon.svg`, und der
 * Browser zeigte ein leeres Tab-Symbol. Die Datei ist klein genug, um sie
 * mitzunehmen – so sieht die Schülerdatei auch im Tab wie LexiFlow aus.
 */
export function inlineFavicon(root) {
  return {
    name: 'lexiflow-inline-favicon',
    enforce: 'post',
    transformIndexHtml(html) {
      const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');
      const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
      return html.replace(/href="\.?\/?favicon\.svg"/g, `href="${dataUrl}"`);
    },
  };
}
