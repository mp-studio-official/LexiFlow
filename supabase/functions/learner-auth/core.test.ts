// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  ABGELEHNT,
  BREMSEN,
  KENNWORT_MINDESTLAENGE,
  TECHNISCHE_DOMAIN,
  ZU_VIELE,
  codeAusBytes,
  gleichOhneZeitverrat,
  handle,
  kurzkennungAus,
  namensteil,
  technischeAdresse,
  wiederherstellungscode,
  type Ports,
} from './core';

/**
 * Der Kern der Serverfunktion – vollständig mit Fakes geprüft.
 *
 * Was hier **nicht** geprüft wird, und zwar gar nicht: der Deno-Mantel in
 * `index.ts`, echtes Supabase Auth, die Edge-Laufzeit, das Deployment. Diese
 * Datei zeigt, dass die Entscheidungen stimmen, nicht dass der Dienst läuft.
 */

/* ------------------------------------------------------------- Werkzeug -- */

const TOKENS = { access_token: 'test-zugang', refresh_token: 'test-erneuerung' };

interface FakeStand {
  lernende: Map<string, { userId: string; recoveryCodeHash: string; password: string }>;
  konten: Map<string, { email: string; password: string; userId: string }>;
  einladungen: Map<string, { courseId: string; freiePlaetze: number }>;
  angelegteKonten: unknown[];
  versuche: Map<string, number>;
  freigegeben: string[];
}

/**
 * Zufall, der sich vorhersagen lässt – aber nicht der geprüfte Zufall.
 *
 * Die Bytes kommen aus einem Zähler. Das ist genau richtig für einen Test
 * (dieselbe Eingabe, dasselbe Ergebnis) und wäre im Ernstfall ein Fehler –
 * deshalb steckt die Quelle in einem Port und nicht im Ablauf.
 */
function zaehlzufall(start = 0) {
  let n = start;
  return (anzahl: number) => Uint8Array.from({ length: anzahl }, () => (n = (n + 7) % 256));
}

async function fakeSha256(text: string): Promise<string> {
  // Kein Hash, sondern eine eindeutige, gleich lange Abbildung – für die
  // Abläufe hier zählt nur, dass gleiche Eingaben gleiche Werte ergeben.
  let wert = 0n;
  for (const zeichen of text) wert = (wert * 131n + BigInt(zeichen.codePointAt(0)!)) % (2n ** 200n);
  return wert.toString(16).padStart(64, '0').slice(0, 64);
}

function fakePorts(over: { stand?: Partial<FakeStand>; ports?: Partial<Ports> } = {}) {
  const stand: FakeStand = {
    lernende: new Map(),
    konten: new Map(),
    einladungen: new Map(),
    angelegteKonten: [],
    versuche: new Map(),
    freigegeben: [],
    ...over.stand,
  };

  const ports: Ports = {
    now: () => new Date('2026-09-13T10:00:00.000Z'),
    randomBytes: zaehlzufall(),
    sha256Hex: fakeSha256,
    auth: {
      async signIn(email, password) {
        const konto = stand.konten.get(email);
        return konto && konto.password === password ? TOKENS : undefined;
      },
      async createUser(email, password) {
        if (stand.konten.has(email)) return undefined;
        const userId = `u-${stand.konten.size + 1}`;
        stand.konten.set(email, { email, password, userId });
        return userId;
      },
      async deleteUser(userId) {
        for (const [email, konto] of stand.konten) {
          if (konto.userId === userId) stand.konten.delete(email);
        }
      },
      async setPassword(userId, password) {
        let getroffen = false;
        for (const konto of stand.konten.values()) {
          if (konto.userId === userId) {
            konto.password = password;
            getroffen = true;
          }
        }
        for (const eintrag of stand.lernende.values()) {
          if (eintrag.userId === userId) eintrag.password = password;
        }
        return getroffen;
      },
    },
    db: {
      async findLearner(learnerId) {
        const eintrag = stand.lernende.get(learnerId);
        return eintrag ? { userId: eintrag.userId, recoveryCodeHash: eintrag.recoveryCodeHash } : undefined;
      },
      async learnerIdExists(learnerId) {
        return stand.lernende.has(learnerId);
      },
      async consumeInvite(codeHash) {
        const einladung = stand.einladungen.get(codeHash);
        if (!einladung || einladung.freiePlaetze <= 0) return undefined;
        einladung.freiePlaetze -= 1;
        return einladung.courseId;
      },
      async releaseInvite(codeHash) {
        stand.freigegeben.push(codeHash);
        const einladung = stand.einladungen.get(codeHash);
        if (einladung) einladung.freiePlaetze += 1;
      },
      async createLearnerAccount(input) {
        stand.angelegteKonten.push(input);
        stand.lernende.set(input.learnerId, {
          userId: input.userId,
          recoveryCodeHash: input.recoveryHash,
          password: '',
        });
      },
      async rotateRecoveryCode(userId, neuerHash) {
        for (const eintrag of stand.lernende.values()) {
          if (eintrag.userId === userId) eintrag.recoveryCodeHash = neuerHash;
        }
      },
      async noteAttempt(schluessel, hoechstzahl) {
        const bisher = (stand.versuche.get(schluessel) ?? 0) + 1;
        stand.versuche.set(schluessel, bisher);
        return bisher <= hoechstzahl;
      },
      ...over.ports?.db,
    },
    ...over.ports,
  };

  return { ports, stand };
}

