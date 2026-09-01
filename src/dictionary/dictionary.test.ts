import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import {
  RUNTIME_FORMAT_VERSION,
  SHARD_COUNT,
  normalizeKey,
  shardOf,
  type PackedShard,
} from './runtimeFormat';
import {
  SHARD_COUNT as BUILD_SHARD_COUNT,
  RUNTIME_FORMAT_VERSION as BUILD_FORMAT_VERSION,
  buildShards,
  normalizeKey as buildNormalizeKey,
  shardOf as buildShardOf,
} from '../../scripts/dictionary/buildRuntime.mjs';
import { createOfflineDictionary } from './offlineDictionary';
import { isQuestionable, rankSenses, rankSuggestions, suggestionPenalty } from './ranking';
import type { DictionaryMeta, DictionarySense } from './DictionaryProvider';

/**
 * Erzeuger und Leser sind zwei Dateien in zwei Sprachen. Damit sie sich einig
 * bleiben, prüft dieser Test sie **gegeneinander**, statt beide Seiten
 * dieselbe Annahme wiederholen zu lassen.
 */
describe('Laufzeitformat: Erzeuger und Leser stimmen überein', () => {
  it('teilt Fachanzahl und Formatversion', () => {
    expect(SHARD_COUNT).toBe(BUILD_SHARD_COUNT);
    expect(RUNTIME_FORMAT_VERSION).toBe(BUILD_FORMAT_VERSION);
  });

  it('normalisiert Schlüssel identisch', () => {
    const proben = [
      'Island',
      '  shell   shock ',
      "don’t",
      'Café',
      'WELL-KNOWN',
      'sq mi',
      '',
      'ÄÖÜ',
    ];
    for (const probe of proben) {
      expect(normalizeKey(probe), probe).toBe(buildNormalizeKey(probe));
    }
  });

  it('streut Schlüssel identisch', () => {
    for (const probe of ['island', 'doctor', 'shell shock', 'constructor', 'a', 'zzz']) {
      expect(shardOf(probe), probe).toBe(buildShardOf(probe));
      expect(shardOf(probe)).toBeGreaterThanOrEqual(0);
      expect(shardOf(probe)).toBeLessThan(SHARD_COUNT);
    }
  });

  it('verteilt die Fächer einigermaßen gleichmäßig', () => {
    // Keine Schönheitsfrage: Das größte Fach bestimmt die Wartezeit der Suche.
    const counts = new Array(SHARD_COUNT).fill(0);
    for (let index = 0; index < 20000; index += 1) counts[shardOf('wort' + index)] += 1;
    const average = 20000 / SHARD_COUNT;
    expect(Math.max(...counts)).toBeLessThan(average * 1.5);
    expect(Math.min(...counts)).toBeGreaterThan(average * 0.5);
  });
});

/* -------------------------------------------------------------------- Daten */

/** Ein kleiner Bestand, gebaut mit dem **echten** Erzeuger. */
const lines = [
  {
    word: 'limestone',
    pos: 'noun',
    senses: [
      {
        sense: 'abundant rock',
        german: [
          { german: 'Kalkstein', gender: 'm' },
          { german: 'Calciumcarbonat', gender: 'n' },
          { german: 'Kalk', gender: 'm' },
        ],
      },
    ],
  },
  {
    word: 'island',
    pos: 'noun',
    senses: [{ sense: 'land surrounded by water', german: [{ german: 'Insel', gender: 'f' }] }],
  },
  { form: 'islands', lemmas: [{ lemma: 'island', pos: 'noun', tags: ['plural'] }] },
  {
    word: 'doctor',
    pos: 'noun',
    senses: [
      { sense: 'doctorate holder', german: [{ german: 'Doktor', gender: 'm' }] },
      { sense: 'medical doctor', via: 'physician', german: [{ german: 'Arzt', gender: 'm' }] },
    ],
  },
  {
    word: 'shell shock',
    pos: 'noun',
    multiword: true,
    senses: [{ sense: 'psychiatric condition', german: [{ german: 'Kriegszitterer', register: ['dated'] }] }],
  },
  {
    word: 'London',
    pos: 'name',
    senses: [{ sense: 'capital', german: [{ german: 'London', gender: 'n' }] }],
  },
  // Ein Stichwort, das auf `Object.prototype` liegt – im Wörterbuch ein Wort
  // wie jedes andere, in einem Objektliteral eine Falle.
  {
    word: 'constructor',
    pos: 'noun',
    senses: [{ sense: 'one who constructs', german: [{ german: 'Erbauer', gender: 'm' }] }],
  },
];

