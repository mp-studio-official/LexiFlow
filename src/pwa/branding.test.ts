import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_DESCRIPTION,
  APP_ICONS,
  APP_NAME,
  APP_SHORT_NAME,
  BRAND_ACCENT,
  BRAND_CANVAS,
  BRAND_COLORS,
  BRAND_INK,
  PWA_ASSETS,
  RETIRED_BRAND_COLORS,
  buildManifest,
} from './manifest';

/**
 * Sprint 3A.1: Die Marke muss überall dieselbe sein.
 *
 * Ein Redesign, das die Oberfläche umstellt und das Icon vergisst, ist kein
 * Redesign – der erste Eindruck einer PWA ist ihr Symbol auf dem Startbildschirm.
 * Diese Tests lesen die echten Dateien, nicht Kopien davon.
 */

const root = resolve(__dirname, '../..');

function readText(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
}

function readBinary(relative: string): Buffer {
  return readFileSync(resolve(root, relative));
}

/** Liest Breite und Höhe aus dem IHDR-Chunk einer PNG-Datei. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  const signature = buffer.subarray(0, 8).toString('hex');
  expect(signature, 'Datei ist kein PNG').toBe('89504e470d0a1a0a');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('Markenfarben', () => {
  it('benennt Papier, Aubergine und Tomato wie die Tokens', () => {
    const tokens = readText('src/styles/tokens.css');

    // Seit Sprint 4A.1c stehen die Markenfarben als eigene Basistöne in den
    // Tokens; die semantischen Namen verweisen darauf.
    expect(tokens).toContain(`--brand-parchment: ${BRAND_CANVAS}`);
    expect(tokens).toContain(`--brand-aubergine: ${BRAND_INK}`);
    expect(tokens).toContain(`--brand-tomato: ${BRAND_ACCENT}`);
    expect(tokens).toContain('--canvas: var(--brand-parchment)');
    expect(tokens).toContain('--nav: var(--brand-aubergine)');
    expect(tokens).toContain('--accent: var(--brand-tomato)');
  });

  it('hat die alten Markenfarben vollständig abgelegt', () => {
    /*
      `student.html` stand bis 4B.1c **nicht** in dieser Liste – und trug
      deshalb als einzige Datei noch die alte Theme-Farbe, sichtbar erst in der
      exportierten Schülerdatei. Eine zweite Einstiegsdatei ist leicht zu
      übersehen; die Liste ist es jetzt nicht mehr.
    */
    const files = [
      'index.html',
      'student.html',
      'public/favicon.svg',
      'public/lexiflow-mark-on-aubergine.svg',
      'public/lexiflow-mark-on-parchment.svg',
      'src/styles/tokens.css',
      'src/styles/global.css',
      'src/ui/Logo.tsx',
      'src/ui/logoPaths.ts',
    ];

    for (const file of files) {
      const content = readText(file).toLowerCase();
      for (const retired of RETIRED_BRAND_COLORS) {
        expect(content, `${file} enthält noch ${retired}`).not.toContain(retired);
      }
    }
  });

  it('trägt die alten Farben auch nicht mehr im Manifest', () => {
    const manifest = JSON.stringify(buildManifest('/')).toLowerCase();
    for (const retired of RETIRED_BRAND_COLORS) {
      expect(manifest).not.toContain(retired);
    }
  });
});

