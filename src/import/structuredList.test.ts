import { describe, expect, it } from 'vitest';
import { looksStructured, parseStructuredList, structuredToDrafts } from './structuredList';

/**
 * Sprint 4B.2: Der Parser für schon strukturierte Vokabellisten.
 *
 * Die Referenzliste aus dem Auftrag steht hier vollständig – sie ist der
 * Maßstab, an dem sich dieses Modul messen lassen muss. Geprüft wird nicht
 * nur, was erkannt wird, sondern auch, **was bewusst nicht getrennt wird**:
 * Ein falsch zerlegter Mehrwortbegriff wäre eine erfundene Vokabel.
 */

/** Der Block aus dem Auftrag, wortgleich. */
const REFERENZ = `• to coin a phrase / term
context/example: “…coined the phrase ‘the American Dream’…”
translation: einen Begriff, eine Redewendung prägen

• enduring
translation: dauerhaft; beständig; langanhaltend

• restraints (pl.)
translation: Beschränkungen

• attainability (n.) / attainable (adj.)
translation: Erreichbarkeit

• endeavor (n./v.)
translation: Anstrengung; Bemühen

• to single out sb./sth.
translation: herausgreifen

• Manifest Destiny
translation: Manifest Destiny

• to surmount obstacles
translation: Hindernisse überwinden

• ethnic stock
translation: ethnische Herkunft`;

function parse(text: string) {
  return parseStructuredList(text).entries;
}

describe('Erkennen, ob eine Liste überhaupt strukturiert ist', () => {
  it('erkennt Aufzählungen, Schlüsselzeilen und Wortartkürzel', () => {
    expect(looksStructured(REFERENZ)).toBe(true);
    expect(looksStructured('• eins\n• zwei')).toBe(true);
    expect(looksStructured('translation: dauerhaft')).toBe(true);
  });

  it('hält sich bei einer schlichten Tabulatorliste heraus', () => {
    // Dafür gibt es den alten Weg, und der ist hier der richtige.
    expect(looksStructured('crowded\tüberfüllt\nlitter\tMüll')).toBe(false);
  });
});

describe('Die Referenzliste aus dem Auftrag', () => {
  const entries = parse(REFERENZ);
  const find = (english: string) => entries.find((entry) => entry.english === english);

  it('liest jede Vokabel', () => {
    /*
      Zehn Einträge aus neun Aufzählungspunkten: `attainability (n.) /
      attainable (adj.)` und `endeavor (n./v.)` sind je zwei Vokabeln.
    */
    expect(entries).toHaveLength(11);
  });

  it('liest die vollständige Verbform samt Ergänzung', () => {
    const coin = find('to coin a phrase / term');
    expect(coin).toBeDefined();
    expect(coin?.partOfSpeech).toBe('verb');
    // Der Schrägstrich gehört zur Vokabel – er trennt hier nichts.
    expect(coin?.german).toEqual(['einen Begriff, eine Redewendung prägen']);
    expect(coin?.example?.english).toContain('coined the phrase');
  });

  it('behält ein Komma in der Übersetzung', () => {
    expect(find('to coin a phrase / term')?.german).toHaveLength(1);
  });

  it('trennt mehrere Übersetzungen am Semikolon', () => {
    expect(find('enduring')?.german).toEqual(['dauerhaft', 'beständig', 'langanhaltend']);
  });

  it('erkennt die Pluralkennzeichnung', () => {
    const restraints = find('restraints (pl.)');
    expect(restraints?.grammaticalNumber).toBe('plural');
    expect(restraints?.lemma).toBe('restraints');
  });

  it('macht aus zwei markierten Formen zwei Einträge mit gemeinsamer Gruppe', () => {
    const substantiv = find('attainability');
    const adjektiv = find('attainable');
    expect(substantiv?.partOfSpeech).toBe('noun');
    expect(adjektiv?.partOfSpeech).toBe('adjective');
    expect(substantiv?.groupKey).toBeDefined();
    expect(substantiv?.groupKey).toBe(adjektiv?.groupKey);
  });

  it('macht aus einer Doppelwortart zwei Lernformen', () => {
    // `endeavor (n./v.)` ist das Substantiv **und** das Verb.
    const substantiv = find('endeavor');
    const verb = find('to endeavor');
    expect(substantiv?.partOfSpeech).toBe('noun');
    expect(verb?.partOfSpeech).toBe('verb');
    expect(substantiv?.groupKey).toBe(verb?.groupKey);
  });

  it('übernimmt ein belegtes Ergänzungsmuster, ohne eines zu erfinden', () => {
    const single = find('to single out sb./sth.');
    expect(single?.complementPattern).toBe('sb./sth.');
    expect(single?.lemma).toBe('single out');

    // Und die Gegenprobe: Ohne Beleg steht dort nichts.
    expect(find('to surmount obstacles')?.complementPattern).toBeUndefined();
  });

  it('lässt einen Eigennamen in Ruhe', () => {
    const manifest = find('Manifest Destiny');
    expect(manifest).toBeDefined();
    expect(manifest?.english).toBe('Manifest Destiny');
  });

  it('zerlegt keine Mehrwortvokabel', () => {
    expect(find('to surmount obstacles')).toBeDefined();
    expect(find('ethnic stock')).toBeDefined();
    expect(find('to surmount')).toBeUndefined();
  });
});

