import { describe, expect, it } from 'vitest';

import {
  GEMINI_CAPABILITIES,
  GEMINI_CAPABILITY_LABELS,
  MAX_ITEMS,
  TRANSMITTED,
  describeTransmission,
} from './capabilities';

/**
 * Die Zusagen, die vor dem Klick stehen – als Test und nicht als Absichtserklärung.
 *
 * Eine Datenschutzangabe in einer Oberfläche ist so lange wahr, bis jemand den
 * Code darunter ändert. Diese Datei ist der Wachhund dafür.
 */

describe('Kein vollständiger Quelltext', () => {
  it('verlässt bei keiner Fähigkeit das Gerät', () => {
    /*
      Der zentrale Test dieser Datei. Die Textwerkstatt zerlegt den eingefügten
      Text lokal in Kandidaten; nach draußen geht diese Liste, nicht der Text.
      Wer das ändert, ändert eine Zusage – und muss diesen Test bewusst anfassen.
    */
    for (const capability of GEMINI_CAPABILITIES) {
      expect(TRANSMITTED[capability].sendsFullText, capability).toBe(false);
    }
  });

  it('sagt das im Satz vor der Anfrage auch so', () => {
    expect(describeTransmission('recommend-from-text')).toContain('Kein vollständiger Quelltext');
  });
});

describe('Jede Fähigkeit ist vollständig beschrieben', () => {
  it('hat eine Beschriftung, eine Auskunft und eine Obergrenze', () => {
    for (const capability of GEMINI_CAPABILITIES) {
      expect(GEMINI_CAPABILITY_LABELS[capability], capability).toBeTruthy();
      expect(TRANSMITTED[capability].items.length, capability).toBeGreaterThan(0);
      expect(MAX_ITEMS[capability], capability).toBeGreaterThan(0);
    }
  });

  it('nennt nirgends Namen, Lernstände oder Paket-Kennungen', () => {
    /*
      Kein Feintest auf Wortlaut, sondern eine grobe Reißleine: Taucht eines
      dieser Wörter je in einer Auskunft auf, wurde etwas übertragen, das nicht
      übertragen werden darf – oder die Auskunft ist falsch. Beides ist ein Fund.
    */
    const verboten = ['name', 'lernstand', 'fortschritt', 'paket-id', 'schüler'];
    for (const capability of GEMINI_CAPABILITIES) {
      const text = TRANSMITTED[capability].items.join(' ').toLowerCase();
      for (const wort of verboten) {
        expect(text, `${capability}: ${wort}`).not.toContain(wort);
      }
    }
  });
});

describe('Der Satz vor der Anfrage', () => {
  it('nennt zuerst die Daten und dann erst das Geld', () => {
    const text = describeTransmission('translate-entry');
    expect(text.indexOf('übertragen')).toBeLessThan(text.indexOf('Kosten'));
  });

  it('nennt für eine Übersetzung genau die vier Angaben', () => {
    const text = describeTransmission('translate-entry');
    expect(text).toContain('die englische Lernform');
    expect(text).toContain('GeR-Niveau');
    expect(text).toContain('Keine Namen, keine Lernstände, keine anderen Pakete');
  });
});
