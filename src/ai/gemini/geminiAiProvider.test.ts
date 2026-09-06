import { describe, expect, it } from 'vitest';

import type { AiGenerationContext, AiTextCandidate } from '../AiProvider';
import { ApiKey } from './credentials';
import {
  createFakeGemini,
  replyWithError,
  replyWithJson,
  replyWithText,
  TEST_API_KEY,
  type FakeGemini,
} from './fakeGemini';
import { GeminiError } from './errors';
import { createGeminiAiProvider, type GeminiAssistant } from './geminiAiProvider';
import { GeminiTransportError } from './transport';

/**
 * Der Anbieter – geprüft mit einem Gemini, das nie im Netz ist.
 *
 * **Kein Test hier ruft die echte API auf.** Verwendet wird durchgehend
 * `TEST_API_KEY`, ein Wert, der auf den ersten Blick als Attrappe zu erkennen
 * ist.
 */

const KONTEXT: AiGenerationContext = { grade: '8', cefrLevel: 'A2/B1' };

/**
 * `null` heißt „kein Schlüssel eingetragen“, nicht `undefined`.
 *
 * Ein voreingestellter Parameter greift auch dann, wenn `undefined`
 * ausdrücklich übergeben wird – der Test ohne Schlüssel hätte also stillschwei-
 * gend mit Schlüssel gelaufen. Er tat es beim ersten Durchlauf auch.
 */
function anbieter(fake: FakeGemini, key: ApiKey | null = new ApiKey(TEST_API_KEY)): GeminiAssistant {
  return createGeminiAiProvider({
    getKey: () => key ?? undefined,
    getModel: () => 'gemini-3.5-flash-lite',
    transport: fake.transport,
  });
}

