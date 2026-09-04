import { describe, expect, it } from 'vitest';

import {
  LEARNING_AREA_KIND,
  LEARNING_AREA_MAX_PACKS,
  areaBlockers,
  areaPacks,
  describeArea,
  learningAreaDocumentTitle,
  learningAreaFileName,
  parseLearningArea,
  singlePackArea,
  toLearningAreaFile,
} from './learningArea';
import { serializePack, toPackFile } from './vocabpack';
import { VOCABPACK_KIND } from './schema';
import { makeEntry, makeMeta } from '../test/fixtures';
import type { VocabPack } from './schema';

/**
 * Der Lernbereich als Datenform – ohne React, ohne IndexedDB, ohne Browser.
 *
 * Die eine Zusage, um die es hier wirklich geht, steht ganz unten: **Die
 * Kennung überlebt eine Neuausgabe.** An ihr hängt der Lernstand von
 * achtundzwanzig Personen, und sie ist das Einzige in dieser Datei, dessen
 * Verlust man erst Wochen später bemerkt.
 */

function pack(id: string, title: string, words = 2): VocabPack {
  return {
    meta: makeMeta({ id, title }),
    entries: Array.from({ length: words }, (_, index) =>
      makeEntry({ id: `${id}-e${index}`, english: `word-${id}-${index}` }),
    ),
  };
}

describe('Ein Lernbereich als Datei', () => {
  it('trägt Kennung, Titel und die Pakete in der gewählten Reihenfolge', () => {
    const area = toLearningAreaFile({ id: 'bereich-9b', title: 'Englisch 9b' }, [
      pack('p2', 'Unit 5'),
      pack('p1', 'Unit 4'),
    ]);

    expect(area.kind).toBe(LEARNING_AREA_KIND);
    expect(area.id).toBe('bereich-9b');
    expect(area.title).toBe('Englisch 9b');
    // Die Reihenfolge ist die der Lehrkraft und nicht die der Bibliothek.
    expect(area.packs.map((entry) => entry.meta.id)).toEqual(['p2', 'p1']);
  });

  it('legt die Pakete Zeichen für Zeichen so ab wie eine einzelne Paketdatei', () => {
    /*
      Keine eigene, gekürzte Paketform: Die wäre ein zweites Format mit eigener
      Migration, und die Ersparnis wären ein paar Bytes.
    */
    const einzeln = pack('p1', 'Unit 4');
    const area = toLearningAreaFile({ id: 'b', title: 'B' }, [einzeln]);
    expect(area.packs[0]).toEqual(toPackFile(einzeln));
  });

  it('enthält keinen Lernstand – auch nicht versehentlich', () => {
    /*
      Lernstände sind das, was diese Anwendung ausdrücklich nicht weitergibt.
      Geprüft am serialisierten Text und nicht an den Feldern: Ein Feld, das
      erst später dazukommt, fiele bei einer Feldprüfung nicht auf.
    */
    const text = JSON.stringify(toLearningAreaFile({ id: 'b', title: 'B' }, [pack('p1', 'U')]));
    for (const verboten of ['box', 'dueAt', 'streak', 'correctCount', 'lastAnsweredAt']) {
      expect(text, `„${verboten}“ steht in der Datei`).not.toContain(verboten);
    }
  });
});

describe('Ein einzelnes Paket ist ein Bereich mit einem Paket', () => {
  it('übernimmt die Paket-Kennung als Bereichskennung', () => {
    /*
      Das ist der Grund, warum eine erneut ausgegebene Lerndatei den
      Lernstand der vorigen wiederfindet: Der Datenbankname hängt an dieser
      Kennung. Eine neu erzeugte Bereichskennung wäre für die Lernenden ein
      leerer Anfang – und niemand fände heraus, warum.
    */
    const einzeln = pack('pack-42', 'Unit 7');
    const area = singlePackArea(einzeln);

    expect(area.id).toBe('pack-42');
    expect(area.title).toBe('Unit 7');
    expect(area.packs).toHaveLength(1);
  });
});

