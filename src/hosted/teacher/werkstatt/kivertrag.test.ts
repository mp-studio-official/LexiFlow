import { describe, expect, it } from 'vitest';
import {
  TEXTWERKSTATT_MAX_AUSSCHNITT,
  textwerkstattAuftrag,
} from '../../../../supabase/functions/ai-gateway/textwerkstattauftrag';
import { SCOTLAND_WALES } from '../../../testdaten/scotlandWales';
import {
  GRENZE_KANDIDATEN,
  GRENZE_AUSSCHNITT,
  TEXTVORSCHLAEGE,
  baueAnfrage,
  datenschutzsatz,
  leseAntwort,
  zuFragende,
} from './kivertrag';
import { type Textstand, textZug, textanfang } from './textzustand';

function analysiert(): Textstand {
  return textZug(textanfang(), { art: 'text-analysiert', text: SCOTLAND_WALES });
}

function mitAufgenommenen(anzahl: number): Textstand {
  let stand = analysiert();
  for (const zeile of stand.zeilen.slice(0, anzahl)) {
    stand = textZug(stand, { art: 'aufgenommen', id: zeile.kandidat.id });
  }
  return stand;
}

const KONTEXT = { grade: '8', cefrLevel: 'A2/B1' } as const;

describe('der Name der Fähigkeit', () => {
  it('ist der serverseitig vorbereitete und kein zweiter', () => {
    /*
      Diese Zeile ist der ganze Zweck der Prüfung. Wer den Namen hier
      ändert, erfindet einen Vertrag, den die Serverfunktion nicht kennt
      — und merkt es erst, wenn das Portal am Gateway abprallt.
    */
    expect(TEXTVORSCHLAEGE).toBe('teacher-text/suggestions');
  });

  it('und die gebaute Nutzlast werden vom echten Serververtrag angenommen', () => {
    const payload = baueAnfrage(mitAufgenommenen(2).zeilen, KONTEXT);
    expect(textwerkstattAuftrag(TEXTVORSCHLAEGE, payload)).toBeDefined();
  });

  it('begrenzt Textausschnitte genauso wie der Server', () => {
    expect(GRENZE_AUSSCHNITT).toBe(TEXTWERKSTATT_MAX_AUSSCHNITT);
  });
});

describe('was hinausgeht', () => {
  it('fragt nur nach aufgenommenen Wörtern ohne Bedeutung', () => {
    const stand = mitAufgenommenen(3);
    expect(zuFragende(stand.zeilen)).toHaveLength(3);
    const gefuellt = textZug(stand, {
      art: 'zeile-geaendert',
      id: stand.zeilen[0]!.kandidat.id,
      teil: { german: 'etwas' },
    });
    expect(zuFragende(gefuellt.zeilen)).toHaveLength(2);
  });

  it('fragt gar nicht, solange nichts aufgenommen ist', () => {
    expect(zuFragende(analysiert().zeilen)).toHaveLength(0);
    expect(baueAnfrage(analysiert().zeilen, KONTEXT).candidates).toHaveLength(0);
  });

  it('sendet höchstens die Grenze, auch wenn mehr aufgenommen sind', () => {
    const stand = mitAufgenommenen(60);
    expect(stand.zeilen.filter((zeile) => zeile.aufgenommen).length).toBeGreaterThan(
      GRENZE_KANDIDATEN,
    );
    expect(baueAnfrage(stand.zeilen, KONTEXT).candidates).toHaveLength(GRENZE_KANDIDATEN);
  });

  it('lässt alle übrigen Kandidaten trotzdem von Hand erreichbar', () => {
    /*
      Die Grenze beschneidet die KI, nicht die Lehrkraft. Dass 67
      Kandidaten in der Liste stehen und nur 25 hinausgehen, ist genau
      die gewollte Asymmetrie.
    */
    const stand = mitAufgenommenen(60);
    expect(stand.zeilen.length).toBeGreaterThan(GRENZE_KANDIDATEN * 2);
  });

  it('sendet je Wort nur die Felder des Serververtrags und den einen Quellsatz', () => {
    const anfrage = baueAnfrage(mitAufgenommenen(2).zeilen, KONTEXT);
    expect(anfrage.context).toEqual(KONTEXT);
    for (const kandidat of anfrage.candidates) {
      expect(Object.keys(kandidat).sort()).toEqual([
        'english', 'id', 'occurrences', 'sourceSentence',
      ]);
      expect(Object.keys(kandidat)).not.toContain('text');
      expect(SCOTLAND_WALES).toContain(kandidat.sourceSentence);
    }
  });

  it('sendet nicht den ganzen Text', () => {
    const anfrage = baueAnfrage(mitAufgenommenen(5).zeilen, KONTEXT);
    const alles = JSON.stringify(anfrage);
    expect(alles).not.toContain('Singing is an important tradition');
    expect(alles.length).toBeLessThan(SCOTLAND_WALES.length);
  });
});

