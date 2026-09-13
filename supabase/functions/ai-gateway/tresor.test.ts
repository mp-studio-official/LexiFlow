// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  IV_LAENGE,
  NICHT_LESBAR,
  SCHLUESSEL_FEHLT,
  alsBase64,
  ausBase64,
  bindungsdaten,
  entsiegeln,
  leseSchluesselbund,
  maskiere,
  TRENNER,
  versiegeln,
  type Bindung,
  type Schluesselbund,
} from './tresor';

/**
 * Der Tresor.
 *
 * Geprüft wird nicht AES-GCM – das prüft niemand hier nach. Geprüft wird, was
 * **um** AES-GCM herum falsch gemacht werden kann: ein wiederverwendeter IV,
 * eine fehlende Bindung, eine verlorene Schlüsselfassung, ein Fehler, der
 * Daten löscht statt zu melden.
 */

const KEY_V1 = alsBase64(new Uint8Array(32).fill(7));
const KEY_V2 = alsBase64(new Uint8Array(32).fill(9));

const BINDUNG: Bindung = {
  ownerId: '00000000-0000-4000-8000-000000000001',
  connectionId: '00000000-0000-4000-8000-0000000000a1',
  adapter: 'gemini',
};

function echterZufall(anzahl: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(anzahl));
}

function bund(env: Record<string, string | undefined>): Schluesselbund {
  return leseSchluesselbund(env);
}

const EINFACH = { LEXIFLOW_AI_MASTER_KEY_V1: KEY_V1 };

describe('der Schlüsselbund kommt aus der Umgebung – und sonst nirgendher', () => {
  it('liest die Fassungen, die dort stehen', () => {
    const gelesen = bund({ ...EINFACH, LEXIFLOW_AI_MASTER_KEY_V2: KEY_V2 });
    expect([...gelesen.fassungen.keys()].sort()).toEqual([1, 2]);
    expect(gelesen.aktuell).toBe(2);
  });

  it('folgt der ausdrücklich benannten aktuellen Fassung', () => {
    const gelesen = bund({
      ...EINFACH,
      LEXIFLOW_AI_MASTER_KEY_V2: KEY_V2,
      LEXIFLOW_AI_KEY_VERSION: '1',
    });
    expect(gelesen.aktuell).toBe(1);
  });

  it('meldet sich, wenn gar keiner da ist – statt einen zu erfinden', () => {
    /*
      Der Punkt, an dem ein Vorgabewert bequem wäre. Er wäre ein Schlüssel,
      den jeder kennt, der den Quelltext liest.
    */
    expect(() => bund({})).toThrow(SCHLUESSEL_FEHLT);
  });

  it('übergeht einen unbrauchbaren Schlüssel, statt ihn zu benutzen', () => {
    expect(() => bund({ LEXIFLOW_AI_MASTER_KEY_V1: 'kein-base64-!!' })).toThrow(SCHLUESSEL_FEHLT);
    // Zu kurz ist auch unbrauchbar.
    expect(() => bund({ LEXIFLOW_AI_MASTER_KEY_V1: alsBase64(new Uint8Array(16)) })).toThrow(
      SCHLUESSEL_FEHLT,
    );
  });

  it('nimmt nur, was wie ein Hauptschlüssel heißt', () => {
    expect(() => bund({ LEXIFLOW_AI_MASTER_KEY: KEY_V1, IRGENDWAS: KEY_V1 })).toThrow(
      SCHLUESSEL_FEHLT,
    );
  });
});

describe('versiegeln und entsiegeln', () => {
  it('bringt denselben Text zurück', async () => {
    const geheimnis = await versiegeln('sk-testschluessel-1234', BINDUNG, bund(EINFACH), echterZufall);
    expect(await entsiegeln(geheimnis, BINDUNG, bund(EINFACH))).toBe('sk-testschluessel-1234');
  });

  it('legt den Klartext nirgends ab', async () => {
    const geheimnis = await versiegeln('sk-testschluessel-1234', BINDUNG, bund(EINFACH), echterZufall);
    const alles = JSON.stringify(geheimnis);
    expect(alles).not.toContain('sk-testschluessel');
    expect(alles).not.toContain('1234');
  });

  it('nennt die Fassung, mit der versiegelt wurde', async () => {
    const zwei = bund({ ...EINFACH, LEXIFLOW_AI_MASTER_KEY_V2: KEY_V2 });
    const geheimnis = await versiegeln('sk-abc', BINDUNG, zwei, echterZufall);
    expect(geheimnis.keyVersion).toBe(2);
  });
});

