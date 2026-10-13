// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { anbieterAnfrage, anbieterAntwort } from './anbieterprotokoll';

const BASIS = {
  model: 'ein-modell',
  capability: 'suggest-from-text',
  payload: { kandidaten: ['walk', 'interesting'] },
};

describe('die echten Anbieterprotokolle', () => {
  it('gibt der Textwerkstatt bei offiziellen OpenAI-Modellen ein festes Antwortschema', () => {
    const anfrage = anbieterAnfrage({
      adapter: 'openai-kompatibel',
      baseUrl: 'https://api.openai.com/v1/',
      model: 'ein-modell',
      capability: 'teacher-text/suggestions',
      payload: {
        context: { grade: '8', cefrLevel: 'A2' },
        candidates: [
          {
            id: 'c-customs',
            english: 'customs',
            sourceSentence: 'Scotland has some unique customs.',
            occurrences: 1,
          },
        ],
      },
    });
    expect(anfrage.body).toMatchObject({
      text: {
        format: {
          type: 'json_schema',
          strict: true,
          schema: { required: ['suggestions'], additionalProperties: false },
        },
      },
    });
    expect(JSON.stringify(anfrage.body)).not.toContain('sourceText');
  });

  it('lässt einen kaputten Textwerkstattauftrag nicht in den freien Rückfall fallen', () => {
    expect(() =>
      anbieterAnfrage({
        adapter: 'openai-kompatibel',
        baseUrl: 'https://api.openai.com/v1/',
        model: 'ein-modell',
        capability: 'teacher-text/suggestions',
        payload: { sourceText: 'ungeprüfter Volltext' },
      }),
    ).toThrow(/Textwerkstatt-Auftrag ist ungültig/);
  });

  it('benutzt bei OpenAI den Responses-Endpunkt und Structured Outputs', () => {
    const anfrage = anbieterAnfrage({
      ...BASIS,
      adapter: 'openai-kompatibel',
      baseUrl: 'https://api.openai.com/v1/',
    });

    expect(anfrage.url).toBe('https://api.openai.com/v1/responses');
    expect(anfrage.body).toMatchObject({
      model: 'ein-modell',
      store: false,
      text: { format: { type: 'json_object' } },
    });
    expect(JSON.stringify(anfrage.body)).toContain('suggest-from-text');
  });

  it('bleibt bei einem freigegebenen OpenAI-kompatiblen Host kompatibel', () => {
    const anfrage = anbieterAnfrage({
      ...BASIS,
      adapter: 'openai-kompatibel',
      baseUrl: 'https://ki.schule.example/v1/',
    });

    expect(anfrage.url).toBe('https://ki.schule.example/v1/chat/completions');
    expect(anfrage.body).toMatchObject({
      model: 'ein-modell',
      response_format: { type: 'json_object' },
    });
  });

  it('benutzt bei Anthropic die Messages API', () => {
    const anfrage = anbieterAnfrage({
      ...BASIS,
      adapter: 'anthropic-kompatibel',
      baseUrl: 'https://api.anthropic.com/v1/',
    });

    expect(anfrage.url).toBe('https://api.anthropic.com/v1/messages');
    expect(anfrage.body).toMatchObject({
      model: 'ein-modell',
      max_tokens: 1024,
      messages: [{ role: 'user' }],
    });
  });

  it('benutzt bei Gemini generateContent und verlangt JSON', () => {
    const anfrage = anbieterAnfrage({
      ...BASIS,
      adapter: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
    });

    expect(anfrage.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/ein-modell:generateContent',
    );
    expect(anfrage.body).toMatchObject({
      generationConfig: { responseMimeType: 'application/json' },
    });
  });

  it('liest die Antwort jeder offiziellen API in dieselbe Form', () => {
    expect(
      anbieterAntwort(
        'openai-kompatibel',
        JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{"a":1}' }] }] }),
      ),
    ).toEqual({ a: 1 });
    expect(
      anbieterAntwort(
        'openai-kompatibel',
        JSON.stringify({ choices: [{ message: { content: '{"a":2}' } }] }),
      ),
    ).toEqual({ a: 2 });
    expect(
      anbieterAntwort(
        'anthropic-kompatibel',
        JSON.stringify({ content: [{ type: 'text', text: '{"a":3}' }] }),
      ),
    ).toEqual({ a: 3 });
    expect(
      anbieterAntwort(
        'gemini',
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":4}' }] } }] }),
      ),
    ).toEqual({ a: 4 });
  });

  it('lehnt eine formal erfolgreiche, aber unlesbare Anbieterantwort ab', () => {
    expect(() => anbieterAntwort('openai-kompatibel', '{"output":[]}')).toThrow(
      /brauchbare Antwort/,
    );
    expect(() => anbieterAntwort('anthropic-kompatibel', '<html>kaputt</html>')).toThrow(
      /gültiges JSON/,
    );
  });

  it('fordert ein Modell, statt eine kaputte Anfrage zu versenden', () => {
    expect(() =>
      anbieterAnfrage({
        ...BASIS,
        adapter: 'openai-kompatibel',
        baseUrl: 'https://api.openai.com/v1/',
        model: ' ',
      }),
    ).toThrow(/Modell/);
  });
});

