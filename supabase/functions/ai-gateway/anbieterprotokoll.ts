import type { Adapter } from './anbieter.ts';
import { coachAuftrag } from './coachauftrag.ts';
import {
  TEXTWERKSTATT_AUFTRAG_UNGUELTIG,
  TEXTWERKSTATT_CAPABILITY,
  textwerkstattAuftrag,
} from './textwerkstattauftrag.ts';

export const MODELL_FEHLT = 'Bitte ein Modell angeben.';
export const ANTWORT_UNLESBAR = 'Der Anbieter hat keine brauchbare Antwort geliefert.';
export const COACH_AUFTRAG_UNGUELTIG = 'Der Lerncoach-Auftrag ist ungültig.';

interface AnfrageEingabe {
  adapter: Adapter;
  baseUrl: string;
  model: string;
  capability: string;
  payload: unknown;
}

export interface AnbieterAnfrage {
  url: string;
  body: Record<string, unknown>;
}

const SYSTEM =
  'Du unterstützt eine Lehrkraft bei englischem Wortschatz. ' +
  'Verarbeite nur die übergebenen Lerninhalte, erfinde keine Personendaten ' +
  'und antworte ausschließlich als gültiges JSON-Objekt.';

function mitEndung(baseUrl: string, endung: string): string {
  const basis = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(endung, basis).toString();
}

function auftrag(capability: string, payload: unknown): {
  system: string;
  nutzertext: string;
  schema?: Record<string, unknown>;
} {
  if (capability.startsWith('learner-coach/')) {
    const coach = coachAuftrag(capability, payload);
    if (!coach) throw new Error(COACH_AUFTRAG_UNGUELTIG);
    return {
      system: coach.system,
      nutzertext: JSON.stringify({ aktion: coach.aktion, aufgabe: coach.aufgabe }),
      schema: coach.schema,
    };
  }
  const textwerkstatt = textwerkstattAuftrag(capability, payload);
  if (textwerkstatt) {
    return {
      system: textwerkstatt.system,
      nutzertext: JSON.stringify(textwerkstatt.payload),
      schema: textwerkstatt.schema,
    };
  }
  if (capability === TEXTWERKSTATT_CAPABILITY) {
    throw new Error(TEXTWERKSTATT_AUFTRAG_UNGUELTIG);
  }
  return { system: SYSTEM, nutzertext: JSON.stringify({ aufgabe: capability, inhalt: payload }) };
}

/**
 * Übersetzt den internen LexiFlow-Auftrag in das echte Protokoll des
 * gewählten Anbieters. Der Browser kann diese Form weder bestimmen noch um
 * freie Kopfzeilen ergänzen.
 */
