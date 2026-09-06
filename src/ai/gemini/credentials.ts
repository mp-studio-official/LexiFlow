/**
 * Der API-Schlüssel – und die Vorkehrungen, ihn nicht zu verlieren.
 *
 * ## Die Ausgangslage, ehrlich benannt
 *
 * LexiFlow hat kein Backend. Der Schlüssel liegt damit **im Browser der
 * Lehrkraft**, und das ist prinzipiell schwächer als ein Server, der ihn nie
 * herausgibt. Diese Datei kann das nicht heilen; sie kann nur dafür sorgen,
 * dass er nicht zusätzlich dorthin gerät, wo er nichts zu suchen hat.
 *
 * Die Oberfläche sagt das offen (siehe `KEY_STORAGE_NOTICE`). Ein Hinweis, der
 * die Lage beschönigte, wäre schlimmer als keiner: Wer glaubt, der Schlüssel
 * sei sicher verwahrt, geht mit ihm anders um.
 *
 * ## Wo er liegt
 *
 * **Standard: nur im Arbeitsspeicher.** Ein Neuladen vergisst ihn. Das ist die
 * Voreinstellung, weil es die sichere ist, und nicht die bequeme.
 *
 * **Auf Wunsch: `localStorage`**, ausschließlich in der Lehrkraftanwendung.
 * Das Kästchen ist ungesetzt, bis jemand es setzt.
 *
 * ## Wogegen diese Datei schützt
 *
 * Nicht gegen einen Angreifer mit Zugriff auf das Gerät – gegen den hilft hier
 * nichts. Sondern gegen die alltäglichen Wege, auf denen Geheimnisse
 * versehentlich abfließen:
 *
 * - `toJSON` und `toString` geben eine **Maske** zurück. Ein Schlüssel, der in
 *   einem `JSON.stringify` eines React-Zustands, in einem Fehlerbericht oder in
 *   einer Konsolenausgabe landet, steht dort als `AIza…4f2c`.
 * - Der Wert ist eine private Klasseneigenschaft (`#`), nicht ein Feld: Ein
 *   `{...credentials}` kopiert ihn nicht mit.
 * - Ausgelesen wird er nur über `reveal()`, und diese Stelle ist im Quelltext
 *   zählbar – heute genau zwei Aufrufer.
 */

const STORAGE_KEY = 'lexiflow.gemini.key';

/** Was in der Oberfläche über die Speicherung steht. Ungeschönt. */
export const KEY_STORAGE_NOTICE =
  'LexiFlow ist eine reine Browseranwendung ohne Server. Ein hier gemerkter ' +
  'Schlüssel liegt im Speicher dieses Browsers und kann dort nicht so gut ' +
  'geschützt werden wie hinter einem Backend. Wer das Gerät mit anderen teilt, ' +
  'sollte ihn nicht merken lassen.';

/**
 * Ein maskierter Schlüssel: Anfang, Ende, dazwischen nichts.
 *
 * Vier Zeichen vorn und vier hinten reichen, um zwei Schlüssel auseinanderzuhalten
 * („ist das der aus dem Schulprojekt oder meiner?“) und reichen nicht, um einen
 * zu rekonstruieren. Kurze Zeichenketten werden vollständig verdeckt – bei einem
 * Wert mit zehn Zeichen wären acht davon zu viel.
 */
