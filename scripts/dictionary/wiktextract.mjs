/**
 * Die Umformung eines Wiktextract-Eintrags in einen Wörterbuchvorschlag.
 *
 * Bewusst **ohne** Dateizugriff, ohne Streaming, ohne LexiFlow-Fachwissen: nur
 * Funktionen von Objekt zu Objekt. Der Grund ist derselbe wie bei
 * `portableBuild.mjs` – so lässt sich die Umformung prüfen, ohne 2,6 GB zu
 * lesen, und die Prüfung läuft in `npm run test` mit.
 *
 * ## Was die Quelle wirklich liefert
 *
 * Nachgesehen, nicht angenommen. Ein Übersetzungsobjekt aus dem echten
 * Datensatz (Stichwort `limestone`):
 *
 * ```json
 * { "lang": "German", "code": "de", "lang_code": "de",
 *   "sense": "abundant rock of marine and fresh-water sediments",
 *   "tags": ["masculine"], "word": "Kalkstein" }
 * ```
 *
 * Wichtig daran: `sense` ist die Überschrift der Übersetzungstabelle, **nicht**
 * die Glosse aus `senses[]`. Beide Texte stimmen oft nicht überein – bei
 * `physician` heißt die Glosse „A medical doctor trained in human medicine.“,
 * die Übersetzungsüberschrift aber schlicht „medical doctor“. Deshalb wird hier
 * nach `translation.sense` gruppiert und nicht versucht, beides zwanghaft
 * aufeinander abzubilden.
 *
 * ## Der Fall `doctor`
 *
 * Im englischen Wiktionary steht unter `doctor` für die medizinische Bedeutung
 * kein eigener Übersetzungsblock, sondern ein Verweis auf `physician`. Dieser
 * Verweis **überlebt die Extraktion nicht** – im Rohdatensatz ist von
 * „trans-see“ nichts mehr zu finden (nachgeprüft). Übrig bleibt genau eine
 * Spur: Die Glosse lautet „A physician; a member of the medical profession…“
 * und ihr erster Link zeigt auf `physician`.
 *
 * Genau daraus wird hier ein Verweis rekonstruiert – eng geführt, damit nicht
 * jede Glosse, die zufällig mit einem Link beginnt, fremde Übersetzungen
 * einsammelt. Die Bedingungen stehen bei `crossReferenceTarget`.
 */

/** Die drei Genera, wie die Quelle sie in `tags` führt. */
const GENDER_TAGS = new Map([
  ['masculine', 'm'],
  ['feminine', 'f'],
  ['neuter', 'n'],
]);

/** Der bestimmte Artikel – die Form, in der eine Lernende das Genus liest. */
export const GENDER_ARTICLES = { m: 'der', f: 'die', n: 'das' };

/**
 * Marker, die eine Übersetzung für den Schulgebrauch fragwürdig machen.
 *
 * Nicht gelöscht, sondern gekennzeichnet: Die Entscheidung, was eine Lehrkraft
 * sieht, gehört in die Oberfläche, nicht in den Importer. Der Datensatz soll
 * hinterher noch beantworten können, *warum* etwas auffällig ist.
 */
const REGISTER_TAGS = new Set([
  'obsolete',
  'archaic',
  'dated',
  'slang',
  'vulgar',
  'derogatory',
  'offensive',
  'rare',
  'dialectal',
  'informal',
  'colloquial',
  'humorous',
  'poetic',
  'literary',
]);

/** Führende Artikel, die eine englische Glosse eröffnen können. */
const LEADING_ARTICLE = /^(?:an?|the)\s+/i;

/**
 * Ein Präfixfragment ist kein Wort.
 *
 * `military` liefert unter anderem `Militär-` und `Kriegs-`. Als Vokabel wäre
 * das eine Zumutung: Man kann „Kriegs-“ nicht übersetzen, nicht abfragen und
 * nicht in einen Satz stellen. Dasselbe gilt für Suffixe wie `-heit`.
 */
export function isAffixFragment(word) {
  if (typeof word !== 'string') return false;
  const trimmed = word.trim();
  return trimmed.endsWith('-') || trimmed.startsWith('-');
}

/** Mehrwortausdrücke sind erlaubt, müssen aber erkennbar bleiben. */
export function isMultiword(word) {
  return typeof word === 'string' && /\s/.test(word.trim());
}

/**
 * Klammerzusätze wie „Kalk (gebrannt)“ trennen: Der Zusatz erklärt, gehört aber
 * nicht in die Antwort, die eine Schülerin tippen soll.
 */
