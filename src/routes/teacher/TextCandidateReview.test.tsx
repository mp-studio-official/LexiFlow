import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SENTENCE_CLAMP_CHARS,
  TextCandidateReview,
  describeProgress,
} from './TextCandidateReview';
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

function mount(provider?: TranslationProvider, dictionary: DictionaryProvider = LEERES_WOERTERBUCH) {
  const onApply = vi.fn();
  const onBack = vi.fn();
  const onContextChange = vi.fn();
  render(
    <ProviderRegistry {...(provider ? { value: { translation: provider } } : {})}>
      <TextCandidateReview
        candidates={candidates()}
        context={CONTEXT}
        onContextChange={onContextChange}
        dictionary={dictionary}
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

/**
 * Sprint 4B.3: Die Werkbank – links die Quelle, rechts das Ergebnis.
 *
 * Wie breit die Spalten werden, prüft `SplitPane.test.tsx`; wie sie sich auf
 * schmalen Fenstern stapeln, prüft niemand in jsdom (dort gibt es keine
 * Medienabfragen). Hier geht es nur um das Inhaltliche: dass der analysierte
 * Text in dieser Ansicht **ansprechbar** ist – und dass sie ohne ihn nicht
 * kaputtgeht, sondern eine Spalte weniger hat.
 */
describe('Die Quellspalte', () => {
  it('zeigt den analysierten Text zum Nachschlagen', () => {
    render(
      <TextCandidateReview
        candidates={candidates()}
        context={CONTEXT}
        onContextChange={vi.fn()}
        dictionary={LEERES_WOERTERBUCH}
        sourceText="Coastal erosion threatens the settlement."
        onApply={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const quelle = screen.getByRole('region', { name: 'Analysierter Text' });
    expect(quelle).toHaveTextContent('Coastal erosion threatens the settlement.');
  });

  it('kommt ohne Quelltext aus, statt einen leeren Kasten zu zeigen', () => {
    mount();
    expect(screen.queryByRole('region', { name: 'Analysierter Text' })).not.toBeInTheDocument();
    // Die Einstellungen stehen trotzdem da – die Spalte fällt nicht weg.
    expect(screen.getByLabelText('Jahrgang')).toBeInTheDocument();
  });

  it('macht die Spaltenbreite verstellbar', () => {
    mount();
    expect(
      screen.getByRole('separator', { name: 'Breite der Quellspalte' }),
    ).toBeInTheDocument();
  });
});

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

  it('bietet alle vier Sortierungen an', async () => {
    await setup();
    const auswahl = screen.getByLabelText('Sortierung');
    for (const name of [
      'Empfehlung',
      'Anspruchsvollste zuerst',
      'Häufigkeit im Text',
      'Reihenfolge im Text',
    ]) {
      expect(within(auswahl).getByRole('option', { name })).toBeInTheDocument();
    }
    expect(within(auswahl).getAllByRole('option')).toHaveLength(4);
    // Vorbelegt ist die Empfehlung – das ist der Sinn dieses Schritts.
    expect(auswahl).toHaveValue('recommended');
  });

  it('bietet die Anzahlen 5, 10, 15 und 20 an', async () => {
    await setup();
    const auswahl = screen.getByLabelText('Anzahl');
    for (const wert of ['5', '10', '15', '20']) {
      expect(within(auswahl).getByRole('option', { name: `${wert} Vokabeln` })).toBeInTheDocument();
    }
    expect(within(auswahl).getAllByRole('option')).toHaveLength(4);
  });

  it('erzeugt genau so viele Empfehlungen, wie eingestellt sind', async () => {
    const viele = extractTextCandidates(
      'Coastal erosion threatens the settlement. Evacuation of residents demonstrates ' +
        'the resilience of the local infrastructure. Bombardment and regulation followed.',
    );
    render(
      <ProviderRegistry>
        <TextCandidateReview
          candidates={viele}
          context={CONTEXT}
          onContextChange={vi.fn()}
          dictionary={LEERES_WOERTERBUCH}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />
      </ProviderRegistry>,
    );
    const user = userEvent.setup();
    const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
    await waitFor(() => expect(knopf).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Anzahl'), '5');
    await user.click(knopf);

    expect(screen.getByRole('heading', { name: 'Vorgeschlagene Vokabeln (5)' })).toBeInTheDocument();
  });
});

describe('Der Themenvorschlag', () => {
  function mountWithTopic(suggested: string, source: 'heading' | 'frequency' | 'none') {
    render(
      <ProviderRegistry>
        <TextCandidateReview
          candidates={candidates()}
          context={CONTEXT}
          onContextChange={vi.fn()}
          suggestedTopic={suggested}
          topicSource={source}
          dictionary={LEERES_WOERTERBUCH}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />
      </ProviderRegistry>,
    );
  }

  it('sagt, dass er aus der Überschrift stammt', () => {
    mountWithTopic('Coastal Erosion in Cornwall', 'heading');
    expect(screen.getByLabelText('Thema')).toHaveAccessibleDescription(
      /Aus der Überschrift des Textes vorgeschlagen: „Coastal Erosion in Cornwall“/,
    );
  });

  it('sagt, dass er aus den häufigsten Begriffen stammt', () => {
    mountWithTopic('Erosion und Settlement', 'frequency');
    expect(screen.getByLabelText('Thema')).toHaveAccessibleDescription(
      /häufigsten Begriffen des Textes vorgeschlagen/,
    );
  });

  it('sagt es auch, wenn nichts herausstach', () => {
    /*
      Der wichtigste Fall. Ein erfundenes Thema kostet Vertrauen und muss
      weggeklickt werden; ein leeres Feld mit einer Erklärung kostet nichts.
    */
    mountWithTopic('', 'none');
    expect(screen.getByLabelText('Thema')).toHaveValue('');
    expect(screen.getByLabelText('Thema')).toHaveAccessibleDescription(
      /ließ sich kein Thema ableiten/,
    );
  });

  it('bleibt ein ganz normales, editierbares Feld', async () => {
    const onContextChange = vi.fn();
    render(
      <ProviderRegistry>
        <TextCandidateReview
          candidates={candidates()}
          context={CONTEXT}
          onContextChange={onContextChange}
          suggestedTopic="Coastal Erosion"
          topicSource="heading"
          dictionary={LEERES_WOERTERBUCH}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />
      </ProviderRegistry>,
    );
    await userEvent.type(screen.getByLabelText('Thema'), 'X');
    expect(onContextChange).toHaveBeenCalledWith(expect.objectContaining({ topic: 'X' }));
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
    /*
      Zweimal dieselbe Frage heißt: „gib mir andere Wörter“.

      Seit 4B.2 gibt es dafür **einen** Knopf statt zweier. Was er tut, hängt
      daran, ob sich seit dem letzten Lauf etwas an den Einstellungen geändert
      hat – hier hat es das nicht, also werden die offenen Plätze mit anderen
      Wörtern besetzt.
    */
    const { user } = await setup();

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    const vorher = screen.getAllByText(/× im Text/).length;
    await user.click(screen.getByRole('button', { name: /Offene Empfehlungen neu berechnen/ }));

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
    await user.click(screen.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }));

    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  it('nennt die echte Anzahl, wenn der Text nichts mehr hergibt', async () => {
    /*
      Der Text hat vier Kandidaten und alle stehen schon da. Ein „3 neue
      Empfehlungen“ wäre hier eine Lüge; es kommt keine einzige.
    */
    const { user } = await setup();
    // Unveränderte Einstellungen: Es sollen ausdrücklich **andere** Wörter kommen.
    await user.click(screen.getByRole('button', { name: /Offene Empfehlungen neu berechnen/ }));

    const meldung = screen
      .getAllByRole('status')
      .map((element) => element.textContent ?? '')
      .join(' ');
    expect(meldung).toMatch(/keine weiteren Vokabeln her/);
  });

  it('sagt beim Wiederaufnehmen, dass die Liste dadurch wächst', async () => {
    /*
      Zurückholen verdrängt nichts – es legt oben drauf. Wer nach dem
      Wiederaufnehmen elf statt zehn Zeilen hat, soll das gelesen haben und
      nicht selbst nachzählen müssen.
    */
    const { user } = await setup();
    await user.selectOptions(screen.getByLabelText('Anzahl'), '5');
    await user.click(screen.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }));

    const vorher = screen.getAllByText(/× im Text/).length;
    await user.click(screen.getByRole('button', { name: 'Litter entfernen' }));
    await user.click(screen.getByRole('button', { name: /Frühere Empfehlungen/ }));
    await user.click(screen.getByRole('button', { name: 'Litter wieder aufnehmen' }));

    expect(screen.getAllByText(/× im Text/).length).toBe(vorher);
    const meldung = screen
      .getAllByRole('status')
      .map((element) => element.textContent ?? '')
      .join(' ');
    expect(meldung).toMatch(/wieder aufgenommen/);
  });
});

describe('Der Wörterbuchlauf kommt niemandem in die Quere', () => {
  it('sperrt die Hauptaktion, solange nachgeschlagen wird', async () => {
    /*
      Das ist die Absicherung gegen das alte Problem: Ein Wörterbuchergebnis,
      das nach dem Empfehlen eintrifft, dürfte Zeilen nicht mehr anfassen.
      Gelöst ist es nicht durch Zusammenführen, sondern durch Reihenfolge – die
      Suche ist fertig, bevor es überhaupt Zeilen gibt.
    */
    let freigeben = (): void => undefined;
    const tor = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    const langsam: DictionaryProvider = {
      ...LEERES_WOERTERBUCH,
      async lookup() {
        await tor;
        return [];
      },
    };

    const { user } = mount(undefined, langsam);
    const knopf = screen.getByRole('button', { name: 'Empfehlungen generieren' });
    expect(knopf).toBeDisabled();
    expect(screen.getByText(/Das Offline-Wörterbuch schlägt gerade nach/)).toBeInTheDocument();

    freigeben();
    await waitFor(() => expect(knopf).toBeEnabled());

    await user.click(knopf);
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    // Und nichts kommt später und schreibt darüber.
    await waitFor(() =>
      expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt'),
    );
  });

  it('überschreibt eine getippte Antwort auch nicht mit einem Modellvorschlag', async () => {
    const { provider } = createFakeTranslationProvider();
    const { user } = await setup(provider);

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'meine Antwort');
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    await screen.findByText('neighbourhood-de');

    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('meine Antwort');
  });
});