describe('der feste Lerncoach-Vertrag am Anbieter', () => {
  const COACH = {
    capability: 'learner-coach/hinweis',
    payload: {
      lernform: 'to tell sb. sth.',
      richtung: 'de-en',
      loesung: 'to tell somebody something',
      sprache: 'de',
      niveau: 'A2',
      userId: 'geht-nicht-hinaus',
    },
  };

  it('erzwingt bei OpenAI das eine vereinbarte Antwortfeld per JSON-Schema', () => {
    const anfrage = anbieterAnfrage({
      ...BASIS,
      ...COACH,
      adapter: 'openai-kompatibel',
      baseUrl: 'https://api.openai.com/v1/',
    });
    expect(anfrage.body).toMatchObject({
      text: {
        format: {
          type: 'json_schema',
          name: 'lexiflow_coachantwort',
          strict: true,
          schema: { required: ['text'], additionalProperties: false },
        },
      },
    });
    expect(JSON.stringify(anfrage.body)).not.toContain('geht-nicht-hinaus');
  });

  it('gibt Gemini dasselbe Antwortschema', () => {
    const anfrage = anbieterAnfrage({
      ...BASIS,
      ...COACH,
      adapter: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
    });
    expect(anfrage.body).toMatchObject({
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { required: ['text'], additionalProperties: false },
      },
    });
  });

  it('lehnt freie oder unvollstaendige Lerncoach-Auftraege vor dem Netz ab', () => {
    expect(() => anbieterAnfrage({
      ...BASIS,
      capability: 'learner-coach/freier-chat',
      payload: COACH.payload,
      adapter: 'openai-kompatibel',
      baseUrl: 'https://api.openai.com/v1/',
    })).toThrow(/Lerncoach-Auftrag/);
    expect(() => anbieterAnfrage({
      ...BASIS,
      capability: 'learner-coach/hinweis',
      payload: { lernform: 'walk' },
      adapter: 'openai-kompatibel',
      baseUrl: 'https://api.openai.com/v1/',
    })).toThrow(/Lerncoach-Auftrag/);
  });
});

describe('der Edge-Mantel setzt die Laufzeitgrenze auch wirklich um', () => {
  it('übergibt den Zeitablauf an fetch und folgt weiterhin keiner Weiterleitung', () => {
    const quelle = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

    expect(quelle).toContain("redirect: 'manual'");
    expect(quelle).toContain('signal: AbortSignal.timeout(timeoutMs)');
    expect(quelle).not.toMatch(/=\s*await antwort\.text\(\)/);
  });
});
