/**
 * Der Tresor: wie ein Anbieterschlüssel abgelegt wird.
 *
 * ## Was hier nicht passiert
 *
 * Eigene Kryptografie. Kein selbstgebautes Verfahren, keine Ableitung „mit
 * SHA-256 über den Nutzernamen", kein XOR. Verwendet wird **AES-GCM aus
 * WebCrypto**, also das, was Deno und jeder Browser mitbringen und was nicht
 * von dieser Datei abhängt.
 *
 * ## Was hier passiert – und warum jeder Teil davon
 *
 * ### Ein neuer Zufall je Verschlüsselung
 *
 * AES-GCM bricht zusammen, wenn derselbe Initialisierungsvektor zweimal mit
 * demselben Schlüssel benutzt wird – nicht „wird schwächer", sondern gibt den
 * Klartext beider Nachrichten preis. Der IV ist deshalb 96 Bit aus einer
 * kryptografischen Quelle, je Verschlüsselung neu, und er wird nirgends
 * abgeleitet.
 *
 * Ein IV aus lauter Nullen wird abgelehnt. Nicht, weil er rechnerisch
 * unmöglich wäre, sondern weil er in der Praxis genau eines bedeutet: Die
 * Zufallsquelle ist kaputt.
 *
 * ### Zusätzliche Daten, die mitversiegelt werden (AAD)
 *
 * Verschlüsselt allein heißt nur „niemand kann es lesen". Es heißt nicht
 * „niemand kann es **verschieben**". Ohne Bindung ließe sich der Chiffretext
 * einer Lehrkraft in die Zeile einer anderen kopieren; der Server
 * entschlüsselte ihn anstandslos und riefe mit einem fremden Schlüssel an.
 *
 * Mitversiegelt werden deshalb: Schlüsselfassung, Eigentümerin, Verbindung und
 * Anbieter. Passt eine davon nicht, schlägt das Entschlüsseln fehl – nicht
 * „liefert Müll", sondern schlägt fehl. Das ist die Eigenschaft von GCM, wegen
 * der es hier steht.
 *
 * ### Fassungen und ihr Wechsel
 *
 * Der Hauptschlüssel hat eine Nummer, und sie steht bei jedem Geheimnis dabei.
 * Ein Wechsel heißt: eine neue Fassung dazulegen, die neue als „aktuell"
 * benennen, die alte **behalten**. Neues wird mit der neuen versiegelt, Altes
 * bleibt lesbar und wandert beim nächsten Speichern mit. Erst wenn nichts mehr
 * auf die alte Fassung zeigt, kann sie weg.
 *
 * Eine Rotation, die die alte Fassung sofort entfernt, ist keine Rotation,
 * sondern ein Datenverlust mit Ankündigung.
 *
 * ### Was nie hinausgeht
 *
 * Der entschlüsselte Schlüssel verlässt diese Serverfunktion nicht. Er steht
 * in keiner Antwort, in keiner Meldung und in keinem Protokoll. Nach außen
 * geht ausschließlich die Maske (`sk-…abcd`), und die entsteht aus dem
 * Klartext **vor** dem Versiegeln – damit sie nie ein Grund ist, später zu
 * entschlüsseln.
 */

export const SCHLUESSEL_FEHLT =
  'Der Hauptschlüssel ist nicht eingerichtet. Ohne ihn können Anbieterschlüssel weder gespeichert noch benutzt werden.';
export const NICHT_LESBAR =
  'Dieser Anbieterschlüssel lässt sich nicht entsiegeln. Bitte neu eintragen.';

/** 96 Bit – die für AES-GCM vorgesehene Länge. */
export const IV_LAENGE = 12;

/** Der Hauptschlüssel: 256 Bit. */
export const SCHLUESSEL_LAENGE = 32;

export interface Schluesselbund {
  /** Die Fassung, mit der **neu** versiegelt wird. */
  aktuell: number;
  /** Alle Fassungen, mit denen entsiegelt werden kann – auch alte. */
  fassungen: ReadonlyMap<number, Uint8Array>;
}

export interface Bindung {
  ownerId: string;
  connectionId: string;
  adapter: string;
}

export interface Geheimnis {
  keyVersion: number;
  /** Base64. */
  iv: string;
  /** Base64. */
  ciphertext: string;
}

/* ------------------------------------------------------------- Base64 --- */

