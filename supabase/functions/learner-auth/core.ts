/**
 * Der Kern von `learner-auth` – ohne Deno, ohne Netz, ohne Datenbank.
 *
 * ## Warum diese Datei getrennt ist
 *
 * Die erste Fassung war ein einziger Deno-Handler: HTTP, Zufall, Zeit,
 * Datenbank und die eigentlichen Abläufe in einer Datei. Sie war damit
 * **gar nicht prüfbar** – und das an der Stelle, an der Kennwörter,
 * Wiederherstellungscodes und Einladungen zusammenkommen. „Geschrieben und nie
 * gelaufen" ist für einen Entwurf vertretbar; für die Anmeldung einer Schule
 * ist es das nicht.
 *
 * Alles, was eine Entscheidung trifft, steht jetzt hier und bekommt seine
 * Seiteneffekte als Parameter (`Ports`). Damit lässt sich jeder Fall
 * durchspielen: falscher Code, abgelaufene Einladung, voller Kurs, zu viele
 * Versuche, ein halb angelegtes Konto. Was offen bleibt, ist der Deno-Mantel
 * in `index.ts` – dreißig Zeilen, die Anfragen entgegennehmen und `handle`
 * aufrufen – und das echte Deployment.
 *
 * ## Eine Ablehnung sieht immer gleich aus
 *
 * Unbekannte Lern-ID, falsches Kennwort, falscher Code, abgelaufene
 * Einladung, voller Kurs: derselbe Status, derselbe Rumpf. Jeder Unterschied
 * wäre ein Auskunftsdienst – wer Lern-IDs durchprobiert, erführe, welche es
 * gibt, und in einer Schule ist das eine Namensliste.
 *
 * Die einzige Ausnahme ist die Bremse: Sie antwortet mit 429, weil „zu viele
 * Versuche" nichts über die Existenz von irgendetwas sagt und die Oberfläche
 * sonst zum Weiterprobieren einlüde.
 */

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface LearnerRow {
  userId: string;
  recoveryCodeHash: string;
}

export interface Ports {
  now(): Date;
  /** Zufall aus einer kryptografischen Quelle – nie aus `Math.random`. */
  randomBytes(anzahl: number): Uint8Array;
  sha256Hex(text: string): Promise<string>;

  auth: {
    signIn(email: string, password: string): Promise<Tokens | undefined>;
    /** Gibt die Kennung des neuen Kontos zurück – oder `undefined`. */
    createUser(email: string, password: string): Promise<string | undefined>;
    deleteUser(userId: string): Promise<void>;
    setPassword(userId: string, password: string): Promise<boolean>;
  };

  db: {
    findLearner(learnerId: string): Promise<LearnerRow | undefined>;
    learnerIdExists(learnerId: string): Promise<boolean>;
    /** Belegt einen Platz – atomar. Gibt die Kurskennung zurück oder nichts. */
    consumeInvite(codeHash: string): Promise<string | undefined>;
    /** Gibt einen eben belegten Platz wieder frei. */
    releaseInvite(codeHash: string): Promise<void>;
    createLearnerAccount(input: {
      userId: string;
      learnerId: string;
      displayName: string;
      shortCode: string;
      recoveryHash: string;
      courseId: string;
    }): Promise<void>;
    rotateRecoveryCode(userId: string, neuerHash: string): Promise<void>;
    /** `true`, wenn der Versuch noch im Rahmen liegt. */
    noteAttempt(schluessel: string, hoechstzahl: number, fensterSekunden: number): Promise<boolean>;
  };
}

export interface Anfrage {
  aktion?: unknown;
  learnerId?: unknown;
  password?: unknown;
  newPassword?: unknown;
  recoveryCode?: unknown;
  inviteCode?: unknown;
  displayName?: unknown;
}

export interface Antwort {
  status: number;
  body: Record<string, unknown>;
}

/** Die Endung der technischen Adressen – reserviert, also nie erreichbar. */
export const TECHNISCHE_DOMAIN = 'lernende.lexiflow.invalid';

export const ABGELEHNT: Antwort = { status: 400, body: { fehler: 'abgelehnt' } };
export const ZU_VIELE: Antwort = { status: 429, body: { fehler: 'zu_viele_versuche' } };

/** Mindestlänge wie in der Oberfläche – hier ist sie verbindlich. */
export const KENNWORT_MINDESTLAENGE = 8;

/*
  Die Bremsen. Getrennt je Aktion, weil sie verschiedene Dinge schützen:

  - Anmelden: gegen das Durchprobieren von Kennwörtern.
  - Wiederherstellen: enger, weil ein Wiederherstellungscode kürzer ist als
    ein Kennwort und ein Treffer mehr wert.
  - Registrieren: gegen das Durchprobieren von Einladungscodes – und gegen das
    Anlegen beliebig vieler Konten mit einem gültigen.
*/
export const BREMSEN = {
  anmelden: { hoechstzahl: 10, fensterSekunden: 300 },
  wiederherstellen: { hoechstzahl: 5, fensterSekunden: 900 },
  registrieren: { hoechstzahl: 10, fensterSekunden: 3600 },
} as const;