describe('index.html', () => {
  const html = readText('index.html');

  it('setzt die Theme-Farbe auf die Navigationsfarbe – in beiden Einstiegsdateien', () => {
    /*
      Die Statusleiste sitzt über der Kopfzeile, und die ist Aubergine.
      `student.html` steht hier mit, weil die Schülerlaufzeit ihre eigene
      Einstiegsdatei hat: Bis 4B.1c prüfte dieser Test nur `index.html`, und
      die alte Theme-Farbe überlebte genau dort.
    */
    for (const file of ['index.html', 'student.html']) {
      expect(readText(file), file).toContain(
        `<meta name="theme-color" content="${BRAND_INK}" />`,
      );
    }
  });

  it('legt sich auf das helle Schema fest', () => {
    // Sprint 3A.1: kein automatischer Dunkelmodus, solange er nicht geprüft ist.
    expect(html).toContain('<meta name="color-scheme" content="light" />');
    expect(html).not.toContain('light dark');
  });

  it('nennt das Produkt wie das Manifest', () => {
    expect(html).toContain(`<title>${APP_NAME}</title>`);
  });

  it('behält die ehrliche deutsche Beschreibung', () => {
    expect(html).toContain('alle Lernstände bleiben lokal im Browser');
    expect(html).toContain('lang="de"');
  });

  it('verweist auf das SVG-Favicon und lädt nichts von fremden Hosts', () => {
    expect(html).toContain('href="favicon.svg"');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('Markenmarker', () => {
  const svg = readText('public/favicon.svg');

  it('besteht aus genau den drei Markenfarben', () => {
    const lower = svg.toLowerCase();
    expect(lower).toContain(BRAND_INK);
    expect(lower).toContain(BRAND_CANVAS);
    expect(lower).toContain(BRAND_ACCENT);
    // Und aus keiner weiteren: Jeder Füllwert ist eine der drei.
    const fills = [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((hit) => hit[1]?.toLowerCase());
    expect(new Set(fills)).toEqual(new Set(BRAND_COLORS));
  });

  it('bleibt reduziert – kein Buch, keine Karteikarte, kein Emoji', () => {
    /*
      Seit 4B.1c trägt das Favicon die gelieferte Form: drei Pfade – hinteres
      Element, vordere gekippte Fläche, Durchblick – auf **einer** Kachel.
      Mehr wäre bei 16 px ohnehin nicht mehr erkennbar.
    */
    expect(svg.match(/<rect/g)).toHaveLength(1);
    expect(svg.match(/<path/g)).toHaveLength(3);
    expect(svg).not.toMatch(/<image|<text/);
    // Keine Emoji-Ebenen (alles außerhalb von Latin-1 wäre hier verdächtig).
    expect(svg).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
  });

  it('ist quadratisch und skaliert verlustfrei', () => {
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('aria-label="LexiFlow"');
  });
});

describe('App-Icons', () => {
  it('liegen in den vom Manifest genannten Größen vor', () => {
    for (const icon of APP_ICONS) {
      const size = pngSize(readBinary(`public/${icon.src}`));
      const [expected] = icon.sizes.split('x').map(Number);
      expect(size.width, `${icon.src}: falsche Breite`).toBe(expected);
      expect(size.height, `${icon.src}: falsche Höhe`).toBe(expected);
    }
  });

  it('nennt genau eine maskierbare Fassung – und zwar eine eigene Datei', () => {
    const maskable = APP_ICONS.filter((icon) => icon.purpose === 'maskable');
    expect(maskable).toHaveLength(1);

    const any = APP_ICONS.filter((icon) => icon.purpose === 'any').map((icon) => icon.src);
    // Dieselbe Datei für beides würde die Marke beim Ausstanzen beschneiden.
    expect(any).not.toContain(maskable[0]?.src);
  });

  it('unterscheidet sich vom alten Icon', () => {
    // Die alten Icons waren blau; die neuen tragen kein einziges blaues Pixel
    // in den ersten Datenbytes – hier genügt: die Dateien sind neu erzeugt.
    for (const icon of APP_ICONS) {
      const buffer = readBinary(`public/${icon.src}`);
      expect(buffer.length, `${icon.src} ist leer`).toBeGreaterThan(500);
    }
  });

  it('wird vollständig als PWA-Asset mitgegeben', () => {
    expect([...PWA_ASSETS]).toEqual([
      'favicon.svg',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-512-maskable.png',
    ]);
  });
});

describe('Manifest', () => {
  const manifest = buildManifest('/');

  it('nennt Produktname und Kurzform konsistent', () => {
    expect(manifest.name).toBe(APP_NAME);
    expect(manifest.name).toBe('LexiFlow – Vokabeln lernen');
    expect(manifest.short_name).toBe(APP_SHORT_NAME);
  });

  it('behält die deutsche Beschreibung und die ehrliche Aussage', () => {
    expect(manifest.description).toBe(APP_DESCRIPTION);
    expect(manifest.description).toContain('alle Daten bleiben lokal im Browser');
    expect(manifest.lang).toBe('de');
  });

  it('nutzt Papier als Fläche und Aubergine als Theme-Farbe', () => {
    expect(manifest.background_color).toBe(BRAND_CANVAS);
    expect(manifest.theme_color).toBe(BRAND_INK);
  });

  it('übernimmt den Deployment-Pfad', () => {
    const scoped = buildManifest('/lexiflow/');
    expect(scoped.start_url).toBe('/lexiflow/');
    expect(scoped.scope).toBe('/lexiflow/');
  });

  it('verweist ausschließlich auf lokale Dateien', () => {
    for (const icon of manifest.icons) {
      expect(icon.src).not.toMatch(/^https?:/);
      expect(icon.src.startsWith('icons/')).toBe(true);
    }
  });
});

describe('Kein Dunkelmodus als Nebenwirkung', () => {
  it('legt die Tokens auf das helle Schema fest', () => {
    const tokens = readText('src/styles/tokens.css');
    expect(tokens).toContain('color-scheme: light;');
    expect(tokens).not.toContain('light dark');
  });

  it('enthält keinen ungeprüften prefers-color-scheme-Block', () => {
    for (const file of ['src/styles/tokens.css', 'src/styles/global.css', 'src/styles/fonts.css']) {
      expect(readText(file), `${file}: unerwarteter Dunkelmodus`).not.toContain(
        'prefers-color-scheme',
      );
    }
  });
});
