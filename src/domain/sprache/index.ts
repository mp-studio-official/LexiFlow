import type { AnswerCheckResult, AnswerVerdict } from '../answerCheck';
import { lemmaOf, longPartLabel } from '../learningForm';
import { normalizeAnswer } from '../normalize';
import type { TaskDirection, VocabEntry } from '../schema';

/**
 * Was eine Vokabel über sich sagen kann — ohne Wörterbuch und ohne KI.
 *
 * ## Die Linie zur KI
 *
 * Alles hier ist **deterministisch** und aus dem abgeleitet, was die
 * Lehrkraft eingegeben hat. Kein Netz, kein Modell, keine Erfindung. Eine
 * spätere KI darf daneben erklären und Beispiele anbieten; sie darf diese
 * Funktionen nicht ersetzen und erst recht keinen Lernstand ändern.
 *
 * Das ist nicht nur eine Datenschutzfrage. Ein Hinweis, der jedes Mal
 * anders lautet, ist kein Hinweis, sondern eine Überraschung — und eine
 * Fehlererklärung, die sich nicht reproduzieren lässt, kann man einer
 * Lehrkraft nicht zeigen, wenn eine lernende Person sie bestreitet.
 */

export type Hinweisstufe = 1 | 2 | 3 | 4;

export interface Hinweis {
  readonly stufe: Hinweisstufe;
  readonly text: string;
  /** Wie viel vom Wort dieser Hinweis preisgibt. Für die Oberfläche. */
  readonly art: 'wortart' | 'gestalt' | 'satz' | 'anfang';
}

