import { describe, expect, it } from 'vitest';

import { attestsIdenticalMeaning, cognateFingerprint, identicalMeanings } from './cognates';
import { attestCognates, attestationKey } from './attestCognates';
import { emptyDraft, validateDrafts, type DraftRow } from './draft';
import type { DictionaryEntry, DictionaryProvider } from '../dictionary/DictionaryProvider';

/**
 * Wörter, die im Deutschen genauso heißen – `erosion → Erosion`.
 *
 * Die Regel in einem Satz: **Der Befund entfällt nur mit Beleg.** Das
 * Wörterbuch muss die identische Übersetzung ausdrücklich führen, in einer
 * Bedeutungsgruppe, deren Wortart passt. Alles andere – kein Wörterbuch, ein
 * Verweis auf ein anderes Stichwort, eine andere Wortart, ein anderes Wort –
 * lässt „Bitte prüfen" stehen.
 *
 * Der Grund, warum das so eng gefasst ist: Der Befund gibt es, weil eine in
 * die falsche Spalte eingefügte Liste ein Paket erzeugt, in dem jede Karte
 * `erosion → erosion` fragt. Eine Regel, die das durchwinkt, sobald etwas
 * lateinisch aussieht, wäre schlimmer als gar keine Prüfung.
 */

function sense(german: string, extra: Partial<DictionaryEntry['senses'][number]> = {}) {
  return { sense: 'test', suggestions: [{ german }], ...extra };
}

function entry(partial: Partial<DictionaryEntry> = {}): DictionaryEntry {
  return {
    headword: 'erosion',
    lemma: 'erosion',
    senses: [sense('Erosion')],
    quality: 'exact',
    source: 'wiktionary',
    ...partial,
  };
}

function row(partial: Partial<DraftRow> = {}): DraftRow {
  return { ...emptyDraft(), english: 'erosion', german: 'Erosion', ...partial };
}

/** Ein Wörterbuch, das genau die übergebenen Einträge kennt – und zählt mit. */
function stubDictionary(entries: readonly DictionaryEntry[]) {
  const calls: string[] = [];
  const provider: DictionaryProvider = {
    id: 'stub',
    label: 'Test',
    async isAvailable() {
      return true;
    },
    async lookup(headword: string) {
      calls.push(headword);
      return entries;
    },
    async meta() {
      return undefined;
    },
  };
  return { provider, calls };
}

describe('Welche Bedeutungen mit dem Stichwort übereinstimmen', () => {
  it('erkennt sie unabhängig von Groß- und Kleinschreibung', () => {
    expect(identicalMeanings('erosion', 'Erosion')).toEqual(['Erosion']);
    expect(identicalMeanings('Erosion', 'erosion')).toEqual(['erosion']);
  });

  it('greift nur die identische Bedeutung heraus, nicht die ganze Zeile', () => {
    expect(identicalMeanings('erosion', 'Erosion; die Abtragung')).toEqual(['Erosion']);
  });

  it('meldet nichts, wenn sich die Übersetzung unterscheidet', () => {
    expect(identicalMeanings('erosion', 'die Abtragung')).toEqual([]);
  });

  it('zählt einen bloß ähnlichen Fall nicht mit', () => {
    /*
      Absichtlich der strenge Vergleich und nicht der tolerante ohne Artikel:
      `die Bank` und `bank` sind ein Fall, den man ansehen soll.
    */
    expect(identicalMeanings('bank', 'die Bank')).toEqual([]);
  });
});

