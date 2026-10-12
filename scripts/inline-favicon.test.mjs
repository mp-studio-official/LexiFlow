// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ohneWebMetadaten } from './inline-favicon.mjs';

describe('Metadaten portabler Dokumente', () => {
  it('entfernt ausschließlich webgebundene kanonische und Vorschaudaten', () => {
    const html = `
      <meta name="description" content="LexiFlow" />
      <meta property="og:title" content="LexiFlow" />
      <meta property="og:url" content="https://lexiflow.info/" />
      <meta property="og:image" content="https://lexiflow.info/icons/icon-512.png" />
      <link rel="canonical" href="https://lexiflow.info/" />
      <link rel="icon" href="favicon.svg" />
    `;

    const portable = ohneWebMetadaten(html);

    expect(portable).not.toContain('rel="canonical"');
    expect(portable).not.toContain('property="og:url"');
    expect(portable).not.toContain('property="og:image"');
    expect(portable).toContain('name="description"');
    expect(portable).toContain('property="og:title"');
    expect(portable).toContain('href="favicon.svg"');
  });

  it('erkennt auch eine andere Attributreihenfolge und einfache Anführungszeichen', () => {
    const html = `
      <link href='https://lexiflow.info/' rel='canonical'>
      <meta content='https://lexiflow.info/' property='og:url'>
      <meta content='bild.png' property='og:image'>
    `;

    expect(ohneWebMetadaten(html)).not.toContain('lexiflow.info');
    expect(ohneWebMetadaten(html)).not.toContain('bild.png');
  });
});
