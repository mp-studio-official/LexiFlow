import { describe, expect, it } from 'vitest';
import { SCOTLAND_WALES } from '../../../testdaten/scotlandWales';
import { mergeMultiwordTokens, tokenizeSource } from '../../../import/sourceTokens';
import { pickFromSource } from '../../../import/sourcePick';
import { analyzeText } from '../../../domain/textExtraction';
import {
  type Textstand,
  aufgenommene,
  textEntwurf,
  textIstFertig,
  textZug,
  textanfang,
  wasFehlt,
  wortzustand,
} from './textzustand';

/**
 * Die Textwerkstatt gegen den verbindlichen Abnahmetext.
 *
 * Jeder Stand hier entsteht durch `textZug` aus dem echten Text. Ein von
 * Hand gebauter Stand könnte Dinge behaupten, die der Automat nie
 * erzeugt — und dann prüfte die Datei einen Fall, den es nicht gibt.
 */

function analysiert(text = SCOTLAND_WALES): Textstand {
  return textZug(textanfang(), { art: 'text-analysiert', text });
}

function idVon(stand: Textstand, englisch: string): string {
  const zeile = stand.zeilen.find(
    (eintrag) => eintrag.kandidat.normalizedEnglish === englisch.toLowerCase(),
  );
  if (!zeile) throw new Error(`Kandidat „${englisch}" fehlt im Text`);
  return zeile.kandidat.id;
}

describe('aus dem Text entstehen echte Wortkandidaten', () => {
  const stand = analysiert();

  it('findet genug Kandidaten, um eine Stunde zu füllen', () => {
    expect(stand.zeilen.length).toBeGreaterThan(20);
  });

  it('findet Wörter, die wirklich im Text stehen', () => {
    for (const zeile of stand.zeilen) {
      const erstesWort = zeile.kandidat.normalizedEnglish.split(' ')[0]!;
      expect(SCOTLAND_WALES.toLowerCase()).toContain(erstesWort);
    }
  });

  it('findet die inhaltstragenden Wörter des Textes', () => {
    /*
      Nicht „irgendwelche 20 Wörter": Dies sind die Wörter, wegen derer
      eine Lehrkraft diesen Text überhaupt einfügt. Fielen sie heraus
      und blieben `sq`, `mi` und `islands` übrig, wäre die Analyse grün
      und nutzlos.
    */
    const gefunden = new Set(stand.zeilen.map((zeile) => zeile.kandidat.normalizedEnglish));
    for (const wort of ['capital', 'tradition', 'symbol', 'separate', 'culture']) {
      expect(gefunden).toContain(wort);
    }
  });

  it('bewahrt zu jedem Kandidaten seinen Quellsatz aus dem Text', () => {
    for (const zeile of stand.zeilen) {
      expect(zeile.kandidat.sourceSentence.length).toBeGreaterThan(0);
      expect(SCOTLAND_WALES).toContain(zeile.kandidat.sourceSentence);
    }
  });

  it('zählt die Sätze des Textes', () => {
    expect(stand.saetze).toBeGreaterThan(10);
  });
});

describe('nichts ist vorausgewählt', () => {
  it('hakt keinen einzigen Kandidaten von allein an', () => {
    const stand = analysiert();
    expect(stand.zeilen.every((zeile) => !zeile.aufgenommen)).toBe(true);
    expect(aufgenommene(stand)).toHaveLength(0);
  });

  it('füllt keine einzige Übersetzung von allein', () => {
    const stand = analysiert();
    expect(stand.zeilen.every((zeile) => zeile.german === '')).toBe(true);
  });

  it('ist ohne Zutun der Lehrkraft nicht abgabefähig', () => {
    const stand = analysiert();
    expect(textIstFertig(stand)).toBe(false);
    expect(textEntwurf(stand)).toBeUndefined();
  });
});

