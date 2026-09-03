import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Logo, LogoAppIcon, LogoMark } from './Logo';
import {
  LOGO_ASPECT,
  LOGO_BLACK_AND_WHITE,
  LOGO_LAYERS,
  LOGO_SHAPES,
  LOGO_VARIANTS,
  LOGO_VIEWBOX,
} from './logoPaths';
import { AppShell } from './AppShell';
import { StudentShell } from '../portable/StudentShell';
import {
  APP_CLAIM,
  APP_ICONS,
  APP_NAME,
  BRAND_ACCENT,
  BRAND_CANVAS,
  BRAND_INK,
  BRAND_COLORS,
  RETIRED_BRAND_COLORS,
  buildManifest,
} from '../pwa/manifest';

/**
 * Sprint 4A.1c: Die Marke, geprüft an den Stellen, an denen sie auftritt.
 *
 * Bewusst **keine** Prüfung auf Pfaddaten oder Pixel: Das Zeichen darf sich
 * weiterentwickeln. Geprüft wird, was verbindlich ist – dass die Wortmarke da
 * ist, dass sie einen Namen hat, dass der Claim genau so lautet und dass der
 * alte Claim aus der Vorlage nirgends steht.
 */

const root = resolve(import.meta.dirname, '../..');

/** Der Claim aus der Brand-Vorlage. Er ist ausdrücklich **nicht** unserer. */
const ALTER_CLAIM = 'Aus Listen wird Lernen';

