import { inflateSync } from 'fflate';
import type {
  DictionaryEntry,
  DictionaryMeta,
  DictionaryProvider,
  DictionarySense,
  DictionarySuggestion,
  LookupQuality,
} from './DictionaryProvider';
import { rankEntries } from './ranking';
import {
  RUNTIME_FORMAT_VERSION,
  normalizeKey,
  shardOf,
  type PackedEntry,
  type PackedShard,
} from './runtimeFormat';

/**
 * Das eingebaute Offline-Wörterbuch.
 *
 * ## Warum `fflate` und nicht `DecompressionStream`
 *
 * Die browsereigene Dekompression wäre bequemer und ist genau dort nicht
 * verlässlich, wo dieses Wörterbuch am meisten zählt: in einer Lehrkraftdatei,
 * die per Doppelklick unter `file://` in Safari geöffnet wird. `fflate` liegt
 * ohnehin im Projekt, arbeitet synchron im Hauptthread und verhält sich überall
 * gleich. Kein Worker – ein Worker unter `file://` ist in Safari eine Wette.
 *
 * ## Warum Fächer und nicht alles auf einmal
 *
 * Der Datensatz umfasst 66 000 Stichwörter. Sie beim Öffnen der Datei zu
 * entpacken hieße, jede Lehrkraft für eine Suche bezahlen zu lassen, die sie
 * vielleicht nie stellt. Stattdessen wird die Metadatei einmal geladen und pro
 * Suche genau ein Fach entpackt – rund 100 KiB, im Millisekundenbereich.
 *
 * ## Reihenfolge der Suche
 *
 * 1. der Begriff selbst (`exact`; bei Leerzeichen `phrase`),
 * 2. dessen Grundformen laut Flexionsverzeichnis (`lemma`).
 *
 * Mehrwortbegriffe werden **vor** ihren Einzelwörtern gesucht: Wer
 * `shell shock` nachschlägt, will nicht `shell` und `shock`. Die Zerlegung in
 * Einzelwörter findet hier bewusst gar nicht statt – sie ist Sache der
 * Kandidatengewinnung, die den Begriff überhaupt erst gebildet hat.
 */

/** Die geladene Datei, so wie der Erzeuger sie schreibt. */
interface DictionaryPayload {
  meta: DictionaryMeta;
  shards: string[];
}

/** Wie viele entpackte Fächer gleichzeitig im Speicher bleiben dürfen. */
const SHARD_CACHE_LIMIT = 8;

/** Base64 → Bytes, ohne Abhängigkeit von Node oder einer Polyfill. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toSuggestion(packed: PackedEntry['n'][number]['g'][number]): DictionarySuggestion {
  return {
    german: packed.d,
    ...(packed.x ? { gender: packed.x } : {}),
    ...(packed.r?.length ? { register: packed.r } : {}),
    ...(packed.q ? { qualifier: packed.q } : {}),
    ...(packed.m ? { multiword: true } : {}),
  };
}

function toEntry(packed: PackedEntry, lemma: string, quality: LookupQuality): DictionaryEntry {
  const senses: DictionarySense[] = packed.n.map((sense) => ({
    sense: sense.s,
    ...(sense.v ? { via: sense.v } : {}),
    suggestions: sense.g.map(toSuggestion),
  }));
  return {
    headword: packed.w,
    lemma,
    ...(packed.p && packed.p !== '?' ? { partOfSpeech: packed.p } : {}),
    senses,
    ...(packed.m ? { multiword: true } : {}),
    quality,
    source: 'wiktionary',
  };
}

export interface OfflineDictionaryOptions {
  /**
   * Lädt die Datei. Ausgelagert, damit Tests einen kleinen Bestand einsetzen
   * können, ohne 6 MB zu erzeugen – und damit die echte Datei ein eigener
   * Chunk bleibt, der erst bei der ersten Suche geholt wird.
   */
  load: () => Promise<DictionaryPayload>;
}

