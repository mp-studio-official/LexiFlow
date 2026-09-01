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
 * Der Empfehlungsschritt mit Offline-Wörterbuch – im Zustand „Safari“:
 * kein Übersetzungs-Anbieter, kein Sprachmodell, keine Netzverbindung.
 *
 * Der `ProviderRegistry` bekommt **keinen** Übersetzer; damit meldet die
 * Verfügbarkeitsprüfung `unavailable`, und genau das ist der Fall, den dieser
 * Weg verlässlich machen soll.
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

function mount(dictionary: DictionaryProvider = fakeDictionary()) {
  const onApply = vi.fn();
  render(
    <ProviderRegistry>
      <TextCandidateReview
        candidates={extractTextCandidates(TEXT)}
        context={CONTEXT}
        onContextChange={vi.fn()}
        dictionary={dictionary}
        onApply={onApply}
        onBack={vi.fn()}
      />
    </ProviderRegistry>,
  );
  return { onApply, user: userEvent.setup() };
}

/**
 * Der ganze Schritt in einem Aufruf: warten, bis das Wörterbuch fertig ist,
 * die Anzahl hochsetzen und einmal empfehlen lassen.
 *
 * Die Anzahl steht bewusst auf 20: Diese Tests prüfen die Wörterbuchanzeige,
 * nicht die Rangfolge – jeder Kandidat des Textes soll dabei sein.
 */
async function setup(dictionary?: DictionaryProvider) {
  const mounted = mount(dictionary ?? fakeDictionary());
  const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
  await waitFor(() => expect(knopf).toBeEnabled());
  await mounted.user.selectOptions(screen.getByLabelText('Anzahl'), '20');
  await mounted.user.click(knopf);
  return mounted;
}

/** Die Zeile eines Kandidaten – über das Antwortfeld, das seinen Namen trägt. */
function rowOf(word: string): HTMLElement {
  const field = screen.getByLabelText(`Deutsche Antwort für „${word}“`);
  const item = field.closest('li');
  if (!item) throw new Error(`Keine Zeile für ${word}`);
  return item;
}

function answerField(word: string): HTMLInputElement {
  return screen.getByLabelText(`Deutsche Antwort für „${word}“`) as HTMLInputElement;
}

describe('Wörterbuchvorschläge im Empfehlungsschritt', () => {
  it('erscheinen ohne Zutun, auch ohne Sprachmodell', async () => {
    await setup();
    expect(within(rowOf('litter')).getByText('Müll')).toBeInTheDocument();
    expect(within(rowOf('litter')).getByText('Offline-Wörterbuch')).toBeInTheDocument();
  });

  it('tragen nichts von selbst ein', async () => {
    await setup();
    // Der Vorschlag steht daneben – das Antwortfeld bleibt leer.
    expect(answerField('litter').value).toBe('');
  });

  it('nennen Wortart und Genus', async () => {
    await setup();
    const row = rowOf('litter');
    expect(within(row).getByText('noun')).toBeInTheDocument();
    expect(within(row).getByText('(der)')).toBeInTheDocument();
  });

  it('füllen die Wortart der Zeile vor, wenn sie eindeutig ist', async () => {
    await setup();
    expect(screen.getByLabelText('Wortart für „litter“')).toHaveValue('noun');
    expect(screen.getByLabelText('Wortart für „quiet“')).toHaveValue('adjective');
    // Ohne Treffer bleibt sie leer statt geraten.
    expect(screen.getByLabelText('Wortart für „crowded“')).toHaveValue('');
  });

  it('übernehmen eine einzelne Bedeutung auf Klick', async () => {
    const { user } = await setup();
    await user.click(
      screen.getByRole('button', { name: '„Müll“ als Antwort für litter einsetzen' }),
    );
    expect(answerField('litter').value).toBe('Müll');
  });

  it('übernehmen auf Wunsch mehrere Bedeutungen einer Gruppe', async () => {
    const { user } = await setup();
    await user.click(
      screen.getByRole('button', {
        name: /Alle 2 Bedeutungen dieser Gruppe als Antwort für station/,
      }),
    );
    expect(answerField('station').value).toBe('Bahnhof, Station');
  });

  it('lassen eine getippte Antwort unangetastet', async () => {
    const { user } = await setup();

    await user.type(answerField('litter'), 'Abfall');
    await user.click(screen.getByRole('button', { name: 'Übersetzungsvorschläge eintragen' }));

    expect(answerField('litter').value).toBe('Abfall');
  });

  it('kennzeichnen eine markierte Übersetzung sichtbar', async () => {
    await setup();
    const row = rowOf('quiet');
    expect(within(row).getByText('stillschweigend')).toBeInTheDocument();
    expect(within(row).getByText('dated')).toBeInTheDocument();
    expect(within(row).getByText(/vor der Übernahme prüfen/)).toBeInTheDocument();
  });
});