const LERN_ID = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Die technische Adresse hinter einer Lern-ID – nur hier, nie im Browser. */
export function technischeAdresse(learnerId: string): string | undefined {
  const sauber = learnerId.trim().toLowerCase();
  return LERN_ID.test(sauber) ? `${sauber}@${TECHNISCHE_DOMAIN}` : undefined;
}

/**
 * Vergleich ohne Zeitverrat.
 *
 * Ein `===` auf zwei Zeichenketten bricht bei der ersten Abweichung ab. Über
 * viele Versuche lässt sich daraus die Länge des gemeinsamen Anfangs ablesen
 * und ein Hash Zeichen für Zeichen erraten. Die Bremse oben macht das
 * unpraktisch; dieser Vergleich macht es sinnlos.
 */
export function gleichOhneZeitverrat(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i += 1) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/** Ein Code aus dem vorgelesenen Alphabet – mit Zurückweisung gegen Schieflage. */
export function codeAusBytes(bytes: Uint8Array, laenge: number): string {
  let code = '';
  for (const byte of bytes) {
    if (code.length >= laenge) break;
    // 256 ist kein Vielfaches von 31; ohne diese Zeile wären die ersten acht
    // Zeichen des Alphabets messbar häufiger.
    if (byte >= 248) continue;
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/** Ein Wiederherstellungscode: vier Gruppen zu vier Zeichen, zum Abschreiben. */
export function wiederherstellungscode(ports: Ports): string {
  const roh = codeAusBytes(ports.randomBytes(48), 16);
  return roh.match(/.{1,4}/g)!.join('-');
}

/** Aus einem Anzeigenamen wird ein lesbarer Anfang der Lern-ID. */
export function namensteil(displayName: string): string {
  const umlaute: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
  const klein = displayName
    .toLowerCase()
    .replace(/[äöüß]/g, (zeichen) => umlaute[zeichen] ?? zeichen)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  // „fuchs" ist eine bessere Lern-ID als „a7f3"; wer gar nichts Brauchbares
  // eingibt, bekommt trotzdem eine.
  return klein.length >= 3 ? klein : 'lexi';
}

export function kurzkennungAus(bytes: Uint8Array): string {
  return `LX-${codeAusBytes(bytes, 4)}`;
}

function text(wert: unknown): string {
  return typeof wert === 'string' ? wert : '';
}

/**
 * Der ganze Ablauf.
 *
 * `herkunft` ist eine grobe Kennzeichnung des Absenders – in der Regel die
 * IP-Adresse, gehasht. Sie geht nur in den Schlüssel der Bremse ein und wird
 * nirgends gespeichert.
 */
export async function handle(
  anfrage: Anfrage,
  herkunft: string,
  ports: Ports,
): Promise<Antwort> {
  const aktion = text(anfrage.aktion);

  if (aktion === 'anmelden') return anmelden(anfrage, herkunft, ports);
  if (aktion === 'wiederherstellen') return wiederherstellen(anfrage, herkunft, ports);
  if (aktion === 'registrieren') return registrieren(anfrage, herkunft, ports);
  return ABGELEHNT;
}

async function anmelden(anfrage: Anfrage, herkunft: string, ports: Ports): Promise<Antwort> {
  const learnerId = text(anfrage.learnerId).trim().toLowerCase();
  const password = text(anfrage.password);
  const adresse = technischeAdresse(learnerId);

  /*
    Die Bremse greift **vor** jeder Prüfung und zählt auch unsinnige Eingaben.
    Sonst wäre sie mit einer ungültigen Lern-ID zu umgehen: erst tausend
    Versuche, die gar nicht gezählt werden, dann der echte.
  */
  const erlaubt = await ports.db.noteAttempt(
    `anmelden:${herkunft}:${learnerId}`,
    BREMSEN.anmelden.hoechstzahl,
    BREMSEN.anmelden.fensterSekunden,
  );
  if (!erlaubt) return ZU_VIELE;

  if (!adresse || password.length < 1) return ABGELEHNT;

  const tokens = await ports.auth.signIn(adresse, password);
  return tokens ? { status: 200, body: { ...tokens } } : ABGELEHNT;
}

async function wiederherstellen(
  anfrage: Anfrage,
  herkunft: string,
  ports: Ports,
): Promise<Antwort> {
  const learnerId = text(anfrage.learnerId).trim().toLowerCase();
  const code = text(anfrage.recoveryCode).trim().toUpperCase();
  const neuesKennwort = text(anfrage.newPassword);

  const erlaubt = await ports.db.noteAttempt(
    `wiederherstellen:${herkunft}:${learnerId}`,
    BREMSEN.wiederherstellen.hoechstzahl,
    BREMSEN.wiederherstellen.fensterSekunden,
  );
  if (!erlaubt) return ZU_VIELE;

  const adresse = technischeAdresse(learnerId);
  if (!adresse || code.length < 4 || neuesKennwort.length < KENNWORT_MINDESTLAENGE) {
    return ABGELEHNT;
  }

  const konto = await ports.db.findLearner(learnerId);
  const hash = await ports.sha256Hex(code);
  /*
    Auch wenn es das Konto nicht gibt, wird gehasht und verglichen – gegen
    einen Wert, der nie passt. Ein früher Ausstieg wäre am Zeitverhalten
    erkennbar und damit wieder ein Auskunftsdienst.
  */
  const passt = gleichOhneZeitverrat(konto?.recoveryCodeHash ?? 'x'.repeat(64), hash);
  if (!konto || !passt) return ABGELEHNT;

  const gesetzt = await ports.auth.setPassword(konto.userId, neuesKennwort);
  if (!gesetzt) return ABGELEHNT;

  /*
    Der gebrauchte Code wird sofort wertlos, und im selben Schritt entsteht
    ein neuer. So ist er einmalig, ohne dass jemand ohne Code dasteht – die
    Sorge, aus der ADR-11 ursprünglich das Gegenteil gemacht hatte.
  */
  const neuerCode = wiederherstellungscode(ports);
  await ports.db.rotateRecoveryCode(konto.userId, await ports.sha256Hex(neuerCode));

  const tokens = await ports.auth.signIn(adresse, neuesKennwort);
  if (!tokens) return ABGELEHNT;
  return { status: 200, body: { ...tokens, recoveryCode: neuerCode } };
}

async function registrieren(anfrage: Anfrage, herkunft: string, ports: Ports): Promise<Antwort> {
  const inviteCode = text(anfrage.inviteCode).trim().toUpperCase();
  const displayName = text(anfrage.displayName).trim();
  const password = text(anfrage.password);

  const erlaubt = await ports.db.noteAttempt(
    `registrieren:${herkunft}`,
    BREMSEN.registrieren.hoechstzahl,
    BREMSEN.registrieren.fensterSekunden,
  );
  if (!erlaubt) return ZU_VIELE;

  if (
    inviteCode.length < 4 ||
    displayName.length < 1 ||
    displayName.length > 60 ||
    password.length < KENNWORT_MINDESTLAENGE
  ) {
    return ABGELEHNT;
  }

  // Erst den Platz belegen, dann das Konto bauen: Andersherum entstünden
  // Konten ohne Kurs, wenn die Einladung inzwischen voll ist.
  const codeHash = await ports.sha256Hex(inviteCode);
  const courseId = await ports.db.consumeInvite(codeHash);
  if (!courseId) return ABGELEHNT;

  const learnerId = await freieLernId(displayName, ports);
  const adresse = technischeAdresse(learnerId);
  if (!learnerId || !adresse) {
    await ports.db.releaseInvite(codeHash);
    return ABGELEHNT;
  }

  const userId = await ports.auth.createUser(adresse, password);
  if (!userId) {
    await ports.db.releaseInvite(codeHash);
    return ABGELEHNT;
  }

  const recoveryCode = wiederherstellungscode(ports);
  try {
    await ports.db.createLearnerAccount({
      userId,
      learnerId,
      displayName,
      shortCode: kurzkennungAus(ports.randomBytes(16)),
      recoveryHash: await ports.sha256Hex(recoveryCode),
      courseId,
    });
  } catch {
    /*
      Ein halb angelegtes Konto ist schlimmer als gar keines: Die Lern-ID wäre
      belegt, die Anmeldung ginge, und die Person landete in keinem Kurs. Also
      zurückbauen – Konto löschen, Platz freigeben.
    */
    await ports.auth.deleteUser(userId);
    await ports.db.releaseInvite(codeHash);
    return ABGELEHNT;
  }

  const tokens = await ports.auth.signIn(adresse, password);
  if (!tokens) return ABGELEHNT;

  return { status: 200, body: { ...tokens, learnerId, recoveryCode } };
}

/** Eine freie Lern-ID finden – lesbar, und nach ein paar Versuchen aufgeben. */
async function freieLernId(displayName: string, ports: Ports): Promise<string> {
  const basis = namensteil(displayName);
  for (let versuch = 0; versuch < 8; versuch += 1) {
    const kandidat = `${basis}-${codeAusBytes(ports.randomBytes(12), 4).toLowerCase()}`;
    if (!LERN_ID.test(kandidat)) continue;
    if (!(await ports.db.learnerIdExists(kandidat))) return kandidat;
  }
  return '';
}
