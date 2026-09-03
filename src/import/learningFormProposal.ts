import { buildLearningForm } from '../domain/learningForm';
import { guessPartOfSpeech } from '../domain/wordRules';
import { collapseWhitespace } from '../domain/wordMatch';
import { partOfSpeechOf, type DictionarySuggestionSummary } from './dictionarySuggestions';
import type { GrammaticalNumber, PartOfSpeech } from '../domain/schema';

/**
 * Aus einem gefundenen Wort eine **lernbare** Form machen – oder ehrlich
 * sagen, dass es nicht reicht.
 *
 * ## Das Problem
 *
 * Die Textanalyse findet Wörter so, wie sie im Text stehen: `depend`,
 * `single`, `restraints`, `attainable`. Als Vokabel taugt davon keines. Ein
 * Vokabelheft schreibt `to depend on sb./sth.`, `to single out sb./sth.`,
 * `restraints (pl.)`, `attainable (adj.)` – weil die Rektion, die Partikel und
 * die Wortart zur Vokabel gehören. Wer `depend` lernt, schreibt später
 * `depend of`.
 *
 * ## Die Regel, an der sich alles entscheidet
 *
 * **Nichts wird erfunden.** Eine Präposition, ein Partikel, eine Wortart
 * kommen entweder aus einer Quelle, die es belegt – oder sie kommen nicht.
 * Und wo etwas fehlt oder unsicher ist, sagt der Vorschlag das (`needsReview`)
 * und niemand übernimmt ihn stillschweigend.
 *
 * Zulässige Quellen, in dieser Reihenfolge:
 *
 * | Quelle | Beispiel | Verlässlichkeit |
 * | --- | --- | --- |
 * | Eingabe der Lehrkraft | `to depend on sb./sth.` | gilt unverändert |
 * | Wörterbuch, eindeutig | `single out` → `verb`, Mehrwortbegriff | übernommen |
 * | Wortbildungsregel, eindeutig | `-ly` ohne Ausnahme → Adverb | übernommen |
 * | Belegsatz | „…depend **on** natural barriers…“ | **nur mit Rückfrage** |
 *
 * Die letzte Zeile ist die interessante. Dass im Satz hinter `depend` ein `on`
 * steht, ist ein Hinweis und kein Beweis: In „to arrive on Monday“ steht
 * hinter dem Verb auch eine Präposition, und die gehört nicht zum Wort. Der
 * Vorschlag nennt deshalb die Möglichkeit und überlässt die Entscheidung der
 * Lehrkraft – er trifft sie nicht.
 *
 * ## Was dieses Modul ausdrücklich **nicht** tut
 *
 * Es hat keine Tabelle „welches Verb hat welche Rektion“. Die wäre nach
 * zwanzig Einträgen unvollständig und nach fünfzig falsch, und sie würde
 * genau dort raten, wo Raten am teuersten ist – in dem Feld, das die Lernenden
 * anschließend auswendig lernen.
 */

/** Woher ein Bestandteil der Lernform stammt. */
export type LearningFormEvidence =
  /** Stand so in der Quelle oder in der Eingabe. */
  | 'written'
  /** Vom Offline-Wörterbuch bestätigt. */
  | 'dictionary'
  /** Aus einer eindeutigen Wortbildungsregel. */
  | 'rule'
  /** Aus dem Belegsatz abgelesen – ein Hinweis, keine Auskunft. */
  | 'sentence';

export interface LearningFormProposal {
  /** Die vorgeschlagene Lernform – das, was auf der Karte stehen soll. */
  english: string;
  /** Das Lemma zum Nachschlagen, Suchen und Dublettenprüfen. */
  lemma: string;
  partOfSpeech: PartOfSpeech | '';
  grammaticalNumber: GrammaticalNumber | '';
  /** Die belegte Rektion. Leer heißt „nicht belegt“, nie „gibt es nicht“. */
  complementPattern: string;
  /** Welche Quellen beigetragen haben – für die Herkunftsanzeige. */
  evidence: LearningFormEvidence[];
  /** Muss jemand hinsehen, bevor das ins Paket geht? */
  needsReview: boolean;
  /** Warum – ein Satz für die Oberfläche. Leer, wenn nichts offen ist. */
  reviewReason: string;
  /**
   * Die Form, die bei Bestätigung entstünde – etwa `to depend on sb./sth.`
   * Nur gesetzt, wenn `needsReview` an einer *konkreten* Vermutung hängt.
   */
  reviewSuggestion?: string;
}

/**
 * Partikel und Präpositionen, die hinter einem Verb zur Vokabel gehören
 * **können**.
 *
 * Die Liste entscheidet nichts – sie legt nur fest, wann überhaupt
 * nachgefragt wird. Steht im Satz hinter dem Verb etwas anderes (ein Artikel,
 * ein Substantiv), gibt es keine Frage und auch keinen Hinweis.
 */