export function splitParenthetical(word) {
  const match = /^([^(]+?)\s*\(([^)]*)\)\s*$/.exec(String(word).trim());
  if (!match?.[1]) return { word: String(word).trim() };
  const qualifier = (match[2] ?? '').trim();
  return qualifier ? { word: match[1].trim(), qualifier } : { word: match[1].trim() };
}

/** Genus und Registermarker aus den `tags` einer Übersetzung lesen. */
export function readTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  let gender;
  const register = [];
  const other = [];
  for (const tag of list) {
    const short = GENDER_TAGS.get(tag);
    if (short && !gender) gender = short;
    else if (REGISTER_TAGS.has(tag)) register.push(tag);
    else if (!GENDER_TAGS.has(tag)) other.push(tag);
  }
  return { ...(gender ? { gender } : {}), register, other };
}

/**
 * Eine einzelne deutsche Übersetzung in die Form bringen, die der Provider
 * später ausliefert – samt Begründung, falls sie nicht taugt.
 */
export function normalizeTranslation(translation) {
  const raw = String(translation?.word ?? '').trim();
  if (!raw) return { ok: false, reason: 'leer' };

  const { word, qualifier } = splitParenthetical(raw);
  if (!word) return { ok: false, reason: 'leer' };
  if (isAffixFragment(word)) return { ok: false, reason: 'affix', word };

  const { gender, register, other } = readTags(translation?.tags);

  return {
    ok: true,
    german: word,
    ...(gender ? { gender } : {}),
    ...(qualifier ? { qualifier } : {}),
    ...(register.length ? { register } : {}),
    ...(other.length ? { tags: other } : {}),
    ...(isMultiword(word) ? { multiword: true } : {}),
  };
}

/**
 * Alle deutschen Übersetzungen eines Eintrags, gruppiert nach der Bedeutung,
 * unter der sie in der Quelle stehen.
 *
 * Die Reihenfolge der Quelle bleibt erhalten – sie ist die einzige Rangfolge,
 * die es gibt, und sie zu verwürfeln hieße, eine eigene zu erfinden.
 */
export function germanSenses(entry) {
  const translations = Array.isArray(entry?.translations) ? entry.translations : [];
  const groups = new Map();
  const dropped = [];

  for (const translation of translations) {
    if (translation?.code !== 'de' && translation?.lang_code !== 'de') continue;
    const normalized = normalizeTranslation(translation);
    if (!normalized.ok) {
      dropped.push({ reason: normalized.reason, word: normalized.word ?? translation?.word });
      continue;
    }
    const sense = String(translation.sense ?? '').trim() || '—';
    if (!groups.has(sense)) groups.set(sense, []);
    const list = groups.get(sense);
    // Dubletten innerhalb einer Bedeutung: dieselbe Antwort zweimal anzubieten
    // sieht nach einem Fehler aus. Das erste Vorkommen gewinnt, weil es das
    // besser belegte ist.
    if (!list.some((existing) => existing.german === normalized.german)) list.push(normalized);
  }

  return {
    senses: [...groups].map(([sense, german]) => ({ sense, german })),
    dropped,
  };
}

/**
 * Der Verweis, der `doctor` mit `physician` verbindet.
 *
 * Der **erste Teilsatz** der Glosse muss genau das verlinkte Stichwort sein.
 * Ein früherer, lockererer Entwurf verlangte nur, dass die Glosse mit dem Link
 * *beginnt*. Der eigene Test hat ihn widerlegt: `physician` wird erklärt als
 * „A medical doctor trained in human medicine.“, erster Link `medical` – und
 * schon hätte `physician` die Übersetzungen von `medical` geerbt.
 */