describe('Empfehlungsschritt ohne Übersetzungs-Anbieter', () => {
  it('bleibt vollständig benutzbar', async () => {
    const { user } = await setup();

    // Ohne Anbieter gibt es die Aktion gar nicht – auch nicht gesperrt.
    expect(screen.queryByRole('button', { name: /KI-Vorschläge für offene/ })).not.toBeInTheDocument();

    /*
      Die Begründung steht seit 4B.2 unter den Ergebnissen im Aufklapper und
      nicht mehr als Kasten davor. Sie ist da – man muss sie nur nicht mehr
      jedes Mal überscrollen.
    */
    await user.click(
      screen.getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ }),
    );
    expect(
      await screen.findByText(/Dieser Browser bietet keine lokale Übersetzung/),
    ).toBeInTheDocument();
  });

  it('sagt unter den Ergebnissen, woher die Vorschläge kommen', async () => {
    const { user } = await setup();

    const aufklapper = screen.getByRole('button', { name: /Woher die Vorschläge kommen/ });
    expect(aufklapper).toHaveAttribute('aria-expanded', 'false');

    await user.click(aufklapper);
    expect(aufklapper).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/auch in Safari/)).toBeInTheDocument();
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
    /*
      „Vor der Nutzung“ heißt seit 4B.2: an derselben Stelle erreichbar wie die
      Aktion, nicht als zwanzig Zeilen vor jedem Ergebnis. Der Aufklapper ist
      zu – aber er ist benannt, und was in ihm steht, hat sich nicht geändert.
    */
    const { provider } = createFakeTranslationProvider();
    const { user } = await setup(provider);

    await user.click(
      screen.getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ }),
    );
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

    await user.click(screen.getByRole('button', { name: /Vorschlag .+ für crowded übernehmen/ }));
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
    /*
      Nach Abschluss verschwindet die Anzeige wieder.

      Seit 4B.3 gibt es einen **zweiten** Fortschrittsbalken: den der
      Aktionsleiste, der zählt, wie viele Empfehlungen beantwortet sind. Der
      steht dauerhaft da. Gefragt wird deshalb nach dem Namen, nicht nach der
      Rolle – sonst prüfte dieser Test, ob die Leiste verschwindet.
    */
    await waitFor(() =>
      expect(
        screen.queryByRole('progressbar', { name: 'Sprachmodell wird vorbereitet' }),
      ).not.toBeInTheDocument(),
    );
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
    await user.click(screen.getByRole('button', { name: /Vorschlag .+ für crowded übernehmen/ }));
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
      name: 'KI-Vorschläge für offene Empfehlungen',
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

    // Der erklärende Satz dazu steht im Aufklapper unter den Ergebnissen.
    await user.click(
      screen.getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ }),
    );
    expect(screen.getByText(/Der Browser lädt das Sprachmodell gerade herunter/)).toBeInTheDocument();

    await user.click(button);

    expect(await screen.findByText('crowded-de')).toBeInTheDocument();
    expect(prepareCount()).toBe(1);
  });

  it('bereitet für denselben Anbieter kein zweites Mal vor', async () => {
    const { provider, prepareCount } = createFakeTranslationProvider({ availability: 'available' });
    const { user } = await setup(provider);

    await user.click(
      await screen.findByRole('button', { name: 'KI-Vorschläge für offene Empfehlungen' }),
    );
    await screen.findByText('crowded-de');

    await user.click(
      screen.getByRole('button', { name: 'KI-Vorschläge für offene Empfehlungen' }),
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
      await screen.findByRole('button', { name: 'KI-Vorschläge für offene Empfehlungen' }),
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
    await screen.findByRole('button', { name: 'KI-Vorschläge für offene Empfehlungen' });
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

/**
 * Sprint 4B.2 Phase 3: Die Karte ist kompakt – ohne dass etwas verschwindet.
 *
 * Der Unterschied zwischen „aufgeräumt“ und „versteckt“ ist genau der, den
 * diese Tests festhalten: Was nicht mehr in der Karte steht, steht hinter einem
 * **benannten** Aufklapper und ist mit der Tastatur erreichbar.
 */
/**
 * Sprint 4B.3: Die klebende Aktionsleiste.
 *
 * Zwei Aufgaben, und die zweite ist die wichtigere: Sie zeigt, wie weit man
 * ist – und sie stellt die offenen Fragen zur Lernform **neben** den
 * Speichern-Knopf. Eine Frage, die man nur findet, wenn man scrollt, ist vor
 * dem Speichern keine.
 *
 * Ob die Leiste wirklich klebt, kann jsdom nicht sagen (kein Layout); das
 * misst der E2E-Lauf. Hier geht es um den Inhalt.
 */
describe('Die Aktionsleiste', () => {
  it('steht erst da, wenn es etwas zu tun gibt', async () => {
    mount();
    // Vor dem Empfehlen gibt es keinen Fortschritt und nichts zu speichern.
    expect(document.querySelector('.actionbar')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Zurück zum Text' })).toBeInTheDocument();
  });

  it('zählt mit, wie weit man ist', async () => {
    const { user } = await setup();
    const leiste = document.querySelector('.actionbar') as HTMLElement;
    expect(leiste).not.toBeNull();

    expect(within(leiste).getByText(/0 von \d+/)).toBeInTheDocument();
    expect(within(leiste).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    expect(within(leiste).getByText(/1 von \d+/)).toBeInTheDocument();
    expect(within(leiste).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('trägt den Speichern-Knopf mit der Zahl, die gespeichert wird', async () => {
    const { user } = await setup();
    const leiste = document.querySelector('.actionbar') as HTMLElement;

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');
    expect(
      within(leiste).getByRole('button', { name: '1 Vokabel prüfen & speichern' }),
    ).toBeEnabled();
  });
});

describe('Die Empfehlungskarte', () => {
  it('trägt im Kopf nur Wort, Häufigkeit, Zustand und den Weg hinaus', async () => {
    await setup();
    const zeile = screen.getByLabelText('Deutsche Antwort für „crowded“').closest('li');
    expect(zeile).not.toBeNull();
    const kopf = zeile!.querySelector('.candidate__head');
    expect(kopf).not.toBeNull();

    expect(within(kopf as HTMLElement).getByText('crowded')).toBeInTheDocument();
    expect(within(kopf as HTMLElement).getByText(/× im Text/)).toBeInTheDocument();
    expect(
      within(kopf as HTMLElement).getByRole('button', { name: 'crowded entfernen' }),
    ).toBeInTheDocument();
  });

  it('sagt den Zustand mit Zeichen und Wort, nicht mit Farbe allein', async () => {
    const { user } = await setup();
    const zeile = () => screen.getByLabelText('Deutsche Antwort für „crowded“').closest('li')!;

    const offen = zeile().querySelector('.candidate__state');
    expect(offen).toHaveAttribute('data-state', 'open');
    expect(offen).toHaveTextContent('noch offen');
    expect(offen?.textContent).toContain('○');

    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    const belegt = zeile().querySelector('.candidate__state');
    expect(belegt).toHaveAttribute('data-state', 'taken');
    expect(belegt).toHaveTextContent('wird übernommen');
    expect(belegt?.textContent).toContain('✓');
  });

  it('legt die beobachteten Formen hinter einen benannten Aufklapper', async () => {
    const { user } = await setup();
    const zeile = screen.getByLabelText('Deutsche Antwort für „crowded“').closest('li')!;

    // Benannt, nicht „Details“ – man soll wissen, was dahinterliegt.
    const knopf = within(zeile).getByRole('button', { name: 'Formen im Text und Herkunft' });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');

    await user.click(knopf);
    expect(within(zeile).getByText(/Im Text:/)).toBeInTheDocument();
  });

});

describe('Ein langer Originalsatz', () => {
  /*
    Zwei Zeilen reichen fast immer. „Fast immer“ ist der Punkt: Für den Rest
    gibt es einen Knopf, und gekürzt wird nur die **Darstellung** – im Dokument
    steht der ganze Satz, eine Vorlesehilfe liest ihn vollständig vor.
  */
  const LANG =
    'The neighbourhood is crowded because a great many people who once lived somewhere else have ' +
    'moved into the very same narrow streets during the past ten years, and the litter that ' +
    'follows them is a problem nobody has solved yet.';

  async function setupLang() {
    const user = userEvent.setup();
    render(
      <ProviderRegistry>
        <TextCandidateReview
          candidates={extractTextCandidates(LANG)}
          context={CONTEXT}
          onContextChange={vi.fn()}
          dictionary={LEERES_WOERTERBUCH}
          onApply={vi.fn()}
          onBack={vi.fn()}
        />
      </ProviderRegistry>,
    );
    const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
    await waitFor(() => expect(knopf).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Anzahl'), '20');
    await user.click(knopf);
    return user;
  }

  it('steht vollständig im Dokument, auch wenn er gekürzt aussieht', async () => {
    await setupLang();
    expect(LANG.length).toBeGreaterThan(SENTENCE_CLAMP_CHARS);

    const satz = document.querySelector('.candidate__sentence');
    expect(satz).not.toBeNull();
    expect(satz).toHaveAttribute('data-clamped');
    // Der Text ist da – gekürzt wird er von CSS, nicht vom Markup.
    expect(satz?.textContent).toContain('nobody has solved yet');
  });

  it('lässt sich ausklappen und wieder kürzen', async () => {
    const user = await setupLang();
    const knopf = screen.getAllByRole('button', { name: /Ganzen Satz für .+ zeigen/ })[0];
    expect(knopf).toBeDefined();
    expect(knopf).toHaveAttribute('aria-expanded', 'false');

    await user.click(knopf!);
    expect(document.querySelector('.candidate__sentence')).not.toHaveAttribute('data-clamped');

    await user.click(screen.getAllByRole('button', { name: /Ganzen Satz für .+ kürzen/ })[0]!);
    expect(document.querySelector('.candidate__sentence')).toHaveAttribute('data-clamped');
  });
});

describe('Eine Aktion für beide Anlässe', () => {
  it('heißt nach dem ersten Lauf „Offene Empfehlungen neu berechnen“', async () => {
    const mounted = mount();
    const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
    await waitFor(() => expect(knopf).toBeEnabled());
    await mounted.user.click(knopf);

    expect(
      screen.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }),
    ).toBeInTheDocument();
    // Und den zweiten Knopf von früher gibt es nicht mehr.
    expect(
      screen.queryByRole('button', { name: /Offene Empfehlungen ersetzen/ }),
    ).not.toBeInTheDocument();
  });

  it('behandelt einen entfernten Platz wie einen leeren', async () => {
    /*
      Der Kern der Zusammenlegung. Wer eine Empfehlung wegräumt, hat einen
      offenen Platz erzeugt – genau wie jemand, der ein Antwortfeld leer lässt.
      Derselbe Knopf besetzt beides neu.

      Geprüft wird der Fall „geänderte Einstellung“: Dann ist es eine neue
      Frage, und ein zurückgelegtes Wort darf wiederkommen, wenn es zur neuen
      Einstellung passt. Bei **unveränderter** Einstellung heißt derselbe Knopf
      „gib mir andere“ – das prüft der Test „ersetzt die offenen Empfehlungen
      und hebt sie auf“.
    */
    const { user } = await setup();
    const vorher = screen.getAllByText(/× im Text/).length;

    await user.click(screen.getByRole('button', { name: 'Litter entfernen' }));
    expect(screen.getAllByText(/× im Text/).length).toBe(vorher - 1);
    expect(screen.getByRole('button', { name: /Frühere Empfehlungen/ })).toHaveTextContent('1');

    await user.selectOptions(screen.getByLabelText('Sortierung'), 'frequency');
    await user.click(screen.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }));

    // Der Platz ist wieder besetzt – und das Wort steht nicht mehr in der Rückschau.
    expect(screen.getAllByText(/× im Text/).length).toBe(vorher);
    expect(screen.queryByRole('button', { name: /Frühere Empfehlungen/ })).not.toBeInTheDocument();
  });

  it('rührt eine beantwortete Zeile auch beim zweiten Klick nicht an', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText('Deutsche Antwort für „crowded“'), 'überfüllt');

    await user.click(screen.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }));
    await user.click(screen.getByRole('button', { name: 'Offene Empfehlungen neu berechnen' }));

    expect(screen.getByLabelText('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });
});
