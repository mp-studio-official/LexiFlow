/**
 * Was der Assistent kann – und was dabei jeweils das Gerät verlässt.
 *
 * ## Warum jede Fähigkeit für sich steht
 *
 * Ein Schalter „KI an“ wäre eine Zusage, die niemand einhalten kann: Er sagt
 * nichts darüber, ob gleich eine Vokabel oder ein ganzer Aufsatz übertragen
 * wird. Die sieben Fähigkeiten hier sind deshalb nicht bloß eine Aufzählung
 * von Knöpfen, sondern **sieben verschiedene Datenschutzlagen**.
 *
 * Jede trägt in `TRANSMITTED` eine Liste dessen, was sie sendet. Diese Liste
 * ist keine Dokumentation, die danebenliegt – sie ist das, was die Oberfläche
 * **vor** der Anfrage anzeigt (`describeTransmission`), und sie steht neben dem
 * Code, der die Anfrage baut. Wer das eine ändert und das andere vergisst, wird
 * von einem Test daran erinnert.
 *
 * ## Der Unterschied, auf den es ankommt
 *
 * **Keine** der sieben Fähigkeiten sendet einen vollständigen Quelltext – auch
 * `recommend-from-text` nicht. Das ist keine nachträgliche Verschärfung,
 * sondern die Architektur, die seit der Textwerkstatt gilt: Der eingefügte
 * Rohtext wird lokal in Kandidaten zerlegt (`extractTextCandidates`), und nach
 * draußen geht nur diese Kandidatenliste mit je **einem** Satz je Kandidat,
 * gedeckelt auf `MAX_CONTEXT_CANDIDATES`. Ein Aufsatz, in dem ein Wort
 * vorkommt, verlässt das Gerät also nicht, weil jemand „Empfehlungen" geklickt
 * hat.
 *
 * Marcs Vorgabe erlaubt einen vollständigen Text bei einer ausdrücklich
 * gestarteten Textanalyse. Erlaubt ist nicht gefordert, und der bestehende
 * Weg über Kandidaten liefert dieselbe Empfehlung, ohne die Erlaubnis in
 * Anspruch zu nehmen. Deshalb bleibt `sendsFullText` überall `false`.
 *
 * Das Feld steht trotzdem da, und ein Test hält fest, dass es nirgends `true`
 * ist. Es ist damit keine Einstellung, sondern eine **Zusage mit Wachhund**:
 * Wer später eine Fähigkeit baut, die den ganzen Text sendet, muss dieses Feld
 * setzen, und in dem Moment fällt der Test um und die Oberfläche muss die
 * deutlichere Rückfrage bekommen. Ohne das Feld verliefe dieselbe Änderung
 * stumm.
 *
 * Für eine Übersetzung geht die Lernform, der eine Satz, in dem sie vorkommt,
 * der Jahrgang und das GeR-Niveau hinaus. Nicht der Text, aus dem der Satz
 * stammt; nicht das Paket; nicht die anderen Vokabeln.
 *
 * ## Was es nicht gibt
 *
 * Keine Chatfunktion, keine frei formulierbare Anfrage, kein Agent, der von
 * sich aus weiterarbeitet. Jede Fähigkeit ist eine Frage mit fester Form und
 * fester Antwortstruktur. Das ist kein fehlendes Merkmal, sondern die
 * Voraussetzung dafür, dass die Liste oben überhaupt stimmen kann.
 */

export const GEMINI_CAPABILITIES = [
  'translate-entry',
  'enrich-entry',
  'suggest-example-sentences',
  'simplify-example-sentence',
  'recommend-from-text',
  'suggest-from-topic',
  'review-learning-form',
] as const;

export type GeminiCapability = (typeof GEMINI_CAPABILITIES)[number];

export const GEMINI_CAPABILITY_LABELS: Readonly<Record<GeminiCapability, string>> = {
  'translate-entry': 'Übersetzung vorschlagen',
  'enrich-entry': 'Eintrag ergänzen',
  'suggest-example-sentences': 'Beispielsätze vorschlagen',
  'simplify-example-sentence': 'Beispielsatz vereinfachen',
  'recommend-from-text': 'Weitere Empfehlungen aus dem Text',
  'suggest-from-topic': 'Vorschläge zu einem Thema',
  'review-learning-form': 'Lernform prüfen',
};