export function crossReferenceTarget(sense) {
  const gloss = String(sense?.glosses?.[0] ?? '').trim();
  const first = sense?.links?.[0]?.[0];
  if (!gloss || typeof first !== 'string') return undefined;

  const target = first.trim();
  if (!target) return undefined;

  const head = gloss.replace(LEADING_ARTICLE, '');
  const clause = head.split(/[;,.:(]/)[0]?.trim() ?? '';
  if (clause.toLowerCase() !== target.toLowerCase()) return undefined;

  return target;
}

/** Ist der Eintrag eine Flexionsform, und wenn ja: wovon? */
export function lemmaOfForm(entry) {
  for (const sense of entry?.senses ?? []) {
    const tags = Array.isArray(sense?.tags) ? sense.tags : [];
    if (!tags.includes('form-of') && !tags.includes('alt-of')) continue;
    const lemma = sense?.form_of?.[0]?.word ?? sense?.alt_of?.[0]?.word;
    if (typeof lemma === 'string' && lemma.trim() && lemma.trim() !== entry.word) {
      return { lemma: lemma.trim(), tags: tags.filter((t) => t !== 'form-of' && t !== 'alt-of') };
    }
  }
  return undefined;
}

/**
 * Ein Rohobjekt zu genau dem verdichten, was der Importer weiterträgt.
 *
 * `undefined` heißt: für dieses Wörterbuch ohne Belang – kein Fehler.
 */
export function readEntry(entry) {
  if (!entry || entry.lang_code !== 'en' || typeof entry.word !== 'string') return undefined;
  const word = entry.word.trim();
  if (!word) return undefined;

  const { senses, dropped } = germanSenses(entry);

  /*
    Erst die Übersetzungen, dann die Formfrage – und nicht umgekehrt.

    Der erste Entwurf prüfte zuerst auf `form_of` und hat damit `island` und
    `casualty` **verloren**: Beide Stichwörter haben unter zehn Bedeutungen je
    eine, die als Kurzform von etwas anderem markiert ist (`island` als Ellipse
    von „kitchen island“, `casualty` als Verkürzung von „casualty department“).
    Ein einziges solches `alt-of` genügte, und das ganze Stichwort galt als
    Flexionsform – „Insel“ und „Unfall“ standen nicht mehr im Wörterbuch.

    Die Regel lautet deshalb: Wer eigene deutsche Übersetzungen mitbringt, ist
    ein Stichwort. Eine reine Form ist nur, wer gar keine hat.
  */
  if (!senses.length) {
    const form = lemmaOfForm(entry);
    if (form) {
      return { kind: 'form', word, pos: entry.pos, lemma: form.lemma, tags: form.tags };
    }
  }

  // Bedeutungen, die auf ein anderes Stichwort zeigen. Die Glosse wird
  // mitgeführt, weil erst sie beim Auflösen entscheidet, **welche** Bedeutung
  // des Ziels gemeint ist.
  const crossRefs = [];
  const seenTargets = new Set();
  for (const sense of entry.senses ?? []) {
    const target = crossReferenceTarget(sense);
    if (!target || target === word || seenTargets.has(target)) continue;
    seenTargets.add(target);
    crossRefs.push({ target, gloss: String(sense?.glosses?.[0] ?? '') });
  }

  if (!senses.length && !crossRefs.length) return undefined;

  // Der eigene Erklärungstext, nur für die Verweisauflösung. Er wird nicht
  // ausgeliefert – `extract-wiktextract.mjs` entfernt ihn vor dem Schreiben.
  const glossText = (entry.senses ?? [])
    .map((sense) => String(sense?.glosses?.[0] ?? ''))
    .join(' ')
    .toLowerCase()
    .slice(0, 4000);

  return {
    kind: 'entry',
    word,
    pos: entry.pos,
    glossText,
    ...(senses.length ? { senses } : {}),
    ...(crossRefs.length ? { crossRefs } : {}),
    ...(dropped.length ? { dropped } : {}),
    ...(isMultiword(word) ? { multiword: true } : {}),
  };
}

/** Inhaltswörter einer englischen Beschreibung, für den Bedeutungsabgleich. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'or', 'and', 'for', 'as', 'is', 'that',
  'who', 'which', 'with', 'by', 'on', 'at', 'from', 'one', 'someone', 'something',
]);

function contentWords(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

/**
 * Welche Bedeutung des Ziels ist gemeint?
 *
 * Gemessen wird die Überschneidung der Inhaltswörter zwischen der verweisenden
 * Glosse und der Bedeutungsüberschrift des Ziels. Bei Gleichstand gewinnt die
 * erste – die Reihenfolge der Quelle ist die einzige belegte Rangfolge.
 */
export function bestMatchingSense(gloss, senses) {
  if (!senses?.length) return undefined;
  // Ein Ziel mit genau einer Bedeutung lässt keine Wahl offen.
  if (senses.length === 1) return senses[0];

  const needle = contentWords(gloss);
  let best;
  let bestScore = 0;
  for (const sense of senses) {
    let score = 0;
    for (const word of contentWords(sense.sense)) if (needle.has(word)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = sense;
    }
  }

  /*
    Kein einziges gemeinsames Wort heißt: raten.

    Ein früherer Entwurf fiel in diesem Fall auf die erste Bedeutung der Quelle
    zurück. Die Messung zeigte, was dabei herauskommt – `fire` erbte von
    `barrage` nicht das Sperrfeuer, sondern das **Stauwehr**; `town` bekam von
    `settlement` nicht die Siedlung, sondern die „Regelung“; `order` von
    `decoration` das „Dekorieren“. Lieber keine Bedeutung als die falsche.
  */
  return best;
}

/**
 * Nennt der Zieleintrag das verweisende Stichwort in seiner eigenen Erklärung?
 *
 * Das ist die Probe darauf, ob wirklich ein **Synonym** vorliegt. Ohne sie
 * verhält sich ein Oberbegriff genau wie ein Synonym: „A bird of the genus
 * Corvus“ und „A physician; a member of the medical profession“ sind
 * strukturell nicht zu unterscheiden – die Glosse beginnt beide Male mit dem
 * verlinkten Wort. Die Messung am echten Datensatz brachte deshalb `crow` als
 * „Vogel“, `hour` als „Jahreszeit“ und `word` als „Bestellung“ hervor.
 *
 * `physician` wird erklärt als „A medical doctor trained in human medicine.“
 * und nennt damit `doctor`; `veterinarian` als „A doctor who treats animals“
 * ebenso. `bird` erwähnt `crow` mit keinem Wort. Genau diese Gegenprobe
 * trennt die beiden Fälle.
 */
export function mentions(glossText, word) {
  if (!glossText || !word) return false;
  const escaped = String(word).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z])' + escaped + '([^a-z]|$)').test(glossText);
}

