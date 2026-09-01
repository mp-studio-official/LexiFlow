import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TextCandidateReview, describeProgress } from './TextCandidateReview';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import { candidatesToDrafts, type CandidateSelection } from '../../import/textDraft';
import { createFakeTranslationProvider } from '../../test/fakeTranslator';
import type { TranslationProvider } from '../../translation/TranslationProvider';
import type { LearningContext } from '../../import/enrichment';
import type { DictionaryProvider } from '../../dictionary/DictionaryProvider';

const TEXT = 'The neighbourhood is crowded. Litter is a problem in the neighbourhood.';

function candidates() {
  return extractTextCandidates(TEXT);
}

const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: '' };

/**
 * Ein Wörterbuch, das nichts weiß.
 *
 * Diese Datei prüft den Ablauf des Empfehlungsschritts und die Anbindung des
 * Sprachmodells – nicht die Wörterbuchanzeige. Ein leerer Bestand hält beides
 * auseinander und macht die Tests schnell.
 */
const LEERES_WOERTERBUCH: DictionaryProvider = {
  id: 'leer',
  label: 'leer',
  async isAvailable() {
    return true;
  },
  async meta() {
    return undefined;
  },
  async lookup() {
    return [];
  },
};

function mount(provider?: TranslationProvider) {
  const onApply = vi.fn();
  const onBack = vi.fn();
  const onContextChange = vi.fn();
  render(
    <ProviderRegistry {...(provider ? { value: { translation: provider } } : {})}>
      <TextCandidateReview
        candidates={candidates()}
        context={CONTEXT}
        onContextChange={onContextChange}
        dictionary={LEERES_WOERTERBUCH}
        onApply={onApply}
        onBack={onBack}
      />
    </ProviderRegistry>,
  );
  return { onApply, onBack, onContextChange, user: userEvent.setup() };
}

/** Aufbauen und einmal empfehlen lassen – der Normalfall dieser Datei. */
async function setup(provider?: TranslationProvider) {
  const mounted = mount(provider);
  const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
  await waitFor(() => expect(knopf).toBeEnabled());
  await mounted.user.selectOptions(screen.getByLabelText('Anzahl'), '20');
  await mounted.user.click(knopf);
  return mounted;
}

function applied(onApply: ReturnType<typeof vi.fn>): CandidateSelection[] {
  return onApply.mock.calls.at(-1)?.[0] as CandidateSelection[];
}

describe('Der Schritt beginnt mit einer Entscheidung, nicht mit einer Liste', () => {
  it('zeigt zuerst die Einstellungen und noch keine Vokabeln', async () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeInTheDocument();
    expect(screen.getByLabelText('Jahrgang')).toBeInTheDocument();
    expect(screen.getByLabelText('GeR-Niveau')).toBeInTheDocument();
    expect(screen.getByLabelText('Sortierung')).toBeInTheDocument();
    expect(screen.getByLabelText('Anzahl')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).not.toBeInTheDocument();
  });

  it('wartet mit der Hauptaktion, bis das Wörterbuch nachgeschlagen hat', async () => {
    /*
      Ob das Wörterbuch ein Wort kennt, ist eines der Merkmale, aus denen die
      Empfehlung entsteht. Vorher zu empfehlen hieße, mit halber Auskunft zu
      entscheiden – deshalb ist die Schaltfläche so lange gesperrt und sagt
      auch, worauf sie wartet.
    */
    mount();
    const knopf = screen.getByRole('button', { name: 'Empfehlungen generieren' });
    expect(knopf).toBeDisabled();
    expect(screen.getByText(/Das Offline-Wörterbuch schlägt gerade nach/)).toBeInTheDocument();
    await waitFor(() => expect(knopf).toBeEnabled());
  });

  it('reicht eine geänderte Einstellung nach oben weiter', async () => {
    const { onContextChange, user } = await setup();
    await user.selectOptions(screen.getByLabelText('Jahrgang'), '9');
    expect(onContextChange).toHaveBeenCalledWith(expect.objectContaining({ grade: '9' }));
  });
});