describe('Wann das Wörterbuch einen Beleg liefert', () => {
  it('belegt eine ausdrücklich geführte identische Übersetzung', () => {
    expect(attestsIdenticalMeaning([entry()], 'erosion')).toBe(true);
  });

  it('belegt nichts, wenn die Quelle das Wort gar nicht kennt', () => {
    expect(attestsIdenticalMeaning([], 'erosion')).toBe(false);
  });

  it('belegt nichts, wenn die Quelle etwas anderes führt', () => {
    const anders = entry({ senses: [sense('die Abtragung')] });
    expect(attestsIdenticalMeaning([anders], 'erosion')).toBe(false);
  });

  it('zählt einen Verweis auf ein anderes Stichwort nicht als Beleg', () => {
    /*
      `via` heißt: Diese Bedeutung stammt von einem anderen Eintrag, den die
      Anwendung dazugezogen hat. Das ist eine Schlussfolgerung und keine
      Auskunft der Quelle – und ein Beleg, der auf einer Schlussfolgerung
      beruht, ist keiner.
    */
    const verwiesen = entry({ senses: [sense('Erosion', { via: 'denudation' })] });
    expect(attestsIdenticalMeaning([verwiesen], 'erosion')).toBe(false);
  });

  it('verlangt die passende Wortart, wo die Vokabel eine hat', () => {
    /*
      `to fall` und `der Fall` schreiben sich gleich und haben nichts
      miteinander zu tun. Ein Eintrag zum Substantiv belegt nicht, dass die
      Übersetzung eines Verbs stimmt.
    */
    const substantiv = entry({ headword: 'fall', partOfSpeech: 'noun', senses: [sense('Fall')] });
    expect(attestsIdenticalMeaning([substantiv], 'fall', 'noun')).toBe(true);
    expect(attestsIdenticalMeaning([substantiv], 'fall', 'verb')).toBe(false);
  });

  it('nimmt bei unbekannter Wortart jede Gruppe – aber nur belegte', () => {
    const substantiv = entry({ partOfSpeech: 'noun' });
    expect(attestsIdenticalMeaning([substantiv], 'erosion', undefined)).toBe(true);
  });

  it('lässt Registermarker und Klammerzusätze den Beleg nicht verhindern', () => {
    /*
      Sie verhindern in `safeAutoAnswer`, dass eine Bedeutung **ohne
      Rückfrage übernommen** wird. Hier ist die Übersetzung schon da; gefragt
      ist nur, ob die Quelle sie kennt.
    */
    const markiert = entry({
      senses: [{ sense: 'test', suggestions: [{ german: 'Erosion', register: ['technical'] }] }],
    });
    expect(attestsIdenticalMeaning([markiert], 'erosion')).toBe(true);
  });
});

describe('Der Befund in der Prüftabelle', () => {
  function befunde(draft: DraftRow): string[] {
    const [geprueft] = validateDrafts([draft]);
    return (geprueft?.issues ?? []).map((issue) => issue.message);
  }

  it('steht ohne Beleg da und hält das Speichern auf', () => {
    expect(befunde(row())).toContain('Übersetzung stimmt mit dem englischen Stichwort überein.');
  });

  it('entfällt mit gültigem Beleg', () => {
    const belegt = row({ cognateAttestedFor: cognateFingerprint('erosion', '') });
    expect(befunde(belegt)).not.toContain(
      'Übersetzung stimmt mit dem englischen Stichwort überein.',
    );
  });

  it('kommt zurück, wenn die Lernform ausgetauscht wird', () => {
    /*
      Der Beleg gilt für **einen** Sachverhalt. Wer nach dem Beleg die Lernform
      ändert, hat einen anderen Fall vor sich – und ein Beleg, der das
      überdauerte, wäre eine Unterschrift unter etwas, das man nie gelesen hat.
    */
    const belegt = row({
      cognateAttestedFor: cognateFingerprint('erosion', ''),
      english: 'motor',
      german: 'Motor',
    });
    expect(befunde(belegt)).toContain('Übersetzung stimmt mit dem englischen Stichwort überein.');
  });

  it('kommt zurück, wenn die Wortart wechselt', () => {
    const belegt = row({
      english: 'fall',
      german: 'Fall',
      partOfSpeech: 'noun',
      cognateAttestedFor: cognateFingerprint('fall', 'noun'),
    });
    expect(befunde(belegt)).not.toContain(
      'Übersetzung stimmt mit dem englischen Stichwort überein.',
    );
    expect(befunde({ ...belegt, partOfSpeech: 'verb' })).toContain(
      'Übersetzung stimmt mit dem englischen Stichwort überein.',
    );
  });

  it('bleibt für die anderen Zeilen unberührt', () => {
    // Der eigentliche Anlass des Befunds: eine Liste in der falschen Spalte.
    const falsch = row({ english: 'shoreline', german: 'shoreline' });
    expect(befunde(falsch)).toContain('Übersetzung stimmt mit dem englischen Stichwort überein.');
  });
});

