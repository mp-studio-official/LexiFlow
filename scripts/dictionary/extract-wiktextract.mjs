#!/usr/bin/env node
/**
 * Streaming-Extraktor: Wiktextract-Rohdaten → kompakte Englisch-Deutsch-Liste.
 *
 * Aufruf:
 *   node scripts/dictionary/extract-wiktextract.mjs \
 *     --source ~/Downloads/wiktextract-gate/raw-wiktextract-data.jsonl.gz \
 *     --out    build/dictionary/en-de.raw.jsonl \
 *     --report build/dictionary/report.json \
 *     [--limit-bytes N]   nur die ersten N komprimierten Bytes (Messläufe)
 *
 * ## Warum Streaming
 *
 * Die Quelle ist komprimiert 2,6 GB und entpackt 22,9 GB. Sie wird **nie**
 * vollständig entpackt: `gunzip` läuft als Transform-Stream, es geht immer nur
 * eine Zeile durch den Speicher. Auf dem Prüfrechner kostet ein voller
 * Durchlauf gut eine Minute – gemessen, nicht geschätzt.
 *
 * ## Warum ein Vorfilter auf der Rohzeile
 *
 * `JSON.parse` ist der teuerste Schritt. Die allermeisten Zeilen sind für ein
 * Englisch-Deutsch-Wörterbuch ohne Belang. Ein `String.includes` auf der noch
 * ungeparsten Zeile kostet Mikrosekunden und erspart das Parsen in über 90 %
 * der Fälle. Was der Vorfilter nicht sieht, zählt das Skript mit und schreibt
 * es in den Bericht – ein Filter, dessen Lücke niemand beziffert, ist eine
 * Behauptung.
 */

import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { readEntry, resolveCrossReferences } from './wiktextract.mjs';

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

/**
 * Der Vorfilter.
 *
 * Eine Zeile ist nur dann interessant, wenn sie englisch ist **und** entweder
 * eine deutsche Übersetzung oder eine Flexionsangabe enthält. Beide Nadeln
 * stehen so im echten Datensatz – nachgesehen, nicht geraten.
 */
const NEEDLE_EN = '"lang_code": "en"';
const NEEDLE_DE = '"code": "de"';
const NEEDLE_FORM = '"form_of"';
const NEEDLE_ALT = '"alt_of"';

/**
 * Jede englische Zeile wird gelesen.
 *
 * Der erste Entwurf verlangte zusätzlich eine deutsche Übersetzung oder eine
 * Flexionsangabe. Das war schneller und hatte eine Lücke, die genau den
 * interessanten Fall traf: ein Stichwort **ohne** eigene deutsche Übersetzung,
 * das ausschließlich auf ein anderes verweist, wurde nie geparst und fehlte
 * damit im Wörterbuch. Die Nadeln bleiben als Zähler erhalten, damit der
 * Bericht beziffert, wie viel der engere Filter übersehen hätte.
 */
function isEnglish(line) {
  return line.includes(NEEDLE_EN);
}