export interface Transmission {
  /** Was übertragen wird – in der Sprache der Lehrkraft, nicht in Feldnamen. */
  items: readonly string[];
  /**
   * Geht der **vollständige** Quelltext hinaus?
   *
   * Die eine Frage, die eine Lehrkraft vor dem Klick wirklich beantwortet haben
   * will. Heute sagt keine Fähigkeit hier `true`, und ein Test hält das fest.
   * Wer das ändert, ändert eine Zusage – nicht eine Einstellung.
   */
  sendsFullText: boolean;
}

/**
 * Was jede Fähigkeit überträgt – der Grundsatz der Datenminimierung, ausbuchstabiert.
 *
 * Auffällig ist, was **nirgends** steht: Namen, Lernstände, Paket-Kennungen,
 * die übrigen Vokabeln eines Pakets. Nichts davon wird gesendet, und weil es
 * nirgends in dieser Tabelle steht, kann es auch nicht versehentlich in einen
 * Prompt geraten – `buildRequest` liest ausschließlich die Felder, die hier
 * benannt sind.
 */
export const TRANSMITTED: Readonly<Record<GeminiCapability, Transmission>> = {
  'translate-entry': {
    items: [
      'die englische Lernform',
      'den einen Satz, in dem sie vorkommt (falls vorhanden)',
      'Jahrgang und GeR-Niveau',
    ],
    sendsFullText: false,
  },
  'enrich-entry': {
    items: [
      'die englische Lernform und die bisherigen Bedeutungen',
      'Jahrgang und GeR-Niveau',
    ],
    sendsFullText: false,
  },
  'suggest-example-sentences': {
    items: [
      'die englische Lernform und die Bedeutungen',
      'die bereits vorhandenen Beispielsätze dieser Vokabel',
      'Jahrgang und GeR-Niveau',
    ],
    sendsFullText: false,
  },
  'simplify-example-sentence': {
    items: ['den einen Satz, der vereinfacht werden soll', 'Jahrgang und GeR-Niveau'],
    sendsFullText: false,
  },
  'recommend-from-text': {
    items: [
      'die bereits lokal gefundenen Wortkandidaten',
      'zu jedem Kandidaten genau einen Satz aus dem Text',
      'Jahrgang und GeR-Niveau',
    ],
    sendsFullText: false,
  },
  'suggest-from-topic': {
    items: [
      'das eingegebene Thema',
      'Jahrgang und GeR-Niveau',
      'eine begrenzte Liste bereits vorhandener Stichwörter (gegen Dubletten)',
    ],
    sendsFullText: false,
  },
  'review-learning-form': {
    items: ['die englische Lernform', 'die Wortart, falls gesetzt'],
    sendsFullText: false,
  },
};

/**
 * Der Satz, der **vor** der Anfrage steht.
 *
 * Er nennt zuerst, was hinausgeht, und dann erst, dass es Geld kosten kann.
 * Die Reihenfolge ist Absicht: Die Datenfrage ist die, die man nicht
 * rückgängig machen kann.
 */
export function describeTransmission(capability: GeminiCapability): string {
  const transmission = TRANSMITTED[capability];
  const liste = transmission.items.join(', ');
  /*
    Der Zusatz macht `sendsFullText` tragend: Setzt jemand das Feld, ändert sich
    der Satz vor dem Klick von selbst mit. Ein Feld, das nur ein Test liest,
    wäre beim nächsten Umbau als „unbenutzt" entfernt worden.
  */
  const warnung = transmission.sendsFullText
    ? 'Dabei wird der vollständige Quelltext übertragen, nicht nur ein Ausschnitt. '
    : 'Kein vollständiger Quelltext. ';
  return (
    `An Google Gemini wird übertragen: ${liste}. ` +
    warnung +
    'Keine Namen, keine Lernstände, keine anderen Pakete. ' +
    'Für die Anfrage gelten die Kontingente und gegebenenfalls die Kosten deines Google-Kontos.'
  );
}

/**
 * Wie viele Antwortteile eine Fähigkeit höchstens liefern darf.
 *
 * Eine Obergrenze im Schema und nicht bloß im Prompt: Ein Modell, das
 * hundertfünfzig Vorschläge zurückgibt, ist kein Sicherheitsproblem, aber ein
 * Bedienproblem – und eine Antwort, die die Grenze reißt, wird verworfen und
 * nicht stillschweigend gekürzt.
 */
export const MAX_ITEMS: Readonly<Record<GeminiCapability, number>> = {
  'translate-entry': 5,
  'enrich-entry': 1,
  'suggest-example-sentences': 3,
  'simplify-example-sentence': 1,
  'recommend-from-text': 20,
  'suggest-from-topic': 25,
  'review-learning-form': 1,
};
