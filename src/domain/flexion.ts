import { z } from 'zod';

/**
 * Flexionsangaben je Wortart — Schemafassung 3 (5B.8).
 *
 * ## Warum nach Wortart getrennt und nicht ein Sack voller Felder
 *
 * Ein Verb hat eine zweite und dritte Form, ein Substantiv einen Plural, ein
 * Adjektiv Steigerungsstufen. In **einem** Objekt mit allen Feldern optional
 * wäre jede Kombination erlaubt: ein Substantiv mit `pastParticiple`, ein
 * Verb mit `superlative`. Niemand schriebe das absichtlich, und genau deshalb
 * fiele es auch niemandem auf.
 *
 * Eine unterschiedene Vereinigung über `kind` macht aus „darf nicht" ein
 * „gibt es nicht": Der Typ kennt die Felder gar nicht, und die Prüfung lehnt
 * sie ab.
 *
 * `strictObject` und nicht `object`: Zod wirft unbekannte Schlüssel sonst
 * **stillschweigend weg**. Ein Substantiv mit `pastSimple` käme dann als
 * gültiges Substantiv heraus, und der Tippfehler wäre weg statt gemeldet.
 *
 * ## Warum nichts abgeleitet wird
 *
 * Aus `to tell` ließe sich mit einer Regel `telled` bilden, und das wäre
 * falsch. Aus `information` ließe sich `informations` bilden, und das wäre
 * ebenfalls falsch. Was hier steht, ist **belegt** — aus der Quelle, dem
 * Wörterbuch oder dem Unterrichtsmaterial. Eine erfundene Form ist schlimmer
 * als eine fehlende: Sie sieht geprüft aus und bringt jemandem etwas Falsches
 * bei.
 *
 * Dieselbe Entscheidung wie bei `complementPattern` in Fassung 2 — und sie
 * ist der Grund, warum die Migration 2 → 3 keinen einzigen Wert anfasst.
 */

/** Die Obergrenzen, einmal und an einer Stelle. */
export const FLEXION_GRENZEN = {
  /** Eine einzelne Wortform: `told`, `children`, `best`. */
  form: 80,
  /** Partikel und Präposition eines Verbs: `up`, `of`, `forward to`. */
  anhang: 40,
} as const;

/**
 * Eine Wortform: getrimmt, nicht leer, begrenzt.
 *
 * Als Vorverarbeitung und nicht als Prüfung: Eine leere Zeichenkette aus einer
 * Tabellenspalte, die niemand ausgefüllt hat, ist **keine Angabe**. Sie
 * abzulehnen machte aus einer leeren Zelle einen Importfehler; sie zu
 * speichern machte aus ihr eine Auskunft. Sie verschwindet.
 */
function form(max: number) {
  return z.preprocess(
    (wert) => (typeof wert === 'string' && wert.trim() === '' ? undefined : wert),
    z.string().trim().min(1).max(max),
  );
}

const pflichtform = form(FLEXION_GRENZEN.form);
const wahlform = form(FLEXION_GRENZEN.form).optional();
const wahlanhang = form(FLEXION_GRENZEN.anhang).optional();

/**
 * Verb.
 *
 * `base`, `pastSimple` und `pastParticiple` sind Pflicht — die drei Formen,
 * nach denen im Unterricht gefragt wird. Wer nur zwei davon hat, hat keine
 * Flexionsangabe, sondern eine halbe, und eine halbe Tabelle ist beim Lernen
 * schlimmer als keine.
 *
 * `irregular` ist ein ausdrücklicher Wahrheitswert und keine Ableitung aus
 * `base + 'ed' === pastSimple`. Die Ableitung läge bei `to travel` →
 * `travelled` daneben, und sie läge still daneben.
 *
 * `particle` und `preposition` trennen `to look up` von `to look forward to`:
 * Beide hängen an `look`, und erst der Anhang macht die Bedeutung.
 */
