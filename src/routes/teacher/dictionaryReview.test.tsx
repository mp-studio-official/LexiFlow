import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextCandidateReview } from './TextCandidateReview';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import type { CandidateSelection } from '../../import/textDraft';
import type { LearningContext } from '../../import/enrichment';
import type { DictionaryEntry, DictionaryProvider } from '../../dictionary/DictionaryProvider';

/**
 * Die Kandidatenprüfung mit Offline-Wörterbuch – im Zustand „Safari“:
 * kein Übersetzungs-Anbieter, kein Sprachmodell, keine Netzverbindung.
 *
 * Der `ProviderRegistry` bekommt **keinen** Übersetzer; damit meldet die
 * Verfügbarkeitsprüfung `unavailable`, und genau das ist der Fall, den dieser
 * Sprint verlässlich machen soll.
 */

const TEXT = 'The neighbourhood is crowded. Litter covers the quiet street near the old station.';
const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: '' };

function entry(
  headword: string,
  senses: DictionaryEntry['senses'],
  extra: Partial<DictionaryEntry> = {},
): DictionaryEntry {
  return {
    headword,
    lemma: headword,
    partOfSpeech: 'noun',
    senses,
    quality: 'exact',
    source: 'wiktionary',
    ...extra,
  };
}

/** Ein kleiner Bestand, der genau die geprüften Fälle abdeckt. */
const BESTAND: Record<string, DictionaryEntry[]> = {
  litter: [entry('litter', [{ sense: 'rubbish', suggestions: [{ german: 'Müll', gender: 'm' }] }])],
  neighbourhood: [
    entry('neighbourhood', [
      { sense: 'area', suggestions: [{ german: 'Nachbarschaft', gender: 'f' }] },
      { sense: 'vicinity', suggestions: [{ german: 'Umgebung', gender: 'f' }] },
    ]),
  ],
  station: [
    entry('station', [
      {
        sense: 'place',
        suggestions: [
          { german: 'Bahnhof', gender: 'm' },
          { german: 'Station', gender: 'f' },
        ],
      },
    ]),
  ],
  quiet: [
    entry(
      'quiet',
      [{ sense: 'silent', suggestions: [{ german: 'stillschweigend', register: ['dated'] }] }],
      { partOfSpeech: 'adj' },
    ),
  ],
};

function fakeDictionary(overrides: Partial<DictionaryProvider> = {}): DictionaryProvider {
  return {
    id: 'test',
    label: 'Offline-Wörterbuch',
    async isAvailable() {
      return true;
    },
    async meta() {
      return undefined;
    },
    async lookup(word) {
      return BESTAND[word.toLowerCase()] ?? [];
    },
    ...overrides,
  };
}

function setup(dictionary: DictionaryProvider = fakeDictionary()) {
  const onApply = vi.fn();
  render(
    <ProviderRegistry>
      <TextCandidateReview
        candidates={extractTextCandidates(TEXT)}
        context={CONTEXT}
        onContextChange={vi.fn()}
        requestedCount={20}
        dictionary={dictionary}
        onApply={onApply}
        onBack={vi.fn()}
      />
    </ProviderRegistry>,
  );
  return { onApply, user: userEvent.setup() };
}

/** Die Zeile eines Kandidaten – über die Checkbox, die seinen Namen trägt. */
function rowOf(word: string): HTMLElement {
  const box = screen.getByRole('checkbox', { name: `${word} übernehmen` });
  const item = box.closest('li');
  if (!item) throw new Error(`Keine Zeile für ${word}`);
  return item;
}

function answerField(word: string): HTMLInputElement {
  return within(rowOf(word)).getByLabelText(`Deutsche Antwort für „${word}“`) as HTMLInputElement;
}