describe('der Initialisierungsvektor', () => {
  it('ist 96 Bit lang', async () => {
    const geheimnis = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    expect(ausBase64(geheimnis.iv)).toHaveLength(IV_LAENGE);
  });

  it('ist bei jedem Versiegeln ein anderer', async () => {
    /*
      Die Eigenschaft, an der AES-GCM hängt. Zweimal derselbe IV mit demselben
      Schlüssel heißt nicht „etwas schwächer", sondern: beide Klartexte sind
      lesbar.
    */
    const gesehen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const geheimnis = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
      gesehen.add(geheimnis.iv);
    }
    expect(gesehen.size).toBe(200);
  });

  it('macht aus demselben Text jedes Mal einen anderen Chiffretext', async () => {
    const a = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    const b = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('wird abgelehnt, wenn die Zufallsquelle nur Nullen liefert', async () => {
    // Rechnerisch möglich, praktisch immer ein Defekt – und einer, dessen
    // Folge der Klartext ist.
    await expect(
      versiegeln('sk-abc', BINDUNG, bund(EINFACH), (anzahl) => new Uint8Array(anzahl)),
    ).rejects.toThrow(/Zufallsquelle/);
  });

  it('wird abgelehnt, wenn er die falsche Länge hat', async () => {
    await expect(
      versiegeln('sk-abc', BINDUNG, bund(EINFACH), () => new Uint8Array(8).fill(3)),
    ).rejects.toThrow(/Länge/);
  });
});

describe('die Bindung – verschlüsselt heißt nicht verschiebbar', () => {
  async function versiegeltFuer(bindung: Bindung) {
    return versiegeln('sk-geheim', bindung, bund(EINFACH), echterZufall);
  }

  it('lässt sich nicht in die Zeile einer anderen Person kopieren', async () => {
    const geheimnis = await versiegeltFuer(BINDUNG);
    const fremd = { ...BINDUNG, ownerId: '00000000-0000-4000-8000-000000000002' };

    await expect(entsiegeln(geheimnis, fremd, bund(EINFACH))).rejects.toThrow(NICHT_LESBAR);
  });

  it('lässt sich nicht auf eine andere Verbindung umhängen', async () => {
    const geheimnis = await versiegeltFuer(BINDUNG);
    const andere = { ...BINDUNG, connectionId: '00000000-0000-4000-8000-0000000000b2' };

    await expect(entsiegeln(geheimnis, andere, bund(EINFACH))).rejects.toThrow(NICHT_LESBAR);
  });

  it('lässt sich nicht einem anderen Anbieter unterschieben', async () => {
    /*
      Der eigentlich gefährliche Fall: Ein Gemini-Schlüssel, umgehängt auf
      einen Anbieter mit frei wählbarer Adresse – und schon geht er dorthin.
    */
    const geheimnis = await versiegeltFuer(BINDUNG);
    const anderer = { ...BINDUNG, adapter: 'openai-kompatibel' };

    await expect(entsiegeln(geheimnis, anderer, bund(EINFACH))).rejects.toThrow(NICHT_LESBAR);
  });

  it('lässt sich nicht durch ein verschobenes Trennzeichen austricksen', () => {
    /*
      Mit einem gewöhnlichen Trennzeichen wären `{owner: 'a|b', conn: 'c'}`
      und `{owner: 'a', conn: 'b|c'}` dieselbe Zeichenkette – und zwei
      verschiedene Bindungen ergäben dasselbe Siegel.

      Das Trennzeichen ist deshalb eines, das in einer Kennung nicht vorkommt.
      Und weil „kommt nicht vor" eine Annahme ist, wird sie geprüft statt
      geglaubt.
    */
    expect(() =>
      bindungsdaten({ ownerId: `a${TRENNER}b`, connectionId: 'c', adapter: 'x' }, 1),
    ).toThrow(/unzulässiges Zeichen/);
  });

  it('macht aus zwei verschiedenen Bindungen zwei verschiedene Siegel', () => {
    const eins = bindungsdaten({ ownerId: 'ab', connectionId: 'c', adapter: 'x' }, 1);
    const zwei = bindungsdaten({ ownerId: 'a', connectionId: 'bc', adapter: 'x' }, 1);
    expect(alsBase64(eins)).not.toBe(alsBase64(zwei));
  });

  it('bindet auch die Schlüsselfassung', async () => {
    const geheimnis = await versiegeltFuer(BINDUNG);
    // Dieselbe Bindung, aber die Fassungsnummer im Geheimnis verstellt.
    await expect(
      entsiegeln({ ...geheimnis, keyVersion: 2 }, BINDUNG, {
        aktuell: 2,
        fassungen: new Map([[2, ausBase64(KEY_V1)]]),
      }),
    ).rejects.toThrow(NICHT_LESBAR);
  });
});

describe('was schiefgehen kann – und was dann passiert', () => {
  it('ein falscher Hauptschlüssel meldet sich, statt Müll zu liefern', async () => {
    const geheimnis = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    const falsch = bund({ LEXIFLOW_AI_MASTER_KEY_V1: KEY_V2 });

    await expect(entsiegeln(geheimnis, BINDUNG, falsch)).rejects.toThrow(NICHT_LESBAR);
  });

  it('eine fehlende Fassung meldet sich ebenso', async () => {
    const zwei = bund({ ...EINFACH, LEXIFLOW_AI_MASTER_KEY_V2: KEY_V2 });
    const geheimnis = await versiegeln('sk-abc', BINDUNG, zwei, echterZufall);

    await expect(entsiegeln(geheimnis, BINDUNG, bund(EINFACH))).rejects.toThrow(NICHT_LESBAR);
  });

  it('ein veränderter Chiffretext wird bemerkt', async () => {
    const geheimnis = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    const bytes = ausBase64(geheimnis.ciphertext);
    bytes[0] = (bytes[0]! ^ 0xff) & 0xff;

    await expect(
      entsiegeln({ ...geheimnis, ciphertext: alsBase64(bytes) }, BINDUNG, bund(EINFACH)),
    ).rejects.toThrow(NICHT_LESBAR);
  });

  it('jeder dieser Fehler sieht gleich aus', async () => {
    /*
      Der Unterschied zwischen „falsche Fassung" und „verändert" hilft
      niemandem, der das Formular ausfüllt – und wäre eine Auskunft für
      jemanden, der es nicht ausfüllt.
    */
    const geheimnis = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    const meldungen: string[] = [];
    // Erst beim Abarbeiten starten: Drei gleichzeitig gestartete Versprechen
    // sind drei Ablehnungen, von denen zwei unbeachtet blieben.
    const versuche = [
      () => entsiegeln(geheimnis, { ...BINDUNG, ownerId: 'fremd' }, bund(EINFACH)),
      () => entsiegeln({ ...geheimnis, keyVersion: 99 }, BINDUNG, bund(EINFACH)),
      () =>
        entsiegeln(
          { ...geheimnis, ciphertext: alsBase64(new Uint8Array(32)) },
          BINDUNG,
          bund(EINFACH),
        ),
    ];
    for (const versuch of versuche) {
      await versuch().catch((fehler: Error) => meldungen.push(fehler.message));
    }
    expect(new Set(meldungen).size).toBe(1);
  });

  it('ein Fehlschlag beim Entsiegeln verändert nichts', async () => {
    /*
      Die Zusage, die kein Test beweisen kann, indem er etwas tut – nur,
      indem er zeigt, dass diese Datei nichts anderes kann als rechnen: Sie
      bekommt keine Datenbank, kein Netz und keinen Löschbefehl gereicht.
      Was sie nicht hat, kann sie nicht aufräumen.
    */
    const geheimnis = await versiegeln('sk-abc', BINDUNG, bund(EINFACH), echterZufall);
    const vorher = JSON.stringify(geheimnis);

    await entsiegeln(geheimnis, { ...BINDUNG, ownerId: 'fremd' }, bund(EINFACH)).catch(() => undefined);

    expect(JSON.stringify(geheimnis)).toBe(vorher);
  });
});

describe('der Wechsel einer Schlüsselfassung', () => {
  it('lässt Altes lesbar und versiegelt Neues mit der neuen Fassung', async () => {
    const alt = bund(EINFACH);
    const altes = await versiegeln('sk-alt', BINDUNG, alt, echterZufall);

    // Die neue Fassung kommt dazu, die alte bleibt.
    const nachher = bund({ ...EINFACH, LEXIFLOW_AI_MASTER_KEY_V2: KEY_V2 });

    expect(await entsiegeln(altes, BINDUNG, nachher)).toBe('sk-alt');
    const neues = await versiegeln('sk-neu', BINDUNG, nachher, echterZufall);
    expect(neues.keyVersion).toBe(2);
  });

  it('und eine Rotation, die die alte Fassung wegwirft, ist ein Datenverlust', async () => {
    const altes = await versiegeln('sk-alt', BINDUNG, bund(EINFACH), echterZufall);
    const ohneAlt = bund({ LEXIFLOW_AI_MASTER_KEY_V2: KEY_V2 });

    await expect(entsiegeln(altes, BINDUNG, ohneAlt)).rejects.toThrow(NICHT_LESBAR);
  });
});

describe('die Maske', () => {
  it('zeigt vier Zeichen und verbirgt den Rest', () => {
    expect(maskiere('sk-proj-abcdefgh1234')).toBe('••••••••1234');
  });

  it('verrät bei einem kurzen Wert gar nichts', () => {
    expect(maskiere('abc')).toBe('••••');
  });

  it('enthält nie den ganzen Schlüssel', () => {
    const schluessel = 'sk-proj-geheimgeheim';
    expect(maskiere(schluessel)).not.toContain('geheimgeheim');
  });
});
