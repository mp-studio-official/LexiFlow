import type { PartOfSpeech } from '../../../domain/schema';
import {
  type TextCandidate,
  analyzeText,
  candidateLiteral,
  describeCandidateForms,
  describeCandidateInflections,
} from '../../../domain/textExtraction';
import { contextPartOfSpeech } from '../../../import/contextPartOfSpeech';
import { draftsToEntries } from '../../../import/draft';
import { type SourcePick } from '../../../import/sourcePick';
import { type CandidateSelection, candidatesToDrafts } from '../../../import/textDraft';
import type { GepruefterEntwurf } from './zustand';

/**
 * Die Textwerkstatt als Zustandsautomat.
 *
 * ## Was sie wiederherstellt
 *
 * Den Ablauf, den die Lehrkraftdatei seit Sprint 3B hat und den das
 * Portal nie bekam: Rohtext einfügen, lokal analysieren, Kandidaten im
 * Quelltext sehen, auswählen, prüfen, als Entwurf anlegen. Nichts davon
 * ist hier neu erfunden — `analyzeText`, `contextPartOfSpeech`,
 * `candidatesToDrafts` und `draftsToEntries` standen alle schon da.
 *
 * ## Vier Zusagen, die hier und nicht in der Oberfläche stehen
 *
 * 1. **Nichts ist vorausgewählt.** Jede Zeile beginnt mit
 *    `aufgenommen: false`. Ein Vorschlag, der schon angehakt ist, ist
 *    kein Vorschlag mehr, sondern eine Voreinstellung, die jemand
 *    übersieht.
 * 2. **Eingaben der Lehrkraft werden nie überschrieben.** Ein
 *    maschineller Vorschlag landet nur in einem Feld, das leer *und*
 *    unberührt ist. Was sie getippt hat, bleibt stehen — auch wenn der
 *    Vorschlag eine Sekunde später eintrifft.
 * 3. **Erfundene Wörter kommen nicht durch.** Ein Vorschlag zu einer
 *    Kennung, die es im Text nicht gibt, wird verworfen und gezählt.
 * 4. **Der Quellsatz bleibt der Quellsatz.** Er stammt aus
 *    `analyzeText` und wird hier nirgends neu gebildet.
 *
 * ## Warum es keinen Netzzugriff gibt
 *
 * Weil `src/integrationsgrenze.test.ts` ihn dieser Ordnung verbietet —
 * und zu Recht: Ein Automat, der selbst einen Anbieter ruft, lässt sich
 * nur noch mit Netz prüfen. Die KI ist hier ein **Zug**
 * (`ki-vorschlaege`), den die Seite auslöst, nachdem sie den Gateway
 * gefragt hat.
 */

/** Was mit einem Kandidaten geschehen soll — eine Zeile der Prüfliste. */
export interface Kandidatenzeile {
  readonly kandidat: TextCandidate;
  /** Übernimmt die Lehrkraft diesen Kandidaten? Vorgabe: nein. */
  readonly aufgenommen: boolean;
  readonly german: string;
  readonly partOfSpeech: PartOfSpeech | '';
  /** `to depend on`, `restraints (pl.)` — leer heisst: die Textform gilt. */
  readonly learningForm: string;
  readonly beispielsatzUebernehmen: boolean;
  readonly germanSentence: string;
  /** Ein maschineller Vorschlag wurde unverändert übernommen. */
  readonly vorschlagUebernommen: boolean;
  /**
   * Hat die Lehrkraft an dieser Zeile etwas getippt?
   *
   * Der Merkposten für Zusage 2. Ohne ihn liesse sich „leer, weil noch
   * nichts da" nicht von „leer, weil bewusst geleert" unterscheiden —
   * und ein eintreffender Vorschlag füllte das zweite wieder auf.
   */
  readonly beruehrt: boolean;
  readonly herkunft: 'analyse' | 'quelltext';
}

export type Textschritt = 'quelle' | 'analysiert';
export type Kistand = 'aus' | 'laeuft' | 'fertig' | 'gescheitert';