describe('Empfehlungen statt Häkchen', () => {
  it('kommt ohne Auswahlkästchen aus', async () => {
    await setup();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('zählt ehrlich, was übernommen wird und was offen ist', async () => {
    const { user } = await setup();
    const total = candidates().length;

    expect(screen.getByText(describeProgress(0, total))).toBeInTheDocument();

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    expect(screen.getByText(describeProgress(1, total - 1))).toBeInTheDocument();
  });

  it('formuliert die Zählung im Singular richtig', () => {
    expect(describeProgress(1, 1)).toBe('1 Vokabel wird übernommen · 1 Empfehlung ist noch offen.');
    expect(describeProgress(7, 3)).toBe(
      '7 Vokabeln werden übernommen · 3 Empfehlungen sind noch offen.',
    );
    expect(describeProgress(4, 0)).toBe('4 Vokabeln werden übernommen. Keine Empfehlung ist mehr offen.');
  });

  it('gibt nur die beantworteten Zeilen weiter', async () => {
    const { onApply, user } = await setup();

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    const selections = applied(onApply);
    expect(selections).toHaveLength(1);
    expect(selections[0]?.german).toBe('überfüllt');
    expect(selections[0]?.translationAccepted).toBe(false);
  });

  it('lässt ohne eine einzige Antwort nicht weitergehen', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /prüfen & speichern/ })).toBeDisabled();
  });

  it('zeigt zu jedem Vorschlag den unveränderten Originalsatz', async () => {
    await setup();
    const sentences = [...document.querySelectorAll('.candidate__sentence')].map((element) =>
      (element.textContent ?? '').replace('Originalsatz: ', '').replace(/^„|“$/g, ''),
    );
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) expect(TEXT).toContain(sentence);
  });

  it('gibt die im Schritt gewählte Wortart mit weiter', async () => {
    const { onApply, user } = await setup();

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    await user.selectOptions(screen.getByLabelText('Wortart für „crowded“'), 'adjective');
    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    expect(applied(onApply)[0]?.partOfSpeech).toBe('adjective');
    expect(candidatesToDrafts(applied(onApply))[0]?.partOfSpeech).toBe('adjective');
  });
});

describe('Nachlegen, ohne Arbeit zu verlieren', () => {
  it('ersetzt die offenen Empfehlungen und hebt sie auf', async () => {
    const { user } = await setup();

    await user.selectOptions(screen.getByLabelText('Anzahl'), '5');
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    const vorher = screen.getAllByText(/× im Text/).length;
    await user.click(screen.getByRole('button', { name: /Offene Empfehlungen ersetzen/ }));

    // Die beantwortete Zeile steht noch da …
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
    // … und die ersetzten sind auffindbar, nicht weg.
    const frueher = screen.getByRole('button', { name: /Frühere Empfehlungen/ });
    expect(frueher).toHaveTextContent(String(vorher - 1));
  });

  it('holt eine frühere Empfehlung auf Klick zurück', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Litter entfernen' }));
    expect(screen.queryByLabelText('Deutsche Antwort für „Litter“')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Frühere Empfehlungen/ }));
    await user.click(screen.getByRole('button', { name: 'Litter wieder aufnehmen' }));

    expect(screen.getByLabelText('Deutsche Antwort für „Litter“')).toBeInTheDocument();
  });

  it('hält die früheren Empfehlungen eingeklappt, bis jemand sie sehen will', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Litter entfernen' }));

    const knopf = screen.getByRole('button', { name: /Frühere Empfehlungen/ });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Litter wieder aufnehmen' })).not.toBeInTheDocument();

    await user.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
  });

  it('lässt beantwortete Zeilen beim Neuberechnen stehen', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    await user.selectOptions(screen.getByLabelText('Sortierung'), 'frequency');
    await user.click(screen.getByRole('button', { name: 'Empfehlungen neu berechnen' }));

    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });
});

describe('Empfehlungsschritt ohne Übersetzungs-Anbieter', () => {
  it('bleibt vollständig benutzbar', async () => {
    await setup();
    expect(
      await screen.findByText(/Dieser Browser bietet keine lokale Übersetzung/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vorschläge für offene/ })).not.toBeInTheDocument();
  });
});