export function anbieterAnfrage(eingabe: AnfrageEingabe): AnbieterAnfrage {
  const model = eingabe.model.trim();
  if (model === '') throw new Error(MODELL_FEHLT);
  const inhalt = auftrag(eingabe.capability, eingabe.payload);

  switch (eingabe.adapter) {
    case 'gemini':
      return {
        url: mitEndung(
          eingabe.baseUrl,
          `models/${encodeURIComponent(model)}:generateContent`,
        ),
        body: {
          systemInstruction: { parts: [{ text: inhalt.system }] },
          contents: [{ role: 'user', parts: [{ text: inhalt.nutzertext }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(inhalt.schema ? { responseSchema: inhalt.schema } : {}),
          },
        },
      };

    case 'openai-kompatibel': {
      const offiziell = new URL(eingabe.baseUrl).hostname === 'api.openai.com';
      return offiziell
        ? {
            url: mitEndung(eingabe.baseUrl, 'responses'),
            body: {
              model,
              store: false,
              input: [
                { role: 'system', content: [{ type: 'input_text', text: inhalt.system }] },
                { role: 'user', content: [{ type: 'input_text', text: inhalt.nutzertext }] },
              ],
              text: {
                format: inhalt.schema
                  ? {
                      type: 'json_schema',
                      name: 'lexiflow_coachantwort',
                      strict: true,
                      schema: inhalt.schema,
                    }
                  : { type: 'json_object' },
              },
            },
          }
        : {
            url: mitEndung(eingabe.baseUrl, 'chat/completions'),
            body: {
              model,
              messages: [
                { role: 'system', content: inhalt.system },
                { role: 'user', content: inhalt.nutzertext },
              ],
              response_format: { type: 'json_object' },
            },
          };
    }

    case 'anthropic-kompatibel':
      return {
        url: mitEndung(eingabe.baseUrl, 'messages'),
        body: {
          model,
          max_tokens: 1024,
          system: inhalt.system,
          messages: [{ role: 'user', content: inhalt.nutzertext }],
        },
      };

    case 'browsermodell':
      throw new Error('Das Browsermodell hat kein Serverprotokoll.');
  }
}

function objekt(roh: string): Record<string, unknown> {
  let wert: unknown;
  try {
    wert = JSON.parse(roh);
  } catch {
    throw new Error('Die Antwort des Anbieters ist kein gültiges JSON.');
  }
  if (!wert || typeof wert !== 'object' || Array.isArray(wert)) {
    throw new Error(ANTWORT_UNLESBAR);
  }
  return wert as Record<string, unknown>;
}

function textAus(wert: unknown): string | undefined {
  return typeof wert === 'string' && wert.trim() !== '' ? wert.trim() : undefined;
}

function inhaltAusOpenAi(antwort: Record<string, unknown>): string | undefined {
  const output = Array.isArray(antwort['output']) ? antwort['output'] : [];
  for (const eintrag of output) {
    const nachricht = eintrag as Record<string, unknown>;
    const inhalte = Array.isArray(nachricht['content']) ? nachricht['content'] : [];
    for (const inhalt of inhalte) {
      const block = inhalt as Record<string, unknown>;
      if (block['type'] === 'output_text') {
        const text = textAus(block['text']);
        if (text) return text;
      }
    }
  }

  const choices = Array.isArray(antwort['choices']) ? antwort['choices'] : [];
  const erste = choices[0] as Record<string, unknown> | undefined;
  const nachricht = erste?.['message'] as Record<string, unknown> | undefined;
  return textAus(nachricht?.['content']);
}

function inhaltAusAnthropic(antwort: Record<string, unknown>): string | undefined {
  const inhalte = Array.isArray(antwort['content']) ? antwort['content'] : [];
  for (const inhalt of inhalte) {
    const block = inhalt as Record<string, unknown>;
    if (block['type'] === 'text') {
      const text = textAus(block['text']);
      if (text) return text;
    }
  }
  return undefined;
}

function inhaltAusGemini(antwort: Record<string, unknown>): string | undefined {
  const kandidaten = Array.isArray(antwort['candidates']) ? antwort['candidates'] : [];
  const kandidat = kandidaten[0] as Record<string, unknown> | undefined;
  const inhalt = kandidat?.['content'] as Record<string, unknown> | undefined;
  const teile = Array.isArray(inhalt?.['parts']) ? inhalt.parts : [];
  return teile.map((teil) => textAus((teil as Record<string, unknown>)['text']) ?? '').join('').trim() || undefined;
}

/** Nimmt die Hülle des Anbieters ab und gibt nur dessen fachliche Antwort zurück. */
export function anbieterAntwort(adapter: Adapter, roh: string): unknown {
  const antwort = objekt(roh);
  const inhalt =
    adapter === 'gemini'
      ? inhaltAusGemini(antwort)
      : adapter === 'anthropic-kompatibel'
        ? inhaltAusAnthropic(antwort)
        : adapter === 'openai-kompatibel'
          ? inhaltAusOpenAi(antwort)
          : undefined;
  if (!inhalt) throw new Error(ANTWORT_UNLESBAR);

  try {
    return JSON.parse(inhalt) as unknown;
  } catch {
    return inhalt;
  }
}
