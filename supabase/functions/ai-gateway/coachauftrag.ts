export const COACH_AKTIONEN = [
  'fehler-erklaeren',
  'hinweis',
  'anderer-satz',
  'warum-richtig',
] as const;
export type CoachAktion = (typeof COACH_AKTIONEN)[number];

export const COACH_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
} as const;

interface SichereAufgabe {
  lernform: string;
  richtung: 'en-de' | 'de-en';
  beispielsatz?: string;
  antwort?: string;
  loesung?: string;
  sprache: 'de' | 'en';
  niveau: string;
}

export interface CoachAuftrag {
  aktion: CoachAktion;
  aufgabe: SichereAufgabe;
  system: string;
  schema: typeof COACH_SCHEMA;
}

function kurz(wert: unknown, laenge: number): string | undefined {
  return typeof wert === 'string' && wert.trim() !== '' ? wert.trim().slice(0, laenge) : undefined;
}

function aktionAus(capability: string): CoachAktion | undefined {
  const treffer = /^learner-coach\/(.+)$/.exec(capability)?.[1];
  return (COACH_AKTIONEN as readonly string[]).includes(treffer ?? '')
    ? (treffer as CoachAktion)
    : undefined;
}

/** Whitelistet den Lernauftrag unmittelbar vor dem Anbieteraufruf. */
export function coachAuftrag(capability: string, payload: unknown): CoachAuftrag | undefined {
  const aktion = aktionAus(capability);
  if (!aktion || !payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const roh = payload as Record<string, unknown>;
  const lernform = kurz(roh['lernform'], 160);
  const richtung = roh['richtung'];
  const sprache = roh['sprache'];
  const niveau = kurz(roh['niveau'], 12);
  if (
    !lernform ||
    (richtung !== 'en-de' && richtung !== 'de-en') ||
    (sprache !== 'de' && sprache !== 'en') ||
    !niveau
  ) return undefined;

  const beispielsatz = kurz(roh['beispielsatz'], 600);
  const antwort = kurz(roh['antwort'], 300);
  const loesung = kurz(roh['loesung'], 300);
  const aufgabe: SichereAufgabe = {
    lernform,
    richtung,
    sprache,
    niveau,
    ...(beispielsatz ? { beispielsatz } : {}),
    ...(antwort ? { antwort } : {}),
    ...(loesung ? { loesung } : {}),
  };

  const regel =
    aktion === 'hinweis'
      ? 'Gib einen hilfreichen Hinweis, aber nenne oder buchstabiere die Lösung nicht.'
      : aktion === 'anderer-satz'
        ? 'Gib genau einen altersgerechten anderen Beispielsatz und erkläre ihn knapp auf Deutsch.'
        : aktion === 'fehler-erklaeren'
          ? 'Erkläre den konkreten Fehler knapp, freundlich und ohne den Lernstand zu bewerten.'
          : 'Erkläre knapp, warum die angegebene Lösung sprachlich passt.';

  return {
    aktion,
    aufgabe,
    schema: COACH_SCHEMA,
    system:
      'Du bist ein Lerncoach für englischen Wortschatz. Die lernende Person kann minderjährig sein. ' +
      `${regel} Antworte auf Deutsch und ausschließlich als JSON-Objekt mit dem Feld "text".`,
  };
}