describe('Empfehlungsschritt mit Übersetzungs-Anbieter', () => {
  it('lädt das Modell erst nach einem ausdrücklichen Klick', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider();
    const { user } = await setup(provider);

    const button = await screen.findByRole('button', {
      name: 'Sprachmodell laden und Vorschläge erzeugen',
    });
    expect(prepareCount()).toBe(0);

    await user.click(button);
    await waitFor(() => expect(prepareCount()).toBe(1));
  });

  it('nennt vor der Nutzung ehrlich, wohin die Daten gehen', async () => {
    const { provider } = createFakeTranslationProvider();
    await setup(provider);
    expect(await screen.findByText(provider.info.dataNotice)).toBeInTheDocument();
    expect(screen.getAllByText(/ungeprüft/).length).toBeGreaterThan(0);
  });

  it('übernimmt einen Vorschlag nie von selbst', async () => {
    const { provider } = createFakeTranslationProvider();
    const { onApply, user } = await setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();

    // Das Eingabefeld bleibt leer, bis die Lehrkraft übernimmt.
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));
    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('crowded-de');

    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    const selections = applied(onApply);
    const crowded = selections.find((item) => item.candidate.english === 'crowded');
    expect(crowded?.translationAccepted).toBe(true);
    expect(candidatesToDrafts([crowded!])[0]?.sourceType).toBe('text-ai');
  });

  it('zeigt den Ladefortschritt an', async () => {
    const { provider } = createFakeTranslationProvider({ progress: [0.5] });
    const { user } = await setup(provider);
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    // Nach Abschluss verschwindet die Anzeige wieder.
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  });

  it('hält einen Fehler bei der einzelnen Vokabel und bietet Wiederholung an', async () => {
    const { provider } = createFakeTranslationProvider({ failFor: ['crowded'] });
    const { user } = await setup(provider);

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

  it('übersetzt nur die offenen Empfehlungen', async () => {
    /*
      Eine Zeile, die schon eine Antwort trägt, braucht keinen Vorschlag. Sie
      trotzdem zu übersetzen kostet Rechenzeit und stellt einen maschinellen
      Vorschlag neben eine bereits getroffene Entscheidung.
    */
    const { provider, translated } = createFakeTranslationProvider();
    const { user } = await setup(provider);

    await user.type(screen.getByLabelText('Deutsche Antwort für „neighbourhood“'), 'Viertel');
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );

    await screen.findByText('crowded-de');
    expect(translated).not.toContain('neighbourhood');
  });

  it('macht eine bearbeitete Übernahme wieder zu einer eigenen Antwort', async () => {
    const { provider } = createFakeTranslationProvider();
    const { onApply, user } = await setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    await screen.findByText('crowded-de');
    await user.click(screen.getByRole('button', { name: 'Vorschlag für crowded übernehmen' }));
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), '!');

    await user.click(screen.getByRole('button', { name: /prüfen & speichern/ }));

    const crowded = applied(onApply).find((item) => item.candidate.english === 'crowded');
    expect(crowded?.translationAccepted).toBe(false);
  });
});

describe('Verfügbarkeit ist nicht Initialisierung', () => {
  it('bereitet auch bei „available“ genau einmal vor und übersetzt dann', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({ availability: 'available' });
    const { user } = await setup(provider);

    const button = await screen.findByRole('button', {
      name: 'Vorschläge für offene Empfehlungen erzeugen',
    });
    expect(prepareCount()).toBe(0);

    await user.click(button);

    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lässt „downloading“ nicht in einem toten Zustand hängen', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({
      availability: 'downloading',
    });
    const { user } = await setup(provider);

    const button = await screen.findByRole('button', {
      name: 'Laden abwarten und Vorschläge erzeugen',
    });
    expect(button).toBeEnabled();
    expect(screen.getByText(/Der Browser lädt das Sprachmodell gerade herunter/)).toBeInTheDocument();

    await user.click(button);

    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(1);
  });

  it('bereitet für denselben Anbieter kein zweites Mal vor', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({ availability: 'available' });
    const { user } = await setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'Vorschläge für offene Empfehlungen erzeugen' }),
    );
    await screen.findByText('crowded-de');

    await user.click(
      screen.getByRole('button', { name: 'Vorschläge für offene Empfehlungen erzeugen' }),
    );
    await waitFor(() => expect(screen.getAllByText(/-de$/).length).toBeGreaterThan(0));

    expect(prepareCount()).toBe(1);
  });

  it('gilt nach einem gescheiterten prepare nicht als vorbereitet', async () => {
    let attempts = 0;
    const { provider } = createFakeTranslationProvider({ availability: 'available' });
    const failing: typeof provider = {
      ...provider,
      prepare: (source, target, onProgress, signal) => {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new Error('Download unterbrochen'));
        return provider.prepare(source, target, onProgress, signal);
      },
    };
    const { user } = await setup(failing);

    await user.click(
      await screen.findByRole('button', { name: 'Vorschläge für offene Empfehlungen erzeugen' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/Download unterbrochen/);

    // Die Schaltfläche bleibt benutzbar und der zweite Versuch bereitet erneut vor.
    await user.click(
      within(screen.getByRole('alert')).getByRole('button', { name: 'Erneut versuchen' }),
    );
    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('ruft ohne Klick niemals prepare auf', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({ availability: 'available' });
    await setup(provider);
    await screen.findByRole('button', { name: 'Vorschläge für offene Empfehlungen erzeugen' });
    expect(prepareCount()).toBe(0);
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