describe('Übersetzungsvorschläge eintragen', () => {
  it('trägt ein, was ohne Rückfrage geht, und lässt den Rest offen', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Übersetzungsvorschläge eintragen' }));

    // `litter`: eine Bedeutung, eine unmarkierte Übersetzung.
    expect(answerField('litter').value).toBe('Müll');
    // `station`: zwei Entsprechungen **einer** Bedeutung – Alternativen.
    expect(answerField('station').value).toBe('Bahnhof, Station');
    // `neighbourhood`: zwei Bedeutungen. Über Bedeutungen hinweg wird nie
    // verbunden, deshalb steht hier die erste – und nur die.
    expect(answerField('neighbourhood').value).toBe('Nachbarschaft');
    // `quiet`: nur ein veralteter Treffer. Bleibt leer.
    expect(answerField('quiet').value).toBe('');
  });

  it('sagt hinterher, was liegen geblieben ist', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Übersetzungsvorschläge eintragen' }));
    const meldung = screen
      .getAllByRole('status')
      .map((element) => element.textContent ?? '')
      .join(' ');
    expect(meldung).toMatch(/3 Übersetzungen eingetragen/);
    expect(meldung).toMatch(/mehrdeutig oder markiert/);
  });
});

describe('Browserhinweis', () => {
  it('sagt, dass das Wörterbuch auch in Safari funktioniert – und was Chrome zusätzlich kann', async () => {
    mount();
    const hinweis = await screen.findByText(
      /Das integrierte Offline-Wörterbuch funktioniert auch in Safari/,
    );
    expect(hinweis).toBeInTheDocument();
    expect(screen.getByText(/Google Chrome/)).toBeInTheDocument();
    // Keine Behauptung, Chrome könne das überall.
    expect(
      screen.getByText(/sofern Chrome und das Gerät die lokalen Modelle unterstützen/),
    ).toBeInTheDocument();
  });

  it('steht einmal in der Ansicht, nicht an jeder Zeile', async () => {
    await setup();
    expect(screen.getAllByText(/funktioniert auch in Safari/)).toHaveLength(1);
  });

  it('bleibt sachlich, wenn das Wörterbuch selbst fehlt', async () => {
    const fehlt = fakeDictionary({
      async isAvailable() {
        return false;
      },
    });
    mount(fehlt);
    expect(await screen.findByText(/steht hier gerade nicht zur Verfügung/)).toBeInTheDocument();
  });

  it('sperrt die Hauptaktion nicht, wenn das Wörterbuch gar nicht antwortet', async () => {
    /*
      Ohne Wörterbuch sind die Empfehlungen schlechter – aber es gibt sie. Ein
      Anbieter, der beim Prüfen wirft, darf den Schritt nicht verriegeln.
    */
    const kaputt = fakeDictionary({
      isAvailable() {
        return Promise.reject(new Error('Datei beschädigt'));
      },
    });
    mount(kaputt);
    const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
    await waitFor(() => expect(knopf).toBeEnabled());
  });
});

describe('Fehler führen zur Handeingabe, nicht zum Abbruch', () => {
  it('lässt die Empfehlungen stehen, wenn eine Suche wirft', async () => {
    const kaputt = fakeDictionary({
      async lookup(word) {
        if (word.toLowerCase() === 'litter') throw new Error('Fach beschädigt');
        return BESTAND[word.toLowerCase()] ?? [];
      },
    });
    const { user } = await setup(kaputt);

    // Die anderen Zeilen bekommen ihren Vorschlag.
    expect(within(rowOf('station')).getByText('Bahnhof')).toBeInTheDocument();
    /*
      Die kaputte Zeile bleibt leer und tippbar – und behält die Schreibung des
      Satzanfangs: Ohne Wörterbuchauskunft gibt es keinen Beleg dafür, dass
      `Litter` kleingeschrieben gehört. Geraten wird nicht.
    */
    await user.type(answerField('Litter'), 'Müll');
    expect(answerField('Litter').value).toBe('Müll');
  });

  it('gibt die Auswahl unverändert weiter – Vorschläge sind keine Antworten', async () => {
    const { onApply, user } = await setup();

    await user.type(answerField('litter'), 'Müll');
    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    const selections = onApply.mock.calls.at(-1)?.[0] as CandidateSelection[];
    // Nur die beantwortete Zeile geht weiter.
    expect(selections).toHaveLength(1);
    const litter = selections[0];
    /*
      Kleingeschrieben: `Litter` steht im Text nur am Satzanfang, und das
      Wörterbuch führt das Wort klein. Die Empfehlung normalisiert das, bevor
      der Kandidat weitergereicht wird – sonst lernte jemand die Vokabel in der
      Schreibung eines Satzanfangs.
    */
    expect(litter?.candidate.english).toBe('litter');
    expect(litter?.german).toBe('Müll');
    // Weder Schwierigkeitsgrad noch Thementags kommen aus dem Wörterbuch.
    expect(litter).not.toHaveProperty('difficulty');
    expect(litter).not.toHaveProperty('topicTags');
  });
});
