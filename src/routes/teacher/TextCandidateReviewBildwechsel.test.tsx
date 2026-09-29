// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TextCandidateReview } from './TextCandidateReview';
import { ProviderRegistry } from '../../providers/ProviderContext';
import { extractTextCandidates } from '../../domain/textExtraction';
import type { LearningContext } from '../../import/enrichment';
import type { DictionaryProvider } from '../../dictionary/DictionaryProvider';

/**
 * Was ein verspäteter Bildwechsel **nicht** darf.
 *
 * ## Der Befund
 *
 * `TextCandidateReview` verschiebt zwei Dinge auf das nächste Bild: den Fokus
 * aufs Ergebnis nach dem Empfehlen, und den Sprung zu der Zeile, die gerade
 * aus dem Quelltext aufgenommen wurde. Beides ist richtig – der Fokus soll
 * dorthin wandern, wo etwas passiert ist.
 *
 * Falsch war, wie es gemacht war. `requestAnimationFrame` lief weiter, auch
 * wenn die Ansicht längst abgebaut war, und der Rückruf suchte sein Ziel mit
 * `document.getElementById`. Das ist eine Suche im **ganzen** Dokument. Steht
 * dort inzwischen eine zweite Fassung derselben Ansicht – in einer Prüfung ist
 * das der Normalfall, im Betrieb nach einem Wechsel hin und zurück –, dann
 * greift der Rückruf in die neue Ansicht und setzt dort den Fokus um.
 *
 * Gemessen hat sich das als schwankende Prüfung gezeigt: In derselben Datei
 * fielen mal vier, mal sieben, mal sechs Prüfungen durch, immer mit dem Bild
 * einer Eingabe, die mitten im Tippen abbrach.
 *
 * ## Warum in einer eigenen Datei
 *
 * Weil hier eine Eigenschaft geprüft wird und nicht eine Ansicht: „Ein Rückruf
 * aus einer abgebauten Fassung rührt die nächste nicht an.“ Stünde die Prüfung
 * in `TextCandidateReview.test.tsx`, teilte sie sich den Ablauf mit 67
 * anderen – und genau dieses Teilen ist der Gegenstand.
 *
 * ## Warum kein `waitFor`
 *
 * `waitFor` verdeckte den Fehler, statt ihn zu zeigen: Es wartet, bis etwas
 * eintritt, und ein verspäteter Rückruf tritt irgendwann ein. Hier wird der
 * Bildwechsel stattdessen **angehalten** und von Hand ausgelöst – genau zu dem
 * Zeitpunkt, an dem er schaden würde. Kein Warten, keine Zufallsfrage.
 */

const TEXT = 'The neighbourhood is crowded. Litter is a problem in the neighbourhood.';
const CONTEXT: LearningContext = { grade: '7', cefrLevel: 'A2', topic: '' };

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

/**
 * Ein angehaltener Bildwechsel.
 *
 * `offen()` zählt, was noch aussteht – daran zeigt sich, ob der Abbau
 * aufgeräumt hat.
 *
 * `markiere()` zieht einen Strich, `alteAusloesen()` ruft **jeden** Rückruf
 * diesseits davon, auch einen zurückgenommenen. Der Strich ist nötig: Ohne ihn
 * liefe der berechtigte Rückruf der zweiten Fassung mit, und die Prüfung fiele
 * über ihren eigenen Aufbau.
 */
function bildwechselAnhalten(): {
  offen: () => number;
  angemeldet: () => number;
  markiere: () => void;
  alteAusloesen: () => void;
} {
  const offen = new Map<number, FrameRequestCallback>();
  const jemalsAngemeldet: FrameRequestCallback[] = [];
  let grenze = 0;
  let naechste = 1;

  vi.stubGlobal('requestAnimationFrame', (rueckruf: FrameRequestCallback): number => {
    const handle = naechste;
    naechste += 1;
    offen.set(handle, rueckruf);
    jemalsAngemeldet.push(rueckruf);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number): void => {
    offen.delete(handle);
  });

  return {
    offen: () => offen.size,
    angemeldet: () => jemalsAngemeldet.length,
    markiere: () => {
      grenze = jemalsAngemeldet.length;
    },
    alteAusloesen: () => {
      for (const rueckruf of jemalsAngemeldet.slice(0, grenze)) rueckruf(0);
    },
  };
}