describe('Was der Parser nicht versteht, zeigt er', () => {
  it('markiert einen unbekannten Klammerzusatz', () => {
    const [entry] = parse('• enduring (irreg.)\ntranslation: dauerhaft');
    expect(entry?.needsReview).toContain('irreg.');
  });

  it('wirft eine Feldzeile ohne Vokabel nicht weg', () => {
    const result = parseStructuredList('translation: dauerhaft\n\n• enduring');
    expect(result.unassigned).toEqual(['translation: dauerhaft']);
    expect(result.entries).toHaveLength(1);
  });

  it('trägt den Hinweis bis in die Entwurfszeile', () => {
    const drafts = structuredToDrafts(parseStructuredList('• enduring (irreg.)\ntranslation: dauerhaft'));
    expect(drafts[0]?.issues.some((issue) => issue.message.includes('irreg.'))).toBe(true);
  });
});

describe('Kopfzeilen, Seitenzahlen und andere Reste', () => {
  /*
    Der häufigste Ärger beim PDF-Weg. Aus einem Vokabelanhang fallen
    Kolumnentitel und Seitenzahlen mit heraus. Sie als Vokabeln mit leerer
    Übersetzung anzulegen hieße, der Lehrkraft die Aufräumarbeit zurückzugeben,
    die ihr die Vorschau gerade abgenommen hat – sie stillschweigend zu löschen
    hieße, Inhalt zu unterschlagen. Also: heraus aus der Liste, hinein in die
    sichtbaren „nicht zugeordnet“-Zeilen.
  */
  const MIT_KOPFZEILE = [
    'Unit 7 – Vokabelanhang',
    'Seite 143',
    '',
    '• to coin a phrase / term (v.)',
    '  translation: eine Wendung prägen',
  ].join('\n');

  it('legt aus einer Kopfzeile keine leere Vokabel an', () => {
    const result = parseStructuredList(MIT_KOPFZEILE);

    expect(result.entries.map((entry) => entry.english)).toEqual(['to coin a phrase / term']);
    expect(result.unassigned).toEqual(['Unit 7 – Vokabelanhang', 'Seite 143']);
  });

  it('behält eine Kopfzeile mit Aufzählungszeichen – die ist gemeint', () => {
    // Wer sie aufzählt, meint sie als Vokabel, auch ohne Übersetzung.
    const result = parseStructuredList('• attainability (n.)\n• enduring\ntranslation: dauerhaft');

    expect(result.entries.map((entry) => entry.english)).toEqual(['attainability', 'enduring']);
    expect(result.unassigned).toEqual([]);
  });

  it('behält eine Kopfzeile mit Wortartklammer – die ist auch gemeint', () => {
    const result = parseStructuredList('crowded (adj.)\n\n• enduring\ntranslation: dauerhaft');

    expect(result.entries.map((entry) => entry.english)).toContain('crowded');
    expect(result.unassigned).toEqual([]);
  });

  it('behält eine Kopfzeile, unter der ein Feld steht', () => {
    // Kein Aufzählungszeichen, keine Klammer – aber eine Übersetzung darunter.
    const result = parseStructuredList('translation-test\n\nenduring\ntranslation: dauerhaft');

    expect(result.entries.map((entry) => entry.english)).toContain('enduring');
    expect(result.unassigned).toContain('translation-test');
  });
});

describe('Andere Schreibweisen derselben Liste', () => {
  it('versteht „example:“ und „Übersetzung:“', () => {
    const [entry] = parse('• enduring\nexample: an enduring peace\nÜbersetzung: dauerhaft');
    expect(entry?.example?.english).toBe('an enduring peace');
    expect(entry?.german).toEqual(['dauerhaft']);
  });

  it('versteht Aufzählungen mit Ziffern und Strichen', () => {
    expect(parse('1. enduring\n2. crowded')).toHaveLength(2);
    expect(parse('- enduring\n– crowded')).toHaveLength(2);
  });

  it('versteht die alte Tabulatorzeile weiterhin', () => {
    const [entry] = parse('to apologise\tsich entschuldigen');
    expect(entry?.english).toBe('to apologise');
    expect(entry?.german).toEqual(['sich entschuldigen']);
  });

  it('trennt Einträge auch ohne Aufzählungszeichen an Leerzeilen', () => {
    const entries = parse('enduring\ntranslation: dauerhaft\n\nethnic stock\ntranslation: Herkunft');
    expect(entries.map((entry) => entry.english)).toEqual(['enduring', 'ethnic stock']);
  });
});

describe('Aus gelesenen Vokabeln werden Entwurfszeilen', () => {
  it('füllt die strukturierten Felder durch', () => {
    const drafts = structuredToDrafts(parseStructuredList(REFERENZ));
    const single = drafts.find((draft) => draft.english === 'to single out sb./sth.');
    expect(single?.partOfSpeech).toBe('verb');
    expect(single?.lemma).toBe('single out');
    expect(single?.complementPattern).toBe('sb./sth.');

    const attainability = drafts.find((draft) => draft.english === 'attainability');
    const attainable = drafts.find((draft) => draft.english === 'attainable');
    expect(attainability?.lexicalGroupId).toBeTruthy();
    expect(attainability?.lexicalGroupId).toBe(attainable?.lexicalGroupId);
  });

  it('schreibt mehrere Antworten mit Semikolon in das Feld', () => {
    const drafts = structuredToDrafts(parseStructuredList(REFERENZ));
    expect(drafts.find((draft) => draft.english === 'enduring')?.german).toBe(
      'dauerhaft; beständig; langanhaltend',
    );
  });
});