/**
 * Zweiter Durchgang: Verweise auflösen.
 *
 * Drei Eigenschaften machen das Ergebnis überprüfbar:
 *
 * 1. **Tiefe eins.** Geerbt wird ausschließlich aus dem *ursprünglichen*
 *    Bestand des Ziels, nie aus etwas, das dieses selbst geerbt hat. Ohne
 *    diesen Schnappschuss hinge das Ergebnis an der Reihenfolge der Einträge –
 *    dasselbe Wörterbuch käme bei zwei Läufen verschieden heraus.
 * 2. **Keine Zyklen.** Zeigen zwei Stichwörter aufeinander, erbt keines vom
 *    anderen. Wer beide Richtungen zulässt, tauscht Bedeutungen im Kreis.
 * 3. **Höchstens eine Bedeutung je Verweis**, ausgewählt über die
 *    Wortüberschneidung mit der verweisenden Glosse.
 *
 * Geerbte Bedeutungen tragen `via`. Im Zweifel wird nichts übernommen: Eine
 * fehlende Übersetzung ist harmlos, eine falsche nicht.
 */
export function resolveCrossReferences(entries) {
  const byWordPos = new Map();
  for (const entry of entries) {
    if (entry.kind !== 'entry') continue;
    byWordPos.set(entry.word + '|' + entry.pos, entry);
  }

  // Der Schnappschuss: der Bestand *vor* jeder Übernahme.
  const original = new Map();
  for (const [key, entry] of byWordPos) original.set(key, entry.senses ? [...entry.senses] : []);

  const stats = { resolved: 0, unresolved: 0, rejected: 0, cycles: 0, targets: 0 };

  for (const entry of entries) {
    if (entry.kind !== 'entry' || !entry.crossRefs) continue;
    for (const reference of entry.crossRefs) {
      stats.targets += 1;
      const key = reference.target + '|' + entry.pos;
      const source = byWordPos.get(key);
      const borrowed = original.get(key);

      if (!source || !borrowed?.length) {
        stats.unresolved += 1;
        continue;
      }
      // Zeigt das Ziel seinerseits hierher zurück? Dann bleibt es dabei.
      if (source.crossRefs?.some((back) => back.target === entry.word)) {
        stats.cycles += 1;
        continue;
      }
      if (!mentions(source.glossText, entry.word)) {
        stats.rejected += 1;
        continue;
      }
      const chosen = bestMatchingSense(reference.gloss, borrowed);
      if (!chosen || entry.senses?.some((sense) => sense.sense === chosen.sense)) {
        stats.unresolved += 1;
        continue;
      }
      entry.senses ??= [];
      entry.senses.push({ ...chosen, via: reference.target });
      stats.resolved += 1;
    }
  }

  return stats;
}