function payloadFrom(input: unknown[] = lines) {
  const { shards, stats } = buildShards(input);
  return {
    payload: {
      meta: {
        formatVersion: RUNTIME_FORMAT_VERSION,
        shardCount: SHARD_COUNT,
        quelle: {
          name: 'Wiktionary (englische Ausgabe)',
          url: 'https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz',
          dump: '2026-08-05',
          extraktion: '2026-08-28',
          wiktextract: ['872fc7b', '4deed51'],
          sha256: '4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006',
          pruefsummeHinweis: 'lokal berechnet, nicht offiziell veröffentlicht',
          werkzeug: 'wiktextract (MIT, © Tatu Ylonen)',
        },
        lizenz: {
          name: 'CC BY-SA 4.0',
          url: 'https://creativecommons.org/licenses/by-sa/4.0/',
          hinweis: 'Abgeleitet aus dem englischen Wiktionary.',
          rueckverweis: 'https://en.wiktionary.org/',
        },
        zahlen: stats,
      } as DictionaryMeta,
      shards: (shards as PackedShard[]).map((shard) =>
        Buffer.from(deflateSync(Buffer.from(JSON.stringify(shard), 'utf8'), { level: 9 })).toString(
          'base64',
        ),
      ),
    },
    stats,
  };
}

function dictionary(input?: unknown[]) {
  const { payload } = payloadFrom(input);
  return createOfflineDictionary({ load: async () => payload });
}

/* ------------------------------------------------------------------ Suche */