describe('Der Nachschlagepass', () => {
  it('belegt die Zeile, die das Wörterbuch hergibt', async () => {
    const { provider } = stubDictionary([entry()]);
    const [geprueft] = await attestCognates([row()], provider);
    expect(geprueft?.cognateAttestedFor).toBe(cognateFingerprint('erosion', ''));
  });

  it('lässt eine Zeile ohne Beleg unangetastet', async () => {
    const { provider } = stubDictionary([entry({ senses: [sense('die Abtragung')] })]);
    const [geprueft] = await attestCognates([row()], provider);
    expect(geprueft?.cognateAttestedFor).toBeUndefined();
  });

  it('schlägt gar nicht erst nach, wo es nichts zu belegen gibt', async () => {
    /*
      In einem Paket mit sechzig Vokabeln sind null bis drei Zeilen betroffen.
      Sechzig Anfragen an ein 6-MB-Archiv wären der Unterschied zwischen einer
      Prüftabelle, die sofort dasteht, und einer, die lädt.
    */
    const { provider, calls } = stubDictionary([entry()]);
    const normal = [
      row({ english: 'shoreline', german: 'die Küstenlinie' }),
      row({ english: 'tide', german: 'die Flut' }),
    ];
    await attestCognates(normal, provider);
    expect(calls).toEqual([]);
  });

  it('schlägt eine Lernform nur einmal nach, auch bei zwei Zeilen', async () => {
    const { provider, calls } = stubDictionary([entry()]);
    await attestCognates([row(), row({ id: 'zweite' })], provider);
    expect(calls).toEqual(['erosion']);
  });

  it('schlägt einen bereits belegten Fall nicht erneut nach', async () => {
    const { provider, calls } = stubDictionary([entry()]);
    const belegt = row({ cognateAttestedFor: cognateFingerprint('erosion', '') });
    await attestCognates([belegt], provider);
    expect(calls).toEqual([]);
  });

  it('überlebt ein Wörterbuch, das nicht antwortet', async () => {
    /*
      Ein Ladefehler ist kein Beleg – und kein Grund, die Prüftabelle scheitern
      zu lassen. Der Befund bleibt stehen, und bestätigen kann man ihn wie
      bisher.
    */
    const kaputt: DictionaryProvider = {
      id: 'kaputt',
      label: 'Kaputt',
      async isAvailable() {
        return true;
      },
      async lookup() {
        throw new Error('Archiv nicht lesbar');
      },
      async meta() {
        return undefined;
      },
    };
    const [geprueft] = await attestCognates([row()], kaputt);
    expect(geprueft?.cognateAttestedFor).toBeUndefined();
  });

  it('hält kein „nicht belegt" fest', async () => {
    /*
      Sonst würde ein Wörterbuch, das beim ersten Anlauf noch lud, dauerhaft
      zu einer fachlichen Aussage – und der zweite Anlauf fände einen Fall vor,
      der scheinbar schon geklärt ist.
    */
    const leer = stubDictionary([]);
    const [erstesMal] = await attestCognates([row()], leer.provider);
    expect(erstesMal?.cognateAttestedFor).toBeUndefined();

    const jetztDa = stubDictionary([entry()]);
    const [zweitesMal] = await attestCognates([erstesMal as DraftRow], jetztDa.provider);
    expect(zweitesMal?.cognateAttestedFor).toBe(cognateFingerprint('erosion', ''));
  });
});

describe('Der Auslöseschlüssel', () => {
  it('ist leer, wenn es nichts nachzuschlagen gibt', () => {
    expect(attestationKey([row({ english: 'tide', german: 'die Flut' })])).toBe('');
  });

  it('ändert sich nicht, wenn eine andere Zeile bearbeitet wird', () => {
    /*
      Der Effekt in der Oberfläche hängt daran. Änderte sich der Schlüssel bei
      jedem Tastendruck in irgendeinem Feld, liefe der Pass ständig an.
    */
    const offen = row();
    const andere = row({ id: 'x', english: 'tide', german: 'die Flut' });
    const vorher = attestationKey([offen, andere]);
    const nachher = attestationKey([offen, { ...andere, german: 'die Gezeiten' }]);
    expect(nachher).toBe(vorher);
  });

  it('wird leer, sobald der Fall belegt ist', () => {
    const belegt = row({ cognateAttestedFor: cognateFingerprint('erosion', '') });
    expect(attestationKey([belegt])).toBe('');
  });
});