function luecke(satz: string, wort: string): string | undefined {
  const muster = new RegExp(`\\b${wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (!muster.test(satz)) return undefined;
  return satz.replace(muster, '___');
}

/**
 * Gestufte Hinweise — vier, und jeder gibt mehr preis als der vorige.
 *
 * ## Warum gestuft und nicht „die Lösung zeigen"
 *
 * Ein Knopf, der die Antwort zeigt, beendet die Aufgabe. Eine Stufe, die
 * nur die Wortart nennt, lässt sie offen. Wer nach Stufe 1 weiterkommt,
 * hat die Vokabel selbst gefunden — und genau das soll der Lernstand
 * abbilden.
 *
 * ## Warum nicht bei jeder Vokabel vier Stufen entstehen
 *
 * Weil nicht jede Vokabel genug hergibt. Ohne Wortart gibt es keine Stufe
 * „Wortart", ohne Beispielsatz keine Lücke. Eine Stufe zu erfinden, nur
 * damit es vier sind, hiesse, Inhalt zu behaupten — die Liste ist deshalb
 * so lang, wie sie trägt.
 */
export function hinweiseFuer(eintrag: VocabEntry, richtung: TaskDirection): Hinweis[] {
  const gesucht = richtung === 'en-de' ? (eintrag.germanAnswers[0] ?? '') : eintrag.english;
  if (gesucht.length === 0) return [];

  const hinweise: Hinweis[] = [];

  const wortart = longPartLabel(eintrag.partOfSpeech, eintrag.grammaticalNumber);
  if (wortart.length > 0) {
    hinweise.push({ stufe: 1, text: wortart, art: 'wortart' });
  }

  const buchstaben = gesucht.replace(/\s/g, '').length;
  hinweise.push({
    stufe: (hinweise.length + 1) as Hinweisstufe,
    text:
      buchstaben === 1
        ? 'Ein Buchstabe.'
        : `${buchstaben} Buchstaben${gesucht.includes(' ') ? ', mehrere Wörter' : ''}.`,
    art: 'gestalt',
  });

  /*
    Die Lücke nur in Richtung Englisch: Die Beispielsätze sind englisch,
    und ein englischer Satz mit einer Lücke verrät die **deutsche** Antwort
    nicht — er hilft dann auch nicht.
  */
  if (richtung === 'de-en') {
    for (const satz of eintrag.exampleSentences) {
      const mitLuecke = luecke(satz.english, eintrag.english);
      if (mitLuecke) {
        hinweise.push({
          stufe: (hinweise.length + 1) as Hinweisstufe,
          text: mitLuecke,
          art: 'satz',
        });
        break;
      }
    }
  }

  const anfang = gesucht.slice(0, Math.max(1, Math.ceil(gesucht.length / 3)));
  hinweise.push({
    stufe: (hinweise.length + 1) as Hinweisstufe,
    text: `Beginnt mit „${anfang}…“`,
    art: 'anfang',
  });

  return hinweise.slice(0, 4).map((hinweis, platz) => ({
    ...hinweis,
    stufe: (platz + 1) as Hinweisstufe,
  }));
}

export type Fehlerart =
  | 'richtung-vertauscht'
  | 'grundform-statt-lernform'
  | 'andere-bedeutung'
  | 'schreibweise'
  | 'nichts-erkannt';

export interface Fehlererklaerung {
  readonly art: Fehlerart;
  /** Ein Satz, der sagt, was passiert ist. Nie ein Urteil über die Person. */
  readonly text: string;
  /** Alle richtigen Antworten — damit niemand raten muss, was gemeint war. */
  readonly richtig: readonly string[];
}

/**
 * Warum die Antwort nicht gezählt hat.
 *
 * ## Was diese Funktion **nicht** tut
 *
 * Sie entscheidet nichts. `checkAnswer` hat bereits geurteilt; hier wird
 * dieses Urteil nur erklärt. Keine Erklärung kann aus `wrong` ein
 * `correct` machen — auch die freundlichste nicht, und auch keine, die
 * später eine KI dazuschreibt.
 *
 * ## Warum die Richtungsverwechslung zuerst geprüft wird
 *
 * Weil sie der häufigste Fall ist, der sich wie ein Fehler anfühlt und
 * keiner ist: Die Vokabel war gewusst, nur die Frage falsch gelesen. „Das
 * ist das englische Wort, gefragt war die deutsche Bedeutung" ist eine
 * Auskunft; „falsch" an derselben Stelle ist eine Kränkung ohne Inhalt.
 */
export function fehlererklaerung(
  eingabe: string,
  ergebnis: AnswerCheckResult,
  eintrag: VocabEntry,
  richtung: TaskDirection,
): Fehlererklaerung | undefined {
  if (ergebnis.verdict === 'correct') return undefined;

  const normalisiert = normalizeAnswer(eingabe);
  const richtig = ergebnis.expected;

  if (normalisiert.length === 0) {
    return { art: 'nichts-erkannt', text: 'Da stand noch nichts.', richtig };
  }

  /* Die andere Seite der Karte — die Vokabel war gewusst, die Frage verlesen. */
  const andereSeite =
    richtung === 'en-de'
      ? [eintrag.english, ...eintrag.acceptedEnglishAnswers]
      : eintrag.germanAnswers;
  if (andereSeite.some((wert) => normalizeAnswer(wert) === normalisiert)) {
    return {
      art: 'richtung-vertauscht',
      text:
        richtung === 'en-de'
          ? 'Das ist das englische Wort. Gefragt war die deutsche Bedeutung.'
          : 'Das ist die deutsche Bedeutung. Gefragt war das englische Wort.',
      richtig,
    };
  }

  /* Die Grundform statt der Lernform: `go` für `went`. */
  if (richtung === 'de-en') {
    const grundform = lemmaOf(eintrag);
    if (
      normalizeAnswer(grundform) === normalisiert &&
      normalizeAnswer(grundform) !== normalizeAnswer(eintrag.english)
    ) {
      return {
        art: 'grundform-statt-lernform',
        text: `Das ist die Grundform. Gefragt war „${eintrag.english}“.`,
        richtig,
      };
    }
  }

  if (ergebnis.verdict === 'almost') {
    return {
      art: 'schreibweise',
      text: ergebnis.hint ?? 'Fast richtig — achte auf die Schreibweise.',
      richtig,
    };
  }

  if (richtung === 'en-de' && eintrag.germanAnswers.length > 1) {
    return {
      art: 'andere-bedeutung',
      text: `Für dieses Wort gibt es mehrere richtige Antworten: ${eintrag.germanAnswers.join(', ')}.`,
      richtig,
    };
  }

  return { art: 'nichts-erkannt', text: 'Das war eine andere Vokabel.', richtig };
}

/**
 * Der nächste Beispielsatz — und nicht immer derselbe.
 *
 * Wer eine Vokabel zum fünften Mal sieht, sieht sonst zum fünften Mal
 * denselben Satz und liest ihn beim dritten Mal nicht mehr. Gedreht wird
 * über die Zahl der bisherigen Begegnungen, nicht über den Zufall: Der
 * Satz soll sich beim erneuten Zeichnen derselben Karte nicht ändern.
 */
export function beispielsatz(
  eintrag: VocabEntry,
  begegnungen: number,
): VocabEntry['exampleSentences'][number] | undefined {
  const saetze = eintrag.exampleSentences;
  if (saetze.length === 0) return undefined;
  const platz = ((begegnungen % saetze.length) + saetze.length) % saetze.length;
  return saetze[platz];
}

/**
 * Die Zeitformen und Flexionen einer Vokabel, als beschriftete Paare.
 *
 * Nur, was wirklich dasteht: `inflection` ist geprüft (Schemafassung 3) und
 * unterscheidet schon unzählbare Substantive von Pluralwörtern. Hier wird
 * nichts abgeleitet und nichts erfunden — eine erfundene Pluralform wäre
 * genau der Fehler, den eine Lehrkraft nie bemerkt und eine Klasse
 * mitlernt.
 */
export interface Formangabe {
  readonly label: string;
  readonly wert: string;
}

export function formangaben(eintrag: VocabEntry): Formangabe[] {
  const flexion = eintrag.inflection;
  if (!flexion) return [];

  if (flexion.kind === 'verb') {
    const angaben: Formangabe[] = [
      { label: 'Grundform', wert: flexion.base },
      { label: 'Past Simple', wert: flexion.pastSimple },
      { label: 'Past Participle', wert: flexion.pastParticiple },
    ];
    if (flexion.thirdPerson) angaben.push({ label: '3. Person', wert: flexion.thirdPerson });
    if (flexion.presentParticiple) {
      angaben.push({ label: 'Present Participle', wert: flexion.presentParticiple });
    }
    return angaben;
  }

  if (flexion.kind === 'noun') {
    if (flexion.uncountable) return [{ label: 'Zahl', wert: 'nur Singular (unzählbar)' }];
    if (flexion.pluralOnly) return [{ label: 'Zahl', wert: 'nur Plural' }];
    const angaben: Formangabe[] = [];
    if (flexion.singular) angaben.push({ label: 'Singular', wert: flexion.singular });
    if (flexion.plural) angaben.push({ label: 'Plural', wert: flexion.plural });
    return angaben;
  }

  const angaben: Formangabe[] = [];
  if (flexion.comparative) angaben.push({ label: 'Komparativ', wert: flexion.comparative });
  if (flexion.superlative) angaben.push({ label: 'Superlativ', wert: flexion.superlative });
  return angaben;
}

/**
 * Was eine spätere Aussprache- und Hörverstehensstufe braucht.
 *
 * **Bewusst nur ein Vertrag, keine Umsetzung.** Es gibt heute weder
 * Tondateien noch einen Speicherort dafür, und eine Oberfläche mit einem
 * Lautsprecherknopf, der nichts abspielt, ist schlimmer als gar keiner:
 * Sie verspricht etwas, das es nicht gibt.
 *
 * Festgehalten wird hier, **woran** eine solche Stufe hängt, damit sie
 * später nicht am Datenmodell scheitert:
 *
 * - eine Tonquelle je Lernform, nicht je Eintrag (`went` klingt nicht wie
 *   `go`);
 * - eine Angabe, ob sie gesprochen oder erzeugt wurde — eine synthetische
 *   Aussprache ist für Hörverstehen etwas anderes als eine echte;
 * - die Varietät (britisch, amerikanisch), weil `schedule` sonst je nach
 *   Quelle anders klingt und niemand weiss, warum.
 *
 * Nichts davon braucht eine Migration: Es käme additiv in
 * `vocabEntrySchema`, wie `inflection` in Fassung 3.
 */
export interface Aussprachequelle {
  readonly lernform: string;
  readonly art: 'gesprochen' | 'erzeugt';
  readonly varietaet: 'britisch' | 'amerikanisch';
  readonly adresse: string;
}

/** Heute gibt es keine. Die Funktion existiert, damit die Oberfläche sie fragen kann. */
export function aussprachequelle(_eintrag: VocabEntry): Aussprachequelle | undefined {
  return undefined;
}

export type { AnswerVerdict };
