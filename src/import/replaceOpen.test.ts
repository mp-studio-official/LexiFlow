import { describe, expect, it } from 'vitest';
import { analyzeText } from '../domain/textExtraction';
import {
  describeReplacement,
  familyKeys,
  looksLikePublication,
  recommend,
  replaceOpenRecommendations,
  type RecommendationInput,
  type ReplaceableRow,
  type ScoredCandidate,
} from './recommendation';
import { ATTRITIONAL_COMBAT_TEXT } from './fixtures/attritionalCombat';

/**
 * „Offene Empfehlungen ersetzen“ – die Rechnung dahinter, ohne Oberfläche.
 *
 * Der geprüfte Ablauf ist der aus dem Auftrag: zehn Empfehlungen, sieben
 * beantwortet, drei offen. Ein Klick, und danach müssen genau drei neue
 * dastehen, die sieben unverändert und die drei alten wiederfindbar sein.
 */

interface Row extends ReplaceableRow {
  german: string;
  /** Nur für den Test: etwas, das beim Nachbauen verloren ginge. */
  notiz?: string;
}

const analysis = analyzeText(ATTRITIONAL_COMBAT_TEXT);
const publicationContext = looksLikePublication(ATTRITIONAL_COMBAT_TEXT);
const inputs: RecommendationInput[] = analysis.candidates.map((candidate) => ({ candidate }));
const context = { grade: 'Q1', cefrLevel: 'B2/C1' } as const;

function toRow(scored: ScoredCandidate): Row {
  return { candidate: scored.candidate, german: '', families: scored.families };
}

/** Zehn Empfehlungen, davon die ersten sieben beantwortet. */
function startingPoint(): Row[] {
  return recommend(inputs, { context, sort: 'recommended', count: 10, publicationContext })
    .map(toRow)
    .map((row, index) =>
      index < 7 ? { ...row, german: `Antwort ${index}`, notiz: `Notiz ${index}` } : row,
    );
}

function replace(rows: readonly Row[], earlier: readonly Row[] = []) {
  return replaceOpenRecommendations<Row>({
    inputs,
    rows,
    earlier,
    context,
    sort: 'recommended',
    count: 10,
    publicationContext,
    excludeShown: true,
    toRow,
  });
}

describe('Zehn Empfehlungen, sieben beantwortet, drei offen', () => {
  const rows = startingPoint();

  it('geht von genau dieser Lage aus', () => {
    expect(rows).toHaveLength(10);
    expect(rows.filter((row) => row.german).length).toBe(7);
    expect(rows.filter((row) => !row.german).length).toBe(3);
  });

  it('lässt die sieben beantworteten unangetastet – als dieselben Objekte', () => {
    /*
      `toBe`, nicht `toEqual`: Die Zeilen dürfen nicht neu gebaut werden. Ein
      Nachbau sähe im Test gleich aus und verlöre in der Oberfläche alles, was
      nicht mit abgeschrieben wurde – Wortart, übernommener Vorschlag,
      Übersetzungszustand.
    */
    const result = replace(rows);
    const beantwortet = rows.filter((row) => row.german);
    for (const [index, row] of beantwortet.entries()) {
      expect(result.rows[index]).toBe(row);
      expect(result.rows[index]?.notiz).toBe(row.notiz);
    }
  });

  it('legt genau drei neue nach', () => {
    const result = replace(rows);
    expect(result.added).toBe(3);
    expect(result.requested).toBe(3);
    expect(result.rows).toHaveLength(10);
    expect(result.rows.filter((row) => !row.german)).toHaveLength(3);
  });

  it('legt die drei offenen unter „Frühere Empfehlungen“, neueste zuerst', () => {
    const result = replace(rows);
    const offen = rows.filter((row) => !row.german);
    expect(result.earlier).toHaveLength(3);
    expect(result.earlier.map((row) => row.candidate.id)).toEqual(
      offen.map((row) => row.candidate.id),
    );
  });

  it('schlägt keine Familie erneut vor – weder aktuelle noch frühere', () => {
    const result = replace(rows);
    const verbraucht = new Set<string>();
    for (const row of [...rows, ...result.earlier]) {
      for (const family of row.families) verbraucht.add(family);
    }
    const neue = result.rows.filter((row) => !row.german);
    for (const row of neue) {
      for (const family of row.families) {
        expect(verbraucht.has(family)).toBe(false);
      }
    }
  });

  it('bleibt über mehrere Runden konsistent', () => {
    // Dreimal ersetzen: Nichts kommt zurück, und die sieben stehen weiter.
    let current = replace(rows);
    const gesehen = new Set(rows.map((row) => row.candidate.id));
    for (let runde = 0; runde < 2; runde += 1) {
      for (const row of current.rows) gesehen.add(row.candidate.id);
      const next = replace(current.rows, current.earlier);
      for (const row of next.rows.filter((row) => !row.german)) {
        expect(gesehen.has(row.candidate.id)).toBe(false);
      }
      current = next;
    }
    expect(current.rows.filter((row) => row.german)).toHaveLength(7);
  });
});