describe('die Lehrkraft behält die Kontrolle', () => {
  it('nimmt auf und wählt wieder ab, ohne die Eingabe zu verlieren', () => {
    const stand = analysiert();
    const id = idVon(stand, 'capital');
    let jetzt = textZug(stand, { art: 'aufgenommen', id });
    jetzt = textZug(jetzt, { art: 'zeile-geaendert', id, teil: { german: 'das Parlament' } });
    jetzt = textZug(jetzt, { art: 'abgewaehlt', id });
    jetzt = textZug(jetzt, { art: 'aufgenommen', id });
    const zeile = jetzt.zeilen.find((eintrag) => eintrag.kandidat.id === id);
    expect(zeile?.german).toBe('das Parlament');
  });

  it('nennt beim Namen, was zum Speichern fehlt', () => {
    const stand = analysiert();
    expect(wasFehlt(stand)).toContain('Dem Lernpaket fehlt noch ein Name.');
    expect(wasFehlt(stand)).toContain('Es ist noch kein Wort aufgenommen.');
  });

  it('nennt ein aufgenommenes Wort ohne Bedeutung beim Namen', () => {
    const stand = analysiert();
    const id = idVon(stand, 'capital');
    const jetzt = textZug(textZug(stand, { art: 'titel-geaendert', titel: 'UK' }), {
      art: 'aufgenommen',
      id,
    });
    expect(wasFehlt(jetzt).join(' ')).toContain('capital');
    expect(textIstFertig(jetzt)).toBe(false);
  });

  it('legt erst nach Bestätigung einen Entwurf an — mit Quellsatz', () => {
    let jetzt = analysiert();
    jetzt = textZug(jetzt, { art: 'titel-geaendert', titel: 'Scotland and Wales' });
    for (const [wort, deutsch] of [
      ['capital', 'die Hauptstadt'],
      ['tradition', 'die Tradition'],
      ['symbol', 'das Symbol'],
    ] as const) {
      const id = idVon(jetzt, wort);
      jetzt = textZug(jetzt, { art: 'aufgenommen', id });
      jetzt = textZug(jetzt, { art: 'zeile-geaendert', id, teil: { german: deutsch } });
    }

    expect(textIstFertig(jetzt)).toBe(true);
    const entwurf = textEntwurf(jetzt);
    expect(entwurf?.titel).toBe('Scotland and Wales');
    expect(entwurf?.eintraege).toHaveLength(3);

    const hauptstadt = entwurf?.eintraege.find((eintrag) => eintrag.english === 'capital');
    expect(hauptstadt?.germanAnswers).toContain('die Hauptstadt');
    /*
      Der Beispielsatz steht im Eintrag und stammt aus dem Text — nicht
      aus einer Vorlage und nicht aus einem Modell.
    */
    const satz = hauptstadt?.exampleSentences[0]?.english ?? '';
    expect(satz.length).toBeGreaterThan(0);
    expect(SCOTLAND_WALES).toContain(satz);
  });
});

describe('ein Wort direkt aus dem Quelltext ergänzen', () => {
  it('nimmt ein Wort auf, das die Analyse ausgelassen hatte', () => {
    const stand = analysiert();
    const analyse = analyzeText(SCOTLAND_WALES, { sort: 'text-order' });
    const tokens = mergeMultiwordTokens(
      tokenizeSource(SCOTLAND_WALES, analyse.candidates),
      analyse.candidates,
    );
    /*
      „Cardiff" ist ein Eigenname und wird von der Analyse ausgeblendet
      — genau der Fall, für den es den Griff in den Quelltext gibt: Die
      Lehrkraft sieht das Wort im Text und will es trotzdem haben.
    */
    const index = tokens.findIndex((token) => token.isWord && token.text === 'Cardiff');
    expect(index).toBeGreaterThan(-1);

    const auswahl = pickFromSource({
      sourceText: SCOTLAND_WALES,
      tokens,
      from: index,
      to: index,
      candidates: analyse.candidates,
    });
    expect(auswahl.kind).toBe('new');

    const jetzt = textZug(stand, { art: 'aus-quelltext', auswahl });
    expect(jetzt.zeilen).toHaveLength(stand.zeilen.length + 1);
    const neu = jetzt.zeilen[jetzt.zeilen.length - 1]!;
    expect(neu.kandidat.english).toBe('Cardiff');
    expect(neu.herkunft).toBe('quelltext');
    expect(neu.aufgenommen).toBe(true);
    expect(SCOTLAND_WALES).toContain(neu.kandidat.sourceSentence);
  });

  it('legt dasselbe Wort kein zweites Mal an', () => {
    const stand = analysiert();
    const zeile = stand.zeilen[0]!;
    const jetzt = textZug(stand, {
      art: 'aus-quelltext',
      auswahl: { kind: 'new', candidate: zeile.kandidat },
    });
    expect(jetzt.zeilen).toHaveLength(stand.zeilen.length);
  });
});

describe('die Wortzustände im Quelltext', () => {
  it('unterscheidet offen, gelistet und übernommen', () => {
    const stand = analysiert();
    const id = idVon(stand, 'capital');
    expect(wortzustand(stand, id)).toBe('open');

    const aufgenommenerStand = textZug(stand, { art: 'aufgenommen', id });
    expect(wortzustand(aufgenommenerStand, id)).toBe('listed');

    const mitBedeutung = textZug(aufgenommenerStand, {
      art: 'zeile-geaendert',
      id,
      teil: { german: 'das Parlament' },
    });
    expect(wortzustand(mitBedeutung, id)).toBe('taken');
  });
});