describe('Wörterbuchvorschläge in der Kandidatenprüfung', () => {
  it('erscheinen ohne Zutun, auch ohne Sprachmodell', async () => {
    setup();
    await waitFor(() => expect(within(rowOf('Litter')).getByText('Müll')).toBeInTheDocument());
    expect(within(rowOf('Litter')).getByText('Offline-Wörterbuch')).toBeInTheDocument();
  });

  it('tragen nichts von selbst ein', async () => {
    setup();
    await waitFor(() => expect(within(rowOf('Litter')).getByText('Müll')).toBeInTheDocument());
    // Der Vorschlag steht daneben – das Antwortfeld bleibt leer.
    expect(answerField('Litter').value).toBe('');
  });

  it('nennen Wortart und Genus', async () => {
    setup();
    await waitFor(() => expect(within(rowOf('Litter')).getByText('Müll')).toBeInTheDocument());
    const row = rowOf('Litter');
    expect(within(row).getByText('noun')).toBeInTheDocument();
    expect(within(row).getByText('(der)')).toBeInTheDocument();
  });

  it('übernehmen eine einzelne Bedeutung auf Klick', async () => {
    const { user } = setup();
    await waitFor(() => expect(within(rowOf('Litter')).getByText('Müll')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '„Müll“ als Antwort für Litter einsetzen' }));
    expect(answerField('Litter').value).toBe('Müll');
  });

  it('übernehmen auf Wunsch mehrere Bedeutungen einer Gruppe', async () => {
    const { user } = setup();
    await waitFor(() => expect(within(rowOf('station')).getByText('Bahnhof')).toBeInTheDocument());

    await user.click(
      screen.getByRole('button', { name: /Alle 2 Bedeutungen dieser Gruppe als Antwort für station/ }),
    );
    expect(answerField('station').value).toBe('Bahnhof, Station');
  });

  it('lassen eine getippte Antwort unangetastet', async () => {
    const { user } = setup();
    await waitFor(() => expect(within(rowOf('Litter')).getByText('Müll')).toBeInTheDocument());

    await user.clear(answerField('Litter'));
    await user.type(answerField('Litter'), 'Abfall');
    await user.click(
      screen.getByRole('button', { name: /Eindeutige Wörterbuchvorschläge übernehmen/ }),
    );

    expect(answerField('Litter').value).toBe('Abfall');
  });

  it('kennzeichnen eine markierte Übersetzung sichtbar', async () => {
    setup();
    await waitFor(() =>
      expect(within(rowOf('quiet')).getByText('stillschweigend')).toBeInTheDocument(),
    );
    const row = rowOf('quiet');
    expect(within(row).getByText('dated')).toBeInTheDocument();
    expect(within(row).getByText(/vor der Übernahme prüfen/)).toBeInTheDocument();
  });
});

describe('Sammelübernahme', () => {
  it('nimmt nur eindeutige Ergebnisse und nennt die Zahl vorher', async () => {
    const { user } = setup();
    const knopf = await screen.findByRole('button', {
      name: /Eindeutige Wörterbuchvorschläge übernehmen \(1\)/,
    });

    await user.click(knopf);

    // `litter` ist eindeutig – eine Bedeutung, eine Übersetzung, unmarkiert.
    expect(answerField('Litter').value).toBe('Müll');
    // `neighbourhood` hat zwei Bedeutungen und bleibt offen.
    expect(answerField('neighbourhood').value).toBe('');
    // `station` hat zwei Übersetzungen in einer Bedeutung – auch das ist eine Wahl.
    expect(answerField('station').value).toBe('');
    // `quiet` trägt einen Registermarker und bleibt ebenfalls offen.
    expect(answerField('quiet').value).toBe('');
  });

  it('erscheint gar nicht, wenn es nichts Eindeutiges gibt', async () => {
    const leer = fakeDictionary({ async lookup() { return []; } });
    setup(leer);
    await waitFor(() =>
      expect(screen.getByText(/Das integrierte Offline-Wörterbuch/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /Eindeutige Wörterbuchvorschläge/ }),
    ).not.toBeInTheDocument();
  });
});