describe('Ohne ausdrückliche Handlung passiert nichts', () => {
  it('fragt für die Verfügbarkeit nicht im Netz nach', async () => {
    /*
      Die wichtigste Zusage des ganzen Anbieters. Ein Verfügbarkeitstest, der
      eine Anfrage schickt, läuft beim Öffnen jeder Seite – und kostet Geld.
    */
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gut' }));
    const provider = anbieter(fake);

    expect(await provider.getAvailability('enrich-entry')).toBe('available');
    expect(fake.calls).toHaveLength(0);
  });

  it('lädt bei `prepare` nichts und ruft nichts auf', async () => {
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gut' }));
    const provider = anbieter(fake);

    await provider.prepare('enrich-entry');
    expect(fake.calls).toHaveLength(0);
  });

  it('meldet ohne Schlüssel „nicht eingerichtet", ohne zu fragen', async () => {
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gut' }));
    const provider = anbieter(fake, null);

    expect(await provider.getAvailability('enrich-entry')).toBe('unavailable');
    await expect(provider.reviewLearningForm({ english: 'house' })).rejects.toMatchObject({
      kind: 'no-key',
    });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('Der Schlüssel', () => {
  it('erscheint im Anfragerumpf nirgends', () => {
    /*
      Er gehört in die Kopfzeile (das prüft `transport.test.ts`). Hier wird
      geprüft, dass er nicht zusätzlich irgendwo im Rumpf mitfährt – etwa in
      einem Kontextfeld, das jemand „zur Sicherheit" mitgibt.
    */
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gut' }));
    return anbieter(fake)
      .testConnection()
      .then(() => {
        expect(JSON.stringify(fake.calls[0]?.body)).not.toContain(TEST_API_KEY);
        expect(fake.calls[0]?.maskedKey).not.toContain(TEST_API_KEY);
      });
  });

  it('wird bei jeder Anfrage neu geholt, nicht festgehalten', async () => {
    /*
      Ein festgehaltener Schlüssel überlebte ein „Zugangsdaten vergessen" in
      jedem Anbieterobjekt, das gerade in einem React-Zustand hängt.
    */
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gut' }));
    let key: ApiKey | undefined = new ApiKey(TEST_API_KEY);
    const provider = createGeminiAiProvider({
      getKey: () => key,
      transport: fake.transport,
    });

    await provider.testConnection();
    key = undefined; // „Zugangsdaten vergessen"

    await expect(provider.testConnection()).rejects.toMatchObject({ kind: 'no-key' });
    expect(fake.calls).toHaveLength(1);
  });
});

describe('Der Verbindungstest', () => {
  it('überträgt kein Material', async () => {
    // Er soll den Schlüssel prüfen, nicht nebenbei einen Schülertext verschicken.
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gebräuchlich' }));
    await anbieter(fake).testConnection();

    const rumpf = JSON.stringify(fake.calls[0]?.body);
    expect(rumpf).toContain('house');
    expect(fake.calls).toHaveLength(1);
  });

  it('meldet einen ungültigen Schlüssel verständlich', async () => {
    const fake = createFakeGemini(replyWithError(400, 'API key not valid'));
    await expect(anbieter(fake).testConnection()).rejects.toMatchObject({ kind: 'invalid-key' });
  });
});

describe('Die Antwort wird geprüft, nicht geglaubt', () => {
  it('verwirft eine Antwort, die nicht zum Schema passt', async () => {
    const fake = createFakeGemini(replyWithJson({ translations: 'das Haus' }));
    await expect(
      anbieter(fake).translateEntry({ english: 'house' }, KONTEXT),
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('verwirft eine Antwort, die kein JSON ist', async () => {
    const fake = createFakeGemini(replyWithText('Gerne! Hier sind die Übersetzungen:'));
    await expect(
      anbieter(fake).translateEntry({ english: 'house' }, KONTEXT),
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('übernimmt nichts teilweise', async () => {
    /*
      Eine halb gültige Vorschlagsliste ist schlimmer als keine: Sie sieht
      vollständig aus. Hier ist der zweite Eintrag zu lang – die ganze Antwort
      fällt durch.
    */
    const fake = createFakeGemini(
      replyWithJson({ translations: [{ german: 'das Haus' }, { german: 'x'.repeat(200) }] }),
    );
    await expect(
      anbieter(fake).translateEntry({ english: 'house' }, KONTEXT),
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('erkennt eine abgeschnittene Antwort als solche', async () => {
    const fake = createFakeGemini({
      status: 200,
      text: JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"translations":[{"ger' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    });
    await expect(
      anbieter(fake).translateEntry({ english: 'house' }, KONTEXT),
    ).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('erkennt eine inhaltlich gesperrte Anfrage', async () => {
    const fake = createFakeGemini({
      status: 200,
      text: JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
    });
    await expect(anbieter(fake).translateEntry({ english: 'x' }, KONTEXT)).rejects.toMatchObject({
      kind: 'blocked',
    });
  });

  it('nimmt eine gültige Antwort an – mit Herkunftsvermerk', async () => {
    const fake = createFakeGemini(
      replyWithJson({ translations: [{ german: 'das Haus' }, { german: 'das Gebäude' }] }),
    );
    const ergebnis = await anbieter(fake).translateEntry({ english: 'house' }, KONTEXT);

    expect(ergebnis.value.map((eintrag) => eintrag.german)).toEqual(['das Haus', 'das Gebäude']);
    expect(ergebnis.provenance.status).toBe('ungeprueft');
    expect(ergebnis.provenance.model).toBe('gemini-3.5-flash-lite');
    expect(ergebnis.provenance.capability).toBe('translate-entry');
  });
});

describe('Deutsche Alternativen', () => {
  it('kommen als getrennte Einträge und nicht als eine Zeichenkette', async () => {
    /*
      Die sichtbare Kurzform mit Semikolon entsteht erst in der Oberfläche.
      Käme sie schon so vom Modell, ließe sie sich nicht mehr zerlegen.
    */
    const fake = createFakeGemini(
      replyWithJson({ translations: [{ german: 'aufgeben' }, { german: 'verzichten auf' }] }),
    );
    const ergebnis = await anbieter(fake).translateEntry({ english: 'to give up' }, KONTEXT);

    expect(ergebnis.value).toHaveLength(2);
    for (const eintrag of ergebnis.value) expect(eintrag.german).not.toContain(';');
  });
});

describe('Die Lernformprüfung', () => {
  it('bleibt auch bei „ok" ein ungeprüfter Vorschlag', async () => {
    /*
      Eine grammatische Lernform gilt nicht als richtig, weil ein Modell das
      gesagt hat. `markSuggestion` kennt keinen anderen Anfangszustand.
    */
    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gebräuchliche Form' }));
    const ergebnis = await anbieter(fake).reviewLearningForm({ english: 'house' });

    expect(ergebnis.value.verdict).toBe('ok');
    expect(ergebnis.provenance.status).toBe('ungeprueft');
  });
});

describe('Die Textempfehlung', () => {
  const kandidaten: AiTextCandidate[] = [
    { key: 'c1', english: 'reef', occurrences: 3, sourceSentence: 'The reef is dying.' },
    { key: 'c2', english: 'coral', occurrences: 2, sourceSentence: 'Coral needs warm water.' },
  ];

  it('gibt nur bekannte Schlüssel zurück', async () => {
    /*
      Der eigentliche Schutz gegen einen präparierten Quelltext: Selbst ein
      Modell, das der Einflüsterung folgt, kann keine Vokabel unterschieben,
      die im Text nie stand.
    */
    const fake = createFakeGemini(
      replyWithJson({ recommendedKeys: ['c2', 'c99', 'c2', 'malware'] }),
    );
    const ergebnis = await anbieter(fake).suggestFromText(kandidaten, KONTEXT);

    expect(ergebnis).toEqual([{ key: 'c2' }]);
  });

  it('behält die Reihenfolge des Modells', async () => {
    const fake = createFakeGemini(replyWithJson({ recommendedKeys: ['c2', 'c1'] }));
    const ergebnis = await anbieter(fake).suggestFromText(kandidaten, KONTEXT);

    expect(ergebnis).toEqual([{ key: 'c2' }, { key: 'c1' }]);
  });
});

describe('Ergänzen heißt ergänzen', () => {
  it('überschreibt keine vorhandenen Angaben', async () => {
    /*
      Der Eintrag geht vollständig wieder heraus; nur die drei Felder dieser
      Fähigkeit kommen hinzu. Was jemand von Hand eingetragen hat, bleibt.
    */
    const fake = createFakeGemini(
      replyWithJson({ partOfSpeech: 'noun', difficulty: 2, topicTags: ['nature'] }),
    );
    const ergebnis = await anbieter(fake).enrichEntry(
      {
        english: 'reef',
        germanAnswers: ['das Riff'],
        notes: 'von Hand ergänzt',
        exampleSentences: [{ english: 'The reef is dying.' }],
      },
      KONTEXT,
    );

    expect(ergebnis.notes).toBe('von Hand ergänzt');
    expect(ergebnis.germanAnswers).toEqual(['das Riff']);
    expect(ergebnis.exampleSentences).toEqual([{ english: 'The reef is dying.' }]);
    expect(ergebnis.partOfSpeech).toBe('noun');
  });
});

describe('Wenn etwas schiefgeht', () => {
  it('wiederholt von sich aus nichts', async () => {
    // Ein automatischer zweiter Versuch bei 429 macht aus einem Kontingent zwei.
    const fake = createFakeGemini(replyWithError(429, 'Quota exceeded'));
    await expect(anbieter(fake).testConnection()).rejects.toMatchObject({ kind: 'quota' });
    expect(fake.calls).toHaveLength(1);
  });

  it('reicht einen Transportfehler als verständliche Meldung weiter', async () => {
    const fake = createFakeGemini({
      throws: new GeminiTransportError('Keine Verbindung.', 'offline'),
    });
    const fehler: unknown = await anbieter(fake)
      .testConnection()
      .then(
        () => {
          throw new Error('Das hätte scheitern müssen.');
        },
        (error: unknown) => error,
      );

    expect(fehler).toBeInstanceOf(GeminiError);
    expect((fehler as GeminiError).kind).toBe('offline');
  });

  it('bricht vor der Anfrage ab, wenn das Signal schon abgebrochen ist', async () => {
    const controller = new AbortController();
    controller.abort();

    const fake = createFakeGemini(replyWithJson({ verdict: 'ok', reason: 'gut' }));
    await expect(anbieter(fake).testConnection(controller.signal)).rejects.toMatchObject({
      kind: 'aborted',
    });
    expect(fake.calls).toHaveLength(0);
  });
});