export interface Textstand {
  readonly schritt: Textschritt;
  readonly text: string;
  readonly titel: string;
  /** In Textreihenfolge — so, wie die Wörter im Quelltext stehen. */
  readonly zeilen: readonly Kandidatenzeile[];
  readonly saetze: number;
  readonly ausgeblendeteFunktionswoerter: number;
  readonly ausgeblendeteEigennamen: number;
  readonly kiStand: Kistand;
  readonly kiMeldung?: string;
  /** Vorschläge, die zu keinem Wort aus dem Text gehörten. */
  readonly kiVerworfen: number;
}

/** Ein Übersetzungsvorschlag, wie ihn die Seite vom Gateway zurückbringt. */
export interface Uebersetzungsvorschlag {
  readonly kandidatId: string;
  readonly german: string;
  readonly partOfSpeech?: PartOfSpeech;
  readonly learningForm?: string;
}

export type Textzug =
  | { readonly art: 'text-analysiert'; readonly text: string }
  | { readonly art: 'aufgenommen'; readonly id: string }
  | { readonly art: 'abgewaehlt'; readonly id: string }
  | {
      readonly art: 'zeile-geaendert';
      readonly id: string;
      readonly teil: Partial<
        Pick<
          Kandidatenzeile,
          'german' | 'partOfSpeech' | 'learningForm' | 'beispielsatzUebernehmen' | 'germanSentence'
        >
      >;
    }
  | { readonly art: 'aus-quelltext'; readonly auswahl: SourcePick }
  | { readonly art: 'ki-gestartet' }
  | { readonly art: 'ki-vorschlaege'; readonly vorschlaege: readonly Uebersetzungsvorschlag[] }
  | { readonly art: 'ki-gescheitert'; readonly grund: string }
  | { readonly art: 'titel-geaendert'; readonly titel: string }
  | { readonly art: 'verworfen' };

export function textanfang(): Textstand {
  return {
    schritt: 'quelle',
    text: '',
    titel: '',
    zeilen: [],
    saetze: 0,
    ausgeblendeteFunktionswoerter: 0,
    ausgeblendeteEigennamen: 0,
    kiStand: 'aus',
    kiVerworfen: 0,
  };
}

/** Derselbe Stand ohne KI-Meldung — `exactOptionalPropertyTypes`. */
function ohneKiMeldung(stand: Textstand): Textstand {
  const { kiMeldung: _weg, ...rest } = stand;
  return rest;
}

/**
 * Eine frische Zeile zu einem Kandidaten.
 *
 * Die Wortart kommt aus dem **Satz**, nicht aus einem Wörterbuch: Das
 * Portal hat keines, und `contextPartOfSpeech` schweigt lieber, als zu
 * raten. Alles andere bleibt leer — erfunden wird hier nichts.
 */
function neueZeile(
  kandidat: TextCandidate,
  herkunft: Kandidatenzeile['herkunft'],
): Kandidatenzeile {
  return {
    kandidat,
    aufgenommen: false,
    german: '',
    partOfSpeech: contextPartOfSpeech(kandidat.sourceSentence, candidateLiteral(kandidat)) ?? '',
    learningForm: '',
    beispielsatzUebernehmen: true,
    germanSentence: '',
    vorschlagUebernommen: false,
    beruehrt: false,
    herkunft,
  };
}

function ersetze(
  zeilen: readonly Kandidatenzeile[],
  id: string,
  wandle: (zeile: Kandidatenzeile) => Kandidatenzeile,
): readonly Kandidatenzeile[] {
  return zeilen.map((zeile) => (zeile.kandidat.id === id ? wandle(zeile) : zeile));
}

