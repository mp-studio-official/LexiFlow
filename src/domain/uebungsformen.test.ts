import { describe, expect, it } from 'vitest';
import {
  UEBUNGSFORMEN,
  formkarten,
  wegZu,
  zaehleFaellige,
  zaehleRichtung,
  zaehleSchwierige,
} from './uebungsformen';
import type { Paketstand } from './uebungsformen';
import { directionKey } from './ids';
import type { EntryProgress, LearningDirection, VocabEntry } from './schema';

const JETZT = new Date('2026-10-02T10:00:00.000Z');

function eintrag(id: string): VocabEntry {
  return { id, english: id, germanAnswers: [id] } as VocabEntry;
}

function stand(entryId: string, teil: Partial<EntryProgress>): EntryProgress {
  return {
    key: directionKey(entryId, 'en-de'),
    packId: 'p-1',
    entryId,
    direction: 'en-de',
    box: 1,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    dueAt: '2026-10-09T10:00:00.000Z',
    ...teil,
  } as EntryProgress;
}

function paket(
  ids: string[],
  staende: EntryProgress[],
  direction: LearningDirection = 'en-de',
): Paketstand {
  return {
    courseId: 'k-1',
    packId: 'p-1',
    titel: 'Unit 1',
    direction,
    entries: ids.map(eintrag),
    staende: new Map(staende.map((s) => [directionKey(s.entryId, s.direction), s])),
  };
}

describe('die Zahlen hinter den Karten', () => {
  it('fällig ist, was heute dran ist — nicht, was noch liegt', () => {
    const p = paket(
      ['a', 'b'],
      [
        stand('a', { dueAt: '2026-10-01T10:00:00.000Z' }),
        stand('b', { dueAt: '2026-10-09T10:00:00.000Z' }),
      ],
    );
    expect(zaehleFaellige(p, JETZT)).toBe(1);
  });

  it('ein Wort ohne Lernstand ist weder fällig noch schwierig', () => {
    /*
      Der Fall, der eine Karte sonst von selbst erzeugte: Ein frisches Paket
      hat lauter Wörter ohne Stand. Zählten die mit, stünde „Fällige
      Wiederholungen" am ersten Tag mit der vollen Paketgröße da.
    */
    const p = paket(['a', 'b'], []);
    expect(zaehleFaellige(p, JETZT)).toBe(0);
    expect(zaehleSchwierige(p)).toBe(0);
  });

  it('schwierig zählt nach derselben Regel wie `istSchwierig`', () => {
    const p = paket(
      ['a', 'b'],
      [stand('a', { wrongCount: 3, box: 1 }), stand('b', { wrongCount: 3, box: 5 })],
    );
    expect(zaehleSchwierige(p)).toBe(1);
  });

  it('eine Richtung ist nur bei einem Paket mit beiden Richtungen wählbar', () => {
    expect(zaehleRichtung(paket(['a', 'b'], [], 'both'))).toBe(2);
    expect(zaehleRichtung(paket(['a', 'b'], [], 'en-de'))).toBe(0);
    expect(zaehleRichtung(paket(['a', 'b'], [], 'de-en'))).toBe(0);
  });
});

