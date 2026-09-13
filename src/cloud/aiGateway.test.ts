// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KI_NICHT_ERREICHBAR, createAiGateway, type AiTransport } from './aiGateway';

/**
 * Die Hülle um die Serverfunktion.
 *
 * Was der Server entscheidet, steht in `supabase/functions/ai-gateway/` und
 * ist dort geprüft. Hier geht es um die Naht: dass die richtige Aktion
 * hinausgeht, dass ein Fehler als Fehler ankommt – und dass diese Datei den
 * Schlüssel weder erfindet noch zurückgibt.
 *
 * Kein Test hier ruft etwas im Netz auf: `transport` ist eine Funktion, die
 * ein Objekt zurückgibt.
 */

function fakeTransport(
  antwort: { status: number; body: Record<string, unknown> } = { status: 200, body: {} },
) {
  const gesendet: Record<string, unknown>[] = [];
  const transport: AiTransport = async (körper) => {
    gesendet.push(körper);
    return antwort;
  };
  return { transport, gesendet };
}

describe('was hinausgeht', () => {
  it('eine Liste fragt nach der Liste', async () => {
    const { transport, gesendet } = fakeTransport({ status: 200, body: { verbindungen: [] } });
    await createAiGateway(transport).listConnections();
    expect(gesendet[0]).toEqual({ aktion: 'liste' });
  });

  it('ein Speichern schickt den Schlüssel genau einmal mit', async () => {
    const { transport, gesendet } = fakeTransport({
      status: 200,
      body: { verbindung: { id: 'v1', label: 'Test', maskedSecret: '••••1234' } },
    });

    await createAiGateway(transport).saveConnection({
      label: 'Test',
      adapter: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
      model: 'gemini-3.5-flash-lite',
      secret: 'sk-test-abcdefgh1234',
    });

    expect(gesendet).toHaveLength(1);
    expect(gesendet[0]!['aktion']).toBe('speichern');
    expect(gesendet[0]!['secret']).toBe('sk-test-abcdefgh1234');
  });

  it('und bekommt nur die Maske zurück', async () => {
    const { transport } = fakeTransport({
      status: 200,
      body: { verbindung: { id: 'v1', label: 'Test', maskedSecret: '••••1234' } },
    });

    const gespeichert = await createAiGateway(transport).saveConnection({
      label: 'Test',
      adapter: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
      model: 'x',
      secret: 'sk-test-abcdefgh1234',
    });

    expect(gespeichert.maskedSecret).toBe('••••1234');
    expect(JSON.stringify(gespeichert)).not.toContain('sk-test');
  });

  it('ein Aufruf nennt Verbindung und Nutzlast – und keine Kopfzeilen', async () => {
    const { transport, gesendet } = fakeTransport({ status: 200, body: { antwort: '{}' } });
    await createAiGateway(transport).invoke({
      connectionId: 'v1',
      capability: 'suggest-from-text',
      payload: { kandidaten: ['c1'] },
    });

    expect(Object.keys(gesendet[0]!).sort()).toEqual(['aktion', 'capability', 'id', 'payload']);
  });
});

describe('was hereinkommt', () => {
  it('ein Fehlertext des Servers wird durchgereicht', async () => {
    /*
      Die Serverfunktion weiß, warum eine Adresse nicht taugt. Diese Datei
      weiß es nicht und erfindet deshalb nichts.
    */
    const { transport } = fakeTransport({
      status: 400,
      body: { fehler: 'Dieser Host ist nicht freigegeben.' },
    });

    await expect(createAiGateway(transport).listConnections()).rejects.toThrow(
      'Dieser Host ist nicht freigegeben.',
    );
  });

  it('ohne Fehlertext steht ein allgemeiner Satz – keine erfundene Begründung', async () => {
    const { transport } = fakeTransport({ status: 500, body: {} });
    await expect(createAiGateway(transport).listConnections()).rejects.toThrow(
      KI_NICHT_ERREICHBAR,
    );
  });

  it('eine unvollständige Antwort führt nicht zum Absturz', async () => {
    const { transport } = fakeTransport({ status: 200, body: {} });
    expect(await createAiGateway(transport).listConnections()).toEqual([]);
  });

  it('eine gescheiterte Prüfung ist ein Ergebnis, kein Fehler', async () => {
    /*
      Der einzige Aufruf, der einen Fehlschlag nicht weiterwirft: „Die
      Verbindung steht nicht" ist die Antwort auf die Frage, nicht ihr
      Scheitern.
    */
    const { transport } = fakeTransport({
      status: 502,
      body: { ok: false, meldung: 'Der Anbieter hat die Anfrage abgelehnt.' },
    });

    const ergebnis = await createAiGateway(transport).testConnection('v1');
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.message).toBe('Der Anbieter hat die Anfrage abgelehnt.');
  });
});