export const verbFlexionSchema = z.strictObject({
  kind: z.literal('verb'),
  base: pflichtform,
  pastSimple: pflichtform,
  pastParticiple: pflichtform,
  thirdPerson: wahlform,
  presentParticiple: wahlform,
  irregular: z.boolean(),
  particle: wahlanhang,
  preposition: wahlanhang,
});

/**
 * Substantiv.
 *
 * Drei Fälle, und die Prüfung unten lässt nur diese drei zu:
 *
 * | Fall | Singular | Plural |
 * | --- | --- | --- |
 * | regulär | Pflicht | Pflicht |
 * | `uncountable` | Pflicht | **verboten** |
 * | `pluralOnly` | **verboten** | Pflicht |
 *
 * „Verboten" und nicht „optional": `information` hat keinen Plural, und ein
 * Feld, das dort leer bleibt, sagt dasselbe wie ein Feld mit `informations` —
 * nämlich nichts, was man unterscheiden könnte. Ein ausdrücklich verbotenes
 * Feld macht aus dem Versehen einen Fehler.
 *
 * `uncountable` und `pluralOnly` schließen sich aus. Ein Wort, das beides
 * wäre, hätte weder Singular noch Plural, und dann gäbe es nichts zu
 * flektieren.
 */
export const substantivFlexionSchema = z
  .strictObject({
    kind: z.literal('noun'),
    singular: wahlform,
    plural: wahlform,
    uncountable: z.boolean().optional(),
    pluralOnly: z.boolean().optional(),
  })
  .superRefine((wert, ctx) => {
    if (wert.uncountable && wert.pluralOnly) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Ein Substantiv kann nicht gleichzeitig unzählbar und nur im Plural sein.',
        path: ['uncountable'],
      });
      return;
    }

    if (wert.uncountable) {
      if (wert.singular === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ein unzählbares Substantiv braucht seine Singularform.',
          path: ['singular'],
        });
      }
      if (wert.plural !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ein unzählbares Substantiv hat keinen Plural – bitte keinen erfinden.',
          path: ['plural'],
        });
      }
      return;
    }

    if (wert.pluralOnly) {
      if (wert.plural === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ein Pluraliatantum braucht seine Pluralform.',
          path: ['plural'],
        });
      }
      if (wert.singular !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Ein Pluraliatantum hat keinen Singular – bitte keinen erfinden.',
          path: ['singular'],
        });
      }
      return;
    }

    for (const feld of ['singular', 'plural'] as const) {
      if (wert[feld] === undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Ein zählbares Substantiv braucht Singular und Plural. Ist eine Form sprachlich ' +
            'nicht vorhanden, gehört `uncountable` oder `pluralOnly` dazu.',
          path: [feld],
        });
      }
    }
  });

/**
 * Adjektiv.
 *
 * Beide Steigerungsformen sind **optional und unabhängig**. `unique` hat
 * keine, `good` hat beide, und es gibt Fälle, in denen das Material nur eine
 * nennt. Sie zu Paaren zu zwingen hieße, die fehlende zu erfinden — und
 * `uniquer` ist genau die Art Form, die niemand lernen soll.
 */
export const adjektivFlexionSchema = z.strictObject({
  kind: z.literal('adjective'),
  comparative: wahlform,
  superlative: wahlform,
});

export const flexionSchema = z.discriminatedUnion('kind', [
  verbFlexionSchema,
  substantivFlexionSchema,
  adjektivFlexionSchema,
]);

export type VerbFlexion = z.infer<typeof verbFlexionSchema>;
export type SubstantivFlexion = z.infer<typeof substantivFlexionSchema>;
export type AdjektivFlexion = z.infer<typeof adjektivFlexionSchema>;
export type Flexion = z.infer<typeof flexionSchema>;

/** Die Wortarten, zu denen es überhaupt eine Flexionsangabe gibt. */
export const FLEKTIERBARE_WORTARTEN = ['noun', 'verb', 'adjective'] as const;
