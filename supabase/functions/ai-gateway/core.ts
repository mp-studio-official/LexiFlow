import {
  ANBIETER,
  istAdapter,
  kopfzeilenFuer,
  voreingestellteHosts,
  type Adapter,
} from './anbieter.ts';
import { ABLEHNUNGSTEXT, pruefeZiel } from './ziel.ts';
import {
  NICHT_LESBAR,
  SCHLUESSEL_FEHLT,
  entsiegeln,
  leseSchluesselbund,
  maskiere,
  versiegeln,
  type Geheimnis,
} from './tresor.ts';

/**
 * Der Kern von `ai-gateway` – ohne Deno, ohne Netz, ohne Datenbank.
 *
 * Derselbe Aufbau wie bei `learner-auth`: Alles, was entscheidet, steht hier
 * und bekommt seine Seiteneffekte als Parameter. Offen bleibt der Deno-Mantel
 * in `index.ts` und das Deployment – beides ist nie gelaufen (§ 7.1).
 *
 * ## Die vier Zusagen dieser Datei
 *
 * 1. **Der Browser sieht nie einen Anbieterschlüssel.** Er geht einmal hinein
 *    (beim Speichern) und kommt nie wieder heraus – auch nicht maskiert aus
 *    dem Chiffretext, denn die Maske entsteht vorher.
 * 2. **Es wird nur dorthin gesendet, wo gesendet werden darf.** Zweimal
 *    geprüft: beim Speichern und noch einmal unmittelbar vor dem Aufruf. Die
 *    Freigabeliste kann sich zwischen beidem geändert haben.
 * 3. **Nur Lehrkräfte.** Eine lernende Person hat hier nichts zu suchen, und
 *    zwar nicht, weil die Oberfläche den Knopf verbirgt.
 * 4. **Kein Lernstand, keine Person.** Diese Funktion nimmt einen
 *    Nutzlastteil entgegen und reicht ihn weiter; sie liest keine Tabelle mit
 *    Lernständen und hat keinen Port dafür.
 *
 * ## Warum eine Ablehnung wenig sagt
 *
 * „Host nicht freigegeben" ist eine hilfreiche Auskunft für eine Lehrkraft,
 * die eine Adresse einträgt – deshalb steht sie beim **Speichern** dabei.
 * Beim **Aufruf** steht sie nicht mehr dabei: Dort wäre sie ein Scanner, mit
 * dem sich das interne Netz abfragen ließe.
 */

/* --------------------------------------------------------------- Typen --- */

export type Rolle = 'admin' | 'teacher' | 'student';

export interface VerbindungZeile {
  id: string;
  ownerId: string;
  label: string;
  adapter: Adapter;
  baseUrl: string;
  model: string;
  maskedSecret: string;
  secret: Geheimnis;
  capabilities: string[];
  active: boolean;
  lastCheckedAt?: string;
}

/** Was nach außen geht – ohne Chiffretext, ohne IV, ohne Fassungsnummer. */
export interface VerbindungOhneGeheimnis {
  id: string;
  label: string;
  adapter: Adapter;
  baseUrl: string;
  model: string;
  maskedSecret: string;
  capabilities: string[];
  active: boolean;
  lastCheckedAt?: string;
}

export interface Antwort {
  status: number;
  body: Record<string, unknown>;
}

export interface Ports {
  now(): Date;
  randomBytes(anzahl: number): Uint8Array;
  newId(): string;
  /** Die Function Secrets. Der Hauptschlüssel steht nur hier. */
  env: Record<string, string | undefined>;

  db: {
    myRole(userId: string): Promise<Rolle | undefined>;
    listConnections(userId: string): Promise<VerbindungZeile[]>;
    readConnection(userId: string, id: string): Promise<VerbindungZeile | undefined>;
    saveConnection(zeile: VerbindungZeile): Promise<void>;
    deleteConnection(userId: string, id: string): Promise<void>;
    markChecked(userId: string, id: string, zeitpunkt: string): Promise<void>;
    /** Die von einer Verwaltung freigegebenen Hosts. */
    allowedHosts(): Promise<string[]>;
    /** Die Bremse. `false` heißt: zu viele Aufrufe. */
    noteCall(userId: string): Promise<boolean>;
  };

