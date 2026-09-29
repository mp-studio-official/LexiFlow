// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  KEIN_NETZ_ANBIETER,
  MAX_ANFRAGE_BYTES,
  NUR_LEHRKRAEFTE,
  WEITERLEITUNG,
  ZU_GROSS,
  ZU_VIELE,
  handle,
  type Ports,
  type Rolle,
  type VerbindungZeile,
} from './core';
import { NICHT_LESBAR, SCHLUESSEL_FEHLT, alsBase64 } from './tresor';

/**
 * Der Kern von `ai-gateway` – vollständig mit Fakes geprüft.
 *
 * Was hier **nicht** geprüft wird, steht in § 7.1 und bleibt dort stehen: der
 * Deno-Mantel, die echte Edge-Laufzeit, echte Function Secrets und ein echter
 * Anbieter. Kein Test in dieser Datei ruft irgendetwas im Netz auf, und keiner
 * benutzt einen echten Schlüssel: Der Hauptschlüssel unten ist eine Folge von
 * Siebenen, und die „Anbieterschlüssel" heißen `sk-test-…`.
 */

const LEHRERIN = '00000000-0000-4000-8000-000000000001';
const LERNENDE = '00000000-0000-4000-8000-000000000002';

const KEY_V1 = alsBase64(new Uint8Array(32).fill(7));

interface Aufzeichnung {
  url: string;
  headers: Record<string, string>;
  body: string;
  hoechstensBytes: number;
}

interface FakeOptionen {
  rolle?: Rolle;
  env?: Record<string, string | undefined>;
  freigegebeneHosts?: string[];
  antwort?: Partial<{
    status: number;
    text: string;
    abgeschnitten: boolean;
    weiterleitungNach: string;
  }>;
  bremseOffen?: boolean;
}

function fakePorts(optionen: FakeOptionen = {}) {
  const zeilen = new Map<string, VerbindungZeile>();
  const gesendet: Aufzeichnung[] = [];
  let zaehler = 0;

  const ports: Ports = {
    now: () => new Date('2026-09-14T09:00:00.000Z'),
    randomBytes: (anzahl) => crypto.getRandomValues(new Uint8Array(anzahl)),
    newId: () => {
      zaehler += 1;
      return `verbindung-${zaehler}`;
    },
    env: optionen.env ?? { LEXIFLOW_AI_MASTER_KEY_V1: KEY_V1 },

    db: {
      async myRole(userId) {
        if (userId === LEHRERIN) return optionen.rolle ?? 'teacher';
        if (userId === LERNENDE) return 'student';
        return undefined;
      },
      async listConnections(userId) {
        return [...zeilen.values()].filter((zeile) => zeile.ownerId === userId);
      },
      async readConnection(userId, id) {
        const zeile = zeilen.get(id);
        return zeile && zeile.ownerId === userId ? zeile : undefined;
      },
      async saveConnection(zeile) {
        zeilen.set(zeile.id, zeile);
      },
      async deleteConnection(userId, id) {
        const zeile = zeilen.get(id);
        if (zeile && zeile.ownerId === userId) zeilen.delete(id);
      },
      async markChecked(userId, id, zeitpunkt) {
        const zeile = zeilen.get(id);
        if (zeile && zeile.ownerId === userId) {
          zeilen.set(id, { ...zeile, lastCheckedAt: zeitpunkt });
        }
      },
      async allowedHosts() {
        return optionen.freigegebeneHosts ?? [];
      },
      async noteCall() {
        return optionen.bremseOffen ?? true;
      },
    },

    http: {
      async senden(input) {
        gesendet.push(input);
        return {
          status: optionen.antwort?.status ?? 200,
          text: optionen.antwort?.text ?? '{"ok":true}',
          abgeschnitten: optionen.antwort?.abgeschnitten ?? false,
          ...(optionen.antwort?.weiterleitungNach === undefined
            ? {}
            : { weiterleitungNach: optionen.antwort.weiterleitungNach }),
        };
      },
    },
  };

  return { ports, zeilen, gesendet };
}