/** Ein angemeldetes Lernkonto einrichten, ohne den Ablauf zu benutzen. */
async function legeLernendeAn(
  stand: FakeStand,
  learnerId = 'fuchs-7390',
  password = 'testkennwort',
  recoveryCode = 'ABCD-EFGH-JKMN-PQRS',
) {
  stand.lernende.set(learnerId, {
    userId: 'u-fuchs',
    recoveryCodeHash: await fakeSha256(recoveryCode),
    password,
  });
  stand.konten.set(`${learnerId}@${TECHNISCHE_DOMAIN}`, {
    email: `${learnerId}@${TECHNISCHE_DOMAIN}`,
    password,
    userId: 'u-fuchs',
  });
  return { learnerId, password, recoveryCode };
}

/* ------------------------------------------------------- Bausteine ------- */

describe('die technische Adresse', () => {
  it('entsteht aus der Lern-ID und liegt unter einer reservierten Endung', () => {
    expect(technischeAdresse('Fuchs-7390')).toBe(`fuchs-7390@${TECHNISCHE_DOMAIN}`);
    // `.invalid` ist per RFC 2606 reserviert: Eine Nachricht dorthin kann es
    // nicht geben – auch nicht versehentlich.
    expect(TECHNISCHE_DOMAIN.endsWith('.invalid')).toBe(true);
  });

  it('lehnt alles ab, was keine saubere Lern-ID ist', () => {
    for (const eingabe of [
      '',
      'ab',
      'mit leerzeichen',
      'jemand@woanders.example',
      'über-lang'.repeat(10),
      '-beginnt-mit-strich',
      'semikolon;drin',
    ]) {
      expect(technischeAdresse(eingabe), eingabe).toBeUndefined();
    }
  });
});

describe('der Vergleich ohne Zeitverrat', () => {
  it('stimmt mit dem gewöhnlichen Vergleich überein', () => {
    expect(gleichOhneZeitverrat('abc', 'abc')).toBe(true);
    expect(gleichOhneZeitverrat('abc', 'abd')).toBe(false);
    expect(gleichOhneZeitverrat('abc', 'abcd')).toBe(false);
    expect(gleichOhneZeitverrat('', '')).toBe(true);
  });

  it('steigt bei gleicher Länge nicht früher aus', () => {
    /*
      Prüfbar ist das nicht an der Uhr – eine Zeitmessung im Test wäre
      unzuverlässig und würde auf jedem zweiten Rechner flackern. Prüfbar ist
      die Form: Die Schleife läuft über die ganze Länge, also ist das Ergebnis
      für „erstes Zeichen falsch" und „letztes Zeichen falsch" dasselbe.
    */
    expect(gleichOhneZeitverrat('aaaaaaaa', 'baaaaaaa')).toBe(false);
    expect(gleichOhneZeitverrat('aaaaaaaa', 'aaaaaaab')).toBe(false);
  });
});