function renderShell(shell: 'lehrkraft' | 'schueler') {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          element={
            shell === 'lehrkraft' ? (
              <AppShell />
            ) : (
              <StudentShell title="Vokabeltrainer" storage="verfuegbar" />
            )
          }
        >
          <Route index element={<p>Inhalt</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Wortmarke und Signet', () => {
  it('setzt den Namen als echten Text, nicht als Bild', () => {
    render(<Logo />);

    // Markierbar, vorlesbar, übersetzbar – und ohne eigenes Bild-Label.
    expect(screen.getByText('LexiFlow')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('ist als reines Zeichen dekorativ, solange Text daneben steht', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', LOGO_VIEWBOX);
  });

  it('nutzt die Höhe als Maß und lässt die Breite folgen', () => {
    /*
      Das Zeichen ist hochkant. Es in ein Quadrat zu zwingen hieße entweder
      verzerren oder beschneiden – beides wäre eine Änderung an der Marke.
    */
    const { container } = render(<LogoMark size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '40');
    expect(svg).toHaveAttribute('width', String(Math.round(40 * LOGO_ASPECT)));
    expect(Number(svg?.getAttribute('width'))).toBeLessThan(40);
  });

  it('bekommt einen Namen, sobald es allein steht', () => {
    render(<LogoMark title="LexiFlow" />);
    expect(screen.getByRole('img', { name: 'LexiFlow' })).toBeInTheDocument();
  });

  it('enthält keine eingebettete Bitmap', () => {
    const { container } = render(
      <>
        <LogoMark />
        <LogoAppIcon />
      </>,
    );
    expect(container.querySelector('image')).toBeNull();
    expect(container.innerHTML).not.toContain('data:image/png');
    expect(container.innerHTML).not.toContain('data:image/jpeg');
  });

  it('trägt in der einfarbigen Fassung keine Markenfarbe', () => {
    const { container } = render(<LogoMark tone="mono" />);
    const html = container.innerHTML;

    expect(html).toContain('currentColor');
    for (const color of ['#2F092D', '#FF2E2D', '#F8EFE3']) {
      expect(html).not.toContain(color);
    }
  });

  it('zeichnet die Schwarzweiß-Fassung deckend und in drei Stufen', () => {
    /*
      Der Fehler, den diese Prüfung festhält: `mono` legte den Durchblick mit
      35 % Deckkraft auf eine voll deckende Fläche. Aus einem hellen „F“ wurde
      dadurch kein helles „F“, sondern gar keines – und dort, wo die vordere
      Fläche über der hinteren liegt, addierten sich zwei halbdurchlässige
      Schichten zu einem dritten Ton, den es im Entwurf nicht gibt.

      `bw` nimmt die drei Werte aus der gelieferten Datei und deckt.
    */
    const { container } = render(<LogoMark tone="bw" />);
    const paths = [...container.querySelectorAll('path')];

    expect(paths.map((path) => path.getAttribute('fill'))).toEqual([
      LOGO_BLACK_AND_WHITE.back,
      LOGO_BLACK_AND_WHITE.front,
      LOGO_BLACK_AND_WHITE.inner,
    ]);
    for (const path of paths) expect(path.getAttribute('fill-opacity')).toBeNull();
  });

  it('hält die Schwarzweiß-Fassung von den Markenfarben getrennt', () => {
    // Sie ist dieselbe Form für Papier, keine dritte Markenfarbe.
    const werte: string[] = Object.values(LOGO_BLACK_AND_WHITE);
    for (const color of ['#2F092D', '#FF2E2D', '#F8EFE3']) {
      expect(werte).not.toContain(color);
    }
  });

  it('nutzt auf Aubergine die Variante für Aubergine-Hintergrund', () => {
    /*
      Die tragende Fläche muss dort **Parchment** sein. Nähme man die helle
      Variante, läge Aubergine auf Aubergine und das Zeichen verschwände zur
      Hälfte.
    */
    const { container } = render(<LogoMark tone="on-dark" />);
    const fills = [...container.innerHTML.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((h) => h[1]);
    expect(fills).toEqual([
      LOGO_VARIANTS.onAubergine.back,
      LOGO_VARIANTS.onAubergine.front,
      LOGO_VARIANTS.onAubergine.inner,
    ]);
  });

  it('nutzt auf hellen Flächen die Variante für Parchment-Hintergrund', () => {
    const { container } = render(<LogoMark tone="brand" />);
    const fills = [...container.innerHTML.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((h) => h[1]);
    expect(fills).toEqual([
      LOGO_VARIANTS.onParchment.back,
      LOGO_VARIANTS.onParchment.front,
      LOGO_VARIANTS.onParchment.inner,
    ]);
  });

  it('zeigt dieselbe Form wie die ausgelieferten Assets', () => {
    // Kein zweiter Satz Pfade: Komponente und Datei lesen `logoPaths.ts`.
    const { container } = render(<LogoMark />);
    for (const layer of LOGO_LAYERS) {
      expect(container.innerHTML).toContain(LOGO_SHAPES[layer].d);
    }
  });
});

describe('Die dunkle Hülle trägt die Aubergine-Variante', () => {
  it.each(['lehrkraft', 'schueler'] as const)('in der %s-Hülle', (shell) => {
    /*
      Beide Hüllen haben eine Aubergine-Kopfzeile. Die helle Variante dort wäre
      nicht bloß hässlich – ihre hintere Fläche ist Aubergine und läge damit
      unsichtbar auf dem Untergrund.
    */
    renderShell(shell);
    /*
      Seit 4B.3 trägt die Lehrkraft-Hülle die Marke an zwei Stellen: in der
      Kopfzeile für schmale Fenster und in der Schiene für breite. Beide liegen
      auf Aubergine, also muss die Regel für **beide** gelten – geprüft wird
      deshalb jede Marke im Baum, nicht die erste.
    */
    const brands = screen.getAllByRole('link', { name: /LexiFlow/ });
    expect(brands.length).toBeGreaterThan(0);

    for (const brand of brands) {
      const fills = [...brand.innerHTML.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((h) => h[1]);
      /*
        Beide Varianten enthalten alle drei Farben – der Unterschied ist die
        Reihenfolge. Geprüft wird deshalb das Tripel, nicht das Vorkommen.
      */
      expect(fills).toEqual([
        LOGO_VARIANTS.onAubergine.back,
        LOGO_VARIANTS.onAubergine.front,
        LOGO_VARIANTS.onAubergine.inner,
      ]);
      expect(fills[0]).not.toBe(LOGO_VARIANTS.onParchment.back);
    }
  });

  it('lädt das Zeichen nicht als externe Datei', () => {
    /*
      Entscheidend für die portablen Einzeldateien: Ein `<img src="…svg">`
      wäre offline und unter `file://` ein leerer Kasten. Das Zeichen steht
      deshalb als Pfad im Dokument.
    */
    renderShell('schueler');
    const brand = screen.getByRole('link', { name: /LexiFlow/ });
    expect(brand.querySelector('img')).toBeNull();
    expect(brand.innerHTML).not.toContain('.svg');
    expect(brand.querySelector('svg path')).not.toBeNull();
  });
});

describe('Marke in den Hüllen', () => {
  it('steht in der Lehrkraft-Hülle samt Claim', () => {
    renderShell('lehrkraft');

    // Kopfzeile (schmale Fenster) und Schiene (breite) – beide tragen Zeichen
    // **und** Wortmarke, und beide führen zur Startseite.
    const brands = screen.getAllByRole('link', { name: /LexiFlow/ });
    expect(brands).toHaveLength(2);
    for (const brand of brands) {
      expect(within(brand).getByText('LexiFlow')).toBeInTheDocument();
      expect(brand.querySelector('svg')).not.toBeNull();
      expect(brand).toHaveAttribute('href', '/');
    }
    expect(screen.getByText(APP_CLAIM)).toBeInTheDocument();
  });

  it('steht in der Schüler-Hülle', () => {
    renderShell('schueler');

    const brand = screen.getByRole('link', { name: /LexiFlow/ });
    expect(within(brand).getByText('LexiFlow')).toBeInTheDocument();
    expect(brand.querySelector('svg')).not.toBeNull();
  });

  it('zeigt in der Schüler-Hülle keine Lehrkraftnavigation', () => {
    renderShell('schueler');
    expect(screen.queryByRole('link', { name: 'Erstellen' })).not.toBeInTheDocument();
  });
});

describe('Der Claim', () => {
  it('lautet genau so', () => {
    expect(APP_CLAIM).toBe('Einfach ins Lernen kommen.');
  });

  it('steht nirgends im Quellbaum in der alten Fassung', () => {
    /*
      Der Vorlagenclaim „Aus Listen wird Lernen.“ gehört einer anderen Marke.
      Diese Prüfung liest den ausgelieferten Quellbaum – Code, Styles,
      Dokumentation und die Einstiegsdateien –, damit er auch nicht über einen
      Kommentar hereinkommt.
    */
    const files = [
      'src/pwa/manifest.ts',
      'src/ui/AppShell.tsx',
      'src/ui/Logo.tsx',
      'src/portable/StudentShell.tsx',
      'src/routes/HomePage.tsx',
      'src/routes/student/StudentHomePage.tsx',
      'src/portable/PortableHomePage.tsx',
      'src/styles/tokens.css',
      'src/styles/global.css',
      'index.html',
      'student.html',
      'README.md',
    ];

    for (const file of files) {
      expect(readFileSync(resolve(root, file), 'utf8'), file).not.toContain(ALTER_CLAIM);
    }
  });
});

describe('PWA-Identität', () => {
  const manifest = buildManifest('/');

  it('trägt Name, Sprache und Beschreibung der Marke', () => {
    expect(manifest.name).toBe(APP_NAME);
    expect(manifest.short_name).toBe('LexiFlow');
    expect(manifest.lang).toBe('de');
    expect(manifest.description).toContain(APP_CLAIM);
  });

  it('nutzt die Markenfarben', () => {
    expect(BRAND_INK).toBe('#2f092d');
    expect(BRAND_CANVAS).toBe('#f8efe3');
    expect(BRAND_ACCENT).toBe('#ff2e2d');
    // Genau drei – eine vierte Markenfarbe gibt es seit 4B.1c nicht mehr.
    expect(BRAND_COLORS).toEqual(['#2f092d', '#ff2e2d', '#f8efe3']);
    // Die Statusleiste trägt die Navigationsfarbe, nicht das Papier.
    expect(manifest.theme_color).toBe(BRAND_INK);
    expect(manifest.background_color).toBe(BRAND_CANVAS);
  });

  it('bringt ein normales und ein maskierbares Icon mit', () => {
    expect(manifest.icons).toHaveLength(APP_ICONS.length);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(manifest.icons.every((icon) => icon.type === 'image/png')).toBe(true);
  });

  it('liefert alle Icons als vorhandene Dateien aus', () => {
    for (const icon of APP_ICONS) {
      expect(() => readFileSync(resolve(root, 'public', icon.src)), icon.src).not.toThrow();
    }
    expect(() => readFileSync(resolve(root, 'public/favicon.svg'))).not.toThrow();
  });

  it('zeigt im Favicon dieselbe Geometrie wie das Signet', () => {
    const favicon = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');

    expect(favicon).toContain('#2F092D');
    expect(favicon).toContain('#FF2E2D');
    expect(favicon).toContain('#F8EFE3');
    expect(favicon).not.toContain('<image');
    // Und keine abgelegte Farbe – Orange zuallererst.
    for (const retired of RETIRED_BRAND_COLORS) {
      expect(favicon.toLowerCase(), retired).not.toContain(retired);
    }
  });
});
