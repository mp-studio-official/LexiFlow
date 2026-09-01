#!/usr/bin/env node
/**
 * Erzeugt den ausgelieferten Laufzeitdatensatz aus dem Extraktionsergebnis.
 *
 *   node scripts/dictionary/build-dictionary-runtime.mjs \
 *     --in   build/dictionary/en-de.raw.jsonl \
 *     --out  src/dictionary/data/dictionary.json \
 *     --meta build/dictionary/runtime-report.json
 *
 * Jedes Fach wird einzeln mit `fflate` deflatiert und Base64-kodiert. Warum
 * `fflate` und nicht `DecompressionStream`: Die browsereigene API ist nicht
 * überall verlässlich – unter `file://` in Safari ist sie kein sicherer Weg,
 * und genau dort muss die Lehrkraftdatei funktionieren. `fflate` liegt ohnehin
 * schon im Projekt (Tabellenimport) und arbeitet überall gleich.
 */

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { deflateSync } from 'fflate';
import { RUNTIME_FORMAT_VERSION, SHARD_COUNT, buildShards } from './buildRuntime.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    args[key.slice(2)] = next && !next.startsWith('--') ? (i += 1, next) : true;
  }
  return args;
}

async function* readLines(path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
      console.error(
      'Aufruf: --in <en-de.raw.jsonl> --out <dictionary.json> [--meta <bericht.json>] [--source-report <extraktion.json>] [--keep-names]',
    );
    process.exit(2);
  }

  const started = Date.now();
  const lines = [];
  for await (const line of readLines(args.in)) lines.push(line);

  const { shards, stats } = buildShards(lines, { keepProperNouns: Boolean(args['keep-names']) });

  let rawBytes = 0;
  let packedBytes = 0;
  const encoded = shards.map((shard) => {
    const json = JSON.stringify(shard);
    rawBytes += Buffer.byteLength(json, 'utf8');
    // `level: 9` und `mem: 12` – der Bau darf langsam sein, das Öffnen nicht.
    const packed = deflateSync(Buffer.from(json, 'utf8'), { level: 9, mem: 12 });
    packedBytes += packed.length;
    return Buffer.from(packed).toString('base64');
  });

  const sizes = encoded.map((shard) => shard.length);
  // Der Extraktionsbericht wandert als Herkunftsnachweis mit in die Metadaten.
  const extraktion = args['source-report']
    ? JSON.parse(readFileSync(args['source-report'], 'utf8'))
    : undefined;

  const payload = {
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
        hinweis:
          'Abgeleitet aus dem englischen Wiktionary, dort doppelt lizenziert unter CC BY-SA 4.0 und GFDL. ' +
          'Dieser abgeleitete Datensatz steht unter CC BY-SA 4.0. Zitate, Bilder und Audio sind nicht enthalten.',
        rueckverweis: 'https://en.wiktionary.org/',
      },
      zahlen: stats,
      ...(extraktion ? { extraktionsbericht: extraktion } : {}),
    },
    shards: encoded,
  };

  const json = JSON.stringify(payload);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, json, 'utf8');

  const report = {
    erzeugt: new Date().toISOString(),
    dauerSekunden: Number(((Date.now() - started) / 1000).toFixed(1)),
    ...stats,
    shards: SHARD_COUNT,
    shardRohBytes: rawBytes,
    shardPackedBytes: packedBytes,
    base64Bytes: sizes.reduce((sum, size) => sum + size, 0),
    dateiBytes: Buffer.byteLength(json, 'utf8'),
    groessterShardBase64: Math.max(...sizes),
    kleinsterShardBase64: Math.min(...sizes),
    sha256: createHash('sha256').update(json).digest('hex'),
  };

  if (args.meta) {
    mkdirSync(dirname(args.meta), { recursive: true });
    writeFileSync(args.meta, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
}

await main();
