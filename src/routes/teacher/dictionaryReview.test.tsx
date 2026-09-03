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

/**
 * Die vollständige Wörterbuchauskunft einer Zeile aufklappen.
 *
 * Seit 4B.2 stehen in der Karte selbst nur zwei bis drei Chips; Wortart,
 * Genus, Markierungen und Herkunft liegen einen Klick tief. Versteckt ist
 * nichts – der Aufklapper ist benannt und nennt die Zahl.
 */
async function openSenses(
  user: ReturnType<typeof userEvent.setup>,
  word: string,
): Promise<HTMLElement> {
  const row = rowOf(word);
  await user.click(within(row).getByRole('button', { name: /Bedeutungen anzeigen/ }));
  return rowOf(word);
}

describe('Wörterbuchvorschläge im Empfehlungsschritt', () => {
  it('erscheinen ohne Zutun, auch ohne Sprachmodell', async () => {
    await setup();
    // Der Chip steht in der Karte, und daneben steht, woher er kommt.
    expect(
      within(rowOf('litter')).getByRole('button', {
        name: '„Müll“ als Antwort für litter einsetzen',
      }),
    ).toBeInTheDocument();
    expect(within(rowOf('litter')).getByText(/Wörterbuch/)).toBeInTheDocument();
  });

  it('tragen ein, was ohne Rückfrage feststeht', async () => {
    /*
      Umgekehrt zu 4B.3: Bis dahin blieb jedes Feld leer, bis jemand
      „Übersetzungsvorschläge eintragen“ drückte. Dieser Knopf war ein
      Zwischenschritt, den man in jedem Durchgang als Erstes traf – also keine
      Wahl, sondern eine Frage ohne zweite Antwort.

      Was **ohne Rückfrage** feststeht, steht jetzt gleich da. Der Maßstab
      dafür ist unverändert eng (siehe `safeAutoAnswer`): genau eine Wortart,
      genau eine Bedeutung, keine Markierung, kein Querverweis.
    */
    await setup();
    expect(answerField('litter').value).toBe('Müll');
  });

  it('lassen leer, was eine Entscheidung braucht', async () => {
    await setup();
    // `quiet`: nur ein veralteter Treffer. Der Chip steht daneben, das Feld
    // bleibt leer – markierte Entsprechungen setzt niemand ungefragt ein.
    expect(answerField('quiet').value).toBe('');
    // `crowded`: kein Treffer.
    expect(answerField('crowded').value).toBe('');
  });

  it('nennen Wortart und Genus – einen Klick tief', async () => {
    const { user } = await setup();
    const row = await openSenses(user, 'litter');
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
    await openSenses(user, 'station');
    await user.click(
      screen.getByRole('button', {
        name: /Alle 2 Bedeutungen dieser Gruppe als Antwort für station/,
      }),
    );
    // Semikolon: zwei Antworten, die beide zählen – kein Komma in einer.
    expect(answerField('station').value).toBe('Bahnhof; Station');
  });

  it('bringen die Wortart mit, wenn eine gewählt wird', async () => {
    /*
      Wer „Bahnhof“ anklickt, hat damit auch gesagt, dass es ein Substantiv
      ist. Dieselbe Auskunft noch einmal von Hand treffen zu lassen wäre Arbeit
      ohne Erkenntnis. Überschrieben wird dabei nichts: Steht in der Wortart
      schon etwas, bleibt es stehen.
    */
    const { user } = await setup();
    const wortart = screen.getByLabelText('Wortart für „crowded“');
    expect(wortart).toHaveValue('');

    await user.click(
      screen.getByRole('button', { name: '„Müll“ als Antwort für litter einsetzen' }),
    );
    expect(screen.getByLabelText('Wortart für „litter“')).toHaveValue('noun');
  });

  it('lassen eine getippte Antwort unangetastet', async () => {
    /*
      Die Zusage gilt auch ohne den alten Sammelknopf: Eingetragen wird nur in
      **leere** Felder, und zwar einmal beim Empfehlen. Wer danach etwas
      hineinschreibt, behält es – auch über einen zweiten Lauf hinweg.
    */
    const { user } = await setup();

    await user.clear(answerField('litter'));
    await user.type(answerField('litter'), 'Abfall');
    await user.click(screen.getByRole('button', { name: /Offene Empfehlungen neu berechnen/ }));

    expect(answerField('litter').value).toBe('Abfall');
  });

  it('kennzeichnen eine markierte Übersetzung sichtbar', async () => {
    const { user } = await setup();
    const row = await openSenses(user, 'quiet');
    // Zweimal da – als Chip in der Karte und in der aufgeklappten Auskunft.
    expect(within(row).getAllByText('stillschweigend').length).toBeGreaterThan(0);
    expect(within(row).getByText('dated')).toBeInTheDocument();
    expect(within(row).getByText(/vor der Übernahme prüfen/)).toBeInTheDocument();
  });
});

