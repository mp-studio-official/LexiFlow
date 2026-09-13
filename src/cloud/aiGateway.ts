import type { AiConnectionSummary, AiGateway } from '../application/repositories';

/**
 * Der KI-Zugang des Portals – eine dünne Hülle um die Serverfunktion.
 *
 * ## Warum hier so wenig steht
 *
 * Weil hier so wenig stehen **darf**. Jede Entscheidung, die diese Datei
 * träfe, wäre eine Entscheidung im Browser – und der Browser ist die Stelle,
 * an der eine lernende Person mitliest, an der eine Erweiterung mitschreibt
 * und an der jemand die Konsole öffnet.
 *
 * Was hier steht: Anfrage stellen, Antwort auslegen, Fehler benennen. Was
 * nicht hier steht: die Adressprüfung, die Verschlüsselung, die Rollenprüfung
 * und der Anbieterschlüssel. Sie stehen in
 * `supabase/functions/ai-gateway/` und sind dort geprüft.
 *
 * ## Der Schlüssel geht einmal hinein
 *
 * `saveConnection` nimmt ihn im Klartext entgegen – anders geht es nicht, er
 * muss ja irgendwie hin. Danach gibt es keinen Weg zurück: Kein Aufruf dieser
 * Schnittstelle liefert ihn, und die Datenbank gibt die Siegelspalten für
 * angemeldete Rollen gar nicht erst heraus.
 *
 * ## Ungeprüft, wie seine Geschwister
 *
 * Diese Datei spricht HTTP mit einer Funktion, die nie gelaufen ist (§ 7.1).
 * Sie ist deshalb so dünn wie möglich gehalten.
 */

export interface AiTransport {
  /** Ruft `ai-gateway` auf und liefert Status und Rumpf. */
  (körper: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
}

export const KI_NICHT_ERREICHBAR = 'Der KI-Zugang ist gerade nicht erreichbar.';

function alsZusammenfassung(roh: unknown): AiConnectionSummary {
  const zeile = (roh ?? {}) as Record<string, unknown>;
  return {
    id: String(zeile['id'] ?? ''),
    label: String(zeile['label'] ?? ''),
    adapter: String(zeile['adapter'] ?? ''),
    model: String(zeile['model'] ?? ''),
    maskedSecret: String(zeile['maskedSecret'] ?? ''),
    capabilities: Array.isArray(zeile['capabilities'])
      ? (zeile['capabilities'] as string[])
      : [],
    active: zeile['active'] !== false,
    ...(typeof zeile['lastCheckedAt'] === 'string'
      ? { lastCheckedAt: zeile['lastCheckedAt'] }
      : {}),
  };
}

/**
 * Eine Antwort auslegen.
 *
 * Ein Fehlertext der Serverfunktion wird durchgereicht, wenn es einen gibt –
 * sie ist die Stelle, die weiß, warum eine Adresse nicht taugt. Gibt es
 * keinen, steht hier ein allgemeiner Satz und keine erfundene Begründung.
 */
function pruefe(antwort: { status: number; body: Record<string, unknown> }): Record<string, unknown> {
  if (antwort.status >= 200 && antwort.status < 300) return antwort.body;
  const gemeldet = antwort.body['fehler'];
  throw new Error(typeof gemeldet === 'string' && gemeldet !== '' ? gemeldet : KI_NICHT_ERREICHBAR);
}

export function createAiGateway(transport: AiTransport): AiGateway {
  return {
    async listConnections() {
      const body = pruefe(await transport({ aktion: 'liste' }));
      const liste = Array.isArray(body['verbindungen']) ? body['verbindungen'] : [];
      return liste.map(alsZusammenfassung);
    },

    async saveConnection(input) {
      const body = pruefe(
        await transport({
          aktion: 'speichern',
          ...(input.id === undefined ? {} : { id: input.id }),
          label: input.label,
          adapter: input.adapter,
          baseUrl: input.baseUrl,
          model: input.model,
          secret: input.secret,
        }),
      );
      return alsZusammenfassung(body['verbindung']);
    },

    async deleteConnection(id) {
      pruefe(await transport({ aktion: 'loeschen', id }));
    },

    async testConnection(id) {
      /*
        Der einzige Aufruf, der einen Fehlschlag **nicht** als Ausnahme
        weitergibt: „Die Verbindung steht nicht" ist hier das Ergebnis der
        Prüfung, nicht ihr Scheitern.
      */
      const antwort = await transport({ aktion: 'pruefen', id });
      const meldung = antwort.body['meldung'];
      return {
        ok: antwort.status === 200 && antwort.body['ok'] === true,
        message: typeof meldung === 'string' ? meldung : KI_NICHT_ERREICHBAR,
      };
    },

    async invoke(input) {
      const body = pruefe(
        await transport({
          aktion: 'aufrufen',
          id: input.connectionId,
          capability: input.capability,
          payload: input.payload,
        }),
      );
      return body['antwort'];
    },
  };
}

/**
 * Der Transport über `fetch` – mit dem Zugangstoken der angemeldeten Person.
 *
 * Getrennt vom Gateway darüber, damit dieses ohne Netz geprüft werden kann.
 * Dieselbe Trennung wie bei `learnerAuth.ts`.
 */
export function createAiTransport(input: {
  supabaseUrl: string;
  publishableKey: string;
  /** Liefert das Zugangstoken der laufenden Sitzung – oder nichts. */
  accessToken: () => Promise<string | undefined>;
}): AiTransport {
  return async (körper) => {
    const token = await input.accessToken();
    if (!token) return { status: 401, body: { fehler: 'Nicht angemeldet.' } };

    const antwort = await fetch(
      new URL('functions/v1/ai-gateway', input.supabaseUrl).toString(),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: input.publishableKey,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(körper),
      },
    );

    let body: Record<string, unknown> = {};
    try {
      body = (await antwort.json()) as Record<string, unknown>;
    } catch {
      // Eine Antwort ohne JSON ist eine Störung, kein Ergebnis.
      body = { fehler: KI_NICHT_ERREICHBAR };
    }
    return { status: antwort.status, body };
  };
}
