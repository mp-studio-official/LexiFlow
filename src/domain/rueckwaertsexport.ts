import {
  VOCABPACK_KIND,
  type VocabEntry,
  type VocabPack,
  type VocabPackFile,
} from './schema';
import { APP_NAME, APP_VERSION } from './vocabpack';

/**
 * Ein Paket der Fassung 3 als Datei der Fassung 2 ausgeben (5B.8).
 *
 * ## Wozu
 *
 * Eine Lehrkraft, die ein Paket an eine Kollegin weitergibt, weiß nicht,
 * welche Fassung deren LexiFlow liest. Fassung 2 lehnt eine Datei der Fassung
 * 3 **ab** — richtig so, denn stillschweigend Felder zu verlieren wäre
 * schlimmer. Dieser Weg macht den Verlust zur ausdrücklichen Handlung.
 *
 * ## Was verlorengeht — und was nicht
 *
 * Entfernt werden **ausschließlich** die vier Felder, die Fassung 3
 * hinzugefügt hat: `occurrence`, `grammarNote`, `sourceSentence`,
 * `inflection`. Lernform, Übersetzungen, zusätzliche Antworten, Wortart,
 * Lemma, Ergänzungsmuster, Beispielsätze, Themen, Notizen, Schwierigkeit,
 * Quelle, Kennungen und die gesamten Metadaten bleiben Zeichen für Zeichen
 * stehen.
 *
 * ## Warum eine Verlustmeldung und kein Wahrheitswert
 *
 * „Es geht etwas verloren" beantwortet die Frage nicht, die jemand vor dem
 * Export hat: **Was** genau, und bei **welchen** Wörtern? Eine Oberfläche
 * (5B.10 und später) soll das zeigen können, ohne selbst nachzurechnen —
 * sonst entstünde dort eine zweite Vorstellung davon, was Fassung 3 ausmacht.
 *
 * ## Keine Oberfläche in 5B.8
 *
 * Diese Datei liefert Datei und Meldung. Ob, wann und wie gefragt wird,
 * entscheidet der Bildschirm, der sie benutzt — und den gibt es hier noch
 * nicht.
 */

/** Die Arten von Angaben, die beim Rückschritt auf Fassung 2 entfallen. */
export const VERLUSTARTEN = [
  'occurrence',
  'grammarNote',
  'sourceSentence',
  'inflection',
] as const;
export type Verlustart = (typeof VERLUSTARTEN)[number];

export const VERLUSTART_LABELS: Readonly<Record<Verlustart, string>> = {
  occurrence: 'Fundstelle',
  grammarNote: 'Grammatikhinweis',
  sourceSentence: 'Quellsatz',
  inflection: 'Flexionsformen',
};

/** Ein betroffener Eintrag, benannt und mit dem, was ihm fehlen wird. */
export interface VerlustEintrag {
  readonly entryId: string;
  /** Die Lernform – damit eine spätere Oberfläche das Wort nennen kann. */
  readonly english: string;
  readonly arten: readonly Verlustart[];
}

export interface Verlustmeldung {
  /** Ob überhaupt etwas entfällt. Die bequeme Frage, einmal beantwortet. */
  readonly verliert: boolean;
  /** Jeder betroffene Eintrag, in der Reihenfolge des Pakets. */
  readonly eintraege: readonly VerlustEintrag[];
  /** Alle Arten, die im ganzen Paket vorkommen – für eine kurze Warnung. */
  readonly arten: readonly Verlustart[];
}

export interface Rueckwaertsexport {
  /** Die Datei, wie sie geschrieben würde: `formatVersion: 2`. */
  readonly datei: VocabPackFile;
  readonly verlust: Verlustmeldung;
}

/** Welche der vier Angaben dieser Eintrag trägt. */
function artenVon(eintrag: VocabEntry): Verlustart[] {
  return VERLUSTARTEN.filter((art) => eintrag[art] !== undefined);
}

/**
 * Ein Eintrag ohne die vier Felder.
 *
 * Über die Liste und nicht über eine Aufzählung der zu behaltenden Felder:
 * Käme in Fassung 4 ein Feld dazu, das Fassung 2 nicht kennt, fiele es hier
 * **nicht** von selbst mit ab — und das soll auffallen, statt sich leise zu
 * erledigen. `VERLUSTARTEN` ist die Liste, die dann zu ergänzen ist, und die
 * Prüfungen daneben machen das Vergessen rot.
 */
function ohneFassung3(eintrag: VocabEntry): VocabEntry {
  const kopie = { ...eintrag };
  for (const art of VERLUSTARTEN) delete kopie[art];
  return kopie;
}

/**
 * @param pack Das Paket. Es wird **nicht** verändert – weder das Paket selbst
 *   noch seine Einträge noch deren verschachtelte Werte.
 */
export function alsVersion2(pack: VocabPack): Rueckwaertsexport {
  const betroffene: VerlustEintrag[] = [];
  const entries = pack.entries.map((eintrag) => {
    const arten = artenVon(eintrag);
    if (arten.length > 0) {
      betroffene.push({ entryId: eintrag.id, english: eintrag.english, arten });
    }
    /*
      Auch Einträge ohne die neuen Felder werden kopiert. Die Datei soll
      keine Objekte mit dem Paket teilen – sonst änderte ein späterer Griff
      in die Datei das Paket im Speicher mit.
    */
    return ohneFassung3(eintrag);
  });

  const arten = VERLUSTARTEN.filter((art) =>
    betroffene.some((eintrag) => eintrag.arten.includes(art)),
  );

  return {
    datei: {
      kind: VOCABPACK_KIND,
      formatVersion: 2,
      app: { name: APP_NAME, version: APP_VERSION },
      /*
        Die Metadaten unverändert – aber als Kopie. `meta` ist dasselbe
        Objekt wie im Paket, und eine Datei, die es teilt, ist eine Datei,
        die sich mitändert.
      */
      meta: { ...pack.meta },
      entries,
    },
    verlust: { verliert: betroffene.length > 0, eintraege: betroffene, arten },
  };
}

/** Die Datei als Text – derselbe Zuschnitt wie `serializePack`. */
export function serialisiereAlsVersion2(pack: VocabPack): {
  text: string;
  verlust: Verlustmeldung;
} {
  const { datei, verlust } = alsVersion2(pack);
  return { text: `${JSON.stringify(datei, null, 2)}\n`, verlust };
}
