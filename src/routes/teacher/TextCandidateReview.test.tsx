import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextCandidateReview } from './TextCandidateReview';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import { candidatesToDrafts, type CandidateSelection } from '../../import/textDraft';
import { createFakeTranslationProvider } from '../../test/fakeTranslator';
import type { TranslationProvider } from '../../translation/TranslationProvider';

const TEXT = 'The neighbourhood is crowded. Litter is a problem in the neighbourhood.';

function candidates() {
  return extractTextCandidates(TEXT);
}

function setup(provider?: TranslationProvider) {
  const onApply = vi.fn();
  const onBack = vi.fn();
  render(
    <ProviderRegistry {...(provider ? { value: { translation: provider } } : {})}>
      <TextCandidateReview candidates={candidates()} onApply={onApply} onBack={onBack} />
    </ProviderRegistry>,
  );
  return { onApply, onBack, user: userEvent.setup() };
}

function applied(onApply: ReturnType<typeof vi.fn>): CandidateSelection[] {
  return onApply.mock.calls.at(-1)?.[0] as CandidateSelection[];
}

describe('Textwerkstatt ohne Übersetzungs-Anbieter', () => {
  it('bleibt vollständig benutzbar', async () => {
    setup();
    expect(
      screen.getByRole('heading', { name: /Gefundene Vokabelkandidaten/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Dieser Browser bietet keine lokale Übersetzung/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Vorschläge/ }),
    ).not.toBeInTheDocument();
  });

  it('zeigt zu jedem Kandidaten den unveränderten Originalsatz', () => {
    setup();
    const sentences = [...document.querySelectorAll('.candidate__sentence')].map((element) =>
      (element.textContent ?? '').replace('Originalsatz: ', '').replace(/^„|“$/g, ''),
    );
    expect(sentences).toHaveLength(candidates().length);
    for (const sentence of sentences) expect(TEXT).toContain(sentence);
  });

  it('führt den kompletten Weg mit selbst eingetragenen Antworten zu Ende', async () => {
    const { onApply, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    const selections = applied(onApply);
    expect(selections).toHaveLength(1);
    expect(selections[0]?.german).toBe('überfüllt');
    expect(selections[0]?.translationAccepted).toBe(false);
  });

  it('macht Zeilen ohne deutsche Antwort sichtbar, ohne sie zu verstecken', async () => {
    const { user } = setup();
    const total = candidates().length;

    expect(screen.getAllByText(/Ohne deutsche Antwort/)).toHaveLength(total);
    expect(screen.getByText(new RegExp(`${total} ohne deutsche Antwort`))).toBeInTheDocument();

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'x');

    // Die Zeile bleibt sichtbar, nur ihr Fehler verschwindet.
    expect(screen.getAllByText(/Ohne deutsche Antwort/)).toHaveLength(total - 1);
    expect(screen.getByLabelText('crowded übernehmen')).toBeInTheDocument();
  });

  it('erlaubt Alle/Keine auswählen, Sortieren und Entfernen', async () => {
    const { user } = setup();
    const count = candidates().length;

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    expect(screen.getByText(`0 von ${count} ausgewählt`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Alle auswählen' }));
    expect(screen.getByText(new RegExp(`${count} von ${count} ausgewählt`))).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Sortierung der Kandidaten'), 'frequency');
    const first = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    expect(first).toHaveAccessibleName('neighbourhood übernehmen');

    await user.click(screen.getByLabelText('crowded entfernen'));
    expect(screen.queryByLabelText('crowded übernehmen')).not.toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${count - 1} von ${count - 1} ausgewählt`)),
    ).toBeInTheDocument();
  });
});

describe('Textwerkstatt mit Übersetzungs-Anbieter', () => {
  it('lädt das Modell erst nach einem ausdrücklichen Klick', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider();
    const { user } = setup(provider);

    const button = await screen.findByRole('button', {
      name: 'Sprachmodell laden und Vorschläge erzeugen',
    });
    expect(prepareCount()).toBe(0);

    await user.click(button);
    await waitFor(() => expect(prepareCount()).toBe(1));
  });

  it('nennt vor der Nutzung ehrlich, wohin die Daten gehen', async () => {
    const { provider } = createFakeTranslationProvider();
    setup(provider);
    expect(await screen.findByText(provider.info.dataNotice)).toBeInTheDocument();
    expect(screen.getByText(/ungeprüft/)).toBeInTheDocument();
  });

  it('übernimmt einen Vorschlag nie von selbst', async () => {
    const { provider } = createFakeTranslationProvider();
    const { onApply, user } = setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();

    // Das Eingabefeld bleibt leer, bis die Lehrkraft übernimmt.
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('crowded-de');

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    const selections = applied(onApply);
    expect(selections[0]?.translationAccepted).toBe(true);
    expect(candidatesToDrafts(selections)[0]?.sourceType).toBe('text-ai');
  });

  it('zeigt den Ladefortschritt an', async () => {
    const { provider } = createFakeTranslationProvider({ progress: [0.5] });
    const { user } = setup(provider);
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    // Nach Abschluss verschwindet die Anzeige wieder.
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  });

  it('hält einen Fehler bei der einzelnen Vokabel und bietet Wiederholung an', async () => {
    const { provider } = createFakeTranslationProvider({ failFor: ['crowded'] });
    const { user } = setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );

    const retry = await screen.findByRole('button', {
      name: 'Übersetzung für crowded erneut versuchen',
    });
    // Die anderen Zeilen sind trotzdem übersetzt.
    expect(screen.getByText('neighbourhood-de')).toBeInTheDocument();

    await user.click(retry);
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
  });

  it('übersetzt nur die ausgewählten Kandidaten', async () => {
    const { provider, translated } = createFakeTranslationProvider();
    const { user } = setup(provider);

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );

    await screen.findByText('crowded-de');
    expect(translated).not.toContain('neighbourhood');
  });

  it('macht eine bearbeitete Übernahme wieder zu einer eigenen Antwort', async () => {
    const { provider } = createFakeTranslationProvider();
    const { onApply, user } = setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    await screen.findByText('crowded-de');
    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), '!');

    await user.click(screen.getByRole('button', { name: 'Keine auswählen' }));
    await user.click(screen.getByLabelText('crowded übernehmen'));
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    expect(applied(onApply)[0]?.translationAccepted).toBe(false);
  });
});

describe('Übergabe an den Entwurfs-Workflow', () => {
  it('erzeugt gültige Entwurfszeilen mit Originalsatz und Herkunft', () => {
    const [candidate] = candidates();
    const drafts = candidatesToDrafts([
      {
        candidate: candidate!,
        german: 'Nachbarschaft',
        translationAccepted: false,
        includeSentence: true,
      },
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.english).toBe(candidate?.english);
    expect(drafts[0]?.sentences[0]?.english).toBe(candidate?.sourceSentence);
    expect(drafts[0]?.sourceType).toBe('import');
    expect(drafts[0]?.provenance?.origin).toBe('text-extraction');
    expect(drafts[0]?.issues.some((issue) => issue.level === 'error')).toBe(false);
  });

  it('meldet eine fehlende deutsche Antwort als Fehler statt sie zu erfinden', () => {
    const [candidate] = candidates();
    const drafts = candidatesToDrafts([
      {
        candidate: candidate!,
        german: '   ',
        translationAccepted: false,
        includeSentence: true,
      },
    ]);
    expect(drafts[0]?.issues.some((issue) => issue.level === 'error')).toBe(true);
  });
});
