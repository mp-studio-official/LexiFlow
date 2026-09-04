import { describe, expect, it } from 'vitest';

import {
  LEARNING_AREA_MAX_PACKS,
  LEARNING_AREA_SIZE_HINT_BYTES,
  describeFileSize,
  sizeAdvice,
  toLearningAreaFile,
} from './learningArea';
import { encodeEmbeddedJson } from '../portable/studentExport';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from './schema';

/**
 * Wie groß eine Lerndatei wird – und ab wann ein Wort dazugehört.
 *
 * ## Die Messung, auf der die Schwelle steht
 *
 * Aus der gebauten Lernlaufzeit (666,9 KiB) und Paketen mit vollständigen
 * Lernformen, zwei Bedeutungen und einem Beispielsatz je Vokabel:
 *
 * | Inhalt | Vokabeln | Datei |
 * | --- | --- | --- |
 * | 1 Paket × 60 | 60 | 690,7 KiB |
 * | 6 Pakete × 60 | 360 | 808,5 KiB |
 * | 20 Pakete × 60 | 1200 | 1141,0 KiB |
 * | 40 Pakete × 60 | 2400 | 1617,2 KiB |
 * | 40 Pakete × 100 | 4000 | 2240,7 KiB |
 *
 * Daraus folgt zweierlei, und das zweite ist das wichtigere:
 *
 * 1. Die Obergrenze von 40 Paketen ist **kein** Größenproblem. Selbst
 *    ausgereizt bleibt die Datei kleiner als ein Foto aus einem Telefon.
 * 2. Eine neue harte Schranke wäre geraten. Es gibt keine Messung auf den
 *    Zielgeräten – kein iPad, kein Schulnetz, kein Moodle. Was es gibt, ist
 *    ein Hinweis, und der hält niemanden auf.
 *
 * ## Warum hier keine echte Laufzeit geladen wird
 *
 * Diese Datei läuft in `npm run test` und darf `dist-portable/` nicht
 * voraussetzen. Gemessen wird deshalb der **Anteil, der mit dem Inhalt
 * wächst** – das eingebettete JSON. Die Laufzeit davor ist eine Konstante,
 * und die steht in `portable.artifact.test.ts` unter einer eigenen Schranke.
 */

/** Eine realistische Vokabel: vollständige Lernform, zwei Bedeutungen, ein Satz. */
function entry(id: string) {
  return makeEntry({
    id,
    english: `to depend on sb./sth. ${id}`,
    germanAnswers: ['von jdm./etw. abhängen', 'auf jdn./etw. angewiesen sein'],
    partOfSpeech: 'verb',
    exampleSentences: [
      {
        english: `Communities depend on natural barriers to survive number ${id}.`,
        german: `Gemeinden hängen von natürlichen Barrieren ab, Nummer ${id}.`,
      },
    ],
  });
}

function pack(index: number, words: number): VocabPack {
  return {
    meta: makeMeta({
      id: `pack-${index}`,
      title: `Unit ${index} – Coastal erosion and its consequences`,
      description: 'Zur Lektüre in der zweiten Woche des Halbjahres.',
    }),
    entries: Array.from({ length: words }, (_, i) => entry(`${index}-${i}`)),
  };
}

/** Die Bytes, die der Inhalt zur Datei beisteuert. */
function payloadBytes(packs: number, words: number): number {
  const area = toLearningAreaFile({ id: 'bereich', title: 'Englisch 9b – Halbjahr 1' }, [
    ...Array.from({ length: packs }, (_, index) => pack(index, words)),
  ]);
  return new TextEncoder().encode(encodeEmbeddedJson(area)).length;
}

describe('Die Größe wächst mit dem Inhalt und nicht mit der Paketzahl', () => {
  it('bleibt auch voll ausgereizt in derselben Größenordnung', () => {
    /*
      Der Punkt, den diese Prüfung festhält: 40 Pakete sind für sich genommen
      harmlos. Was die Datei groß macht, sind Vokabeln – und davon passen in
      40 Pakete genauso viele wie in vier.
    */
    const voll = payloadBytes(LEARNING_AREA_MAX_PACKS, 60);

    // Gemessen 1617,2 KiB Gesamtdatei bei 666,9 KiB Laufzeit – also gut 950 KiB Inhalt.
    expect(voll).toBeLessThan(1.5 * 1024 * 1024);
    expect(voll).toBeGreaterThan(300 * 1024);
  });

  it('wächst ungefähr linear mit der Vokabelzahl', () => {
    /*
      Nicht Kosmetik: Wüchse es überproportional, wäre die Obergrenze von 40
      Paketen zu hoch angesetzt und die Messung oben nicht übertragbar.
    */
    const klein = payloadBytes(2, 60);
    const gross = payloadBytes(8, 60);

    const verhaeltnis = gross / klein;
    expect(verhaeltnis).toBeGreaterThan(3.5);
    expect(verhaeltnis).toBeLessThan(4.5);
  });
});

describe('Der Hinweis zur Dateigröße', () => {
  it('schweigt bei allem, was normal ist', () => {
    /*
      Ein Hinweis, der immer erscheint, ist nach dem dritten Mal keiner mehr.
      Ein Halbjahresbereich mit sechs Paketen ist der Normalfall.
    */
    expect(sizeAdvice(690 * 1024)).toBeUndefined();
    expect(sizeAdvice(1141 * 1024)).toBeUndefined();
    expect(sizeAdvice(LEARNING_AREA_SIZE_HINT_BYTES - 1)).toBeUndefined();
  });

  it('meldet sich bei einer ungewöhnlich großen Datei', () => {
    const satz = sizeAdvice(LEARNING_AREA_SIZE_HINT_BYTES + 1);
    expect(satz).toBeDefined();
    expect(satz).toContain('ungewöhnlich groß');
  });

  it('nennt die Größe und hält trotzdem niemanden auf', () => {
    /*
      Der Wortlaut ist die Zusage: „Sie funktioniert" steht darin, und es gibt
      keine Stelle, an der die Ausgabe deswegen verweigert würde. Eine harte
      Schranke ohne Messung auf den Zielgeräten wäre geraten.
    */
    const satz = sizeAdvice(3 * 1024 * 1024) ?? '';
    expect(satz).toContain('3,0 MB');
    expect(satz).toContain('funktioniert');
  });
});

describe('Die Größenangabe selbst', () => {
  it('schreibt sie so, wie eine Lehrkraft sie liest', () => {
    expect(describeFileSize(512)).toBe('512 B');
    expect(describeFileSize(690 * 1024)).toBe('690 KB');
    expect(describeFileSize(2 * 1024 * 1024)).toBe('2,0 MB');
    expect(describeFileSize(1617 * 1024)).toBe('1,6 MB');
  });

  it('benutzt das deutsche Dezimalkomma', () => {
    expect(describeFileSize(1_500_000)).not.toContain('.');
  });
});
