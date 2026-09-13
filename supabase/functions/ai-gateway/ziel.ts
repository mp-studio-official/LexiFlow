/**
 * Wohin die Serverfunktion überhaupt senden darf.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Weil es die eine Stelle ist, an der aus einer Zeichenkette ein Netzzugriff
 * wird. Ein Server, der auf Zuruf beliebige Adressen abruft, ist ein offener
 * Proxy **im eigenen Netz**: Was der Browser einer Lehrkraft nicht erreicht –
 * `169.254.169.254`, `localhost`, die Datenbank nebenan –, erreicht diese
 * Funktion sehr wohl. Das ist SSRF, und es ist kein erfundenes Risiko: Es ist
 * der übliche Weg, aus einer Anwendung mit „eigenem Endpunkt" die
 * Zugangsdaten der Cloud-Instanz zu holen.
 *
 * Dieselbe Begründung steht seit Sprint 4C in `src/ai/gemini/endpoint.ts` –
 * dort für den Browser, hier für den Server, wo sie schwerer wiegt.
 *
 * ## Der Aufbau: erst erlauben, dann prüfen
 *
 * Zwei Tore, und beide müssen auf sein:
 *
 * 1. **Der Host steht auf einer Liste.** Entweder auf der der offiziellen
 *    Anbieter (fest im Quelltext) oder auf der, die eine Verwaltung gepflegt
 *    hat. Kein Muster, kein Suffix, kein „endet auf": exakter Vergleich.
 *    Ein Suffixvergleich erlaubte `generativelanguage.googleapis.com.boese.example`.
 * 2. **Die Adresse selbst taugt.** HTTPS, kein Benutzername im URL, kein
 *    ungewöhnlicher Port, keine IP-Literale in irgendeiner Schreibweise.
 *
 * ## Die ehrliche Grenze: DNS
 *
 * Ein Name auf der Liste kann auf `127.0.0.1` zeigen. Dagegen hilft nur, den
 * Namen selbst aufzulösen und die **Adresse** zu prüfen – und dann noch die
 * Verbindung an genau diese Adresse zu binden, sonst löst der HTTP-Client ein
 * zweites Mal auf (DNS-Rebinding). Eine Edge-Laufzeit gibt beides nicht her.
 *
 * Das wird hier **nicht weggeredet**: Gegen DNS-Rebinding schützt allein, dass
 * überhaupt nur administrativ freigegebene Namen erreichbar sind. Wer einen
 * Namen freigibt, gibt seine Auflösung mit frei. Genau deshalb ist die
 * Freigabe eine Verwaltungsaufgabe und keine Einstellung im Formular.
 */

/** Warum eine Adresse abgelehnt wurde – für die Meldung und für Prüfungen. */
export type Ablehnung =
  | 'kein-https'
  | 'zugangsdaten-im-url'
  | 'ip-adresse'
  | 'unbekannter-host'
  | 'port'
  | 'kein-name'
  | 'unlesbar';

export interface Zielpruefung {
  ok: boolean;
  grund?: Ablehnung;
  /** Die bereinigte Adresse – nur bei `ok`. */
  url?: string;
}

/**
 * Die Häfen, die ein Anbieter benutzt. Nur diese.
 *
 * Ein freier Port machte aus der Funktion einen Portscanner für das interne
 * Netz: Ob `https://freigegeben.example:6379` antwortet, verrät, ob dort ein
 * Redis steht.
 */
const ERLAUBTE_PORTS = new Set(['', '443']);

/**
 * Namen, die nie ein Anbieter sind – auch dann nicht, wenn jemand sie
 * freigäbe.
 *
 * Die Liste ist der zweite Riegel hinter der Freigabeliste. Sie steht hier,
 * weil eine Verwaltung sich vertippen kann und `localhost` in einem
 * Freigabeformular harmlos aussieht.
 */
const NIEMALS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  // Azure und Alibaba benutzen dieselbe Adresse wie AWS und GCP, aber auch
  // eigene Namen.
  'metadata.azure.com',
  'metadata.tencentyun.com',
]);

/** Endungen, die nur im lokalen Netz vorkommen. */
const NIEMALS_ENDUNG = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];

/**
 * Sieht dieser Hostname wie eine IP-Adresse aus – in **irgendeiner**
 * Schreibweise?
 *
 * Die Frage ist unangenehm genauer, als sie klingt. `127.0.0.1` ist leicht;
 * dieselbe Adresse schreibt sich aber auch `2130706433`, `0x7f.1`, `0177.1`,
 * `[::ffff:127.0.0.1]` und `[::1]`. Ein Prüfer, der nur die erste Form kennt,
 * ist kein Prüfer.
 *
 * Der Ausweg ist die Umkehrung: **Ein Anbieter hat einen Namen.** Alles, was
 * auch nur aussieht wie eine Zahlenadresse, wird abgelehnt – ohne zu
 * entscheiden, ob es eine private wäre. Damit ist die Liste der Sonderformen
 * nicht mehr die Verteidigung, sondern nur noch die Begründung.
 */
