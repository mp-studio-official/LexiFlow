import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DictionaryLicencePanel } from './DictionaryLicencePanel';
import type { DictionaryMeta, DictionaryProvider } from '../../dictionary/DictionaryProvider';

const META: DictionaryMeta = {
  formatVersion: 1,
  shardCount: 64,
  quelle: {
    name: 'Wiktionary (englische Ausgabe)',
    url: 'https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz',
    dump: '2026-08-05',
    extraktion: '2026-08-28',
    wiktextract: ['872fc7b', '4deed51'],
    sha256: '4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006',
    pruefsummeHinweis: 'lokal berechnet, nicht offiziell veröffentlicht',
    werkzeug: 'wiktextract (MIT, © Tatu Ylonen)',
  },
  lizenz: {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    hinweis: 'Abgeleitet aus dem englischen Wiktionary.',
    rueckverweis: 'https://en.wiktionary.org/',
  },
  zahlen: { eintraege: 66372 },
};

function provider(meta: DictionaryMeta | undefined): DictionaryProvider {
  return {
    id: 'test',
    label: 'Test',
    async isAvailable() {
      return Boolean(meta);
    },
    async lookup() {
      return [];
    },
    async meta() {
      return meta;
    },
  };
}

describe('Quelle und Lizenz des Wörterbuchs', () => {
  it('nennt Quelle, Stand, Werkzeug und Prüfsumme', async () => {
    render(<DictionaryLicencePanel dictionary={provider(META)} />);

    expect(await screen.findByText(/Wiktionary \(englische Ausgabe\)/)).toBeInTheDocument();
    expect(screen.getByText(/2026-08-05/)).toBeInTheDocument();
    expect(screen.getByText(/wiktextract \(MIT/)).toBeInTheDocument();
    expect(screen.getByText(META.quelle.sha256)).toBeInTheDocument();
  });

  it('kennzeichnet die Prüfsumme als lokal berechnet', async () => {
    render(<DictionaryLicencePanel dictionary={provider(META)} />);
    expect(
      await screen.findByText(/lokal berechnet, nicht offiziell veröffentlicht/),
    ).toBeInTheDocument();
  });

  it('nennt CC BY-SA 4.0 mit Verweis', async () => {
    render(<DictionaryLicencePanel dictionary={provider(META)} />);
    const link = await screen.findByRole('link', { name: 'CC BY-SA 4.0' });
    expect(link).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
    expect(screen.getByRole('link', { name: 'en.wiktionary.org' })).toBeInTheDocument();
  });

  it('behauptet keine Rechtsberatung', async () => {
    render(<DictionaryLicencePanel dictionary={provider(META)} />);
    expect(await screen.findByText(/keine Rechtsberatung/)).toBeInTheDocument();
  });

  it('exportiert Quelle und Lizenz als lesbare Datei', async () => {
    const onDownload = vi.fn();
    render(<DictionaryLicencePanel dictionary={provider(META)} onDownload={onDownload} />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Quelle und Lizenz exportieren/ }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    const [filename, content] = onDownload.mock.calls[0] as [string, string];
    expect(filename).toBe('lexiflow-woerterbuch-quelle.json');

    const parsed = JSON.parse(content);
    expect(parsed.lizenz.name).toBe('CC BY-SA 4.0');
    expect(parsed.quelle.sha256).toBe(META.quelle.sha256);
    expect(parsed.quelle.dump).toBe('2026-08-05');
    expect(parsed.hinweis).toMatch(/CC BY-SA 4.0/);
    expect(parsed.hinweis).toMatch(/keine Rechtsberatung/);
    // Zitate, Bilder und Audio sind ausdrücklich nicht enthalten.
    expect(parsed.hinweis).toMatch(/Zitate, Bilder und Audio sind nicht enthalten/);
  });

  it('sagt es sachlich, wenn kein Wörterbuch ausgeliefert wird', async () => {
    render(<DictionaryLicencePanel dictionary={provider(undefined)} />);
    expect(await screen.findByText(/kein Offline-Wörterbuch enthalten/)).toBeInTheDocument();
  });
});