describe('Offline-Wörterbuch', () => {
  it('findet ein Stichwort genau', async () => {
    const [entry] = await dictionary().lookup('limestone');
    expect(entry?.quality).toBe('exact');
    expect(entry?.headword).toBe('limestone');
    expect(entry?.partOfSpeech).toBe('noun');
    expect(entry?.senses[0]?.suggestions.map((s) => s.german)).toEqual([
      'Kalkstein',
      'Calciumcarbonat',
      'Kalk',
    ]);
    // Genus kommt mit, ohne dass jemand es raten müsste.
    expect(entry?.senses[0]?.suggestions[0]?.gender).toBe('m');
  });

  it('ist unabhängig von der Schreibweise', async () => {
    const dict = dictionary();
    expect((await dict.lookup('LIMESTONE'))[0]?.headword).toBe('limestone');
    expect((await dict.lookup('  Limestone ')).length).toBe(1);
  });

  it('findet eine Flexionsform über ihre Grundform', async () => {
    const [entry] = await dictionary().lookup('islands');
    expect(entry?.quality).toBe('lemma');
    expect(entry?.lemma).toBe('island');
    expect(entry?.headword).toBe('island');
    expect(entry?.senses[0]?.suggestions[0]?.german).toBe('Insel');
  });

  it('sagt dazu, **wie** die Form mit der Grundform zusammenhängt', async () => {
    /*
      `quality: 'lemma'` allein trägt zwei grundverschiedene Fälle: `islands →
      island` ist eine Beugung, `story → storey` eine Schreibvariante. Ohne
      dieses Merkmal sehen beide gleich aus – und die Empfehlung machte aus der
      Geschichte ein Stockwerk.
    */
    const [entry] = await dictionary().lookup('islands');
    expect(entry?.formTags).toEqual(['plural']);
  });

  it('lässt das Merkmal weg, wenn die Quelle keines nennt', async () => {
    const ohne = [
      { word: 'lorry', pos: 'noun', senses: [{ sense: 'truck', german: [{ german: 'Lastwagen' }] }] },
      { form: 'lorries', lemmas: [{ lemma: 'lorry', pos: 'noun' }] },
    ];
    const [entry] = await dictionary(ohne).lookup('lorries');
    expect(entry?.quality).toBe('lemma');
    expect(entry?.formTags).toBeUndefined();
  });

  it('erkennt einen Mehrwortbegriff als solchen', async () => {
    const [entry] = await dictionary().lookup('shell shock');
    expect(entry?.quality).toBe('phrase');
    expect(entry?.multiword).toBe(true);
  });

  it('behält den Verweis sichtbar', async () => {
    const [entry] = await dictionary().lookup('doctor');
    const geerbt = entry?.senses.find((sense) => sense.via);
    expect(geerbt?.via).toBe('physician');
    expect(geerbt?.suggestions[0]?.german).toBe('Arzt');
    // Und die eigene Bedeutung steht davor.
    expect(entry?.senses[0]?.via).toBeUndefined();
  });

  it('meldet ein unbekanntes Wort als leeres Ergebnis, nicht als Fehler', async () => {
    await expect(dictionary().lookup('zzqxwv')).resolves.toEqual([]);
    await expect(dictionary().lookup('')).resolves.toEqual([]);
    await expect(dictionary().lookup('   ')).resolves.toEqual([]);
  });

  it('kommt mit einem Stichwort zurecht, das auf Object.prototype liegt', async () => {
    const dict = dictionary();
    expect((await dict.lookup('constructor'))[0]?.headword).toBe('constructor');
    // Und erfindet nichts für die übrigen geerbten Eigenschaften.
    await expect(dict.lookup('toString')).resolves.toEqual([]);
    await expect(dict.lookup('__proto__')).resolves.toEqual([]);
  });

  it('nimmt Eigennamen nicht in den Bestand auf', async () => {
    await expect(dictionary().lookup('London')).resolves.toEqual([]);
  });

  it('liefert Quelle und Lizenz', async () => {
    const meta = await dictionary().meta();
    expect(meta?.lizenz.name).toBe('CC BY-SA 4.0');
    expect(meta?.quelle.sha256).toBe(
      '4c27d202e875550c2cc7ea93a4d21ddf80440e5030606d3edbb8b0e65dc64006',
    );
    expect(meta?.quelle.dump).toBe('2026-08-05');
  });

  it('nennt sich verfügbar, sobald die Datei gelesen ist', async () => {
    await expect(dictionary().isAvailable()).resolves.toBe(true);
  });
});

describe('Offline-Wörterbuch: Fehler führen zur Handeingabe, nicht zum Abbruch', () => {
  it('überlebt eine fehlende Datei', async () => {
    const dict = createOfflineDictionary({
      load: async () => {
        throw new Error('nicht da');
      },
    });
    await expect(dict.isAvailable()).resolves.toBe(false);
    await expect(dict.lookup('limestone')).resolves.toEqual([]);
    await expect(dict.meta()).resolves.toBeUndefined();
  });

  it('weist eine fremde Formatversion ab, statt sie zu raten', async () => {
    const { payload } = payloadFrom();
    const dict = createOfflineDictionary({
      load: async () => ({ ...payload, meta: { ...payload.meta, formatVersion: 99 } }),
    });
    await expect(dict.isAvailable()).resolves.toBe(false);
    await expect(dict.lookup('limestone')).resolves.toEqual([]);
  });

  it('überlebt ein beschädigtes Fach', async () => {
    const { payload } = payloadFrom();
    const kaputt = payload.shards.map((shard, index) =>
      index === shardOf('limestone') ? '!!! kein base64 !!!' : shard,
    );
    const dict = createOfflineDictionary({ load: async () => ({ ...payload, shards: kaputt }) });

    await expect(dict.lookup('limestone')).resolves.toEqual([]);
    // Die anderen Fächer bleiben benutzbar – ein Schaden, kein Totalausfall.
    expect((await dict.lookup('island')).length).toBe(1);
  });

  it('lädt die Datei nur einmal, auch bei vielen Suchen', async () => {
    const { payload } = payloadFrom();
    let calls = 0;
    const dict = createOfflineDictionary({
      load: async () => {
        calls += 1;
        return payload;
      },
    });
    await Promise.all([dict.lookup('island'), dict.lookup('doctor'), dict.lookup('limestone')]);
    await dict.lookup('island');
    expect(calls).toBe(1);
  });
});