export function istIpLiteral(host: string): boolean {
  const nackt = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // IPv6 – erkennbar am Doppelpunkt, und in einem Hostnamen hat er sonst
  // nichts zu suchen. Deckt `::1`, `::ffff:127.0.0.1`, `fe80::…` und `[::]` ab.
  if (nackt.includes(':')) return true;

  /*
    Alles, was nur aus Ziffern, Punkten, `x` und Hexziffern besteht, ist ein
    Kandidat für eine Zahlenadresse: dezimal (`2130706433`), oktal
    (`0177.0.0.1`), hexadezimal (`0x7f000001`) und jede Mischung davon.

    Ein echter Anbietername enthält mindestens einen Buchstaben außerhalb von
    `a`–`f` **oder** eine Endung, die keine Zahl ist – `api.openai.com` hat
    `.com`. Der letzte Teil eines Namens ist nie rein numerisch (RFC 1123),
    also genügt diese Frage.
  */
  const teile = nackt.split('.');
  const letzter = teile[teile.length - 1] ?? '';
  if (/^(0x[0-9a-f]+|[0-9]+)$/i.test(letzter)) return true;

  return false;
}

/** Klein geschrieben, ohne abschließenden Punkt – `EXAMPLE.com.` ist `example.com`. */
export function normalisiereHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Darf diese Adresse angefragt werden?
 *
 * `erlaubteHosts` ist die Vereinigung aus den Anbieter-Voreinstellungen und
 * dem, was eine Verwaltung freigegeben hat. Sie kommt von außen, damit diese
 * Datei nichts über Datenbanken weiß.
 */
export function pruefeZiel(roh: string, erlaubteHosts: ReadonlySet<string>): Zielpruefung {
  let url: URL;
  try {
    url = new URL(roh);
  } catch {
    return { ok: false, grund: 'unlesbar' };
  }

  if (url.protocol !== 'https:') return { ok: false, grund: 'kein-https' };

  /*
    `https://api.openai.com@boese.example/` – der Teil vor dem `@` ist kein
    Host, sondern ein Benutzername. Wer die Adresse überfliegt, liest den
    falschen Namen. `new URL` liest ihn richtig, aber abgelehnt wird trotzdem:
    Ein Anbieter braucht so etwas nie, und eine Adresse, die zum Fehllesen
    einlädt, hat in einem Freigabeformular nichts zu suchen.
  */
  if (url.username !== '' || url.password !== '') {
    return { ok: false, grund: 'zugangsdaten-im-url' };
  }

  if (!ERLAUBTE_PORTS.has(url.port)) return { ok: false, grund: 'port' };

  const host = normalisiereHost(url.hostname);
  if (host === '') return { ok: false, grund: 'kein-name' };
  if (istIpLiteral(host)) return { ok: false, grund: 'ip-adresse' };
  if (NIEMALS.has(host)) return { ok: false, grund: 'unbekannter-host' };
  if (NIEMALS_ENDUNG.some((endung) => host.endsWith(endung))) {
    return { ok: false, grund: 'unbekannter-host' };
  }

  /*
    Nur ASCII. Ein Name in Unicode kann wie ein anderer aussehen
    (`аpi.openai.com` mit kyrillischem а), und der Vergleich mit der
    Freigabeliste liefe daneben. `new URL` wandelt in Punycode um – und
    `xn--…` steht nicht auf der Liste, also fällt es hier ohnehin durch. Die
    Prüfung steht trotzdem da, damit der Grund im Fehler steht.
  */
  if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, grund: 'kein-name' };

  // Exakter Vergleich. Kein Suffix: `…googleapis.com.boese.example` endet auf
  // nichts, was hier steht.
  if (!erlaubteHosts.has(host)) return { ok: false, grund: 'unbekannter-host' };

  return { ok: true, url: url.toString() };
}

export const ABLEHNUNGSTEXT: Readonly<Record<Ablehnung, string>> = {
  'kein-https': 'Nur HTTPS-Adressen sind zulässig.',
  'zugangsdaten-im-url': 'Die Adresse enthält Zugangsdaten. Das ist nicht zulässig.',
  'ip-adresse': 'Eine IP-Adresse ist kein Anbieter. Bitte den Namen angeben.',
  'unbekannter-host': 'Dieser Host ist nicht freigegeben.',
  port: 'Nur der Standardport (443) ist zulässig.',
  'kein-name': 'Die Adresse enthält keinen brauchbaren Hostnamen.',
  unlesbar: 'Diese Adresse ist keine gültige URL.',
};