export function alsBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function ausBase64(text: string): Uint8Array {
  const roh = atob(text);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------- Schlüsselbund --- */

/**
 * Den Schlüsselbund aus den Function Secrets lesen.
 *
 * `LEXIFLOW_AI_MASTER_KEY_V1`, `…_V2`, … – je 32 Byte in Base64. Welche
 * Fassung die aktuelle ist, sagt `LEXIFLOW_AI_KEY_VERSION`; fehlt die Angabe,
 * ist es die höchste vorhandene.
 *
 * **Nur aus der Umgebung.** Kein Vorgabewert, kein Rückfall, keine Ableitung
 * aus einem anderen Wert. Ein eingebauter Standardschlüssel wäre ein
 * Schlüssel, den jeder kennt, der den Quelltext liest.
 */
export function leseSchluesselbund(env: Record<string, string | undefined>): Schluesselbund {
  const fassungen = new Map<number, Uint8Array>();

  for (const [name, wert] of Object.entries(env)) {
    const treffer = /^LEXIFLOW_AI_MASTER_KEY_V(\d+)$/.exec(name);
    if (!treffer || !wert) continue;
    const nummer = Number(treffer[1]);

    let bytes: Uint8Array;
    try {
      bytes = ausBase64(wert.trim());
    } catch {
      // Ein unlesbarer Schlüssel ist kein Schlüssel. Er wird übergangen, und
      // fehlt danach jeder, meldet sich der Aufruf unten.
      continue;
    }
    if (bytes.length !== SCHLUESSEL_LAENGE) continue;
    fassungen.set(nummer, bytes);
  }

  if (fassungen.size === 0) throw new Error(SCHLUESSEL_FEHLT);

  const angesagt = Number(env['LEXIFLOW_AI_KEY_VERSION'] ?? '');
  const aktuell =
    Number.isInteger(angesagt) && fassungen.has(angesagt)
      ? angesagt
      : Math.max(...fassungen.keys());

  return { aktuell, fassungen };
}

/* ------------------------------------------------------------ Bindung --- */

/**
 * Die zusätzlichen Daten, die mitversiegelt werden.
 *
 * Eine Zeichenkette mit Trennzeichen, die in keinem Feld vorkommen kann –
 * `\u0000`. Mit einem Punkt oder Doppelpunkt ließen sich zwei Felder
 * gegeneinander verschieben („`a|bc` + `d`" gegen „`a` + `bc|d`").
 */
export const TRENNER = '\u0000';

export function bindungsdaten(bindung: Bindung, keyVersion: number): Uint8Array {
  const felder = [
    'lexiflow-ai-v1',
    String(keyVersion),
    bindung.ownerId,
    bindung.connectionId,
    bindung.adapter,
  ];
  /*
    Die Zusage steht und fällt damit, dass das Trennzeichen in keinem Feld
    vorkommt. Bei Kennungen und Anbieternamen kann es das nicht – aber
    „kann es nicht" ist eine Annahme, und Annahmen gehören geprüft, nicht
    geglaubt. Hier kostet die Prüfung einen Vergleich.
  */
  if (felder.some((feld) => feld.includes(TRENNER))) {
    throw new Error('Ein Feld der Bindung enthält ein unzulässiges Zeichen.');
  }
  return new TextEncoder().encode(felder.join(TRENNER));
}

/* ----------------------------------------------------- Ver- und Entsiegeln */

async function importiere(bytes: Uint8Array, zweck: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, [zweck]);
}

/**
 * Einen Anbieterschlüssel versiegeln.
 *
 * `zufall` kommt von außen, damit eine Prüfung einen kaputten Generator
 * nachstellen kann – im Betrieb ist es `crypto.getRandomValues`.
 */
export async function versiegeln(
  klartext: string,
  bindung: Bindung,
  bund: Schluesselbund,
  zufall: (anzahl: number) => Uint8Array,
): Promise<Geheimnis> {
  const schluessel = bund.fassungen.get(bund.aktuell);
  if (!schluessel) throw new Error(SCHLUESSEL_FEHLT);

  const iv = zufall(IV_LAENGE);
  if (iv.length !== IV_LAENGE) throw new Error('Der Zufallswert hat die falsche Länge.');
  if (iv.every((byte) => byte === 0)) {
    /*
      Rechnerisch möglich, praktisch immer ein Defekt. Und der Preis eines
      wiederverwendeten IV bei AES-GCM ist nicht „etwas schwächer", sondern
      der Klartext.
    */
    throw new Error('Die Zufallsquelle liefert keinen brauchbaren Wert.');
  }

  const versiegelt = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      additionalData: bindungsdaten(bindung, bund.aktuell) as BufferSource,
    },
    await importiere(schluessel, 'encrypt'),
    new TextEncoder().encode(klartext) as BufferSource,
  );

  return {
    keyVersion: bund.aktuell,
    iv: alsBase64(iv),
    ciphertext: alsBase64(new Uint8Array(versiegelt)),
  };
}

/**
 * Einen Anbieterschlüssel entsiegeln.
 *
 * Schlägt fehl, wenn der Schlüssel falsch ist, die Fassung fehlt, die Bindung
 * nicht passt oder am Chiffretext etwas geändert wurde. **Und schlägt nur
 * fehl** – es wird nichts gelöscht und nichts zurückgesetzt. Ein
 * Hauptschlüssel, der versehentlich fehlt, ist ein behebbarer Betriebsfehler;
 * eine Funktion, die daraufhin Zeilen entfernte, machte ihn unbehebbar.
 */
export async function entsiegeln(
  geheimnis: Geheimnis,
  bindung: Bindung,
  bund: Schluesselbund,
): Promise<string> {
  const schluessel = bund.fassungen.get(geheimnis.keyVersion);
  if (!schluessel) throw new Error(NICHT_LESBAR);

  try {
    const klar = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ausBase64(geheimnis.iv) as BufferSource,
        additionalData: bindungsdaten(bindung, geheimnis.keyVersion) as BufferSource,
      },
      await importiere(schluessel, 'decrypt'),
      ausBase64(geheimnis.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(klar);
  } catch {
    /*
      Eine Meldung für alle Fälle. Der Unterschied zwischen „falsche Fassung"
      und „verändert" interessiert niemanden, der das Formular ausfüllt – und
      er wäre eine Auskunft für jemanden, der es nicht ausfüllt.
    */
    throw new Error(NICHT_LESBAR);
  }
}

/**
 * Die Maske, die nach außen geht.
 *
 * Gebildet **vor** dem Versiegeln und in der Zeile mitgespeichert. Sonst wäre
 * jede Liste von Verbindungen ein Grund, jeden Schlüssel zu entsiegeln – und
 * ein entsiegelter Schlüssel, den niemand braucht, ist ein Schlüssel zu viel
 * im Arbeitsspeicher.
 */
export function maskiere(klartext: string): string {
  const sauber = klartext.trim();
  if (sauber.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, sauber.length - 4))}${sauber.slice(-4)}`;
}