describe('KI-Vorschläge — was sie dürfen und was nicht', () => {
  function mitVorschlag(stand: Textstand, id: string, german: string) {
    return textZug(textZug(stand, { art: 'ki-gestartet' }), {
      art: 'ki-vorschlaege',
      vorschlaege: [{ kandidatId: id, german }],
    });
  }

  it('füllt ein leeres Feld', () => {
    const stand = analysiert();
    const id = idVon(stand, 'capital');
    const jetzt = mitVorschlag(stand, id, 'die Hauptstadt');
    const zeile = jetzt.zeilen.find((eintrag) => eintrag.kandidat.id === id);
    expect(zeile?.german).toBe('die Hauptstadt');
    expect(zeile?.vorschlagUebernommen).toBe(true);
  });

  it('hakt dabei nichts an', () => {
    /*
      Ein Vorschlag ist ein Vorschlag. Würde er die Zeile zugleich
      aufnehmen, entstünde ein Paket, das niemand ausgewählt hat.
    */
    const stand = analysiert();
    const jetzt = mitVorschlag(stand, idVon(stand, 'capital'), 'die Hauptstadt');
    expect(aufgenommene(jetzt)).toHaveLength(0);
  });

  it('überschreibt niemals, was die Lehrkraft getippt hat', () => {
    const stand = analysiert();
    const id = idVon(stand, 'capital');
    const getippt = textZug(stand, {
      art: 'zeile-geaendert',
      id,
      teil: { german: 'die Landeshauptstadt' },
    });
    const jetzt = mitVorschlag(getippt, id, 'die Hauptstadt');
    const zeile = jetzt.zeilen.find((eintrag) => eintrag.kandidat.id === id);
    expect(zeile?.german).toBe('die Landeshauptstadt');
    expect(zeile?.vorschlagUebernommen).toBe(false);
  });

  it('füllt auch ein bewusst geleertes Feld nicht wieder auf', () => {
    /*
      Der Fall, den ein blosser Leerheitstest durchliesse: Die Lehrkraft
      hat etwas getippt und wieder gelöscht. Das Feld ist leer, aber es
      gehört ihr. `beruehrt` ist genau dafür da.
    */
    const stand = analysiert();
    const id = idVon(stand, 'capital');
    let jetzt = textZug(stand, { art: 'zeile-geaendert', id, teil: { german: 'Hauptstadt' } });
    jetzt = textZug(jetzt, { art: 'zeile-geaendert', id, teil: { german: '' } });
    jetzt = mitVorschlag(jetzt, id, 'die Hauptstadt');
    expect(jetzt.zeilen.find((eintrag) => eintrag.kandidat.id === id)?.german).toBe('');
  });

  it('verwirft erfundene Wörter, die nicht aus dem Text stammen', () => {
    /*
      Die wichtigste Gegenprobe dieses Blocks. Ein Modell, das
      „sightseeing" zurückgibt, obwohl das Wort im Text nicht vorkommt,
      bekäme sonst eine Zeile mit einem Quellsatz, den es nie gab.
    */
    const stand = analysiert();
    const jetzt = textZug(textZug(stand, { art: 'ki-gestartet' }), {
      art: 'ki-vorschlaege',
      vorschlaege: [
        { kandidatId: idVon(stand, 'capital'), german: 'die Hauptstadt' },
        { kandidatId: 'erfunden-sightseeing', german: 'die Besichtigung' },
        { kandidatId: 'erfunden-castle', german: 'die Burg' },
      ],
    });
    expect(jetzt.zeilen).toHaveLength(stand.zeilen.length);
    expect(jetzt.kiVerworfen).toBe(2);
    expect(
      jetzt.zeilen.some((zeile) => zeile.german === 'die Besichtigung' || zeile.german === 'die Burg'),
    ).toBe(false);
  });

  it('verwirft leere Vorschläge, statt ein Feld als beantwortet zu zählen', () => {
    const stand = analysiert();
    const jetzt = mitVorschlag(stand, idVon(stand, 'capital'), '   ');
    expect(jetzt.kiVerworfen).toBe(1);
    expect(jetzt.zeilen.find((zeile) => zeile.kandidat.normalizedEnglish === 'capital')?.german).toBe('');
  });

  it('bleibt ohne KI vollständig benutzbar', () => {
    /*
      Die Zusage der Pilotsperre an der Fachlogik: Ohne einen einzigen
      KI-Zug entsteht ein vollständiger Entwurf.
    */
    let jetzt = analysiert();
    jetzt = textZug(jetzt, { art: 'titel-geaendert', titel: 'Ohne KI' });
    const id = idVon(jetzt, 'capital');
    jetzt = textZug(jetzt, { art: 'aufgenommen', id });
    jetzt = textZug(jetzt, { art: 'zeile-geaendert', id, teil: { german: 'die Hauptstadt' } });
    expect(jetzt.kiStand).toBe('aus');
    expect(textEntwurf(jetzt)?.eintraege).toHaveLength(1);
  });

  it('merkt sich eine gescheiterte Anfrage, ohne etwas zu verändern', () => {
    const stand = analysiert();
    const jetzt = textZug(textZug(stand, { art: 'ki-gestartet' }), {
      art: 'ki-gescheitert',
      grund: 'Der KI-Zugang ist gerade nicht erreichbar.',
    });
    expect(jetzt.kiStand).toBe('gescheitert');
    expect(jetzt.kiMeldung).toMatch(/nicht erreichbar/);
    expect(jetzt.zeilen).toEqual(stand.zeilen);
  });
});