export function textZug(stand: Textstand, zug: Textzug): Textstand {
  switch (zug.art) {
    case 'text-analysiert': {
      const analyse = analyzeText(zug.text, { sort: 'text-order' });
      return {
        ...ohneKiMeldung(stand),
        schritt: 'analysiert',
        text: zug.text,
        zeilen: analyse.candidates.map((kandidat) => neueZeile(kandidat, 'analyse')),
        saetze: analyse.sentenceCount,
        ausgeblendeteFunktionswoerter: analyse.hiddenStopwords,
        ausgeblendeteEigennamen: analyse.hiddenProperNouns,
        kiStand: 'aus',
        kiVerworfen: 0,
      };
    }

    case 'aufgenommen':
      return { ...stand, zeilen: ersetze(stand.zeilen, zug.id, (zeile) => ({ ...zeile, aufgenommen: true })) };

    case 'abgewaehlt':
      /*
        Abwählen löscht die Zeile nicht.

        Wer ein Wort versehentlich abwählt und wieder anhakt, bekommt
        seine Übersetzung zurück. Eine gelöschte Zeile wäre getippte
        Arbeit, die ein Klick vernichtet.
      */
      return { ...stand, zeilen: ersetze(stand.zeilen, zug.id, (zeile) => ({ ...zeile, aufgenommen: false })) };

    case 'zeile-geaendert':
      return {
        ...stand,
        zeilen: ersetze(stand.zeilen, zug.id, (zeile) => ({
          ...zeile,
          ...zug.teil,
          /*
            Von Hand geändert heisst: ab jetzt gehört dieses Feld der
            Lehrkraft. Ein später eintreffender Vorschlag fasst es nicht
            mehr an — auch dann nicht, wenn sie es wieder geleert hat.
          */
          beruehrt: true,
          vorschlagUebernommen: zug.teil.german === undefined ? zeile.vorschlagUebernommen : false,
        })),
      };

    case 'aus-quelltext': {
      if (zug.auswahl.kind !== 'new') return stand;
      const neu = zug.auswahl.candidate;
      if (stand.zeilen.some((zeile) => zeile.kandidat.id === neu.id)) return stand;
      /*
        Direkt aufgenommen, und das ist hier kein Widerspruch zu
        „nichts ist vorausgewählt": Wer ein Wort im Quelltext markiert
        und aufnimmt, hat die Auswahl gerade getroffen. Ein Wort, das
        danach erst angehakt werden müsste, wäre ein zweiter Klick für
        dieselbe Entscheidung.
      */
      const zeile = { ...neueZeile(neu, 'quelltext'), aufgenommen: true };
      return { ...stand, zeilen: [...stand.zeilen, zeile] };
    }

    case 'ki-gestartet':
      return { ...ohneKiMeldung(stand), kiStand: 'laeuft' };

    case 'ki-vorschlaege': {
      const bekannt = new Set(stand.zeilen.map((zeile) => zeile.kandidat.id));
      const brauchbar = zug.vorschlaege.filter(
        (vorschlag) => bekannt.has(vorschlag.kandidatId) && vorschlag.german.trim().length > 0,
      );
      const nachId = new Map(brauchbar.map((vorschlag) => [vorschlag.kandidatId, vorschlag]));

      return {
        ...ohneKiMeldung(stand),
        kiStand: 'fertig',
        kiVerworfen: zug.vorschlaege.length - brauchbar.length,
        zeilen: stand.zeilen.map((zeile) => {
          const vorschlag = nachId.get(zeile.kandidat.id);
          /*
            Zusage 2, hier und nur hier. `beruehrt` schlägt jeden
            Vorschlag, und ein nicht leeres Feld ebenso — ein Vorschlag
            überschreibt nie etwas, er füllt nur Leeres.
          */
          if (!vorschlag || zeile.beruehrt || zeile.german.trim().length > 0) return zeile;
          return {
            ...zeile,
            german: vorschlag.german.trim(),
            partOfSpeech: zeile.partOfSpeech || (vorschlag.partOfSpeech ?? ''),
            learningForm: zeile.learningForm || (vorschlag.learningForm ?? ''),
            vorschlagUebernommen: true,
          };
        }),
      };
    }

    case 'ki-gescheitert':
      return { ...stand, kiStand: 'gescheitert', kiMeldung: zug.grund };

    case 'titel-geaendert':
      return { ...stand, titel: zug.titel };

    case 'verworfen':
      return textanfang();
  }
}

