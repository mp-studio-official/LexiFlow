import type { Adapter } from './anbieter.ts';

export const MODELL_FEHLT = 'Bitte ein Modell angeben.';
export const ANTWORT_UNLESBAR = 'Der Anbieter hat keine brauchbare Antwort geliefert.';

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

function auftrag(capability: string, payload: unknown): string {
  return JSON.stringify({ aufgabe: capability, inhalt: payload });
}

/**
 * Übersetzt den internen LexiFlow-Auftrag in das echte Protokoll des
 * gewählten Anbieters. Der Browser kann diese Form weder bestimmen noch um
 * freie Kopfzeilen ergänzen.
 */
export function anbieterAnfrage(eingabe: AnfrageEingabe): AnbieterAnfrage {
  const model = eingabe.model.trim();
  if (model === '') throw new Error(MODELL_FEHLT);
  const nutzertext = auftrag(eingabe.capability, eingabe.payload);

  switch (eingabe.adapter) {
    case 'gemini':
      return {
        url: mitEndung(
          eingabe.baseUrl,
          `models/${encodeURIComponent(model)}:generateContent`,
        ),
        body: {
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: nutzertext }] }],
          generationConfig: { responseMimeType: 'application/json' },
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
                { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
                { role: 'user', content: [{ type: 'input_text', text: nutzertext }] },
              ],
              text: { format: { type: 'json_object' } },
            },
          }
        : {
            url: mitEndung(eingabe.baseUrl, 'chat/completions'),
            body: {
              model,
              messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: nutzertext },
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
          system: SYSTEM,
          messages: [{ role: 'user', content: nutzertext }],
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