describe('Codes', () => {
  it('benutzen nur Zeichen, die sich vorlesen lassen', () => {
    const code = codeAusBytes(Uint8Array.from({ length: 64 }, (_, i) => i * 3), 32);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    // Kein O gegen 0, kein I oder L gegen 1.
    expect(code).not.toMatch(/[OIL01]/);
  });

  it('werfen Bytes weg, die die Gleichverteilung stören würden', () => {
    // 248 und aufwärts wären in einem 31er-Alphabet die ersten acht Zeichen
    // ein zweites Mal – und damit messbar häufiger.
    expect(codeAusBytes(Uint8Array.from([248, 250, 255]), 3)).toBe('');
    expect(codeAusBytes(Uint8Array.from([248, 0, 255, 1]), 2)).toBe('AB');
  });

  it('der Wiederherstellungscode ist in Vierergruppen geschrieben', () => {
    const { ports } = fakePorts();
    const code = wiederherstellungscode(ports);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('die Kurzkennung sieht aus wie in der Datenbank vorgeschrieben', () => {
    expect(kurzkennungAus(Uint8Array.from([1, 2, 3, 4]))).toMatch(/^LX-[0-9A-Z]{4}$/);
  });
});

describe('der Namensteil einer Lern-ID', () => {
  it('macht aus einem Anzeigenamen etwas Lesbares', () => {
    expect(namensteil('Fuchs')).toBe('fuchs');
    // Bei 20 Zeichen ist Schluss: Eine Lern-ID wird vorgelesen und
    // abgeschrieben, und der Zufallsteil dahinter braucht auch noch Platz.
    expect(namensteil('Müller-Lüdenscheidt')).toBe('mueller-luedenscheid');
    expect(namensteil('  Anna   Maria  ')).toBe('anna-maria');
  });

  it('fällt auf etwas Brauchbares zurück, wenn nichts übrig bleibt', () => {
    // Eine Lern-ID muss vorlesbar sein; „🦊" ist es nicht.
    expect(namensteil('🦊')).toBe('lexi');
    expect(namensteil('!!')).toBe('lexi');
  });
});

/* ------------------------------------------------------------ Anmelden --- */

describe('Anmelden', () => {
  it('gibt bei richtigen Angaben Tokens zurück', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);

    const antwort = await handle(
      { aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'testkennwort' },
      'herkunft',
      ports,
    );
    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject(TOKENS);
  });

  it('lehnt unbekannte Lern-ID und falsches Kennwort gleich ab', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);

    const unbekannt = await handle(
      { aktion: 'anmelden', learnerId: 'gibtsnicht', password: 'testkennwort' },
      'h',
      ports,
    );
    const falsch = await handle(
      { aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'falsch' },
      'h',
      ports,
    );

    expect(unbekannt).toEqual(ABGELEHNT);
    expect(falsch).toEqual(ABGELEHNT);
  });

  it('zählt auch unsinnige Eingaben gegen die Bremse', async () => {
    /*
      Sonst wäre die Bremse mit einer ungültigen Lern-ID zu umgehen: erst
      tausend Versuche, die nicht gezählt werden, dann der echte.
    */
    const { ports, stand } = fakePorts();
    await handle({ aktion: 'anmelden', learnerId: '!!', password: '' }, 'h', ports);
    expect([...stand.versuche.values()][0]).toBe(1);
  });

  it('bremst nach zu vielen Versuchen – und sagt das anders', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);

    let letzte = ABGELEHNT;
    for (let i = 0; i < BREMSEN.anmelden.hoechstzahl + 1; i += 1) {
      letzte = await handle(
        { aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'falsch' },
        'h',
        ports,
      );
    }
    expect(letzte).toEqual(ZU_VIELE);
    expect(letzte.status).not.toBe(ABGELEHNT.status);
  });

  it('bremst je Herkunft getrennt', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);

    for (let i = 0; i < BREMSEN.anmelden.hoechstzahl + 1; i += 1) {
      await handle({ aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'x' }, 'eine', ports);
    }
    const andere = await handle(
      { aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'testkennwort' },
      'andere',
      ports,
    );
    expect(andere.status).toBe(200);
  });

  it('nimmt bei der Anmeldung nie einen Einladungscode entgegen', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);
    const antwort = await handle(
      { aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'testkennwort', inviteCode: 'XXXX' },
      'h',
      ports,
    );
    // Der überzählige Wert wird schlicht nicht gelesen.
    expect(antwort.status).toBe(200);
    expect(stand.freigegeben).toEqual([]);
  });
});