/** Die aufgenommenen Zeilen, in Textreihenfolge. */
export function aufgenommene(stand: Textstand): readonly Kandidatenzeile[] {
  return stand.zeilen.filter((zeile) => zeile.aufgenommen);
}

/**
 * Was der Lehrkraft zum Speichern noch fehlt — als Sätze, nicht als `false`.
 *
 * Ein gesperrter Knopf ohne Grund ist eine Sackgasse: Man sieht, dass es
 * nicht geht, und nicht, woran es liegt.
 */
export function wasFehlt(stand: Textstand): readonly string[] {
  const fehlt: string[] = [];
  if (stand.titel.trim().length === 0) fehlt.push('Dem Lernpaket fehlt noch ein Name.');
  const gewaehlt = aufgenommene(stand);
  if (gewaehlt.length === 0) fehlt.push('Es ist noch kein Wort aufgenommen.');
  const ohneAntwort = gewaehlt.filter((zeile) => zeile.german.trim().length === 0);
  if (ohneAntwort.length > 0) {
    fehlt.push(
      ohneAntwort.length === 1
        ? `„${ohneAntwort[0]!.kandidat.english}" hat noch keine deutsche Bedeutung.`
        : `${ohneAntwort.length} aufgenommene Wörter haben noch keine deutsche Bedeutung.`,
    );
  }
  return fehlt;
}

export function textIstFertig(stand: Textstand): boolean {
  return stand.schritt === 'analysiert' && wasFehlt(stand).length === 0;
}

/** Die Übergabe an den bestehenden Entwurfsweg — ohne zweite Editorlogik. */
export function auswahlAlsSelektionen(stand: Textstand): CandidateSelection[] {
  return aufgenommene(stand).map((zeile) => ({
    candidate: zeile.kandidat,
    german: zeile.german,
    partOfSpeech: zeile.partOfSpeech,
    learningForm: zeile.learningForm,
    translationAccepted: zeile.vorschlagUebernommen,
    includeSentence: zeile.beispielsatzUebernehmen,
    ...(zeile.germanSentence.trim() ? { germanSentence: zeile.germanSentence } : {}),
  }));
}

/**
 * Der geprüfte Entwurf — oder nichts.
 *
 * `'import'` als Rückfallebene und nicht `'text-ai'`: Welche Zeile
 * tatsächlich aus einem maschinellen Vorschlag stammt, hat
 * `candidatesToDrafts` schon je Zeile entschieden, und `draftsToEntries`
 * lässt die Zeilenangabe gewinnen. Ein pauschales `'text-ai'` behauptete
 * über jede Zeile etwas, das nur für manche stimmt.
 */
export function textEntwurf(stand: Textstand): GepruefterEntwurf | undefined {
  if (!textIstFertig(stand)) return undefined;
  const zeilen = candidatesToDrafts(auswahlAlsSelektionen(stand));
  return { titel: stand.titel.trim(), eintraege: draftsToEntries(zeilen, 'import') };
}

/** Wie ein Wort im Quelltext aussehen soll. */
export function wortzustand(stand: Textstand, kandidatId: string): 'taken' | 'listed' | 'open' {
  const zeile = stand.zeilen.find((eintrag) => eintrag.kandidat.id === kandidatId);
  if (!zeile || !zeile.aufgenommen) return 'open';
  return zeile.german.trim().length > 0 ? 'taken' : 'listed';
}

/** „Im Text: island, islands · insgesamt 18-mal“ — und die Beugungen. */
export function formbeschreibung(zeile: Kandidatenzeile): {
  readonly formen: string;
  readonly beugungen: readonly string[];
} {
  return {
    formen: describeCandidateForms(zeile.kandidat),
    beugungen: describeCandidateInflections(zeile.kandidat),
  };
}