  http: {
    /**
     * Eine Anfrage – **ohne** zu folgen und mit Größengrenze.
     *
     * `weiterleitungNach` ist gesetzt, wenn der Anbieter mit 3xx geantwortet
     * hat. Der Kern folgt nicht; er lehnt ab. Siehe unten.
     */
    senden(input: {
      url: string;
      headers: Record<string, string>;
      body: string;
      hoechstensBytes: number;
    }): Promise<{
      status: number;
      text: string;
      abgeschnitten: boolean;
      weiterleitungNach?: string;
    }>;
  };
}

/* ------------------------------------------------------------- Grenzen --- */

/** Höchstens so viel geht hinaus. Eine Vokabelliste ist weit darunter. */
export const MAX_ANFRAGE_BYTES = 32 * 1024;

/** Höchstens so viel kommt herein. Alles darüber ist keine Antwort mehr. */
export const MAX_ANTWORT_BYTES = 256 * 1024;

/** Aufrufe je Lehrkraft und Stunde. */
export const BREMSE = { hoechstzahl: 120, fensterSekunden: 3600 };

export const ABGELEHNT = { fehler: 'abgelehnt' } as const;
export const NUR_LEHRKRAEFTE = 'Dieser Bereich ist Lehrkräften vorbehalten.';
export const ZU_VIELE = 'Zu viele Anfragen. Bitte später noch einmal.';
export const WEITERLEITUNG =
  'Der Anbieter hat auf eine andere Adresse umgeleitet. Das ist nicht zulässig.';
export const ZU_GROSS = 'Die Antwort des Anbieters ist zu groß.';
export const KEIN_NETZ_ANBIETER =
  'Dieses Modell läuft im Browser. Es wird nicht über den Server aufgerufen.';

/* ------------------------------------------------------------ Helfer ---- */

export function ohneGeheimnis(zeile: VerbindungZeile): VerbindungOhneGeheimnis {
  return {
    id: zeile.id,
    label: zeile.label,
    adapter: zeile.adapter,
    baseUrl: zeile.baseUrl,
    model: zeile.model,
    maskedSecret: zeile.maskedSecret,
    capabilities: zeile.capabilities,
    active: zeile.active,
    ...(zeile.lastCheckedAt === undefined ? {} : { lastCheckedAt: zeile.lastCheckedAt }),
  };
}

function text(wert: unknown, hoechstens: number): string {
  return typeof wert === 'string' ? wert.trim().slice(0, hoechstens) : '';
}

/** Die Hosts, die jetzt gerade erlaubt sind. */
async function erlaubteHosts(ports: Ports): Promise<Set<string>> {
  const hosts = voreingestellteHosts();
  for (const host of await ports.db.allowedHosts()) hosts.add(host.trim().toLowerCase());
  return hosts;
}

/* ------------------------------------------------------------ Abläufe --- */

async function liste(userId: string, ports: Ports): Promise<Antwort> {
  const zeilen = await ports.db.listConnections(userId);
  return { status: 200, body: { verbindungen: zeilen.map(ohneGeheimnis) } };
}