describe('Lesen', () => {
  it('liest zurück, was geschrieben wurde', () => {
    const original = toLearningAreaFile({ id: 'b1', title: 'Englisch 9b' }, [
      pack('p1', 'Unit 4'),
      pack('p2', 'Unit 5'),
    ]);
    const gelesen = parseLearningArea(JSON.stringify(original));

    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    expect(gelesen.area.id).toBe('b1');
    expect(areaPacks(gelesen.area).map((entry) => entry.meta.id)).toEqual(['p1', 'p2']);
  });

  it('liest auch eine Datei aus der Zeit vor den Lernbereichen', () => {
    /*
      Vor 4B.7 stand in einer Lerndatei ein nacktes Paket. Solche Dateien sind
      verteilt; dieselbe Leseroutine muss beides können, damit es nicht zwei
      gibt.
    */
    const alt = serializePack(pack('pack-alt', 'Unit 3'));
    const gelesen = parseLearningArea(alt);

    expect(gelesen.ok).toBe(true);
    if (!gelesen.ok) return;
    expect(gelesen.area.packs).toHaveLength(1);
    // Und die Kennung ist wieder die des Pakets – der Lernstand bleibt.
    expect(gelesen.area.id).toBe('pack-alt');
  });

  it('nimmt kein beliebiges JSON an, nur weil es ein Feld „packs“ hat', () => {
    const fremd = JSON.stringify({ packs: [{ irgendwas: true }] });
    const gelesen = parseLearningArea(fremd);
    expect(gelesen.ok).toBe(false);
    if (gelesen.ok) return;
    expect(gelesen.errors.join(' ')).toContain('kein LexiFlow-Lernbereich');
  });

  it('sagt bei kaputtem JSON, was los ist', () => {
    const gelesen = parseLearningArea('{ das ist kein json');
    expect(gelesen.ok).toBe(false);
    if (gelesen.ok) return;
    expect(gelesen.errors[0]).toContain('kein gültiges JSON');
  });

  it('lässt ein einzelnes beschädigtes Paket den ganzen Bereich ablehnen', () => {
    /*
      Absichtlich alles oder nichts. Ein Bereich, der still ein Paket
      weglässt, kommt bei achtundzwanzig Lernenden mit einem fehlenden Paket
      an – und niemand merkt es, weil nichts fehlt, was man sehen könnte.
    */
    const area = toLearningAreaFile({ id: 'b', title: 'B' }, [pack('p1', 'U1'), pack('p2', 'U2')]);
    const kaputt = { ...area, packs: [area.packs[0], { kind: VOCABPACK_KIND, formatVersion: 2 }] };

    const gelesen = parseLearningArea(JSON.stringify(kaputt));
    expect(gelesen.ok).toBe(false);
  });
});

describe('Was die Ausgabe blockiert', () => {
  it('nennt den fehlenden Titel', () => {
    expect(areaBlockers({ title: '   ', packIds: ['p1'] })).toEqual([
      'Der Lernbereich braucht einen Titel.',
    ]);
  });

  it('nennt die fehlende Auswahl', () => {
    expect(areaBlockers({ title: 'Englisch 9b', packIds: [] })).toEqual([
      'Wähle mindestens ein Paket aus, das in den Lernbereich soll.',
    ]);
  });

  it('lässt einen vollständigen Bereich durch', () => {
    expect(areaBlockers({ title: 'Englisch 9b', packIds: ['p1'] })).toEqual([]);
  });

  it('zieht bei zu vielen Paketen die Grenze', () => {
    const zuViele = Array.from({ length: LEARNING_AREA_MAX_PACKS + 1 }, (_, i) => `p${i}`);
    expect(areaBlockers({ title: 'B', packIds: zuViele }).join(' ')).toContain('höchstens');
  });
});

describe('Beschriftungen', () => {
  it('zählt Pakete und Vokabeln – im Singular wie im Plural', () => {
    expect(describeArea([pack('p1', 'U', 1)])).toBe('1 Paket · 1 Vokabel');
    expect(describeArea([pack('p1', 'U', 3), pack('p2', 'U', 4)])).toBe('2 Pakete · 7 Vokabeln');
  });

  it('macht aus dem Titel einen Dateinamen, der jedes System übersteht', () => {
    expect(learningAreaFileName('Englisch 9b – Größere Übung')).toBe(
      'englisch-9b-groessere-uebung-lexiflow.html',
    );
    // Ein Titel, der wie ein Pfad aussieht, wird keiner.
    expect(learningAreaFileName('../../etc/passwd')).toBe('etc-passwd-lexiflow.html');
    // Und ein Titel ohne verwertbare Zeichen fällt nicht auf die leere Datei.
    expect(learningAreaFileName('中文')).toBe('lernbereich-lexiflow.html');
  });

  it('setzt einen Fenstertitel ohne HTML-Sonderzeichen', () => {
    // Kein Escaping, sondern Ersetzen: Was kein `<` ist, kann kein Tag öffnen.
    expect(learningAreaDocumentTitle('Englisch <b>9b</b>')).toBe('Englisch b 9b /b – LexiFlow');
  });
});