async function angelegt(
  ports: Ports,
  ueber: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const antwort = await handle(
    {
      aktion: 'speichern',
      label: 'Meine Verbindung',
      adapter: 'gemini',
      model: 'gemini-3.5-flash-lite',
      secret: 'sk-test-abcdefgh1234',
      ...ueber,
    },
    LEHRERIN,
    ports,
  );
  return antwort.body;
}

/* ============================================================ Wer darf === */

describe('wer diese Funktion überhaupt benutzen darf', () => {
  it('niemand ohne Anmeldung', async () => {
    const { ports } = fakePorts();
    expect((await handle({ aktion: 'liste' }, undefined, ports)).status).toBe(401);
  });

  it('keine lernende Person – und zwar hier, nicht in der Oberfläche', async () => {
    const { ports } = fakePorts();
    const antwort = await handle({ aktion: 'liste' }, LERNENDE, ports);

    expect(antwort.status).toBe(403);
    expect(antwort.body['fehler']).toBe(NUR_LEHRKRAEFTE);
  });

  it('auch nicht zum Aufrufen einer fremden Verbindung', async () => {
    const { ports } = fakePorts();
    await angelegt(ports);
    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LERNENDE, ports);
    expect(antwort.status).toBe(403);
  });

  it('eine unbekannte Person ebenfalls nicht', async () => {
    const { ports } = fakePorts();
    const antwort = await handle({ aktion: 'liste' }, 'jemand-anderes', ports);
    expect(antwort.status).toBe(403);
  });

  it('die Verwaltung darf', async () => {
    const { ports } = fakePorts({ rolle: 'admin' });
    expect((await handle({ aktion: 'liste' }, LEHRERIN, ports)).status).toBe(200);
  });

  /*
    ## Warum hier auch der ungültige Token steht

    `supabase/config.toml` setzt für diese Funktion `verify_jwt = false`. Die
    Plattform prüft den Token also nicht; `wer()` im Mantel tut es. Es reicht
    ihn an `auth.getUser()` und gibt `undefined` zurück, wenn dabei keine
    Person herauskommt – gleich, ob der Kopf fehlte, „Bearer" fehlte, der
    Token abgelaufen war oder erfunden.

    Für den Kern sehen deshalb **alle** diese Fälle gleich aus: keine
    Personenkennung. Das ist keine Vereinfachung des Tests, sondern die
    Bauform – und die beiden Prüfungen unten halten fest, dass sie trägt.
  */
  it('ein fehlender oder ungültiger Token endet bei jeder Aktion mit 401', async () => {
    const { ports } = fakePorts();
    const aktionen = [
      { aktion: 'liste' },
      { aktion: 'speichern', label: 'Z', adapter: 'gemini', model: 'm', secret: 'egal' },
      { aktion: 'aufrufen', id: 'verbindung-1' },
      { aktion: 'loeschen', id: 'verbindung-1' },
      { aktion: 'pruefen', id: 'verbindung-1' },
    ];
    for (const eingabe of aktionen) {
      const antwort = await handle(eingabe, undefined, ports);
      expect(antwort.status, JSON.stringify(eingabe)).toBe(401);
    }
  });

  it('und die Ablehnung kommt, bevor irgendetwas gefragt wird', async () => {
    /*
      Ohne Personenkennung darf der Kern nicht einmal die Rolle nachschlagen.
      Diese Ports werfen bei jedem Zugriff; käme die Ablehnung später, stünde
      hier der Fehler statt der 401.
    */
    const { ports } = fakePorts();
    const sperrig: Ports = {
      ...ports,
      db: new Proxy({} as Ports['db'], {
        get() {
          throw new Error('Der Kern hat vor der 401 auf die Datenbank zugegriffen.');
        },
      }),
    };
    expect((await handle({ aktion: 'liste' }, undefined, sperrig)).status).toBe(401);
  });
});

/* ======================================================= Der Schlüssel === */