async function speichern(
  userId: string,
  eingabe: Record<string, unknown>,
  ports: Ports,
): Promise<Antwort> {
  const adapter = eingabe['adapter'];
  if (!istAdapter(adapter)) {
    return { status: 400, body: { fehler: 'Unbekannter Anbieter.' } };
  }
  const anbieter = ANBIETER[adapter];

  const label = text(eingabe['label'], 80);
  const model = text(eingabe['model'], 80);
  const schluessel = typeof eingabe['secret'] === 'string' ? eingabe['secret'].trim() : '';
  if (label === '') return { status: 400, body: { fehler: 'Ein Name fehlt.' } };

  /*
    Das Browsermodell hat keinen Schlüssel und keine Adresse. Es steht
    trotzdem in der Liste, damit eine Lehrkraft sieht, dass es da ist – aber
    es wird hier nur vermerkt, nicht angebunden.
  */
  if (adapter === 'browsermodell') {
    const id = text(eingabe['id'], 64) || ports.newId();
    await ports.db.saveConnection({
      id,
      ownerId: userId,
      label,
      adapter,
      baseUrl: '',
      model,
      maskedSecret: '',
      secret: { keyVersion: 0, iv: '', ciphertext: '' },
      capabilities: [],
      active: true,
    });
    const gespeichert = await ports.db.readConnection(userId, id);
    return { status: 200, body: { verbindung: gespeichert ? ohneGeheimnis(gespeichert) : null } };
  }

  if (schluessel === '') return { status: 400, body: { fehler: 'Der Schlüssel fehlt.' } };

  // Welche Adresse? Die eigene nur, wenn dieser Anbieter das hergibt.
  const gewuenscht = text(eingabe['baseUrl'], 300);
  const adresse =
    anbieter.eigeneAdresse && gewuenscht !== '' ? gewuenscht : (anbieter.baseUrl ?? '');

  const geprueft = pruefeZiel(adresse, await erlaubteHosts(ports));
  if (!geprueft.ok) {
    /*
      Hier steht der Grund ausdrücklich dabei. Eine Lehrkraft, die eine
      Adresse einträgt, soll erfahren, warum sie nicht taugt – sonst probiert
      sie, bis irgendetwas durchgeht. Beim Aufruf (unten) steht er nicht mehr
      dabei; dort wäre er ein Scanner.
    */
    return { status: 400, body: { fehler: ABLEHNUNGSTEXT[geprueft.grund!] } };
  }

  let bund;
  try {
    bund = leseSchluesselbund(ports.env);
  } catch {
    // Kontrolliert: Es wird nichts gelöscht und nichts überschrieben.
    return { status: 503, body: { fehler: SCHLUESSEL_FEHLT } };
  }

  const id = text(eingabe['id'], 64) || ports.newId();
  const geheimnis = await versiegeln(
    schluessel,
    { ownerId: userId, connectionId: id, adapter },
    bund,
    ports.randomBytes,
  );

  await ports.db.saveConnection({
    id,
    ownerId: userId,
    label,
    adapter,
    baseUrl: geprueft.url!,
    model,
    /*
      Die Maske entsteht aus dem Klartext, **bevor** er versiegelt wird. Sonst
      wäre jede Liste ein Grund, jeden Schlüssel zu entsiegeln.
    */
    maskedSecret: maskiere(schluessel),
    secret: geheimnis,
    capabilities: [],
    active: true,
  });

  const gespeichert = await ports.db.readConnection(userId, id);
  return { status: 200, body: { verbindung: gespeichert ? ohneGeheimnis(gespeichert) : null } };
}

async function loeschen(
  userId: string,
  eingabe: Record<string, unknown>,
  ports: Ports,
): Promise<Antwort> {
  const id = text(eingabe['id'], 64);
  if (id === '') return { status: 400, body: ABGELEHNT };
  await ports.db.deleteConnection(userId, id);
  return { status: 200, body: { ok: true } };
}

/**
 * Eine Verbindung benutzen – der einzige Weg zu einem Anbieter.
 *
 * `pruefen` und `aufrufen` teilen sich diesen Weg, weil sie sich nur darin
 * unterscheiden, was sie senden. Zwei getrennte Wege hießen zwei Stellen, an
 * denen die Adressprüfung stehen muss.
 */
async function anfragen(
  userId: string,
  id: string,
  nutzlast: string,
  ports: Ports,
): Promise<{ status: number; body: Record<string, unknown>; zeile?: VerbindungZeile }> {
  if (!(await ports.db.noteCall(userId))) {
    return { status: 429, body: { fehler: ZU_VIELE } };
  }

  const zeile = await ports.db.readConnection(userId, id);
  if (!zeile) return { status: 404, body: ABGELEHNT };

  if (zeile.adapter === 'browsermodell') {
    return { status: 400, body: { fehler: KEIN_NETZ_ANBIETER } };
  }
  if (nutzlast.length > MAX_ANFRAGE_BYTES) {
    return { status: 413, body: { fehler: 'Die Anfrage ist zu groß.' } };
  }

  /*
    Noch einmal geprüft, obwohl beim Speichern schon geprüft wurde. Zwischen
    beidem kann eine Verwaltung einen Host wieder entfernt haben – und eine
    Freigabe, die nur beim Eintragen gilt, ist keine Freigabe.
  */
  const geprueft = pruefeZiel(zeile.baseUrl, await erlaubteHosts(ports));
  if (!geprueft.ok) return { status: 403, body: ABGELEHNT };

  let bund;
  try {
    bund = leseSchluesselbund(ports.env);
  } catch {
    return { status: 503, body: { fehler: SCHLUESSEL_FEHLT } };
  }

  let schluessel: string;
  try {
    schluessel = await entsiegeln(
      zeile.secret,
      { ownerId: userId, connectionId: zeile.id, adapter: zeile.adapter },
      bund,
    );
  } catch {
    // Kontrolliert: melden, nicht aufräumen. Die Zeile bleibt, wo sie ist.
    return { status: 409, body: { fehler: NICHT_LESBAR } };
  }

  const antwort = await ports.http.senden({
    url: geprueft.url!,
    headers: kopfzeilenFuer(ANBIETER[zeile.adapter], schluessel),
    body: nutzlast,
    hoechstensBytes: MAX_ANTWORT_BYTES,
  });

  /*
    Weiterleitungen werden nicht verfolgt. Eine Umleitung ist der übliche Weg,
    eine geprüfte Adresse in eine ungeprüfte zu verwandeln – und ein offizieller
    Anbieter braucht sie nicht. „Jedes neue Ziel erneut prüfen" wäre die
    aufwendigere Alternative; abzulehnen ist die kürzere und die sicherere.
  */
  if (antwort.weiterleitungNach !== undefined) {
    return { status: 502, body: { fehler: WEITERLEITUNG } };
  }
  if (antwort.abgeschnitten) return { status: 502, body: { fehler: ZU_GROSS } };

  return {
    status: antwort.status >= 200 && antwort.status < 300 ? 200 : 502,
    body:
      antwort.status >= 200 && antwort.status < 300
        ? { antwort: antwort.text }
        : { fehler: 'Der Anbieter hat die Anfrage abgelehnt.' },
    zeile,
  };
}

