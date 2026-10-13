/** Der einzige freie Lehrkraftauftrag, den die Portal-Textwerkstatt braucht. */
export const TEXTWERKSTATT_CAPABILITY = 'teacher-text/suggestions';
export const TEXTWERKSTATT_AUFTRAG_UNGUELTIG = 'Der Textwerkstatt-Auftrag ist ungültig.';
export const TEXTWERKSTATT_MAX_KANDIDATEN = 30;
export const TEXTWERKSTATT_MAX_AUSSCHNITT = 280;

export const TEXTWERKSTATT_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          candidateId: { type: 'string' },
          german: { type: 'string' },
          learningForm: { type: 'string' },
          lemma: { type: 'string' },
          partOfSpeech: {
            type: 'string',
            enum: ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'other'],
          },
          complementPattern: { type: 'string' },
          germanSentence: { type: 'string' },
        },
        required: ['candidateId', 'german', 'learningForm', 'lemma', 'partOfSpeech'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;

interface Kandidat {
  id: string;
  english: string;
  sourceSentence: string;
  occurrences: number;
}

export interface TextwerkstattAuftrag {
  system: string;
  payload: {
    context: { grade: string; cefrLevel: string; topic?: string };
    candidates: Kandidat[];
  };
  schema: typeof TEXTWERKSTATT_SCHEMA;
}

export interface TextwerkstattVorschlag {
  candidateId: string;
  german: string;
  learningForm: string;
  lemma: string;
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase' | 'preposition' | 'other';
  complementPattern?: string;
  germanSentence?: string;
}

const WORTARTEN = new Set([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrase',
  'preposition',
  'other',
]);

function nurSchluessel(wert: Record<string, unknown>, erlaubt: readonly string[]): boolean {
  return Object.keys(wert).every((schluessel) => erlaubt.includes(schluessel));
}

function kurz(wert: unknown, laenge: number): string | undefined {
  return typeof wert === 'string' && wert.trim() !== '' ? wert.trim().slice(0, laenge) : undefined;
}

/**
 * Prüft und verkleinert den Auftrag unmittelbar vor dem Anbieteraufruf.
 *
 * Der vollständige Quelltext wird absichtlich nicht angenommen. Die lokale,
 * deterministische Analyse hat zu diesem Zeitpunkt Kandidaten samt
 * Quellsatz erzeugt; mehr Text braucht der Anbieter für Übersetzung und
 * Lernform nicht.
 */
export function textwerkstattAuftrag(
  capability: string,
  payload: unknown,
): TextwerkstattAuftrag | undefined {
  if (capability !== TEXTWERKSTATT_CAPABILITY) return undefined;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const roh = payload as Record<string, unknown>;
  if (!nurSchluessel(roh, ['context', 'candidates'])) return undefined;
  const contextRoh = roh['context'];
  if (!contextRoh || typeof contextRoh !== 'object' || Array.isArray(contextRoh)) return undefined;
  const context = contextRoh as Record<string, unknown>;
  if (!nurSchluessel(context, ['grade', 'cefrLevel', 'topic'])) return undefined;
  const grade = kurz(context['grade'], 12);
  const cefrLevel = kurz(context['cefrLevel'], 12);
  const topic = kurz(context['topic'], 160);
  if (!grade || !cefrLevel) return undefined;

  const kandidatenRoh = Array.isArray(roh['candidates']) ? roh['candidates'] : [];
  const candidates: Kandidat[] = [];
  const gesehen = new Set<string>();
  for (const eintrag of kandidatenRoh.slice(0, TEXTWERKSTATT_MAX_KANDIDATEN)) {
    if (!eintrag || typeof eintrag !== 'object' || Array.isArray(eintrag)) return undefined;
    const kandidat = eintrag as Record<string, unknown>;
    if (!nurSchluessel(kandidat, ['id', 'english', 'sourceSentence', 'occurrences'])) return undefined;
    const id = kurz(kandidat['id'], 100);
    const english = kurz(kandidat['english'], 160);
    const sourceSentence = kurz(kandidat['sourceSentence'], TEXTWERKSTATT_MAX_AUSSCHNITT);
    const occurrences = Number(kandidat['occurrences']);
    if (
      !id ||
      gesehen.has(id) ||
      !english ||
      !sourceSentence ||
      !Number.isInteger(occurrences) ||
      occurrences < 1
    ) {
      return undefined;
    }
    gesehen.add(id);
    candidates.push({ id, english, sourceSentence, occurrences: Math.min(occurrences, 999) });
  }
  if (candidates.length === 0) return undefined;

  return {
    system:
      'Du unterstützt eine Lehrkraft bei englischem Wortschatz. Die Kandidaten wurden lokal aus einem Unterrichtstext gewonnen. ' +
      'Bearbeite ausschließlich die übergebenen candidateId-Werte und erfinde keine weiteren Wörter. ' +
      'Gib eine gebräuchliche kontextgerechte deutsche Übersetzung, die sinnvolle englische Lernform, Lemma, Wortart und – falls belegt – das Ergänzungsmuster an. ' +
      'Übersetze außerdem den Quellsatz knapp und natürlich. Eigennamen sind nur dann Lernwörter, wenn der Kontext sie fachlich verlangt. ' +
      'Alle Angaben sind Vorschläge für eine Lehrkraft und müssen ausschließlich im verlangten JSON-Objekt stehen.',
    payload: {
      context: { grade, cefrLevel, ...(topic ? { topic } : {}) },
      candidates,
    },
    schema: TEXTWERKSTATT_SCHEMA,
  };
}

/**
 * Reduziert die unzuverlässige Anbieterantwort auf bekannte Kandidaten und
 * vereinbarte Felder. Damit verlässt nie ein freier Anbietertext das Gateway.
 */
export function textwerkstattAntwort(
  roh: unknown,
  erlaubteIds: ReadonlySet<string>,
): { suggestions: TextwerkstattVorschlag[] } | undefined {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return undefined;
  const objekt = roh as Record<string, unknown>;
  if (!nurSchluessel(objekt, ['suggestions']) || !Array.isArray(objekt['suggestions'])) {
    return undefined;
  }
  const gesehen = new Set<string>();
  const suggestions: TextwerkstattVorschlag[] = [];
  for (const eintrag of objekt['suggestions'].slice(0, TEXTWERKSTATT_MAX_KANDIDATEN)) {
    if (!eintrag || typeof eintrag !== 'object' || Array.isArray(eintrag)) return undefined;
    const wert = eintrag as Record<string, unknown>;
    if (
      !nurSchluessel(wert, [
        'candidateId',
        'german',
        'learningForm',
        'lemma',
        'partOfSpeech',
        'complementPattern',
        'germanSentence',
      ])
    ) return undefined;
    const candidateId = kurz(wert['candidateId'], 100);
    const german = kurz(wert['german'], 300);
    const learningForm = kurz(wert['learningForm'], 160);
    const lemma = kurz(wert['lemma'], 160);
    const partOfSpeech = kurz(wert['partOfSpeech'], 20);
    if (
      !candidateId ||
      !erlaubteIds.has(candidateId) ||
      gesehen.has(candidateId) ||
      !german ||
      !learningForm ||
      !lemma ||
      !partOfSpeech ||
      !WORTARTEN.has(partOfSpeech)
    ) return undefined;
    gesehen.add(candidateId);
    const complementPattern = kurz(wert['complementPattern'], 200);
    const germanSentence = kurz(wert['germanSentence'], TEXTWERKSTATT_MAX_AUSSCHNITT);
    suggestions.push({
      candidateId,
      german,
      learningForm,
      lemma,
      partOfSpeech: partOfSpeech as TextwerkstattVorschlag['partOfSpeech'],
      ...(complementPattern ? { complementPattern } : {}),
      ...(germanSentence ? { germanSentence } : {}),
    });
  }
  return { suggestions };
}