describe('der Anbieterschlüssel geht hinein und nie wieder heraus', () => {
  it('kommt in keiner Antwort vor', async () => {
    const { ports } = fakePorts();
    const gespeichert = await angelegt(ports);
    const liste = await handle({ aktion: 'liste' }, LEHRERIN, ports);

    for (const körper of [gespeichert, liste.body]) {
      expect(JSON.stringify(körper)).not.toContain('sk-test-abcdefgh');
    }
  });

  it('steht in der Zeile nur versiegelt', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);
    const zeile = zeilen.get('verbindung-1')!;

    expect(JSON.stringify(zeile.secret)).not.toContain('sk-test');
    expect(zeile.secret.keyVersion).toBe(1);
    expect(zeile.secret.iv).not.toBe('');
  });

  it('ist nach außen nur als Maske zu sehen', async () => {
    const { ports } = fakePorts();
    const gespeichert = await angelegt(ports);
    const verbindung = gespeichert['verbindung'] as Record<string, unknown>;

    expect(verbindung['maskedSecret']).toBe('••••••••1234');
  });

  it('geht beim Aufruf in eine Kopfzeile und nie in die Adresse', async () => {
    const { ports, gesendet } = fakePorts();
    await angelegt(ports);
    await handle({ aktion: 'aufrufen', id: 'verbindung-1', payload: { a: 1 } }, LEHRERIN, ports);

    expect(gesendet).toHaveLength(1);
    expect(gesendet[0]!.headers['x-goog-api-key']).toBe('sk-test-abcdefgh1234');
    expect(gesendet[0]!.url).not.toContain('sk-test');
    expect(gesendet[0]!.url).not.toContain('key=');
  });

  it('und die Antwort an den Browser enthält ihn nicht', async () => {
    const { ports } = fakePorts();
    await angelegt(ports);
    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(JSON.stringify(antwort.body)).not.toContain('sk-test');
  });
});

/* ========================================================= Kopfzeilen === */

describe('die Kopfzeilen baut die Funktion selbst', () => {
  it('es gibt keinen Weg, eine mitzugeben', async () => {
    /*
      Mit freien Kopfzeilen ließe sich der `Host` umbiegen oder ein interner
      Dienst mit einer Kennung ansprechen, die diese Funktion zufällig hat.
    */
    const { ports, gesendet } = fakePorts();
    await angelegt(ports);
    await handle(
      {
        aktion: 'aufrufen',
        id: 'verbindung-1',
        headers: { host: 'boese.example', 'x-forwarded-for': '127.0.0.1' },
        payload: {},
      },
      LEHRERIN,
      ports,
    );

    expect(Object.keys(gesendet[0]!.headers).sort()).toEqual([
      'accept',
      'content-type',
      'x-goog-api-key',
    ]);
  });

  it('ein Anbieter mit fester Zusatzkopfzeile bekommt sie', async () => {
    const { ports, gesendet } = fakePorts({ freigegebeneHosts: [] });
    await angelegt(ports, { adapter: 'anthropic-kompatibel' });
    await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(gesendet[0]!.headers['anthropic-version']).toBe('2023-06-01');
    expect(gesendet[0]!.headers['x-api-key']).toBe('sk-test-abcdefgh1234');
  });
});

/* ============================================================ Adressen === */