/**
 * Der Standardlader.
 *
 * Ein dynamischer Import: Das Wörterbuch wird ein eigener Chunk und landet
 * **nicht** im Startbündel. Für die Schülerlaufzeit ist das entscheidend – dort
 * importiert niemand dieses Modul, also enthält sie auch keine Wörterbuchdaten.
 */
async function loadBundledDictionary(): Promise<DictionaryPayload> {
  const module = await import('./data/dictionary.json');
  return (module.default ?? module) as unknown as DictionaryPayload;
}

export function createOfflineDictionary(
  options: OfflineDictionaryOptions = { load: loadBundledDictionary },
): DictionaryProvider {
  let payload: DictionaryPayload | undefined;
  let loading: Promise<DictionaryPayload> | undefined;
  let broken = false;
  const shardCache = new Map<number, PackedShard>();

  async function payloadOnce(): Promise<DictionaryPayload | undefined> {
    if (broken) return undefined;
    if (payload) return payload;
    loading ??= options.load();
    try {
      payload = await loading;
    } catch {
      // Ein fehlendes oder beschädigtes Wörterbuch darf die Textanalyse nicht
      // anhalten. Ohne Vorschläge tippt die Lehrkraft von Hand – wie bisher.
      broken = true;
      return undefined;
    }
    if (payload?.meta?.formatVersion !== RUNTIME_FORMAT_VERSION) {
      broken = true;
      return undefined;
    }
    return payload;
  }

  function shard(data: DictionaryPayload, index: number): PackedShard | undefined {
    const cached = shardCache.get(index);
    if (cached) return cached;
    const encoded = data.shards[index];
    if (!encoded) return undefined;
    let parsed: PackedShard;
    try {
      const bytes = inflateSync(base64ToBytes(encoded));
      parsed = JSON.parse(new TextDecoder().decode(bytes)) as PackedShard;
    } catch {
      // Ein einzelnes beschädigtes Fach kostet seine Wörter, nicht die Suche.
      return undefined;
    }
    // Ältestes zuerst hinaus – `Map` merkt sich die Einfügereihenfolge.
    if (shardCache.size >= SHARD_CACHE_LIMIT) {
      const oldest = shardCache.keys().next().value;
      if (oldest !== undefined) shardCache.delete(oldest);
    }
    shardCache.set(index, parsed);
    return parsed;
  }

  function entriesFor(data: DictionaryPayload, key: string): PackedEntry[] {
    const found = shard(data, shardOf(key, data.meta.shardCount))?.e[key];
    return Array.isArray(found) ? found : [];
  }

  return {
    id: 'wiktionary-offline',
    label: 'Offline-Wörterbuch',

    async isAvailable() {
      return Boolean(await payloadOnce());
    },

    async meta() {
      return (await payloadOnce())?.meta;
    },

    async lookup(headword: string) {
      const data = await payloadOnce();
      if (!data) return [];

      const key = normalizeKey(headword);
      if (!key) return [];

      const results: DictionaryEntry[] = [];
      const seen = new Set<string>();

      // 1. Der Begriff selbst. Ein Leerzeichen macht daraus einen Mehrwortfund.
      const directQuality: LookupQuality = key.includes(' ') ? 'phrase' : 'exact';
      for (const entry of entriesFor(data, key)) {
        results.push(toEntry(entry, key, directQuality));
        seen.add(entry.w + '|' + entry.p);
      }

      // 2. Grundformen. `lives` führt ehrlich zu **beiden** – `life` und `live`.
      const forms = shard(data, shardOf(key, data.meta.shardCount))?.f[key];
      for (const form of Array.isArray(forms) ? forms : []) {
        const lemmaKey = normalizeKey(form.l);
        for (const entry of entriesFor(data, lemmaKey)) {
          const id = entry.w + '|' + entry.p;
          if (seen.has(id)) continue;
          seen.add(id);
          results.push(toEntry(entry, form.l, 'lemma'));
        }
      }

      return rankEntries(results);
    },
  };
}