async function pruefen(
  userId: string,
  eingabe: Record<string, unknown>,
  ports: Ports,
): Promise<Antwort> {
  const id = text(eingabe['id'], 64);
  if (id === '') return { status: 400, body: ABGELEHNT };

  const ergebnis = await anfragen(userId, id, JSON.stringify({ lexiflow: 'verbindungstest' }), ports);
  if (ergebnis.status === 200 && ergebnis.zeile) {
    await ports.db.markChecked(userId, id, ports.now().toISOString());
    return { status: 200, body: { ok: true, meldung: 'Die Verbindung steht.' } };
  }
  return {
    status: ergebnis.status,
    body: { ok: false, meldung: (ergebnis.body['fehler'] as string) ?? 'Das hat nicht geklappt.' },
  };
}

async function aufrufen(
  userId: string,
  eingabe: Record<string, unknown>,
  ports: Ports,
): Promise<Antwort> {
  const id = text(eingabe['id'], 64);
  if (id === '') return { status: 400, body: ABGELEHNT };

  /*
    Die Nutzlast wird durchgereicht, nicht ausgelegt. Diese Funktion weiß
    nicht, was ein Vokabelvorschlag ist – und sie soll es nicht wissen: Was
    sie nicht auslegt, kann sie auch nicht verwechseln.
  */
  const nutzlast = JSON.stringify(eingabe['payload'] ?? {});
  const ergebnis = await anfragen(userId, id, nutzlast, ports);
  return { status: ergebnis.status, body: ergebnis.body };
}

/* ------------------------------------------------------------ Eingang --- */

/**
 * Der eine Eingang.
 *
 * `userId` und `rolle` kommen aus dem geprüften Token des Aufrufers – nie aus
 * dem Rumpf. Ein Feld `userId` in der Anfrage gibt es nicht, also kann auch
 * keines gefüllt werden.
 */
export async function handle(
  eingabe: Record<string, unknown>,
  userId: string | undefined,
  ports: Ports,
): Promise<Antwort> {
  if (!userId) return { status: 401, body: ABGELEHNT };

  const rolle = await ports.db.myRole(userId);
  if (rolle !== 'teacher' && rolle !== 'admin') {
    /*
      Die Zusage aus ADR-1, an dieser Stelle: Eine lernende Person hat keinen
      KI-Zugang. Nicht, weil die Oberfläche den Knopf verbirgt, sondern weil
      die Funktion ablehnt.
    */
    return { status: 403, body: { fehler: NUR_LEHRKRAEFTE } };
  }

  switch (eingabe['aktion']) {
    case 'liste':
      return liste(userId, ports);
    case 'speichern':
      return speichern(userId, eingabe, ports);
    case 'loeschen':
      return loeschen(userId, eingabe, ports);
    case 'pruefen':
      return pruefen(userId, eingabe, ports);
    case 'aufrufen':
      return aufrufen(userId, eingabe, ports);
    default:
      return { status: 400, body: ABGELEHNT };
  }
}
