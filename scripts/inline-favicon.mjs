import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Metadaten, die nur zu einer ausgelieferten Webseite gehören, haben in einer
 * portablen Datei keinen Sinn. Besonders der kanonische Verweis wäre dort eine
 * echte externe Abhängigkeit: Die Datei soll unter `file://` vollständig für
 * sich stehen und weder eine Netzadresse nachladen noch sich als Kopie der
 * öffentlichen Startseite ausgeben.
 */
export function ohneWebMetadaten(html) {
  return html
    .replace(/\s*<link\b[^>]*\brel=["']canonical["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\b[^>]*\bproperty=["']og:(?:url|image)["'][^>]*>\s*/gi, '\n');
}

/**
 * Bettet das Favicon als Data-URL ein.
 *
 * Ein `<link rel="icon" href="favicon.svg">` wäre in einer portablen Datei ein
 * Verweis ins Leere: Unter `file://` liegt daneben keine `favicon.svg`, und der
 * Browser zeigte ein leeres Tab-Symbol. Die Datei ist klein genug, um sie
 * mitzunehmen – so sieht die Lerndatei auch im Tab wie LexiFlow aus.
 */
export function inlineFavicon(root) {
  return {
    name: 'lexiflow-inline-favicon',
    enforce: 'post',
    transformIndexHtml(html) {
      const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');
      const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
      return ohneWebMetadaten(html).replace(
        /href="\.?\/?favicon\.svg"/g,
        `href="${dataUrl}"`,
      );
    },
  };
}