/* ------------------------------------------------------ Registrieren ----- */

describe('Registrieren', () => {
  function mitEinladung(freiePlaetze = 5) {
    const { ports, stand } = fakePorts();
    return fakeSha256('ABCD1234').then((hash) => {
      stand.einladungen.set(hash, { courseId: 'kurs-1', freiePlaetze });
      return { ports, stand, code: 'ABCD1234' };
    });
  }

  it('legt Konto, Lern-ID und Mitgliedschaft an und meldet gleich an', async () => {
    const { ports, stand, code } = await mitEinladung();

    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject(TOKENS);
    expect(String(antwort.body.learnerId)).toMatch(/^fuchs-[a-z0-9]{4}$/);
    expect(String(antwort.body.recoveryCode)).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(stand.angelegteKonten).toHaveLength(1);
    expect(stand.angelegteKonten[0]).toMatchObject({ courseId: 'kurs-1', displayName: 'Fuchs' });
  });

  it('gibt den Wiederherstellungscode genau einmal heraus – und speichert nur den Hash', async () => {
    const { ports, stand, code } = await mitEinladung();
    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );

    const klartext = String(antwort.body.recoveryCode);
    const gespeichert = stand.angelegteKonten[0] as { recoveryHash: string };
    expect(gespeichert.recoveryHash).not.toContain(klartext);
    expect(gespeichert.recoveryHash).toBe(await fakeSha256(klartext));
  });

  it('belegt genau einen Platz', async () => {
    const { ports, stand, code } = await mitEinladung(5);
    await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );
    expect([...stand.einladungen.values()][0]!.freiePlaetze).toBe(4);
  });

  it('lehnt ab, wenn kein Platz mehr frei ist', async () => {
    const { ports, code } = await mitEinladung(0);
    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );
    expect(antwort).toEqual(ABGELEHNT);
  });

  it('lehnt einen unbekannten Code genauso ab wie einen aufgebrauchten', async () => {
    const { ports, code } = await mitEinladung(0);
    const voll = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'F', password: 'testkennwort' },
      'h',
      ports,
    );
    const erfunden = await handle(
      { aktion: 'registrieren', inviteCode: 'ZZZZZZZZ', displayName: 'F', password: 'testkennwort' },
      'h',
      ports,
    );
    expect(voll).toEqual(erfunden);
  });

  it('lehnt ein zu kurzes Kennwort ab, ohne einen Platz zu verbrauchen', async () => {
    const { ports, stand, code } = await mitEinladung(1);
    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'kurz' },
      'h',
      ports,
    );
    expect(antwort).toEqual(ABGELEHNT);
    expect([...stand.einladungen.values()][0]!.freiePlaetze).toBe(1);
  });

  it('gibt den Platz zurück, wenn das Konto nicht angelegt werden kann', async () => {
    /*
      Ein halb angelegtes Konto ist schlimmer als gar keines: Die Lern-ID wäre
      belegt, die Anmeldung ginge, und die Person landete in keinem Kurs.
    */
    const { ports, stand, code } = await mitEinladung(1);
    ports.db.createLearnerAccount = async () => {
      throw new Error('Datenbank weg');
    };
    const deleteUser = vi.fn(async () => undefined);
    ports.auth.deleteUser = deleteUser;

    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );

    expect(antwort).toEqual(ABGELEHNT);
    expect(deleteUser).toHaveBeenCalled();
    expect([...stand.einladungen.values()][0]!.freiePlaetze).toBe(1);
    expect(stand.freigegeben).toHaveLength(1);
  });

  it('gibt den Platz auch zurück, wenn keine freie Lern-ID zu finden ist', async () => {
    const { ports, stand, code } = await mitEinladung(1);
    ports.db.learnerIdExists = async () => true;

    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );
    expect(antwort).toEqual(ABGELEHNT);
    expect([...stand.einladungen.values()][0]!.freiePlaetze).toBe(1);
  });

  it('weicht bei belegter Lern-ID auf eine andere aus', async () => {
    const { ports, stand, code } = await mitEinladung();
    let ersterVersuch = true;
    const echt = ports.db.learnerIdExists;
    ports.db.learnerIdExists = async (id) => {
      if (ersterVersuch) {
        ersterVersuch = false;
        return true;
      }
      return echt(id);
    };

    const antwort = await handle(
      { aktion: 'registrieren', inviteCode: code, displayName: 'Fuchs', password: 'testkennwort' },
      'h',
      ports,
    );
    expect(antwort.status).toBe(200);
    expect(stand.angelegteKonten).toHaveLength(1);
  });

  it('bremst das Durchprobieren von Einladungscodes', async () => {
    const { ports } = fakePorts();
    let letzte = ABGELEHNT;
    for (let i = 0; i < BREMSEN.registrieren.hoechstzahl + 1; i += 1) {
      letzte = await handle(
        { aktion: 'registrieren', inviteCode: `CODE${i}`, displayName: 'F', password: 'testkennwort' },
        'h',
        ports,
      );
    }
    expect(letzte).toEqual(ZU_VIELE);
  });
});