const PARTICLES = new Set([
  'about', 'across', 'after', 'against', 'along', 'around', 'at', 'away',
  'back', 'by', 'down', 'for', 'from', 'in', 'into', 'of', 'off', 'on',
  'onto', 'out', 'over', 'through', 'to', 'towards', 'under', 'up', 'upon',
  'with', 'without',
]);

/** Die Wortarten, deren Kürzel überhaupt in der Lernform stehen kann. */
const MARKED_PARTS: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'noun',
  'adjective',
  'adverb',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Das Wort, das im Satz unmittelbar hinter der Vokabel steht – wenn es ein
 * Partikel oder eine Präposition ist.
 *
 * Öffentlich, weil der Aufrufer damit entscheidet, ob er das Wörterbuch ein
 * zweites Mal fragt (nach `single out` statt nur nach `single`). Diese Frage
 * kostet einen Nachschlag und lohnt sich nur, wenn überhaupt etwas dasteht.
 */
export function particleAfter(sentence: string, word: string): string | undefined {
  const head = collapseWhitespace(word);
  if (!head || !sentence) return undefined;

  const pattern = new RegExp(`\\b${escapeRegExp(head)}\\w*\\s+([\\p{L}']+)`, 'iu');
  const match = pattern.exec(sentence);
  const next = match?.[1]?.toLowerCase();
  return next && PARTICLES.has(next) ? next : undefined;
}

export interface LearningFormInput {
  /** Die Form, wie sie in der Quelle steht oder eingegeben wurde. */
  written: string;
  /** Der Satz, in dem sie stand. Die einzige zulässige Quelle für Partikel. */
  sourceSentence?: string | undefined;
  /** Der Wörterbuchbefund zum Stichwort selbst. */
  dictionary?: DictionarySuggestionSummary | undefined;
  /**
   * Der Wörterbuchbefund zu `written` **plus Partikel** – falls der Satz einen
   * hergab und der Aufrufer danach gesucht hat. Ein Treffer hier ist der
   * Unterschied zwischen `to single out` (belegt) und `to depend on`
   * (vermutet).
   */
  phrase?: DictionarySuggestionSummary | undefined;
  /** Von der Lehrkraft gesetzte Wortart. Schlägt jede Ermittlung. */
  partOfSpeech?: PartOfSpeech | '' | undefined;
  /**
   * Das Wortartkürzel mitschreiben – `attainability (n.)`, `attainable (adj.)`.
   *
   * ## Warum das der Aufrufer entscheidet und nicht dieses Modul
   *
   * Das Kürzel ist dazu da, **verbundene Formen** auseinanderzuhalten: Stehen
   * `attainability` und `attainable` im selben Paket, ist auf der Karte sonst
   * nicht zu sehen, welche der beiden gemeint ist. Steht ein Substantiv allein
   * da, erklärt `(n.)` nichts und kostet nur Platz – eine Liste, in der hinter
   * jedem Wort `(n.)` steht, liest sich wie ein Wörterbuchauszug und nicht wie
   * ein Vokabelheft.
   *
   * Ob es eine verwandte Form gibt, weiß nur der Aufrufer: Er sieht alle
   * Kandidaten und ihre Wortfamilien. Dieses Modul sieht ein Wort.
   *
   * Der Plural ist davon unberührt – `restraints (pl.)` ist immer markiert,
   * weil die Zahl zur Vokabel gehört und nicht zur Unterscheidung.
   */
  markPartOfSpeech?: boolean | undefined;
}

/** Steht am Anfang bereits ein `to`? Dann hat jemand die Form schon gebaut. */
function alreadyBuilt(value: string): boolean {
  return /^to\s+\S/i.test(value) || /\((?:pl|sg|n|v|adj|adv)\.\)\s*$/i.test(value);
}

/** Ist der Treffer ein Plural, der über seine Grundform gefunden wurde? */
function isPluralForm(summary: DictionarySuggestionSummary | undefined): boolean {
  return (summary?.entries ?? []).some(
    (entry) => entry.quality === 'lemma' && (entry.formTags ?? []).includes('plural'),
  );
}

/** Das Stichwort eines belegten Mehrwortbegriffs, etwa `single out`. */
function multiwordHeadword(summary: DictionarySuggestionSummary | undefined): string | undefined {
  const hit = (summary?.entries ?? []).find(
    (entry) => entry.multiword === true || entry.quality === 'phrase',
  );
  return hit ? collapseWhitespace(hit.headword) : undefined;
}

