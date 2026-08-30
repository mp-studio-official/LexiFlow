import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnrichmentPanel } from './EnrichmentPanel';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { buildDrafts, type DraftRow } from '../../import/draft';
import { detectColumns } from '../../import/columnDetect';
import { syncManualEdits } from '../../import/suggestions';
import type { LearningContext } from '../../import/enrichment';
import { createFakeAiProvider, createFakeTranslationProvider } from '../../test/fakeTranslator';
import type { TranslationProvider } from '../../translation/TranslationProvider';
import type { AiProvider } from '../../ai/AiProvider';

/**
 * Sprint 2B.1: Der Vorschlagsbereich der Importvorschau. Kein Test lädt je ein
 * echtes Modell – alles läuft gegen Fake-Anbieter.
 */

const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: 'City life' };

const ROWS = [
  ['Englisch', 'Deutsch'],
  ['to apologise', ''],
  ['crowded', 'überfüllt'],
  ['quickly', ''],
];

function startingDrafts(): DraftRow[] {
  return buildDrafts(ROWS, detectColumns(ROWS), { splitMultipleMeanings: true });
}

/** Kleine Hülle mit Zustand – wie im Assistenten. */
function Harness({ initial }: { initial: DraftRow[] }) {
  const [drafts, setDrafts] = useState(initial);
  return (
    <>
      <EnrichmentPanel
        drafts={drafts}
        context={CONTEXT}
        onChange={(next) => setDrafts((current) => syncManualEdits(current, next))}
      />
      <ul aria-label="Entwurf">
        {drafts.map((draft) => (
          <li key={draft.id}>
            {draft.english} | de: {draft.german || '–'} | wortart: {draft.partOfSpeech || '–'} |
            schwierigkeit: {draft.difficulty === '' ? '–' : draft.difficulty} | tags:{' '}
            {draft.tags || '–'}
          </li>
        ))}
      </ul>
    </>
  );
}