export function maskKey(value: string): string {
  const key = value.trim();
  if (key.length === 0) return '';
  if (key.length < 16) return '•'.repeat(8);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/**
 * Sieht das überhaupt nach einem Schlüssel aus?
 *
 * Absichtlich großzügig: Diese Prüfung soll den Tippfehler abfangen („dein
 * Schlüssel hier“, ein leeres Feld, ein eingefügter ganzer Satz), nicht das
 * Format erraten. Ob der Schlüssel gilt, weiß nur Google – dafür gibt es
 * „Verbindung testen“.
 */
export function looksLikeApiKey(value: string): boolean {
  const key = value.trim();
  return key.length >= 16 && key.length <= 200 && !/\s/.test(key);
}

/**
 * Der Schlüssel als Gegenstand, der sich nicht versehentlich ausplaudert.
 *
 * Eine Klasse und keine Zeichenkette – genau deshalb: Eine Zeichenkette landet
 * in jedem `console.log`, in jedem `JSON.stringify`, in jeder Fehlermeldung mit
 * Template-Literal. Dieser Gegenstand tut das nicht.
 */
export class ApiKey {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value.trim();
  }

  /** Der Klartext. Bewusst ein Methodenaufruf – man soll ihn suchen können. */
  reveal(): string {
    return this.#value;
  }

  get masked(): string {
    return maskKey(this.#value);
  }

  get isEmpty(): boolean {
    return this.#value.length === 0;
  }

  /** Für `JSON.stringify` – etwa in einem versehentlich geloggten Zustand. */
  toJSON(): string {
    return this.masked;
  }

  /** Für Template-Literale und `String(...)`. */
  toString(): string {
    return this.masked;
  }

  /** Für `console.log` in Node und in den Entwicklerwerkzeugen. */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `ApiKey(${this.masked})`;
  }
}

export type KeyStorage = 'session' | 'device';

export interface StoredKey {
  key: ApiKey;
  storage: KeyStorage;
}

/**
 * Der Schlüsselspeicher dieser Sitzung.
 *
 * Modulzustand und nicht React-State: Ein Schlüssel in einem Zustandsbaum wird
 * mit diesem Baum serialisiert – von den Entwicklerwerkzeugen, von einem
 * Fehlerberichtswerkzeug, von einem Test-Snapshot. Hier liegt er außerhalb.
 */
let sessionKey: ApiKey | undefined;

function readStorage(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    /* Privates Fenster oder gesperrter Speicher – dann gibt es eben keinen. */
    return undefined;
  }
}

/** Den Schlüssel holen, den diese Sitzung benutzen soll. */
export function loadKey(): StoredKey | undefined {
  if (sessionKey && !sessionKey.isEmpty) return { key: sessionKey, storage: 'session' };
  const stored = readStorage();
  if (!stored) return undefined;
  const key = new ApiKey(stored);
  return key.isEmpty ? undefined : { key, storage: 'device' };
}

/**
 * Einen Schlüssel setzen.
 *
 * `remember: false` löscht einen zuvor gemerkten Schlüssel **mit**. Sonst
 * entstünde der schlechteste aller Zustände: Das Kästchen ist aus, und im
 * Speicher liegt trotzdem noch einer.
 */
export function saveKey(value: string, remember: boolean): StoredKey | undefined {
  const key = new ApiKey(value);
  if (key.isEmpty) {
    forgetKey();
    return undefined;
  }

  sessionKey = key;
  try {
    if (remember) window.localStorage.setItem(STORAGE_KEY, key.reveal());
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /*
      Kein Speicher: Der Schlüssel gilt trotzdem für diese Sitzung. Die
      Oberfläche fragt mit `isRemembered()` nach, was wirklich passiert ist –
      ein Kästchen, das gesetzt aussieht, ohne dass etwas gemerkt wurde, wäre
      eine Lüge.
    */
  }
  return { key, storage: remember ? 'device' : 'session' };
}

/** „Zugangsdaten vergessen“ – aus beiden Speichern, ohne Rückfrage ans Netz. */
export function forgetKey(): void {
  sessionKey = undefined;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nichts zu entfernen. */
  }
}

/** Liegt wirklich einer im Gerätespeicher? Für die Anzeige des Kästchens. */
export function isRemembered(): boolean {
  return readStorage() !== undefined;
}

/** Nur für Tests: den Sitzungsspeicher zurücksetzen. */
export function resetSessionKeyForTests(): void {
  sessionKey = undefined;
}