describe('Browserhinweis', () => {
  it('sagt, dass das Wörterbuch auch in Safari funktioniert – und was Chrome zusätzlich kann', async () => {
    setup();
    const hinweis = await screen.findByText(/Das integrierte Offline-Wörterbuch funktioniert auch in Safari/);
    expect(hinweis).toBeInTheDocument();
    expect(screen.getByText(/Google Chrome/)).toBeInTheDocument();
    // Keine Behauptung, Chrome könne das überall.
    expect(screen.getByText(/sofern Chrome und das Gerät die lokalen Modelle unterstützen/)).toBeInTheDocument();
  });

  it('steht einmal in der Ansicht, nicht an jeder Zeile', async () => {
    setup();
    await screen.findByText(/Das integrierte Offline-Wörterbuch funktioniert auch in Safari/);
    expect(screen.getAllByText(/funktioniert auch in Safari/)).toHaveLength(1);
  });

  it('bleibt sachlich, wenn das Wörterbuch selbst fehlt', async () => {
    const fehlt = fakeDictionary({ async isAvailable() { return false; } });
    setup(fehlt);
    expect(
      await screen.findByText(/steht hier gerade nicht zur Verfügung/),
    ).toBeInTheDocument();
  });
});

describe('Eingaben während der Suche', () => {
  it('gehen nicht verloren, wenn die Suche erst danach zurückkommt', async () => {
    /*
      Die Suche über alle Kandidaten braucht einen Moment. Wer in diesem Moment
      schon tippt oder anhakt, darf das nicht wieder verlieren – ein früherer
      Entwurf ersetzte am Ende die gesamte Zeilenliste und tat genau das.
    */
    let freigeben: (() => void) | undefined;
    const langsam = fakeDictionary({
      async lookup(word) {
        await new Promise<void>((resolve) => {
          if (freigeben) resolve();
          else freigeben = resolve;
        });
        return BESTAND[word.toLowerCase()] ?? [];
      },
    });

    const { user } = setup(langsam);

    // Vor dem Ergebnis: anhaken und tippen.
    const box = screen.getByRole('checkbox', { name: 'crowded übernehmen' });
    await user.click(box);
    await user.type(answerField('Litter'), 'Abfall');

    freigeben?.();

    await waitFor(() =>
      expect(within(rowOf('station')).getByText('Bahnhof')).toBeInTheDocument(),
    );

    // Beides steht noch da.
    expect((screen.getByRole('checkbox', { name: 'crowded übernehmen' }) as HTMLInputElement).checked)
      .toBe(false);
    expect(answerField('Litter').value).toBe('Abfall');
    // Und die getippte Zeile bekommt gar keinen Vorschlag mehr.
    expect(within(rowOf('Litter')).queryByText('Müll')).not.toBeInTheDocument();
  });
});

describe('Fehler führen zur Handeingabe, nicht zum Abbruch', () => {
  it('lässt die Analyse stehen, wenn eine Suche wirft', async () => {
    const kaputt = fakeDictionary({
      async lookup(word) {
        if (word.toLowerCase() === 'litter') throw new Error('Fach beschädigt');
        return BESTAND[word.toLowerCase()] ?? [];
      },
    });
    const { user } = setup(kaputt);

    // Die anderen Zeilen bekommen ihren Vorschlag.
    await waitFor(() => expect(within(rowOf('station')).getByText('Bahnhof')).toBeInTheDocument());
    // Die kaputte Zeile bleibt leer und tippbar.
    await user.type(answerField('Litter'), 'Müll');
    expect(answerField('Litter').value).toBe('Müll');
  });

  it('gibt die Auswahl unverändert weiter – Vorschläge sind keine Antworten', async () => {
    const { onApply, user } = setup();
    await waitFor(() => expect(within(rowOf('Litter')).getByText('Müll')).toBeInTheDocument());

    await user.type(answerField('Litter'), 'Müll');
    await user.click(screen.getByRole('button', { name: /in die Vorschau übernehmen/ }));

    const selections = onApply.mock.calls.at(-1)?.[0] as CandidateSelection[];
    const litter = selections.find((selection) => selection.candidate.english === 'Litter');
    expect(litter?.german).toBe('Müll');
    // Weder Schwierigkeitsgrad noch Thementags kommen aus dem Wörterbuch.
    expect(litter).not.toHaveProperty('difficulty');
    expect(litter).not.toHaveProperty('topicTags');
  });
});