/* --------------------------------------------------------------- Rangfolge */

describe('Rangfolge', () => {
  it('lässt die Reihenfolge der Quelle stehen, wo nichts dagegen spricht', () => {
    // `limestone`: Nach „kürzeste zuerst“ stünde „Kalk“ vorn. Das wäre schlechter.
    const ranked = rankSuggestions([
      { german: 'Kalkstein', gender: 'm' },
      { german: 'Calciumcarbonat', gender: 'n' },
      { german: 'Kalk', gender: 'm' },
    ]);
    expect(ranked.map((s) => s.german)).toEqual(['Kalkstein', 'Calciumcarbonat', 'Kalk']);
  });

  it('stuft markierte Übersetzungen zurück, ohne sie zu verstecken', () => {
    const ranked = rankSuggestions([
      { german: 'Kittel', register: ['dated'] },
      { german: 'Mantel' },
    ]);
    expect(ranked.map((s) => s.german)).toEqual(['Mantel', 'Kittel']);
    expect(ranked).toHaveLength(2);
  });

  it('stuft ein sehr langes Fachwort zurück', () => {
    const ranked = rankSuggestions([
      { german: 'elastisches Verformungsarbeitsaufnahmevermögen', gender: 'n', multiword: true },
      { german: 'Elastizität', gender: 'f' },
    ]);
    expect(ranked[0]?.german).toBe('Elastizität');
  });

  it('gewichtet die Zuschläge nachvollziehbar', () => {
    expect(suggestionPenalty({ german: 'Mantel' })).toBe(0);
    expect(suggestionPenalty({ german: 'Kittel', register: ['dated'] })).toBe(4);
    expect(suggestionPenalty({ german: 'schwarzes Brett', multiword: true })).toBe(2);
    expect(suggestionPenalty({ german: 'Kalk', qualifier: 'gebrannt' })).toBe(1);
  });

  it('stellt eigene Bedeutungen vor geerbte', () => {
    const senses: DictionarySense[] = [
      { sense: 'geerbt', via: 'physician', suggestions: [{ german: 'Arzt' }] },
      { sense: 'eigen', suggestions: [{ german: 'Doktor' }] },
    ];
    expect(rankSenses(senses).map((s) => s.sense)).toEqual(['eigen', 'geerbt']);
  });

  it('erkennt eine Bedeutung, die nur Zweifelhaftes trägt', () => {
    expect(
      isQuestionable({
        sense: 'psychiatric condition',
        suggestions: [{ german: 'Kriegszitterer', register: ['dated'] }],
      }),
    ).toBe(true);
    expect(isQuestionable({ sense: 'x', suggestions: [{ german: 'Insel', gender: 'f' }] })).toBe(
      false,
    );
    expect(isQuestionable({ sense: 'x', suggestions: [] })).toBe(true);
  });

  it('bringt einen exakten Treffer vor eine erschlossene Grundform', async () => {
    // `lives` liefert nur Grundformen; `island` einen exakten Treffer.
    const dict = dictionary([
      ...lines,
      { form: 'limestones', lemmas: [{ lemma: 'limestone', pos: 'noun' }] },
      {
        word: 'limestones',
        pos: 'noun',
        senses: [{ sense: 'plural use', german: [{ german: 'Kalksteine' }] }],
      },
    ]);
    const found = await dict.lookup('limestones');
    expect(found[0]?.quality).toBe('exact');
    expect(found[1]?.quality).toBe('lemma');
  });
});