describe('Was ohne Rückfrage eingetragen wird', () => {
  /*
    Die Regeln sind dieselben wie vorher – nur ohne Knopf davor. Sie stehen
    hier weiterhin einzeln, weil jede an einem echten Beispiel entstanden ist.
  */
  it('trägt ein, was ohne Rückfrage geht, und lässt den Rest offen', async () => {
    await setup();

    // `litter`: eine Bedeutung, eine unmarkierte Übersetzung.
    expect(answerField('litter').value).toBe('Müll');
    // `station`: zwei Entsprechungen **einer** Bedeutung – Alternativen.
    expect(answerField('station').value).toBe('Bahnhof; Station');
    // `neighbourhood`: zwei Bedeutungen. Welche im Text gemeint ist, weiß das
    // Wörterbuch nicht. Automatisch die erste zu nehmen sähe von außen genauso
    // aus wie ein sicherer Treffer – deshalb bleibt das Feld leer und die
    // Bedeutungen stehen als Chips zur Auswahl.
    expect(answerField('neighbourhood').value).toBe('');
    // `quiet`: nur ein veralteter Treffer. Bleibt leer.
    expect(answerField('quiet').value).toBe('');
  });

  it('sagt, wie viele eingetragen wurden', async () => {
    await setup();
    const meldung = screen
      .getAllByRole('status')
      .map((element) => element.textContent ?? '')
      .join(' ');
    expect(meldung).toMatch(/2 Übersetzungen aus dem Wörterbuch eingetragen/);
    expect(meldung).toMatch(/bitte durchsehen/);
  });

  it('bietet den alten Sammelknopf nicht mehr an', () => {
    // Er hätte nichts mehr zu tun – und ein Knopf ohne Wirkung ist schlimmer
    // als keiner.
    expect(
      screen.queryByRole('button', { name: 'Übersetzungsvorschläge eintragen' }),
    ).not.toBeInTheDocument();
  });
});

describe('Browserhinweis', () => {
  /*
    Der Hinweis stand bis 4B.1 als Kasten **über** den Ergebnissen. Seit 4B.2
    liegt er unter ihnen in einem zugeklappten, benannten Aufklapper: Beim
    ersten Mal liest man so etwas, beim dritten scrollt man daran vorbei – und
    scrollt dabei über die Empfehlungen hinaus, um die es geht.
  */
  async function openHinweis(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole('button', { name: /Woher die Vorschläge kommen/ }));
  }

  it('sagt, dass das Wörterbuch auch in Safari funktioniert – und was Chrome zusätzlich kann', async () => {
    const { user } = await setup();
    await openHinweis(user);

    expect(
      screen.getByText(/Das integrierte Offline-Wörterbuch funktioniert auch in Safari/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google Chrome/)).toBeInTheDocument();
    // Keine Behauptung, Chrome könne das überall.
    expect(
      screen.getByText(/sofern Chrome und das Gerät die lokalen Modelle unterstützen/),
    ).toBeInTheDocument();
  });

  it('steht einmal in der Ansicht, nicht an jeder Zeile', async () => {
    const { user } = await setup();
    await openHinweis(user);
    expect(screen.getAllByText(/funktioniert auch in Safari/)).toHaveLength(1);
  });

  it('ist zugeklappt, bis jemand ihn öffnet', async () => {
    await setup();
    const knopf = screen.getByRole('button', { name: /Woher die Vorschläge kommen/ });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    // Zu heißt zu: Auch eine Vorlesehilfe findet den Text dann nicht.
    expect(screen.queryByText(/funktioniert auch in Safari/)).not.toBeInTheDocument();
  });

  it('bleibt sachlich, wenn das Wörterbuch selbst fehlt', async () => {
    const fehlt = fakeDictionary({
      async isAvailable() {
        return false;
      },
    });
    const { user } = await setup(fehlt);
    await openHinweis(user);
    expect(screen.getByText(/steht hier gerade nicht zur Verfügung/)).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    const selections = onApply.mock.calls.at(-1)?.[0] as CandidateSelection[];
    /*
      Seit 4B.4 stehen die sicheren Wörterbuchantworten schon da, also gehen
      zwei Zeilen weiter statt einer: `litter` und `station`.
      `neighbourhood` (zwei Bedeutungen, keine automatisch gewählt), `quiet`
      (nur markiert) und `crowded` (kein Treffer) bleiben offen.
    */
    expect(selections.map((selection) => selection.candidate.english).sort()).toEqual([
      'litter',
      'station',
    ]);
    const litter = selections.find((selection) => selection.candidate.english === 'litter');
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
