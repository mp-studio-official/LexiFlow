// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TextCandidateReview } from './TextCandidateReview';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import type { LearningContext } from '../../import/enrichment';
import type { DictionaryEntry, DictionaryProvider } from '../../dictionary/DictionaryProvider';
import type { TranslationProvider } from '../../translation/TranslationProvider';

/**
 * Was die Lehrkraft eingegeben hat, gehört der Lehrkraft — und was sie
 * ausdrücklich anstößt, geschieht auch.
 *
 * ## Zwei Vorgänge, die nicht dasselbe sind
 *
 * **Automatisch und asynchron.** Ein Wörterbuch- oder Modellergebnis, das
 * später eintrifft, darf eine Eingabe der Lehrkraft niemals überschreiben oder
 * leeren. Auch nicht, wenn das Feld gerade leer aussieht: Ein leeres Feld kann
 * heißen „hier war noch nie jemand“ oder „hier stand etwas, und ich habe es
 * weggemacht“. Das zweite ist eine Entscheidung.
 *
 * **Ausdrücklich ausgelöst.** „Offene Empfehlungen neu berechnen“ ist eine
 * Anweisung: Tausche die offenen maschinellen Vorschläge gegen andere. Eine
 * geleerte maschinelle Empfehlung **ist** offen — sie geht dabei unter
 * „Frühere Empfehlungen“ und kann von dort zurückgeholt werden. Sie dort zu
 * halten hieße, den Knopf zu ignorieren, den jemand gerade gedrückt hat.
 *
 * Der Zustand `geleert` bleibt deshalb nötig. Er schützt vor dem, was von
 * selbst geschieht — nicht vor dem, was jemand verlangt.
 *
 * ## Was dabei niemals ersetzt wird
 *
 * - eine nicht leere Antwort, gleich woher sie kommt;
 * - eine Zeile, die von Hand aus dem Quelltext aufgenommen wurde — auch leer.
 *   Sie steht nicht da, weil eine Schätzung sie vorgeschlagen hat, sondern
 *   weil jemand sie ausgesucht hat. Sie verschwindet nur, wenn dieselbe Person
 *   sie entfernt.
 *
 * ## Warum kein `waitFor` als Lückenfüller
 *
 * Wo etwas eintreffen soll, wird auf genau dieses Etwas gewartet (der
 * Modellvorschlag einer **anderen** Zeile). Wo nichts geschehen soll, wird
 * nicht gewartet, sondern nachgesehen. Ein `waitFor` um die eigentliche
 * Erwartung herum würde die Frage „ob überhaupt?“ in ein „wann?“ verwandeln.
 */

const TEXT = 'The neighbourhood is crowded. Litter covers the quiet street near the old station.';
const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: '' };

