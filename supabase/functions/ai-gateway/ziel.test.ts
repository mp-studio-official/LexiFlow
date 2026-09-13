// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { istIpLiteral, normalisiereHost, pruefeZiel } from './ziel';

/**
 * Die Adressprüfung – die Stelle, an der aus einer Zeichenkette ein
 * Netzzugriff wird.
 *
 * Diese Datei ist absichtlich lang. Jede Zeile darin ist eine Schreibweise
 * von `127.0.0.1` oder `169.254.169.254`, die schon einmal an einem Prüfer
 * vorbeigekommen ist, der nur die erste kannte.
 */

const ERLAUBT = new Set(['generativelanguage.googleapis.com', 'api.openai.com', 'ki.schule.example']);

function grund(adresse: string) {
  return pruefeZiel(adresse, ERLAUBT).grund;
}

describe('was durchkommt', () => {
  it('ein freigegebener Host über HTTPS', () => {
    const ergebnis = pruefeZiel('https://api.openai.com/v1/chat/completions', ERLAUBT);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('derselbe Host mit ausgeschriebenem Standardport', () => {
    expect(pruefeZiel('https://api.openai.com:443/v1/', ERLAUBT).ok).toBe(true);
  });

  it('und mit Großschreibung oder abschließendem Punkt', () => {
    expect(pruefeZiel('https://API.OpenAI.com/v1/', ERLAUBT).ok).toBe(true);
    expect(pruefeZiel('https://api.openai.com./v1/', ERLAUBT).ok).toBe(true);
  });
});

describe('HTTPS ist Pflicht', () => {
  it.each(['http://api.openai.com/', 'ftp://api.openai.com/', 'file:///etc/passwd'])(
    '%s wird abgelehnt',
    (adresse) => {
      expect(grund(adresse)).toBe('kein-https');
    },
  );

  it('auch `gopher:` und `dict:` – die klassischen SSRF-Träger', () => {
    expect(grund('gopher://api.openai.com:6379/_INFO')).toBe('kein-https');
    expect(grund('dict://api.openai.com:11211/stats')).toBe('kein-https');
  });
});

describe('kein Host, der nur so aussieht', () => {
  it('Zugangsdaten vor dem @ täuschen das Auge', () => {
    /*
      `https://api.openai.com@boese.example/` liest sich wie OpenAI und geht
      zu `boese.example`. Das ist der Trick, der in Freigabeformularen
      funktioniert.
    */
    expect(grund('https://api.openai.com@boese.example/')).toBe('zugangsdaten-im-url');
    expect(grund('https://api.openai.com:geheim@boese.example/')).toBe('zugangsdaten-im-url');
  });

  it('ein Suffix ist kein Host', () => {
    expect(grund('https://api.openai.com.boese.example/')).toBe('unbekannter-host');
    expect(grund('https://boese-api.openai.com.example/')).toBe('unbekannter-host');
  });

  it('ein Teilstring erst recht nicht', () => {
    expect(grund('https://notapi.openai.com/')).toBe('unbekannter-host');
    expect(grund('https://api.openai.com.evil/')).toBe('unbekannter-host');
  });

  it('und ein nicht freigegebener Host bleibt draußen', () => {
    expect(grund('https://api.example.com/')).toBe('unbekannter-host');
  });
});

describe('IP-Adressen – in jeder Schreibweise', () => {
  it.each([
    ['klassisch', '127.0.0.1'],
    ['die andere Loopback', '127.1'],
    ['null', '0.0.0.0'],
    ['dezimal', '2130706433'],
    ['hexadezimal', '0x7f000001'],
    ['oktal', '0177.0.0.1'],
    ['gemischt', '0x7f.1'],
    ['privat 10er', '10.0.0.5'],
    ['privat 172er', '172.16.0.1'],
    ['privat 192er', '192.168.1.1'],
    ['Carrier-Grade NAT', '100.64.0.1'],
    ['link-local', '169.254.169.254'],
    ['Cloud-Metadaten als Zahl', '2852039166'],
  ])('%s: %s wird abgelehnt', (_beschreibung, host) => {
    expect(grund(`https://${host}/`), host).toBe('ip-adresse');
    expect(istIpLiteral(host), host).toBe(true);
  });

  it.each([
    ['Loopback', '[::1]'],
    ['unspezifiziert', '[::]'],
    ['IPv4 in IPv6', '[::ffff:127.0.0.1]'],
    ['IPv4 in IPv6, hexadezimal', '[::ffff:7f00:1]'],
    ['link-local', '[fe80::1]'],
    ['eindeutig lokal', '[fd00::1]'],
    ['Metadaten über IPv6', '[fd00:ec2::254]'],
  ])('IPv6 %s: %s wird abgelehnt', (_beschreibung, host) => {
    expect(grund(`https://${host}/`), host).toBe('ip-adresse');
  });

  it('auch dann, wenn jemand die Adresse freigeben würde', () => {
    // Der zweite Riegel: Die Freigabeliste wird gar nicht erst gefragt.
    expect(pruefeZiel('https://169.254.169.254/', new Set(['169.254.169.254'])).grund).toBe(
      'ip-adresse',
    );
  });
});

describe('Namen, die nie ein Anbieter sind', () => {
  it.each([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata',
    'instance-data',
  ])('%s wird abgelehnt', (host) => {
    expect(pruefeZiel(`https://${host}/`, new Set([host])).grund).toBe('unbekannter-host');
  });

  it.each(['db.internal', 'redis.local', 'router.lan', 'drucker.home.arpa', 'api.localhost'])(
    'auch die Endung von %s',
    (host) => {
      expect(pruefeZiel(`https://${host}/`, new Set([host])).grund).toBe('unbekannter-host');
    },
  );
});

describe('Ports', () => {
  it.each(['6379', '11211', '8080', '22', '5432', '80'])(
    'Port %s wird abgelehnt',
    (port) => {
      expect(grund(`https://api.openai.com:${port}/`)).toBe('port');
    },
  );

  it('sonst wäre die Funktion ein Portscanner für das interne Netz', () => {
    // Der Satz ist der Grund, nicht die Prüfung – die Prüfung steht darüber.
    expect(grund('https://ki.schule.example:6379/')).toBe('port');
  });
});

describe('Kleinkram, der trotzdem zählt', () => {
  it('eine unlesbare Adresse ist kein Absturz', () => {
    expect(grund('kein-url')).toBe('unlesbar');
    expect(grund('')).toBe('unlesbar');
  });

  it('normalisiert Großschreibung und den abschließenden Punkt', () => {
    expect(normalisiereHost('  API.Example.COM. ')).toBe('api.example.com');
  });

  it('ein Name in Unicode kommt als Punycode an und steht damit nicht auf der Liste', () => {
    /*
      `аpi.openai.com` mit kyrillischem `а` sieht aus wie das Original.
      `new URL` macht daraus `xn--pi-…`, und das steht auf keiner Liste.
    */
    const ergebnis = pruefeZiel('https://аpi.openai.com/', ERLAUBT);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.grund).toBe('unbekannter-host');
  });

  it('eine leere Freigabeliste lässt nichts durch', () => {
    expect(pruefeZiel('https://api.openai.com/', new Set()).grund).toBe('unbekannter-host');
  });
});