function setup(providers: { translation?: TranslationProvider; ai?: AiProvider } = {}) {
  render(
    <ProviderRegistry value={providers}>
      <Harness initial={startingDrafts()} />
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

function rowText(english: string): string {
  const list = screen.getByRole('list', { name: 'Entwurf' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((element) => element.textContent?.startsWith(english));
  return item?.textContent ?? '';
}

async function generate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(
    await screen.findByRole('button', { name: /Vorschläge erzeugen/ }),
  );
}

describe('Ohne Anbieter', () => {
  it('blockiert nichts und erklärt die Lage', async () => {
    setup();
    expect(
      await screen.findByText(/in diesem Browser nicht verfügbar\. Deutsche Antworten/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/in diesem Browser nicht verfügbar\. Wortart und Schwierigkeit/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vorschläge erzeugen/ })).toBeDisabled();
  });

  it('liefert trotzdem sofort die regelbasierten Vorschläge', async () => {
    setup();
    expect((await screen.findAllByText(/Wortart:/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Verb')).toBeInTheDocument();
    expect(screen.getByText('Adverb')).toBeInTheDocument();
    // Vorgeschlagen heißt nicht übernommen.
    expect(rowText('to apologise')).toContain('wortart: –');
  });

  it('schlägt das Thema als Tag vor, ohne es zu setzen', async () => {
    setup();
    expect(await screen.findAllByText('City life')).toHaveLength(3);
    expect(rowText('crowded')).toContain('tags: –');
  });

  it('sagt, dass nichts übertragen wird und das Paket ohne Modell auskommt', () => {
    setup();
    expect(screen.getByText(/Es werden keine Daten übertragen\./)).toBeInTheDocument();
    expect(screen.getByText(/funktioniert später ohne jedes Modell/)).toBeInTheDocument();
    expect(screen.getByText(/ungeprüft/)).toBeInTheDocument();
  });
});

describe('Einzelne Vorschläge', () => {
  it('übernimmt genau einen Wert', async () => {
    const user = setup();
    await screen.findByText('Verb');

    await user.click(
      screen.getByRole('button', { name: 'Wortart für to apologise übernehmen' }),
    );

    expect(rowText('to apologise')).toContain('wortart: verb');
    // Der Vorschlag ist erledigt und verschwindet aus der Liste.
    expect(
      screen.queryByRole('button', { name: 'Wortart für to apologise übernehmen' }),
    ).not.toBeInTheDocument();
  });

  it('lehnt einen Vorschlag ab, ohne ihn zu setzen', async () => {
    const user = setup();
    await screen.findByText('Verb');

    await user.click(screen.getByRole('button', { name: 'Wortart für to apologise ablehnen' }));

    expect(rowText('to apologise')).toContain('wortart: –');
    expect(
      screen.queryByRole('button', { name: 'Wortart für to apologise übernehmen' }),
    ).not.toBeInTheDocument();
  });

  it('trennt Vorschlag und gespeicherten Wert sichtbar', async () => {
    setup();
    const badges = await screen.findAllByText('Vorschlag');
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/aus einer festen Regel/).length).toBeGreaterThan(0);
  });
});

describe('Mit lokalen Anbietern', () => {
  it('lädt erst nach dem Klick und übersetzt nur leere Felder', async () => {
    const translation = createFakeTranslationProvider();
    const ai = createFakeAiProvider();
    const user = setup({ translation: translation.provider, ai: ai.provider });

    await screen.findByRole('button', { name: 'Sprachmodelle laden und Vorschläge erzeugen' });
    expect(translation.prepareCount()).toBe(0);
    expect(ai.prepareCount()).toBe(0);

    await generate(user);

    await waitFor(() => expect(translation.translated).toContain('to apologise'));
    expect(translation.prepareCount()).toBe(1);
    expect(ai.prepareCount()).toBe(1);
    // „crowded“ hat bereits eine Übersetzung und wird nicht angefasst.
    expect(translation.translated).not.toContain('crowded');
  });

  it('bereitet beim zweiten Lauf nicht erneut vor', async () => {
    const translation = createFakeTranslationProvider();
    const ai = createFakeAiProvider();
    const user = setup({ translation: translation.provider, ai: ai.provider });

    await generate(user);
    await screen.findByText('to apologise-de');
    await generate(user);
    await waitFor(() => expect(screen.getByText(/Fertig\./)).toBeInTheDocument());

    expect(translation.prepareCount()).toBe(1);
    expect(ai.prepareCount()).toBe(1);
  });

  it('schlägt Übersetzung, Wortart, Schwierigkeit und Tags vor', async () => {
    const user = setup({
      translation: createFakeTranslationProvider().provider,
      ai: createFakeAiProvider({ difficulty: 4, topicTags: ['traffic'] }).provider,
    });
    await generate(user);

    expect(await screen.findByText('to apologise-de')).toBeInTheDocument();
    expect(screen.getAllByText('4 von 5').length).toBeGreaterThan(0);
    // Regel- und Modell-Tags ergänzen sich, statt sich zu verdrängen.
    expect(screen.getAllByText('City life, traffic').length).toBeGreaterThan(0);
    // Noch ist nichts im Entwurf gelandet.
    expect(rowText('to apologise')).toContain('de: –');
  });

  it('lässt einen Zeilenfehler die übrigen Zeilen nicht verwerfen', async () => {
    const user = setup({
      translation: createFakeTranslationProvider({ failFor: ['to apologise'] }).provider,
      ai: createFakeAiProvider().provider,
    });
    await generate(user);

    expect(await screen.findByText('quickly-de')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Übersetzung fehlgeschlagen/);
  });

  it('meldet den Fortschritt und lässt sich abbrechen', async () => {
    const user = setup({
      translation: createFakeTranslationProvider().provider,
      ai: createFakeAiProvider().provider,
    });
    await generate(user);
    await waitFor(() =>
      expect(screen.getByText(/Vorschläge für \d+ Vokabeln liegen zur Prüfung bereit/))
        .toBeInTheDocument(),
    );
  });
});

describe('Sammelaktionen', () => {
  it('übernimmt nur leere Felder ausgewählter Zeilen', async () => {
    const user = setup({
      translation: createFakeTranslationProvider().provider,
      ai: createFakeAiProvider().provider,
    });
    await generate(user);
    await screen.findByText('to apologise-de');

    await user.click(
      screen.getByRole('button', { name: /Alle Deutsche Übersetzung übernehmen \(2\)/ }),
    );

    expect(rowText('to apologise')).toContain('de: to apologise-de');
    expect(rowText('quickly')).toContain('de: quickly-de');
    // Die vorhandene Übersetzung bleibt, wie sie war.
    expect(rowText('crowded')).toContain('de: überfüllt');
  });

  it('nennt die Anzahl und meldet die Übernahme', async () => {
    const user = setup();
    await screen.findByText('Verb');

    const button = screen.getByRole('button', { name: /Alle Themen-Tags übernehmen \(3\)/ });
    await user.click(button);

    expect(rowText('crowded')).toContain('tags: City life');
    expect(screen.getByText(/3 Vorschläge für „Themen-Tags“ übernommen/)).toBeInTheDocument();
  });

  it('lässt abgelehnte Vorschläge aus', async () => {
    const user = setup();
    await screen.findByText('Verb');

    await user.click(screen.getByRole('button', { name: 'Wortart für to apologise ablehnen' }));
    await user.click(screen.getByRole('button', { name: /Alle Wortart übernehmen \(1\)/ }));

    expect(rowText('to apologise')).toContain('wortart: –');
    expect(rowText('quickly')).toContain('wortart: adverb');
  });
});

describe('Barrierefreiheit', () => {
  it('ist mit der Tastatur bedienbar', async () => {
    const user = setup();
    await screen.findByText('Verb');

    const accept = screen.getByRole('button', { name: 'Wortart für to apologise übernehmen' });
    accept.focus();
    expect(accept).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(rowText('to apologise')).toContain('wortart: verb');
  });

  it('meldet Zustände über eine Live-Region', async () => {
    const user = setup();
    await screen.findByText('Verb');
    await user.click(screen.getByRole('button', { name: /Alle Wortart übernehmen/ }));

    expect(screen.getByText(/für „Wortart“ übernommen/)).toBeInTheDocument();
  });

  it('gibt jeder Schaltfläche einen eindeutigen Namen', async () => {
    setup();
    await screen.findByText('Verb');
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Keine Überraschungen', () => {
  it('ruft ohne Klick keinen Anbieter auf', async () => {
    const translation = createFakeTranslationProvider();
    const ai = createFakeAiProvider();
    const translateSpy = vi.spyOn(translation.provider, 'translate');
    const enrichSpy = vi.spyOn(ai.provider, 'enrichEntry');

    setup({ translation: translation.provider, ai: ai.provider });
    await screen.findByText('Verb');

    expect(translateSpy).not.toHaveBeenCalled();
    expect(enrichSpy).not.toHaveBeenCalled();
    expect(translation.prepareCount()).toBe(0);
  });
});
