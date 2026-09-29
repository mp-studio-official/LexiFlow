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
 * Was die Lehrkraft eingegeben hat, gehört der Lehrkraft.
 *
 * ## Die Regel
 *
 * Eine Eingabe der Lehrkraft darf **niemals** durch ein später eintreffendes
 * Wörterbuch- oder Modellergebnis überschrieben oder geleert werden. Ein
 * automatischer Vorschlag darf ergänzen, nie ersetzen.
 *
 * ## Warum „das Feld ist leer“ als Entscheidung nicht reicht
 *
 * Bis hierher entschied die Ansicht an genau einer Frage, ob eine Zeile
 * „offen“ ist: `row.german.trim().length > 0`. Das kann zwei völlig
 * verschiedene Dinge bedeuten:
 *
 *   - Hier war noch nie jemand.
 *   - Hier stand etwas, und die Lehrkraft hat es **weggemacht**.
 *
 * Das zweite ist eine Entscheidung. Sie rückgängig zu machen, weil das
 * Ergebnis zufällig so aussieht wie das erste, ist der Fehler – und zwar
 * derselbe Fehler an zwei Stellen: `applyDictionaryDefaults` füllt jede leere
 * Zeile, und das Neuberechnen räumt jede leere Zeile weg.
 *
 * Deshalb führt eine Zeile jetzt einen Antwortstand mit:
 * `unberührt`, `automatisch`, `geändert`, `geleert`.
 *
 * ## Warum kein `waitFor` in diesen Prüfungen
 *
 * Es gibt hier nichts zu erwarten. Jede Prüfung führt die Handgriffe zu Ende
 * und sieht dann nach. Ein `waitFor` würde die Frage „wann?“ stellen, wo die
 * Frage „ob überhaupt?“ lautet.
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

/** Ein Bestand, der genau eine eindeutige Antwort hergibt. */
const BESTAND: Record<string, DictionaryEntry[]> = {
  litter: [eintrag('litter', [{ sense: 'rubbish', suggestions: [{ german: 'Müll', gender: 'm' }] }])],
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

function baueAuf(uebersetzer?: TranslationProvider): ReturnType<typeof userEvent.setup> {
  render(
    <ProviderRegistry {...(uebersetzer ? { value: { translation: uebersetzer } } : {})}>
      <TextCandidateReview
        candidates={extractTextCandidates(TEXT)}
        context={CONTEXT}
        onContextChange={vi.fn()}
        dictionary={WOERTERBUCH}
        onApply={vi.fn()}
        onBack={vi.fn()}
      />
    </ProviderRegistry>,
  );
  return userEvent.setup();
}

/** Aufbauen, das Wörterbuch abwarten, alle Kandidaten empfehlen lassen. */
async function empfehlen(
  uebersetzer?: TranslationProvider,
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = baueAuf(uebersetzer);
  const knopf = await screen.findByRole('button', { name: 'Empfehlungen generieren' });
  await waitFor(() => expect(knopf).toBeEnabled());
  await user.selectOptions(screen.getByLabelText('Anzahl'), '20');
  await user.click(knopf);
  return user;
}

function feldFuer(wort: string): HTMLElement {
  return screen.getByLabelText(`Deutsche Antwort für „${wort}“`);
}

function neuBerechnen(): HTMLElement {
  return screen.getByRole('button', { name: /Offene Empfehlungen neu berechnen/ });
}

describe('Eine bewusst geleerte Antwort bleibt leer', () => {
  it('wird beim Neuberechnen nicht wieder aus dem Wörterbuch gefüllt', async () => {
    const user = await empfehlen();

    /*
      Das Wörterbuch kennt `litter` eindeutig, also steht die Antwort sofort
      da. Genau darum geht es: Die Lehrkraft nimmt eine *automatisch* gesetzte
      Antwort wieder weg. „Müll“ passt hier nicht – sie will selbst etwas
      eintragen oder die Vokabel gar nicht übernehmen.
    */
    expect(feldFuer('litter')).toHaveValue('Müll');

    await user.clear(feldFuer('litter'));
    expect(feldFuer('litter')).toHaveValue('');

    await user.click(neuBerechnen());

    // Ohne Antwortstand steht hier wieder „der Müll“: Die Entscheidung der
    // Lehrkraft ist zurückgenommen, ohne dass irgendwer es gesagt hätte.
    expect(feldFuer('litter')).toHaveValue('');
  });

  it('räumt die Zeile beim Neuberechnen nicht weg', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.click(neuBerechnen());

    /*
      Eine leere Zeile gilt als „offen“ und wird durch ein anderes Wort
      ersetzt. Eine *bewusst geleerte* Zeile ist keine offene Zeile – die
      Lehrkraft hat sich mit ihr befasst.
    */
    expect(screen.queryByLabelText('Deutsche Antwort für „litter“')).toBeInTheDocument();
  });
});

describe('Eine getippte Antwort bleibt stehen', () => {
  it('überlebt das Neuberechnen', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.type(feldFuer('litter'), 'der Abfall');
    await user.click(neuBerechnen());

    expect(feldFuer('litter')).toHaveValue('der Abfall');
  });

  it('wird nicht durch den Wörterbuchvorschlag ersetzt', async () => {
    const user = await empfehlen();

    await user.clear(feldFuer('litter'));
    await user.type(feldFuer('litter'), 'der Abfall');
    await user.click(neuBerechnen());
    await user.click(neuBerechnen());

    // Zweimal neu berechnen ist zweimal dieselbe Gelegenheit, es doch zu tun.
    expect(feldFuer('litter')).toHaveValue('der Abfall');
  });
});

/**
 * Eine Antwort, die für eine andere Zeile unterwegs war.
 *
 * Eine Zeile kann entfernt und wieder aufgenommen werden. Die Kennung des
 * Kandidaten bleibt dabei dieselbe – sie kommt aus dem Text. Wer eine späte
 * Antwort nur über diese Kennung zuordnet, trifft damit die **neue** Zeile mit
 * einem Ergebnis, das für die alte gestartet wurde.
 *
 * Deshalb trägt jede Zeile eine Fassung, und eine späte Antwort nennt die
 * Fassung, für die sie unterwegs war.
 */
describe('Eine späte Antwort trifft nur ihre eigene Fassung', () => {
  /** Ein Übersetzer, der erst antwortet, wenn die Prüfung es will. */
  function angehaltenerUebersetzer(): {
    provider: TranslationProvider;
    freigeben: () => void;
  } {
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

  it('landet nicht in einer Zeile, die inzwischen neu aufgenommen wurde', async () => {
    const { provider, freigeben } = angehaltenerUebersetzer();
    const user = await empfehlen(provider);

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

    /*
      Die neue Zeile ist eine andere Zeile. Der Vorschlag, der für die alte
      unterwegs war, gehört nicht hierher – auch wenn die Kennung passt.
    */
    expect(
      screen.queryByRole('button', { name: /Vorschlag „crowded-de“/ }),
    ).not.toBeInTheDocument();
  });
});