/* ---------------------------------------------------- Wiederherstellen --- */

describe('Wiederherstellen', () => {
  it('setzt mit dem richtigen Code ein neues Kennwort und meldet an', async () => {
    const { ports, stand } = fakePorts();
    const { recoveryCode } = await legeLernendeAn(stand);

    const antwort = await handle(
      {
        aktion: 'wiederherstellen',
        learnerId: 'fuchs-7390',
        recoveryCode,
        newPassword: 'neues-testkennwort',
      },
      'h',
      ports,
    );

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject(TOKENS);
  });

  it('macht den gebrauchten Code sofort wertlos', async () => {
    /*
      Einmalnutzung – und zugleich die Antwort auf die Sorge aus ADR-11: Der
      neue Code entsteht im selben Schritt, also steht niemand ohne da.
    */
    const { ports, stand } = fakePorts();
    const { recoveryCode } = await legeLernendeAn(stand);

    const erste = await handle(
      { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode, newPassword: 'neues-testkennwort' },
      'h',
      ports,
    );
    const zweite = await handle(
      { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode, newPassword: 'noch-eins-neu' },
      'h',
      ports,
    );

    expect(erste.status).toBe(200);
    expect(zweite).toEqual(ABGELEHNT);
  });

  it('gibt im selben Schritt einen neuen Code heraus, der auch funktioniert', async () => {
    const { ports, stand } = fakePorts();
    const { recoveryCode } = await legeLernendeAn(stand);

    const erste = await handle(
      { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode, newPassword: 'neues-testkennwort' },
      'h',
      ports,
    );
    const neuerCode = String(erste.body.recoveryCode);
    expect(neuerCode).not.toBe(recoveryCode);

    const zweite = await handle(
      {
        aktion: 'wiederherstellen',
        learnerId: 'fuchs-7390',
        recoveryCode: neuerCode,
        newPassword: 'noch-eins-neu',
      },
      'h',
      ports,
    );
    expect(zweite.status).toBe(200);
  });

  it('lehnt falschen Code und unbekannte Lern-ID gleich ab', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);

    const falsch = await handle(
      { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode: 'FALS-CHER-CODE-XXXX', newPassword: 'neues-testkennwort' },
      'h',
      ports,
    );
    const unbekannt = await handle(
      { aktion: 'wiederherstellen', learnerId: 'gibtsnicht', recoveryCode: 'FALS-CHER-CODE-XXXX', newPassword: 'neues-testkennwort' },
      'h',
      ports,
    );
    expect(falsch).toEqual(unbekannt);
  });

  it('vergleicht auch bei unbekannter Lern-ID, statt früh auszusteigen', async () => {
    // Ein früher Ausstieg wäre am Zeitverhalten erkennbar – und damit wieder
    // ein Auskunftsdienst darüber, welche Lern-IDs es gibt.
    const { ports } = fakePorts();
    const sha = vi.fn(fakeSha256);
    ports.sha256Hex = sha;

    await handle(
      { aktion: 'wiederherstellen', learnerId: 'gibtsnicht', recoveryCode: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'neues-testkennwort' },
      'h',
      ports,
    );
    expect(sha).toHaveBeenCalled();
  });

  it('lehnt ein zu kurzes neues Kennwort ab', async () => {
    const { ports, stand } = fakePorts();
    const { recoveryCode } = await legeLernendeAn(stand);
    const antwort = await handle(
      { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode, newPassword: 'x'.repeat(KENNWORT_MINDESTLAENGE - 1) },
      'h',
      ports,
    );
    expect(antwort).toEqual(ABGELEHNT);
  });

  it('bremst enger als die Anmeldung', async () => {
    // Ein Wiederherstellungscode ist kürzer als ein Kennwort, ein Treffer
    // aber mehr wert.
    expect(BREMSEN.wiederherstellen.hoechstzahl).toBeLessThan(BREMSEN.anmelden.hoechstzahl);

    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);
    let letzte = ABGELEHNT;
    for (let i = 0; i < BREMSEN.wiederherstellen.hoechstzahl + 1; i += 1) {
      letzte = await handle(
        { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode: 'FALSCH', newPassword: 'neues-testkennwort' },
        'h',
        ports,
      );
    }
    expect(letzte).toEqual(ZU_VIELE);
  });
});

