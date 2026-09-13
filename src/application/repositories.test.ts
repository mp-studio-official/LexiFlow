import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLES } from './repositories';

/**
 * Prüfungen an den **Verträgen** selbst.
 *
 * Das ist ungewöhnlich – Schnittstellen verschwinden beim Übersetzen, es gibt
 * zur Laufzeit nichts zu prüfen. Genau deshalb steht hier ein Quelltexttest:
 * Die wichtigste Zusage dieses Sprints ist eine **Abwesenheit**, und eine
 * Abwesenheit lässt sich nur an der Quelle nachweisen.
 *
 * Die Zusage lautet: Es gibt keinen Weg, den Lernstand einer anderen Person zu
 * lesen. Nicht für Lehrkräfte, nicht für die Verwaltung, nicht für die
 * Anwendung selbst. Eine Schnittstelle, die diesen Weg gar nicht beschreibt,
 * kann ihn auch nicht versehentlich bekommen – und wer ihn später doch
 * einbaut, muss diesen Test anfassen und dabei lesen, warum es ihn gibt.
 */

const quelle = readFileSync(resolve(import.meta.dirname, 'repositories.ts'), 'utf8');

/** Der Textblock einer Schnittstelle, von `interface X {` bis zur Klammer. */
function block(name: string): string {
  const anfang = quelle.indexOf(`export interface ${name} {`);
  expect(anfang, `Schnittstelle ${name} nicht gefunden`).toBeGreaterThan(-1);
  const ende = quelle.indexOf('\n}', anfang);
  return quelle.slice(anfang, ende);
}

describe('Lernstände', () => {
  const progress = block('ProgressRepository');

  it('kennt keinen Parameter für eine andere Person', () => {
    /*
      `userId`, `learnerId`, `studentId` – jeder davon wäre der Anfang einer
      Auswertung. Der Vertrag hat sie nicht; der Lernstand ist immer der der
      aufrufenden Person, und die steht in der Sitzung.
    */
    for (const verdaechtig of ['userId', 'learnerId', 'studentId', 'memberId', 'forUser']) {
      expect(progress, `„${verdaechtig}“ gehört nicht in ProgressRepository`).not.toContain(
        verdaechtig,
      );
    }
  });

  it('nennt jede lesende Methode „my…“', () => {
    // Die Benennung ist hier keine Kosmetik: Sie macht am Aufruf sichtbar,
    // wessen Lernstand gemeint ist – ohne dass man die Schnittstelle aufschlägt.
    const methoden = [...progress.matchAll(/^\s{2}(\w+)\(/gm)].map((treffer) => treffer[1]!);
    expect(methoden.length).toBeGreaterThan(3);

    const lesend = methoden.filter((name) => name.startsWith('my'));
    const schreibend = methoden.filter((name) => !name.startsWith('my'));

    expect(lesend.length).toBeGreaterThan(0);
    // Die schreibenden sind abschließend aufgezählt. Kommt eine hinzu, fällt
    // dieser Test auf – und die Frage „liest die etwas heraus?“ wird gestellt.
    expect(schreibend.sort()).toEqual(['beginSession', 'recordEvents', 'resetMyProgress']);
  });
});

describe('Kurse', () => {
  it('geben über Mitglieder nur Name, Kennung, Rolle und Beitritt heraus', () => {
    const mitglied = block('CourseMember');
    const felder = [...mitglied.matchAll(/^\s{2}(\w+)[?]?:/gm)].map((treffer) => treffer[1]!);
    expect(felder.sort()).toEqual(['displayName', 'joinedAt', 'role', 'shortCode', 'userId']);
  });

  it('enthalten kein Feld, das nach Lernstand klingt', () => {
    const mitglied = block('CourseMember');
    for (const verdaechtig of ['progress', 'lastPracticed', 'correct', 'box', 'streak', 'score']) {
      expect(mitglied.toLowerCase()).not.toContain(verdaechtig.toLowerCase());
    }
  });
});

describe('Anmeldung', () => {
  it('trennt den Weg der Lehrkräfte vom Weg der Lernenden', () => {
    const auth = block('AuthRepository');
    expect(auth).toContain('signInWithEmail');
    expect(auth).toContain('signInWithLearnerId');
  });

  it('bietet Lernenden keinen E-Mail-Weg an (ADR-5)', () => {
    /*
      Die E-Mail-Adresse einer zwölfjährigen Person ist ein personenbezogenes
      Datum, das dieses Produkt nicht braucht. Was es nicht erhebt, kann es
      nicht verlieren.
    */
    const auth = block('AuthRepository');

    for (const methode of ['signInWithLearnerId(', 'redeemRecoveryCode(']) {
      const zeile = auth.split('\n').find((eintrag) => eintrag.includes(methode));
      expect(zeile, methode).toBeDefined();
      expect(zeile!.toLowerCase(), methode).not.toContain('email');
    }

    /*
      Genau zwei Methoden dürfen eine Adresse im Namen tragen, und beide
      gehören den Lehrkräften: die Anmeldung und die Wiederherstellung. Käme
      eine dritte hinzu, fiele dieser Test auf – und die Frage „für wen ist
      die?“ würde gestellt.
    */
    const methoden = [...auth.matchAll(/^\s{2}(\w+)\(/gm)].map((treffer) => treffer[1]!);
    expect(methoden.filter((name) => /email/i.test(name)).sort()).toEqual([
      'requestEmailRecovery',
      'signInWithEmail',
    ]);
  });
});

describe('Schlüssel', () => {
  it('kommen aus dem KI-Gateway nur maskiert zurück', () => {
    const zusammenfassung = block('AiConnectionSummary');
    expect(zusammenfassung).toContain('maskedSecret');
    // Ein Feld `secret` in der Zusammenfassung wäre der Klartext auf dem
    // Rückweg – genau das, was Phase 7 ausschließt.
    expect(zusammenfassung).not.toMatch(/^\s{2}secret[?]?:/m);
  });
});

describe('Rollen', () => {
  it('sind genau drei und in dieser Reihenfolge', () => {
    expect(ROLES).toEqual(['admin', 'teacher', 'student']);
  });
});