describe('welche Karten überhaupt entstehen', () => {
  it('ohne Pakete gibt es keine Karte', () => {
    expect(formkarten([], JETZT)).toEqual([]);
  });

  it('eine Form ohne ein einziges Ziel erscheint nicht', () => {
    const p = paket(['a'], [stand('a', { dueAt: '2026-10-01T10:00:00.000Z' })], 'en-de');
    const formen = formkarten([p], JETZT).map((karte) => karte.form);
    /*
      Fällig ist etwas, schwierig nichts, und eine Richtungswahl gibt es bei
      einem Paket mit einer Richtung nicht. Die vier Ansichten aus 5B.15
      brauchen nur Wörter — die gibt es, also stehen sie da.
    */
    expect(formen).toEqual(['faellig', 'karten', 'selbsttest', 'frei', 'liste']);
    expect(formen).not.toContain('schwierig');
    expect(formen).not.toContain('en-de');
  });

  it('ein Paket ohne Wörter gibt gar keine Karte her', () => {
    const leer = paket([], [], 'both');
    expect(formkarten([leer], JETZT)).toEqual([]);
  });

  it('keine zwei Formen führen an dieselbe Adresse', () => {
    /*
      Die Gegenprobe zur Vermehrung der Karten: Zwei Karten, die dasselbe
      öffnen, sind eine Karte zu viel — und zwar eine, die etwas anderes
      verspricht, als sie tut.
    */
    const ziel = { courseId: 'k-1', packId: 'p-1', titel: 'Unit 1', anzahl: 1 };
    const adressen = UEBUNGSFORMEN.map((form) => wegZu(form, ziel));
    expect(new Set(adressen).size, `doppelte Adresse in ${adressen.join(' | ')}`).toBe(
      UEBUNGSFORMEN.length,
    );
  });

  it('Zeitformen und Spiele gibt es in dieser Datei nicht — auch nicht als Absicht', () => {
    /*
      Die Gegenprobe zur Vollständigkeit: Eine Karte, die erst „bald" heißt und
      dann versehentlich erscheint, beginnt damit, dass ihr Name irgendwo
      steht. Hier steht er nicht.
    */
    const alle = formkarten([paket(['a'], [stand('a', { wrongCount: 2 })], 'both')], JETZT);
    for (const karte of alle) {
      expect(karte.titel).not.toMatch(/Zeitform|Spiel/i);
      expect(karte.satz).not.toMatch(/bald|demnächst|später/i);
    }
  });

  it('die Ziele stehen nach Menge, nicht nach Zufall', () => {
    const viel = { ...paket(['a', 'b', 'c'], []), packId: 'p-viel', titel: 'Viel', direction: 'both' as const };
    const wenig = { ...paket(['a'], []), packId: 'p-wenig', titel: 'Wenig', direction: 'both' as const };
    const karte = formkarten([wenig, viel], JETZT).find((k) => k.form === 'en-de');
    expect(karte?.ziele.map((z) => z.titel)).toEqual(['Viel', 'Wenig']);
    expect(karte?.gesamt).toBe(4);
  });
});

describe('wohin eine Karte führt', () => {
  const ziel = { courseId: 'k-1', packId: 'p-1', titel: 'Unit 1', anzahl: 3 };

  it('die vier wiederverwendeten Ansichten haben eigene Adressen', () => {
    expect(wegZu('karten', ziel)).toBe('/ueben/karten/k-1/p-1');
    expect(wegZu('selbsttest', ziel)).toBe('/ueben/selbsttest/k-1/p-1');
    expect(wegZu('frei', ziel)).toBe('/ueben/frei/k-1/p-1');
    expect(wegZu('liste', ziel)).toBe('/ueben/liste/k-1/p-1');
  });

  it('eine Richtung geht als Richtung mit, eine Auswahl als Auswahl', () => {
    expect(wegZu('en-de', ziel)).toBe('/lernen/kurs/k-1/ueben/p-1?richtung=en-de');
    expect(wegZu('de-en', ziel)).toBe('/lernen/kurs/k-1/ueben/p-1?richtung=de-en');
    expect(wegZu('faellig', ziel)).toBe('/lernen/kurs/k-1/ueben/p-1?auswahl=faellig');
    expect(wegZu('schwierig', ziel)).toBe('/lernen/kurs/k-1/ueben/p-1?auswahl=schwierig');
  });

  it('der Weg führt in den bestehenden Rundeneinstieg, nicht an eine neue Adresse', () => {
    /*
      Eine zweite Adresse für dieselbe Runde wäre ein zweiter Weg zum selben
      Ort — und einer davon würde irgendwann vergessen.
    */
    for (const form of ['faellig', 'schwierig', 'en-de', 'de-en'] as const) {
      expect(wegZu(form, ziel)).toMatch(/^\/lernen\/kurs\/[^/]+\/ueben\/[^?]+\?/);
    }
  });
});