describe('die Antwort auslegen', () => {
  it('liest die erwartete Form', () => {
    const gelesen = leseAntwort({
      suggestions: [{ candidateId: 'a', german: 'die Hauptstadt', partOfSpeech: 'noun' }],
    });
    expect(gelesen).toEqual([{ kandidatId: 'a', german: 'die Hauptstadt', partOfSpeech: 'noun' }]);
  });

  it('liest genau die serverseitige Benennung', () => {
    expect(leseAntwort({ suggestions: [{ candidateId: 'b', german: 'der Chor' }] })).toEqual([
      { kandidatId: 'b', german: 'der Chor' },
    ]);
  });

  it('nimmt keinen zweiten Antwortvertrag an', () => {
    expect(leseAntwort([{ id: 'c', german: 'die Insel' }])).toEqual([]);
    expect(leseAntwort({ vorschlaege: [{ id: 'c', german: 'die Insel' }] })).toEqual([]);
  });

  it('wirft weg, was keine Kennung oder keinen Text hat', () => {
    expect(
      leseAntwort({
        suggestions: [
          { candidateId: 'd' },
          { german: 'ohne Kennung' },
          { candidateId: 'e', german: '   ' },
          { candidateId: 'f', german: 'gut' },
        ],
      }),
    ).toEqual([{ kandidatId: 'f', german: 'gut' }]);
  });

  it('übernimmt keine erfundene Wortart', () => {
    const gelesen = leseAntwort({
      suggestions: [{ candidateId: 'g', german: 'gut', partOfSpeech: 'Hauptwort' }],
    });
    expect(gelesen[0]).not.toHaveProperty('partOfSpeech');
  });

  it('stürzt an Unsinn nicht ab', () => {
    expect(leseAntwort(null)).toEqual([]);
    expect(leseAntwort('nein')).toEqual([]);
    expect(leseAntwort({ suggestions: 'nein' })).toEqual([]);
  });
});

describe('der Datenschutzsatz sagt die Wahrheit', () => {
  it('verspricht nicht, dass nichts den Browser verlässt', () => {
    const satz = datenschutzsatz(3);
    expect(satz).not.toMatch(/verlässt (den|nie)/i);
    expect(satz).toContain('3 aufgenommene Wörter');
    expect(satz).toContain('je einem Satz aus deinem Text');
  });

  it('sagt, dass ohne Klick nichts gesendet wird', () => {
    expect(datenschutzsatz(3)).toMatch(/Ohne diesen Klick wird nichts gesendet/);
  });

  it('verschweigt bei kurzen Texten nicht die mögliche Abdeckung', () => {
    expect(datenschutzsatz(1)).toContain('einen großen Teil des Textes abbilden');
    expect(datenschutzsatz(1)).toContain('Lerngruppen werden nicht mitgesendet');
  });

  it('fordert ohne Auswahl erst zur Auswahl auf', () => {
    expect(datenschutzsatz(0)).toMatch(/Nimm zuerst Wörter auf/);
  });
});