export function proposeLearningForm(input: LearningFormInput): LearningFormProposal {
  const written = collapseWhitespace(input.written);
  const evidence: LearningFormEvidence[] = [];

  const empty: LearningFormProposal = {
    english: '',
    lemma: '',
    partOfSpeech: '',
    grammaticalNumber: '',
    complementPattern: '',
    evidence: [],
    needsReview: false,
    reviewReason: '',
  };
  if (!written) return empty;

  /*
    Eine bereits gebaute Form bleibt, wie sie ist.

    Wer `to depend on sb./sth.` eingetippt oder aus einer strukturierten Liste
    übernommen hat, hat die Entscheidung getroffen. Sie noch einmal durch die
    Ermittlung zu schicken hieße, sie zu überschreiben – und genau das darf
    hier nichts.
  */
  if (alreadyBuilt(written)) {
    return {
      ...empty,
      english: written,
      lemma: input.dictionary?.entries[0]?.lemma ?? '',
      partOfSpeech: input.partOfSpeech || partOfSpeechOf(input.dictionary),
      evidence: ['written'],
    };
  }

  evidence.push('written');

  // --- Wortart -------------------------------------------------------------
  let partOfSpeech: PartOfSpeech | '' = input.partOfSpeech ?? '';
  if (!partOfSpeech) {
    const fromDictionary = partOfSpeechOf(input.dictionary);
    if (fromDictionary) {
      partOfSpeech = fromDictionary;
      evidence.push('dictionary');
    } else {
      const rule = guessPartOfSpeech(written, input.sourceSentence);
      if (rule.partOfSpeech) {
        partOfSpeech = rule.partOfSpeech;
        evidence.push('rule');
      }
    }
  }

  // --- Kopf: das Wort selbst, oder der belegte Mehrwortbegriff -------------
  let head = written;
  let complementPattern = '';
  let reviewReason = '';
  let reviewSuggestion: string | undefined;

  const particle = input.sourceSentence
    ? particleAfter(input.sourceSentence, written)
    : undefined;

  if (particle) {
    const phraseHead = multiwordHeadword(input.phrase);
    const confirmed =
      phraseHead !== undefined &&
      phraseHead.toLowerCase() === `${written} ${particle}`.toLowerCase();

    if (confirmed) {
      /*
        Zwei unabhängige Belege: Der Satz zeigt `single out`, und das
        Wörterbuch führt `single out` als eigenes Stichwort. Das ist keine
        Vermutung mehr, das ist eine Auskunft.
      */
      head = phraseHead;
      evidence.push('dictionary');
      if (!partOfSpeech) {
        const fromPhrase = partOfSpeechOf(input.phrase);
        if (fromPhrase) partOfSpeech = fromPhrase;
      }
    } else if (partOfSpeech === 'verb') {
      /*
        Der Satz zeigt `depend on`, das Wörterbuch kennt `depend on` nicht.
        Beides kann stimmen: Die Rektion kann echt sein und im Bestand fehlen,
        oder das `on` gehört gar nicht zum Verb („to arrive on Monday“).

        Der Vorschlag bleibt deshalb bei `to depend` – und stellt die Frage.
      */
      evidence.push('sentence');
      reviewSuggestion = buildLearningForm({
        lemma: `${written} ${particle}`,
        partOfSpeech: 'verb',
        complementPattern: 'sb./sth.',
      });
      reviewReason = `Im Text steht „${written} ${particle}“. Gehört „${particle}“ zur Vokabel?`;
    }
  }

  // --- Zahl ----------------------------------------------------------------
  let grammaticalNumber: GrammaticalNumber | '' = '';
  if (partOfSpeech === 'noun' && isPluralForm(input.dictionary)) {
    grammaticalNumber = 'plural';
    evidence.push('dictionary');
  }

  /*
    Eine ungesicherte Wortart ist **kein** Prüfhinweis.

    Der erste Entwurf setzte hier `needsReview`, wenn die Wortart unklar blieb.
    Gemessen an einem echten Text hieß das: eine sichtbare Frage im
    Empfehlungsschritt – und **zwölf** „Bitte prüfen“ in der Entwurfstabelle,
    weil `coin`, `wall`, `plan` und die Hälfte aller Substantive im Englischen
    nun einmal auch Verben sind.

    Eine Warnung an jeder Zeile ist eine Warnung an keiner. Die eine Frage, die
    wirklich beantwortet werden muss, ging darin unter – und genau sie soll vor
    dem Speichern auffallen.

    Die Auskunft geht dabei nicht verloren: `partOfSpeech` bleibt leer, und das
    Auswahlfeld daneben steht sichtbar auf „–“. Das ist die ehrlichere
    Darstellung, denn eine fehlende Wortart ist kein Fehler – ein Paket ohne
    sie ist gültig.

    `needsReview` bleibt damit dem vorbehalten, was es benennt: einer offenen
    Frage zur **Form**, zu der es eine konkrete Antwort und einen Knopf gibt.
  */

  const english = buildLearningForm({
    lemma: head,
    ...(partOfSpeech ? { partOfSpeech } : {}),
    ...(complementPattern ? { complementPattern } : {}),
    ...(grammaticalNumber ? { grammaticalNumber } : {}),
    ...(input.markPartOfSpeech && partOfSpeech && MARKED_PARTS.has(partOfSpeech) && !grammaticalNumber
      ? { markPartOfSpeech: true }
      : {}),
  });

  return {
    english,
    lemma: input.dictionary?.entries[0]?.lemma ?? head,
    partOfSpeech,
    grammaticalNumber,
    complementPattern,
    evidence: [...new Set(evidence)],
    needsReview: reviewReason.length > 0,
    reviewReason,
    ...(reviewSuggestion ? { reviewSuggestion } : {}),
  };
}