function baueAuf(): ReturnType<typeof userEvent.setup> {
  render(
    <ProviderRegistry>
      <TextCandidateReview
        candidates={extractTextCandidates(TEXT)}
        context={CONTEXT}
        onContextChange={vi.fn()}
        dictionary={LEERES_WOERTERBUCH}
        sourceText={TEXT}
        onApply={vi.fn()}
        onBack={vi.fn()}
      />
    </ProviderRegistry>,
  );
  return userEvent.setup();
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

/** Warten, bis das Wörterbuch durch ist – sonst ist das Aufnehmen geraten. */
async function bereit(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Empfehlungen generieren' })).toBeEnabled(),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ein Bildwechsel überlebt den Abbau seiner Ansicht nicht', () => {
  it('nimmt den Sprung zu einer aufgenommenen Zeile beim Abbau zurück', async () => {
    const bild = bildwechselAnhalten();
    const user = baueAuf();
    await bereit();

    await user.click(wortImText('crowded'));
    await screen.findByLabelText('Deutsche Antwort für „crowded“');

    /*
      Die Erwartung steht **vor** dem Abbau. Stünde sie nur danach, prüfte
      diese Zeile auch dann nichts, wenn gar kein Bildwechsel angemeldet wurde.
    */
    expect(bild.offen()).toBeGreaterThan(0);

    cleanup();

    expect(bild.offen()).toBe(0);
  });

  it('nimmt auch den Fokussprung nach dem Empfehlen zurück', async () => {
    const bild = bildwechselAnhalten();
    const user = baueAuf();
    await bereit();

    await user.click(screen.getByRole('button', { name: 'Empfehlungen generieren' }));
    expect(bild.offen()).toBeGreaterThan(0);

    cleanup();

    expect(bild.offen()).toBe(0);
  });

  it('rührt die nächste Fassung nicht an, selbst wenn der Rückruf doch noch läuft', async () => {
    const bild = bildwechselAnhalten();
    const user = baueAuf();
    await bereit();

    /*
      In der ersten Fassung wird **Litter** aufgenommen – ein anderes Wort als
      das, in das gleich getippt wird. Wäre es dasselbe, spränge der Rückruf
      genau dorthin, wo der Fokus ohnehin steht, und die Prüfung könnte den
      Fehler nicht von der Ordnung unterscheiden.
    */
    await user.click(wortImText('Litter'));
    await screen.findByLabelText('Deutsche Antwort für „Litter“');
    expect(bild.angemeldet()).toBeGreaterThan(0);

    cleanup();
    // Ab hier gehört jeder neue Rückruf der zweiten Fassung und bleibt in Ruhe.
    bild.markiere();

    // Die zweite Fassung – derselbe Text, dieselben Kennungen im Markup.
    const zweiterUser = baueAuf();
    await bereit();
    // Beide Zeilen gibt es auch hier – die gesuchte und die getippte.
    await zweiterUser.click(wortImText('Litter'));
    await screen.findByLabelText('Deutsche Antwort für „Litter“');
    await zweiterUser.click(wortImText('crowded'));
    const feld = await screen.findByLabelText('Deutsche Antwort für „crowded“');
    await zweiterUser.click(feld);
    await zweiterUser.type(feld, 'überfüllt');

    expect(feld).toHaveFocus();
    expect(feld).toHaveValue('überfüllt');

    /*
      Und jetzt der Ernstfall: Jeder Rückruf der ersten Fassung läuft doch
      noch. Über `document.getElementById('de-text:litter')` fände er das Feld
      der **zweiten** Fassung – gleiche Kennung, andere Fassung – und risse den
      Fokus aus der Eingabe, die gerade beschrieben wird.
    */
    bild.alteAusloesen();

    expect(feld).toHaveFocus();
    expect(feld).toHaveValue('überfüllt');
  });
});
