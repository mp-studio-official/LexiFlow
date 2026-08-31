import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Logo, LogoAppIcon, LogoMark } from './Logo';
import { AppShell } from './AppShell';
import { StudentShell } from '../portable/StudentShell';
import {
  APP_CLAIM,
  APP_ICONS,
  APP_NAME,
  BRAND_ACCENT,
  BRAND_CANVAS,
  BRAND_INK,
  BRAND_WARM,
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
    expect(svg).toHaveAttribute('viewBox', '0 0 64 64');
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
    for (const color of ['#3B0F3F', '#E63946', '#FF8A3D']) {
      expect(html).not.toContain(color);
    }
  });

  it('nutzt in der hellen Fassung Parchment für die tragende Fläche', () => {
    const { container } = render(<LogoMark tone="on-dark" />);
    expect(container.innerHTML).toContain('#F8EFE3');
  });
});

describe('Marke in den Hüllen', () => {
  it('steht in der Lehrkraft-Hülle samt Claim', () => {
    renderShell('lehrkraft');

    const brand = screen.getByRole('link', { name: /LexiFlow/ });
    expect(within(brand).getByText('LexiFlow')).toBeInTheDocument();
    expect(brand.querySelector('svg')).not.toBeNull();
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
    expect(BRAND_INK).toBe('#3b0f3f');
    expect(BRAND_CANVAS).toBe('#f8efe3');
    expect(BRAND_ACCENT).toBe('#e63946');
    expect(BRAND_WARM).toBe('#ff8a3d');
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

    expect(favicon).toContain('#3B0F3F');
    expect(favicon).toContain('#E63946');
    expect(favicon).toContain('#FF8A3D');
    expect(favicon).not.toContain('<image');
  });
});