function wouldHavePassedNarrowFilter(line) {
  return line.includes(NEEDLE_DE) || line.includes(NEEDLE_FORM) || line.includes(NEEDLE_ALT);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source;
  const outPath = args.out;
  const reportPath = args.report;
  if (!source || !outPath) {
    console.error('Aufruf: --source <datei.gz> --out <datei.jsonl> [--report <datei.json>] [--limit-bytes N]');
    process.exit(2);
  }

  const started = Date.now();
  const stats = {
    zeilenGesamt: 0,
    zeilenEnglisch: 0,
    zeilenGeparst: 0,
    zeilenUebersprungen: 0,
    zusaetzlichGeparst: 0,
    reineVerweiseintraege: 0,
    parseFehler: 0,
    eintraegeMitDeutsch: 0,
    flexionsformen: 0,
    bedeutungen: 0,
    uebersetzungen: 0,
    verworfen: { affix: 0, leer: 0 },
    mehrwortStichwoerter: 0,
    mehrwortUebersetzungen: 0,
    mitGenus: 0,
    mitRegistermarker: 0,
    wortarten: {},
  };

  const entries = [];
  const forms = new Map();

  const readOptions = args['limit-bytes'] ? { end: Number(args['limit-bytes']) - 1 } : {};
  const input = createReadStream(source, readOptions).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      stats.zeilenGesamt += 1;
      if (!line) continue;
      if (!isEnglish(line)) {
        stats.zeilenUebersprungen += 1;
        continue;
      }
      stats.zeilenEnglisch += 1;
      if (!wouldHavePassedNarrowFilter(line)) stats.zusaetzlichGeparst += 1;
      stats.zeilenGeparst += 1;

      let raw;
      try {
        raw = JSON.parse(line);
      } catch {
        // Eine kaputte Zeile beendet den Lauf nicht. 22,9 GB Fremddaten ohne
        // einen einzigen Ausrutscher wären das eigentlich Überraschende.
        stats.parseFehler += 1;
        continue;
      }

      const entry = readEntry(raw);
      if (!entry) continue;

      if (entry.kind === 'form') {
        stats.flexionsformen += 1;
        // Mehrere Grundformen zu einer Form (etwa `lives` → `life` und `live`)
        // bleiben beide erhalten; die Auflösung ist Sache der Lookupschicht.
        const list = forms.get(entry.word) ?? [];
        if (!list.some((f) => f.lemma === entry.lemma && f.pos === entry.pos)) {
          list.push({ lemma: entry.lemma, pos: entry.pos, tags: entry.tags });
        }
        forms.set(entry.word, list);
        continue;
      }

      // Ein Eintrag, der nur über einen Verweis zu Übersetzungen kommt – genau
      // der Fall, den der engere Vorfilter nicht gesehen hätte.
      if (!entry.senses?.length && entry.crossRefs?.length) stats.reineVerweiseintraege += 1;
      entries.push(entry);
    }
  } catch (error) {
    /*
      Ein Messlauf schneidet die Datei mitten im gzip-Block ab; `Z_BUF_ERROR`
      ist dann der erwartete Abschluss, kein Defekt. Ohne `--limit-bytes` ist
      derselbe Fehler eine abgebrochene Quelldatei – und muss laut scheitern,
      damit niemand einen halben Datensatz für den ganzen hält.
    */
    const truncated = error?.code === 'Z_BUF_ERROR';
    if (!(truncated && args['limit-bytes'])) throw error;
    stats.abgeschnitten = true;
  }

  // Zweiter Durchgang: `doctor` → `physician`.
  const crossRefs = resolveCrossReferences(entries);

  mkdirSync(dirname(outPath), { recursive: true });
  const out = createWriteStream(outPath, { encoding: 'utf8' });

  for (const entry of entries) {
    if (!entry.senses?.length) continue;
    stats.eintraegeMitDeutsch += 1;
    if (entry.multiword) stats.mehrwortStichwoerter += 1;
    stats.wortarten[entry.pos ?? '?'] = (stats.wortarten[entry.pos ?? '?'] ?? 0) + 1;
    for (const sense of entry.senses) {
      stats.bedeutungen += 1;
      for (const german of sense.german) {
        stats.uebersetzungen += 1;
        if (german.gender) stats.mitGenus += 1;
        if (german.register) stats.mitRegistermarker += 1;
        if (german.multiword) stats.mehrwortUebersetzungen += 1;
      }
    }
    for (const drop of entry.dropped ?? []) {
      stats.verworfen[drop.reason] = (stats.verworfen[drop.reason] ?? 0) + 1;
    }
    // `glossText` und `crossRefs` sind Arbeitsmittel der Auflösung und gehören
    // nicht in die Ausgabe.
    const { dropped, crossRefs: _refs, kind, glossText, ...keep } = entry;
    out.write(JSON.stringify(keep) + '\n');
  }

  // Flexionsformen nur, soweit ihre Grundform auch im Wörterbuch steht –
  // ein Verweis auf ein Wort, das es hier nicht gibt, hilft niemandem.
  const known = new Set(entries.filter((e) => e.senses?.length).map((e) => e.word));
  let formsKept = 0;
  for (const [word, list] of forms) {
    const useful = list.filter((f) => known.has(f.lemma));
    if (!useful.length) continue;
    formsKept += 1;
    out.write(JSON.stringify({ form: word, lemmas: useful }) + '\n');
  }

  await new Promise((resolve) => out.end(resolve));

  const report = {
    quelle: source,
    erzeugt: new Date().toISOString(),
    dauerSekunden: Number(((Date.now() - started) / 1000).toFixed(1)),
    ...stats,
    flexionsformenBehalten: formsKept,
    verweise: crossRefs,
  };

  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    const fh = createWriteStream(reportPath, { encoding: 'utf8' });
    fh.end(JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
}

await main();