function eintrag(
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

/** Ein Bestand, der genau die geprüften Fälle eindeutig beantwortet. */
const BESTAND: Record<string, DictionaryEntry[]> = {
  litter: [
    eintrag('litter', [{ sense: 'rubbish', suggestions: [{ german: 'Müll', gender: 'm' }] }]),
  ],
  'old station': [
    eintrag('old station', [
      { sense: 'place', suggestions: [{ german: 'Bahnhof', gender: 'm' }] },
    ]),
  ],
};

const WOERTERBUCH: DictionaryProvider = {
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
};

/** Ein Übersetzer, der erst antwortet, wenn die Prüfung es will. */
function angehaltenerUebersetzer(): { provider: TranslationProvider; freigeben: () => void } {
  let freigeben: () => void = () => undefined;
  const tor = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let bereit = false;
  return {
    freigeben: () => freigeben(),
    provider: {
      info: {
        id: 'angehalten',
        label: 'Testübersetzung',
        dataNotice: 'Testanbieter. Es werden keine Daten übertragen.',
        sendsDataOffDevice: false,
      },
      getAvailability: () => Promise.resolve('downloadable'),
      async prepare(_source, _target, onProgress) {
        onProgress?.(1);
        bereit = true;
        await Promise.resolve();
      },
      async translate(text) {
        if (!bereit) throw new Error('Das Sprachmodell ist noch nicht geladen.');
        await tor;
        return `${text}-de`;
      },
      destroy() {
        bereit = false;
      },
    },
  };
}

function baueAuf(optionen: {
  uebersetzer?: TranslationProvider;
  mitQuelltext?: boolean;
} = {}): ReturnType<typeof userEvent.setup> {
  render(
    <ProviderRegistry
      {...(optionen.uebersetzer ? { value: { translation: optionen.uebersetzer } } : {})}
    >
      <TextCandidateReview
        candidates={extractTextCandidates(TEXT)}
        context={CONTEXT}
        onContextChange={vi.fn()}
        dictionary={WOERTERBUCH}
        {...(optionen.mitQuelltext ? { sourceText: TEXT } : {})}
        onApply={vi.fn()}
        onBack={vi.fn()}
      />
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

/** Aufbauen, das Wörterbuch abwarten, alle Kandidaten empfehlen lassen. */
async function empfehlen(
  optionen: { uebersetzer?: TranslationProvider; mitQuelltext?: boolean } = {},
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = baueAuf(optionen);
  const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
  await waitFor(() => expect(knopf).toBeEnabled());
  await user.selectOptions(screen.getByLabelText('Anzahl'), '20');
  await user.click(knopf);
  return user;
}

function feldFuer(wort: string): HTMLElement {
  return screen.getByLabelText(`Deutsche Antwort für „${wort}“`);
}

function ersetzen(): HTMLElement {
  return screen.getByRole('button', { name: /Offene Empfehlungen neu berechnen/ });
}

/** Ein Wort im Quelltext – als Textstück, nicht als Schaltfläche. */
function wortImText(text: string): HTMLElement {
  const quelle = screen.getByRole('group', { name: 'Analysierter Text' });
  const gefunden = [...quelle.querySelectorAll<HTMLElement>('[data-word]')].find(
    (element) => element.textContent === text,
  );
  if (!gefunden) throw new Error(`„${text}“ steht nicht im Quelltext.`);
  return gefunden;
}

// ---------------------------------------------------------------------------
// 1. Was von selbst geschieht
// ---------------------------------------------------------------------------

describe('Eine bewusst geleerte Zeile füllt sich nicht von selbst wieder', () => {
  it('bleibt leer, solange niemand das Ersetzen auslöst', async () => {
    const user = await empfehlen();

    // Das Wörterbuch kennt `litter` eindeutig, die Antwort steht sofort da.
    expect(feldFuer('litter')).toHaveValue('Müll');

    await user.clear(feldFuer('litter'));

    // Kein Warten: Es soll nichts eintreffen. Genau das wird nachgesehen.
    expect(feldFuer('litter')).toHaveValue('');
    expect(screen.getByLabelText('Deutsche Antwort für „litter“')).toBeInTheDocument();
  });

  it('nimmt einen späten Modellvorschlag als Angebot an, nicht als Antwort', async () => {
    const { provider, freigeben } = angehaltenerUebersetzer();
    const user = await empfehlen({ uebersetzer: provider });

    await user.clear(feldFuer('litter'));

    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );
    freigeben();

    /*
      Gewartet wird auf den Vorschlag **dieser** Zeile – er soll ja ankommen.
      Die Frage ist nur, wo er landet.
    */
    await screen.findByRole('button', { name: /Vorschlag „litter-de“/ });

    // Im Feld: nichts. Daneben: ein Angebot, das einen Klick kostet.
    expect(feldFuer('litter')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 2. Was ausdrücklich verlangt wird
// ---------------------------------------------------------------------------

describe('Das ausdrückliche Ersetzen offener Empfehlungen', () => {
  it('ersetzt eine geleerte maschinelle Empfehlung', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    expect(feldFuer('litter')).toHaveValue('');

    await user.click(ersetzen());

    /*
      Eine geleerte maschinelle Empfehlung **ist** offen. Wer „offene
      Empfehlungen ersetzen“ drückt, meint auch sie – sie stehen zu lassen
      hiesse, den Knopf zu ignorieren.
    */
    expect(screen.queryByLabelText('Deutsche Antwort für „litter“')).not.toBeInTheDocument();
  });

  it('legt die ersetzte Empfehlung unter „Frühere Empfehlungen“ ab', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.click(ersetzen());

    await user.click(screen.getByRole('button', { name: /Frühere Empfehlungen/ }));

    // Ersetzt heißt zurückgelegt, nicht weggeworfen.
    expect(screen.getByRole('button', { name: 'litter wieder aufnehmen' })).toBeInTheDocument();
  });

  it('holt sie von dort unverändert zurück', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.click(ersetzen());
    await user.click(screen.getByRole('button', { name: /Frühere Empfehlungen/ }));
    await user.click(screen.getByRole('button', { name: 'litter wieder aufnehmen' }));

    /*
      Zurückgeholt wird die Zeile, wie sie war – geleert. Sie mit „Müll“
      zurückzubringen wäre dieselbe Entscheidung wieder aufgehoben, nur an
      einer anderen Stelle.
    */
    expect(feldFuer('litter')).toHaveValue('');
  });

  it('lässt eine ausgefüllte Antwort stehen', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.type(feldFuer('litter'), 'der Abfall');
    await user.click(ersetzen());

    expect(feldFuer('litter')).toHaveValue('der Abfall');
  });

  it('lässt sie auch beim zweiten Klick stehen', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.type(feldFuer('litter'), 'der Abfall');
    await user.click(ersetzen());
    await user.click(ersetzen());

    expect(feldFuer('litter')).toHaveValue('der Abfall');
  });
});

// ---------------------------------------------------------------------------
// 3. Was von Hand aus dem Quelltext kam
// ---------------------------------------------------------------------------

describe('Eine von Hand aufgenommene Zeile wird nicht ersetzt', () => {
  /** „old station“ markieren und aufnehmen – eine Wortgruppe, die keine Empfehlung ist. */
  async function ausQuelltextAufnehmen(
    user: ReturnType<typeof userEvent.setup>,
  ): Promise<HTMLElement> {
    wortImText('old').focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await user.keyboard('{Enter}');
    return screen.findByLabelText(/Deutsche Antwort für „(the )?old station“/);
  }

  it('gilt auch für ein Wort, das die Empfehlung ohnehin kennt', async () => {
    /*
      Der Fall, der leicht durchrutscht: `litter` **ist** ein Kandidat. Wer es
      vor dem ersten Empfehlen aus dem Quelltext aufnimmt, hat es trotzdem
      ausgesucht und nicht vorgeschlagen bekommen. Für die Zeile zählt, wie sie
      entstanden ist – nicht, ob dasselbe Wort auch eine Empfehlung hätte
      werden können.
    */
    const user = baueAuf({ mitQuelltext: true });
    const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
    await waitFor(() => expect(knopf).toBeEnabled());

    await user.click(wortImText('Litter'));
    /*
      Die Zeile heißt hier „Litter“ mit großem L: Sie trägt die Form, die im
      Text steht, weil die Lernform aus der Fundstelle entsteht. Die spätere
      Empfehlung desselben Wortes hieße „litter“ – dieselbe Kennung, anderer
      Anzeigename.
    */
    const feld = await screen.findByLabelText('Deutsche Antwort für „Litter“');
    await user.clear(feld);

    await user.click(knopf);

    expect(screen.getByLabelText('Deutsche Antwort für „Litter“')).toBeInTheDocument();
    expect(screen.getByLabelText('Deutsche Antwort für „Litter“')).toHaveValue('');
  });

  it('bleibt beim Ersetzen stehen, auch wenn sie leer ist', async () => {
    const user = await empfehlen({ mitQuelltext: true });
    const feld = await ausQuelltextAufnehmen(user);

    await user.clear(feld);
    await user.click(ersetzen());

    /*
      Sie steht nicht da, weil eine Schätzung sie vorgeschlagen hat, sondern
      weil jemand sie ausgesucht hat. „Offene Empfehlungen ersetzen“ meint die
      Empfehlungen – nicht die Auswahl.
    */
    expect(screen.getByLabelText(/Deutsche Antwort für „(the )?old station“/)).toBeInTheDocument();
  });

  it('wird beim Ersetzen auch nicht wieder aus dem Wörterbuch gefüllt', async () => {
    const user = await empfehlen({ mitQuelltext: true });
    const feld = await ausQuelltextAufnehmen(user);

    // Das Wörterbuch kennt die Wortgruppe – die Antwort stand also da.
    expect(feld).toHaveValue('Bahnhof');

    await user.clear(feld);
    await user.click(ersetzen());

    expect(screen.getByLabelText(/Deutsche Antwort für „(the )?old station“/)).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 4. Fassungen
// ---------------------------------------------------------------------------

/**
 * Eine Antwort, die für eine andere Zeile unterwegs war.
 *
 * Eine Zeile kann entfernt und wieder aufgenommen werden. Die Kennung des
 * Kandidaten bleibt dabei dieselbe – sie kommt aus dem Text. Wer eine späte
 * Antwort nur über diese Kennung zuordnet, trifft damit die **neue** Zeile mit
 * einem Ergebnis, das für die alte gestartet wurde.
 */
describe('Eine späte Antwort trifft nur ihre eigene Fassung', () => {
  it('landet nicht in einer Zeile, die inzwischen neu aufgenommen wurde', async () => {
    const { provider, freigeben } = angehaltenerUebersetzer();
    const user = await empfehlen({ uebersetzer: provider });

    // Die Übersetzung startet für alle offenen Zeilen – „crowded“ ist dabei.
    await user.click(
      await screen.findByRole('button', { name: 'Sprachmodell laden und Vorschläge erzeugen' }),
    );

    // … und während sie unterwegs ist, wird genau diese Zeile ausgetauscht.
    await user.click(screen.getByRole('button', { name: 'crowded entfernen' }));
    await user.click(screen.getByRole('button', { name: /Frühere Empfehlungen/ }));
    await user.click(screen.getByRole('button', { name: 'crowded wieder aufnehmen' }));

    freigeben();
    // Die Übersetzung der übrigen Zeilen kommt an – daran hängt der Zeitpunkt.
    await screen.findByRole('button', { name: /Vorschlag „street-de“/ });

    expect(
      screen.queryByRole('button', { name: /Vorschlag „crowded-de“/ }),
    ).not.toBeInTheDocument();
  });
});