describe('Wenn der Text nicht mehr hergibt', () => {
  it('nennt die echte Anzahl, statt aufzufüllen', () => {
    const kurz = analyzeText('Coastal erosion threatens the settlement near the harbour.');
    const kleineAuswahl: RecommendationInput[] = kurz.candidates.map((candidate) => ({
      candidate,
    }));
    const alle = recommend(kleineAuswahl, {
      context,
      sort: 'recommended',
      count: 20,
    }).map(toRow);

    const result = replaceOpenRecommendations<Row>({
      inputs: kleineAuswahl,
      rows: alle,
      earlier: [],
      context,
      sort: 'recommended',
      count: 20,
      excludeShown: true,
      toRow,
    });

    expect(result.added).toBe(0);
    expect(result.requested).toBe(20);
    expect(describeReplacement(result)).toMatch(/keine weiteren Vokabeln her/);
  });

  it('sagt es auch, wenn nur ein Teil nachkommt', () => {
    expect(describeReplacement({ added: 2, requested: 5 })).toMatch(/gewünscht waren 5/);
    expect(describeReplacement({ added: 2, requested: 5 })).toMatch(/erfunden wird nichts/);
    expect(describeReplacement({ added: 3, requested: 3 })).toBe(
      '3 neue Empfehlungen. Die ersetzten stehen unter „Frühere Empfehlungen“.',
    );
    expect(describeReplacement({ added: 1, requested: 1 })).toMatch(/^1 neue Empfehlung\./);
    expect(describeReplacement({ added: 0, requested: 0 })).toBe('Es war keine Empfehlung offen.');
  });
});

describe('Neu berechnen ist etwas anderes als ersetzen', () => {
  it('darf ein zurückgelegtes Wort wiederbringen, ersetzen darf es nicht', () => {
    /*
      Beim Ersetzen sollen ausdrücklich **andere** Wörter kommen. Wer aber eine
      Einstellung ändert, will die Liste neu – und ein Wort, das jetzt passt,
      darf wieder auftauchen, auch wenn es vorhin weggeklickt wurde.

      Geprüft an einem Text, der so wenig hergibt, dass der Unterschied
      eindeutig ist: Mit Ausschluss kommt nichts nach, ohne Ausschluss schon.
    */
    const kurz = analyzeText('Coastal erosion threatens the settlement near the harbour.');
    const kleineAuswahl: RecommendationInput[] = kurz.candidates.map((candidate) => ({
      candidate,
    }));
    const alle = recommend(kleineAuswahl, { context, sort: 'recommended', count: 20 }).map(toRow);

    const gemeinsam = {
      inputs: kleineAuswahl,
      rows: alle,
      earlier: [],
      context,
      sort: 'recommended',
      count: 20,
      toRow,
    } as const;

    const ersetzt = replaceOpenRecommendations<Row>({ ...gemeinsam, excludeShown: true });
    const neuBerechnet = replaceOpenRecommendations<Row>({ ...gemeinsam, excludeShown: false });

    expect(ersetzt.added).toBe(0);
    expect(neuBerechnet.added).toBe(alle.length);
  });

  it('lässt nichts gleichzeitig oben und unter „Frühere Empfehlungen“ stehen', async () => {
    /*
      Ein echter Fehler aus dem ersten Anlauf: Beim Neuberechnen wanderten die
      offenen Zeilen nach unten und kamen oben sofort wieder – dieselbe Vokabel
      stand zweimal auf der Seite, einmal mit „Entfernen“ und einmal mit
      „Wieder aufnehmen“.
    */
    const kurz = analyzeText('Coastal erosion threatens the settlement near the harbour.');
    const kleineAuswahl: RecommendationInput[] = kurz.candidates.map((candidate) => ({
      candidate,
    }));
    const alle = recommend(kleineAuswahl, { context, sort: 'recommended', count: 20 }).map(toRow);

    const result = replaceOpenRecommendations<Row>({
      inputs: kleineAuswahl,
      rows: alle,
      earlier: [],
      context,
      sort: 'recommended',
      count: 20,
      excludeShown: false,
      toRow,
    });

    const oben = new Set(result.rows.map((row) => row.candidate.id));
    for (const row of result.earlier) expect(oben.has(row.candidate.id)).toBe(false);
  });
});

describe('Familienschlüssel eines Mehrwortbegriffs', () => {
  it('beansprucht auch seine Teile', () => {
    // Die Teile werden auf ihre Grundform zurückgeführt: `casualties` → `casualty`.
    expect(familyKeys('psychological casualties')).toContain('psychological');
    expect(familyKeys('psychological casualties')).toContain('casualty');
    expect(familyKeys('resilience')).toEqual(['resilience']);
  });
});