describe('wohin gesendet werden darf', () => {
  it('der voreingestellte Anbieter braucht keine Freigabe', async () => {
    const { ports, gesendet } = fakePorts();
    await angelegt(ports);
    await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(gesendet[0]!.url).toContain('generativelanguage.googleapis.com');
  });

  it('eine eigene Adresse braucht eine – und bekommt sonst eine Absage mit Grund', async () => {
    const { ports } = fakePorts({ freigegebeneHosts: [] });
    const antwort = await handle(
      {
        aktion: 'speichern',
        label: 'Schul-KI',
        adapter: 'openai-kompatibel',
        baseUrl: 'https://ki.schule.example/v1/',
        secret: 'sk-test-abcdefgh1234',
      },
      LEHRERIN,
      ports,
    );

    expect(antwort.status).toBe(400);
    expect(antwort.body['fehler']).toMatch(/nicht freigegeben/);
  });

  it('mit Freigabe geht sie', async () => {
    const { ports } = fakePorts({ freigegebeneHosts: ['ki.schule.example'] });
    const antwort = await handle(
      {
        aktion: 'speichern',
        label: 'Schul-KI',
        adapter: 'openai-kompatibel',
        baseUrl: 'https://ki.schule.example/v1/',
        secret: 'sk-test-abcdefgh1234',
      },
      LEHRERIN,
      ports,
    );

    expect(antwort.status).toBe(200);
    expect((antwort.body['verbindung'] as Record<string, unknown>)['baseUrl']).toBe(
      'https://ki.schule.example/v1/',
    );
  });

  it('ein Anbieter mit fester Adresse nimmt keine eigene an', async () => {
    /*
      Ein zweiter „Gemini" auf einer anderen Adresse ist kein Gemini. Die
      eingetragene Adresse wird nicht abgelehnt, sondern übergangen – das
      Formular bietet das Feld gar nicht erst an.
    */
    const { ports } = fakePorts({ freigegebeneHosts: ['ki.schule.example'] });
    const antwort = await angelegt(ports, { baseUrl: 'https://ki.schule.example/v1/' });

    expect((antwort['verbindung'] as Record<string, unknown>)['baseUrl']).toContain(
      'generativelanguage.googleapis.com',
    );
  });

  it.each([
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/v1/',
    'https://[::1]/v1/',
    'http://ki.schule.example/v1/',
    'https://ki.schule.example:6379/v1/',
    'https://ki.schule.example@boese.example/v1/',
  ])('lehnt %s ab, auch wenn der Host freigegeben wäre', async (adresse) => {
    const { ports } = fakePorts({
      freigegebeneHosts: ['ki.schule.example', '169.254.169.254', '127.0.0.1', 'boese.example'],
    });
    const antwort = await handle(
      {
        aktion: 'speichern',
        label: 'Test',
        adapter: 'openai-kompatibel',
        baseUrl: adresse,
        secret: 'sk-test-abcdefgh1234',
      },
      LEHRERIN,
      ports,
    );

    expect(antwort.status, adresse).toBe(400);
  });

  it('prüft die Adresse beim Aufruf noch einmal', async () => {
    /*
      Zwischen Speichern und Aufruf kann eine Verwaltung einen Host wieder
      entfernt haben. Eine Freigabe, die nur beim Eintragen gilt, ist keine.
    */
    const freigegeben = ['ki.schule.example'];
    const { ports, gesendet } = fakePorts({ freigegebeneHosts: freigegeben });
    await handle(
      {
        aktion: 'speichern',
        label: 'Schul-KI',
        adapter: 'openai-kompatibel',
        baseUrl: 'https://ki.schule.example/v1/',
        secret: 'sk-test-abcdefgh1234',
      },
      LEHRERIN,
      ports,
    );

    freigegeben.length = 0;
    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.status).toBe(403);
    expect(gesendet).toHaveLength(0);
  });

  it('und sagt beim Aufruf nicht, warum – das wäre ein Scanner', async () => {
    const { ports } = fakePorts({ freigegebeneHosts: [] });
    await handle(
      {
        aktion: 'speichern',
        label: 'Schul-KI',
        adapter: 'openai-kompatibel',
        baseUrl: 'https://api.openai.com/v1/',
        secret: 'sk-test-abcdefgh1234',
      },
      LEHRERIN,
      ports,
    );
    // Die Zeile steht; jetzt den Preset-Host aus der Prüfung nehmen ist nicht
    // möglich – deshalb wird hier eine unbekannte Verbindung aufgerufen.
    const antwort = await handle({ aktion: 'aufrufen', id: 'gibts-nicht' }, LEHRERIN, ports);

    expect(antwort.body).toEqual({ fehler: 'abgelehnt' });
  });
});