/* --------------------------------------------------------- Allgemeines --- */

describe('unbekannte Anfragen', () => {
  it('werden abgelehnt wie alles andere', async () => {
    const { ports } = fakePorts();
    for (const anfrage of [{}, { aktion: 'loeschen' }, { aktion: 42 }]) {
      expect(await handle(anfrage, 'h', ports)).toEqual(ABGELEHNT);
    }
  });

  it('verbrauchen keinen Versuch, weil sie nichts erraten können', async () => {
    const { ports, stand } = fakePorts();
    await handle({ aktion: 'loeschen' }, 'h', ports);
    expect(stand.versuche.size).toBe(0);
  });
});

describe('jede Ablehnung sieht gleich aus', () => {
  it('derselbe Status und derselbe Rumpf – über alle Aktionen hinweg', async () => {
    const { ports, stand } = fakePorts();
    await legeLernendeAn(stand);

    const ablehnungen = [
      await handle({ aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'falsch' }, 'a', ports),
      await handle({ aktion: 'anmelden', learnerId: 'gibtsnicht', password: 'x' }, 'b', ports),
      await handle({ aktion: 'registrieren', inviteCode: 'ZZZZZZZZ', displayName: 'F', password: 'testkennwort' }, 'c', ports),
      await handle({ aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode: 'FALSCH', newPassword: 'neues-testkennwort' }, 'd', ports),
      await handle({ aktion: 'unsinn' }, 'e', ports),
    ];

    for (const antwort of ablehnungen) {
      expect(antwort).toEqual(ABGELEHNT);
    }
  });

  it('keine Antwort nennt eine E-Mail-Adresse', async () => {
    const { ports, stand } = fakePorts();
    const { recoveryCode } = await legeLernendeAn(stand);

    const antworten = [
      await handle({ aktion: 'anmelden', learnerId: 'fuchs-7390', password: 'testkennwort' }, 'a', ports),
      await handle(
        { aktion: 'wiederherstellen', learnerId: 'fuchs-7390', recoveryCode, newPassword: 'neues-testkennwort' },
        'b',
        ports,
      ),
    ];
    for (const antwort of antworten) {
      expect(JSON.stringify(antwort.body)).not.toContain('@');
      expect(JSON.stringify(antwort.body)).not.toContain(TECHNISCHE_DOMAIN);
    }
  });
});
