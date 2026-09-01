/**
 * Vom Extraktionsergebnis zum Laufzeitdatensatz.
 *
 * Wieder ohne Dateizugriff: reine Funktionen, damit die Regeln prüfbar bleiben,
 * ohne dass ein Test 27 MB lesen muss. Der Aufrufer
 * (`build-dictionary-runtime.mjs`) liest und schreibt.
 *
 * ## Warum Shards
 *
 * Eine Lehrkraftdatei liegt als eine einzige HTML auf einem fremden Rechner.
 * Beim Öffnen darf sie nicht erst ein ganzes Wörterbuch auspacken – das wären
 * Millionen Objekte für eine einzige Suche. Der Datensatz zerfällt deshalb in
 * feste Fächer: Jeder Suchschlüssel gehört über eine deterministische Streuung
 * in genau ein Fach, und nur dieses eine wird ausgepackt.
 *
 * Gestreut wird mit FNV-1a – klein, ohne Abhängigkeit, in jeder Umgebung
 * identisch. Eine Streuung statt einer Anfangsbuchstaben-Aufteilung, weil
 * Buchstaben sehr ungleich besetzt sind: „s“ trüge ein Vielfaches von „x“, und
 * das schlechteste Fach bestimmt die Wartezeit.
 */

/** Fachanzahl. Muss beim Bauen und beim Suchen dieselbe sein. */
export const SHARD_COUNT = 64;

/** Version des Laufzeitformats. Ändert sich das Format, ändert sich die Zahl. */
export const RUNTIME_FORMAT_VERSION = 1;

/**
 * Der Suchschlüssel.
 *
 * Kleinschreibung, Unicode-Normalform, typografische Apostrophe auf den
 * geraden zurückgeführt, Mehrfachleerzeichen zusammengezogen. Bindestriche
 * bleiben erhalten – „well-known“ und „well known“ sind im Englischen zwei
 * Schreibungen desselben Begriffs, aber die Quelle führt sie getrennt, und
 * eine eigenmächtige Zusammenlegung wäre geraten.
 */
export function normalizeKey(word) {
  return String(word ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a über die UTF-16-Einheiten des Schlüssels. */
export function shardOf(key, shardCount = SHARD_COUNT) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shardCount;
}

/**
 * Eigennamen gehören nicht in den normalen Vokabelvorschlag.
 *
 * `London`, `Michael`, `Australia` sind im Datensatz als `name` geführt. Als
 * Textvokabel wären sie Ballast: Sie stehen in jedem Sachtext, sind aber nichts
 * zum Lernen. Entfernt statt versteckt – ein zweiter Bestand, den niemand
 * abfragt, kostet nur Platz.
 */
export function isProperNoun(entry) {
  return entry?.pos === 'name';
}

/** Ein Eintrag in der knappen Laufzeitform. */
export function toRuntimeEntry(entry) {
  const senses = (entry.senses ?? [])
    .map((sense) => ({
      s: sense.sense,
      ...(sense.via ? { v: sense.via } : {}),
      g: sense.german.map((german) => ({
        d: german.german,
        ...(german.gender ? { x: german.gender } : {}),
        ...(german.register?.length ? { r: german.register } : {}),
        ...(german.qualifier ? { q: german.qualifier } : {}),
        ...(german.multiword ? { m: 1 } : {}),
      })),
    }))
    .filter((sense) => sense.g.length);

  if (!senses.length) return undefined;
  return {
    w: entry.word,
    p: entry.pos ?? '?',
    n: senses,
    ...(entry.multiword ? { m: 1 } : {}),
  };
}

/**
 * Baut die Fächer auf.
 *
 * `lines` ist ein Iterable der bereits geparsten Zeilen aus dem
 * Extraktionsergebnis – Stichwörter und Flexionsformen gemischt, so wie sie
 * dort stehen.
 */
export function buildShards(lines, { shardCount = SHARD_COUNT, keepProperNouns = false } = {}) {
  /*
    `Map` statt eines Objektliterals – und das ist kein Stilfrage.

    Ein englisches Wörterbuch enthält `constructor`, `toString`, `valueOf` und
    `__proto__`. Auf einem gewöhnlichen Objekt liefert `obj['constructor']`
    die geerbte Funktion statt `undefined`; `obj[key] ??= []` legt dann kein
    Array an, und der nächste `push` wirft. Genau daran ist der erste Lauf
    gescheitert.
  */
  const shards = Array.from({ length: shardCount }, () => ({ e: new Map(), f: new Map() }));
  const stats = {
    eintraege: 0,
    eigennamenEntfernt: 0,
    formen: 0,
    schluessel: 0,
    bedeutungen: 0,
    uebersetzungen: 0,
  };

  for (const line of lines) {
    if (line.form) {
      const key = normalizeKey(line.form);
      if (!key) continue;
      const shard = shards[shardOf(key, shardCount)];
      const lemmas = line.lemmas
        .map((entry) => ({ l: entry.lemma, p: entry.pos ?? '?', ...(entry.tags?.length ? { t: entry.tags } : {}) }))
        .filter((entry) => normalizeKey(entry.l) !== key);
      if (!lemmas.length) continue;
      if (!shard.f.has(key)) shard.f.set(key, []);
      const bucket = shard.f.get(key);
      for (const lemma of lemmas) {
        if (!bucket.some((existing) => existing.l === lemma.l && existing.p === lemma.p)) bucket.push(lemma);
      }
      stats.formen += 1;
      continue;
    }

    if (!keepProperNouns && isProperNoun(line)) {
      stats.eigennamenEntfernt += 1;
      continue;
    }

    const runtime = toRuntimeEntry(line);
    if (!runtime) continue;
    const key = normalizeKey(line.word);
    if (!key) continue;

    const shard = shards[shardOf(key, shardCount)];
    if (!shard.e.has(key)) shard.e.set(key, []);
    shard.e.get(key).push(runtime);
    stats.eintraege += 1;
    stats.bedeutungen += runtime.n.length;
    for (const sense of runtime.n) stats.uebersetzungen += sense.g.length;
  }

  // Flexionsformen, deren Grundform gar nicht im Bestand steht, helfen nicht –
  // und Eigennamen sind gerade eben verschwunden, also verweisen manche Formen
  // jetzt ins Leere.
  const known = new Set();
  for (const shard of shards) for (const key of shard.e.keys()) known.add(key);
  let formsDropped = 0;
  for (const shard of shards) {
    for (const [key, lemmas] of [...shard.f]) {
      const useful = lemmas.filter((lemma) => known.has(normalizeKey(lemma.l)));
      if (useful.length) shard.f.set(key, useful);
      else {
        shard.f.delete(key);
        formsDropped += 1;
      }
    }
  }
  stats.formenOhneGrundform = formsDropped;
  stats.formen -= formsDropped;

  // Deterministische Reihenfolge: Ohne sie erzeugen zwei Läufe verschiedene
  // Bytes, und jede Prüfsumme wäre wertlos.
  const sorted = shards.map((shard) => ({
    e: Object.fromEntries([...shard.e.keys()].sort().map((key) => [key, shard.e.get(key)])),
    f: Object.fromEntries([...shard.f.keys()].sort().map((key) => [key, shard.f.get(key)])),
  }));

  for (const shard of shards) stats.schluessel += shard.e.size + shard.f.size;

  return { shards: sorted, stats };
}