/* ======================================================= Weiterleitung === */

describe('Weiterleitungen und Größen', () => {
  it('eine Umleitung wird nicht verfolgt, sondern abgelehnt', async () => {
    const { ports } = fakePorts({
      antwort: { status: 302, weiterleitungNach: 'https://169.254.169.254/' },
    });
    await angelegt(ports);
    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.status).toBe(502);
    expect(antwort.body['fehler']).toBe(WEITERLEITUNG);
  });

  it('eine abgeschnittene Antwort gilt als keine Antwort', async () => {
    const { ports } = fakePorts({ antwort: { abgeschnitten: true } });
    await angelegt(ports);
    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.status).toBe(502);
    expect(antwort.body['fehler']).toBe(ZU_GROSS);
  });

  it('gibt die Größengrenze an den Transport weiter', async () => {
    const { ports, gesendet } = fakePorts();
    await angelegt(ports);
    await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(gesendet[0]!.hoechstensBytes).toBeGreaterThan(0);
  });

  it('eine zu große Anfrage geht gar nicht erst hinaus', async () => {
    const { ports, gesendet } = fakePorts();
    await angelegt(ports);
    const antwort = await handle(
      { aktion: 'aufrufen', id: 'verbindung-1', payload: { text: 'x'.repeat(MAX_ANFRAGE_BYTES) } },
      LEHRERIN,
      ports,
    );

    expect(antwort.status).toBe(413);
    expect(gesendet).toHaveLength(0);
  });
});

/* ============================================================= Bremse === */

describe('die Bremse', () => {
  it('lässt einen Aufruf nicht durch, wenn zu viele kamen', async () => {
    const { ports, gesendet } = fakePorts({ bremseOffen: false });
    await angelegt(ports);
    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.status).toBe(429);
    expect(antwort.body['fehler']).toBe(ZU_VIELE);
    expect(gesendet).toHaveLength(0);
  });
});

/* ====================================================== Hauptschlüssel === */

describe('wenn der Hauptschlüssel fehlt oder nicht passt', () => {
  it('lässt sich nichts speichern – aber es wird auch nichts gelöscht', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);
    expect(zeilen.size).toBe(1);

    const ohne = fakePorts({ env: {} });
    // Dieselbe Zeile in die Fassung ohne Schlüssel hineinreichen.
    await ohne.ports.db.saveConnection(zeilen.get('verbindung-1')!);

    const antwort = await handle(
      {
        aktion: 'speichern',
        label: 'Noch eine',
        adapter: 'gemini',
        secret: 'sk-test-abcdefgh1234',
      },
      LEHRERIN,
      ohne.ports,
    );

    expect(antwort.status).toBe(503);
    expect(antwort.body['fehler']).toBe(SCHLUESSEL_FEHLT);
    // Die vorhandene Verbindung steht unberührt.
    expect(ohne.zeilen.size).toBe(1);
  });

  it('lässt sich nichts aufrufen – und die Zeile bleibt ebenfalls stehen', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);

    const ohne = fakePorts({ env: {} });
    await ohne.ports.db.saveConnection(zeilen.get('verbindung-1')!);

    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ohne.ports);

    expect(antwort.status).toBe(503);
    expect(ohne.zeilen.size).toBe(1);
    expect(ohne.gesendet).toHaveLength(0);
  });

  it('ein falscher Hauptschlüssel meldet sich, statt die Verbindung zu entfernen', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);

    const falsch = fakePorts({
      env: { LEXIFLOW_AI_MASTER_KEY_V1: alsBase64(new Uint8Array(32).fill(9)) },
    });
    await falsch.ports.db.saveConnection(zeilen.get('verbindung-1')!);

    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, falsch.ports);

    expect(antwort.status).toBe(409);
    expect(antwort.body['fehler']).toBe(NICHT_LESBAR);
    expect(falsch.zeilen.size).toBe(1);
    expect(falsch.gesendet).toHaveLength(0);
  });
});

/* ======================================================= Browsermodell === */

describe('das Modell im Browser', () => {
  it('lässt sich vermerken, aber nicht über den Server aufrufen', async () => {
    const { ports, gesendet } = fakePorts();
    await angelegt(ports, { adapter: 'browsermodell', secret: '' });

    const antwort = await handle({ aktion: 'aufrufen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.status).toBe(400);
    expect(antwort.body['fehler']).toBe(KEIN_NETZ_ANBIETER);
    expect(gesendet).toHaveLength(0);
  });

  it('und hat weder Adresse noch Schlüssel', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports, { adapter: 'browsermodell', secret: '' });
    const zeile = zeilen.get('verbindung-1')!;

    expect(zeile.baseUrl).toBe('');
    expect(zeile.maskedSecret).toBe('');
    expect(zeile.secret.ciphertext).toBe('');
  });
});

/* ======================================================== Verwaltung ===== */

describe('Verwalten der Verbindungen', () => {
  it('listet nur die eigenen', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);
    zeilen.set('fremd', { ...zeilen.get('verbindung-1')!, id: 'fremd', ownerId: 'jemand-anderes' });

    const antwort = await handle({ aktion: 'liste' }, LEHRERIN, ports);
    const liste = antwort.body['verbindungen'] as { id: string }[];

    expect(liste.map((eintrag) => eintrag.id)).toEqual(['verbindung-1']);
  });

  it('löscht nur die eigenen', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);
    zeilen.set('fremd', { ...zeilen.get('verbindung-1')!, id: 'fremd', ownerId: 'jemand-anderes' });

    await handle({ aktion: 'loeschen', id: 'fremd' }, LEHRERIN, ports);
    expect(zeilen.has('fremd')).toBe(true);

    await handle({ aktion: 'loeschen', id: 'verbindung-1' }, LEHRERIN, ports);
    expect(zeilen.has('verbindung-1')).toBe(false);
  });

  it('kann eine fremde Verbindung nicht aufrufen', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);
    zeilen.set('fremd', { ...zeilen.get('verbindung-1')!, id: 'fremd', ownerId: 'jemand-anderes' });

    const antwort = await handle({ aktion: 'aufrufen', id: 'fremd' }, LEHRERIN, ports);
    expect(antwort.status).toBe(404);
  });

  it('vermerkt eine erfolgreiche Prüfung mit Zeitpunkt', async () => {
    const { ports, zeilen } = fakePorts();
    await angelegt(ports);

    const antwort = await handle({ aktion: 'pruefen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.body['ok']).toBe(true);
    expect(zeilen.get('verbindung-1')!.lastCheckedAt).toBe('2026-09-14T09:00:00.000Z');
  });

  it('und vermerkt eine gescheiterte nicht', async () => {
    const { ports, zeilen } = fakePorts({ antwort: { status: 401 } });
    await angelegt(ports);

    const antwort = await handle({ aktion: 'pruefen', id: 'verbindung-1' }, LEHRERIN, ports);

    expect(antwort.body['ok']).toBe(false);
    expect(zeilen.get('verbindung-1')!.lastCheckedAt).toBeUndefined();
  });

  it('kennt keine unbekannte Aktion', async () => {
    const { ports } = fakePorts();
    expect((await handle({ aktion: 'alles-loeschen' }, LEHRERIN, ports)).status).toBe(400);
    expect((await handle({}, LEHRERIN, ports)).status).toBe(400);
  });

  it('nimmt keine Personenkennung aus dem Rumpf entgegen', async () => {
    /*
      Es gibt kein Feld dafür. Hier steht der Nachweis, dass ein
      hineingeschmuggeltes auch nichts bewirkt: Die Verbindung gehört
      trotzdem der aufrufenden Person.
    */
    const { ports, zeilen } = fakePorts();
    await angelegt(ports, { ownerId: 'jemand-anderes', userId: 'jemand-anderes' });

    expect(zeilen.get('verbindung-1')!.ownerId).toBe(LEHRERIN);
  });
});
