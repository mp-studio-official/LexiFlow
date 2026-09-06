import { GeminiTransportError } from './transport';

/**
 * Was schiefgehen kann – und was davon eine Lehrkraft zu sehen bekommt.
 *
 * ## Die Google-Meldung wird gelesen, aber nie gezeigt
 *
 * Eine Fehlerantwort der Gemini-API ist auskunftsfreudig. Sie enthält den
 * Grund, oft ein Stück der Anfrage, gelegentlich eine Adresse und in manchen
 * Fällen den Schlüssel selbst – und sie ist auf Englisch, in der Sprache von
 * jemandem, der die API kennt.
 *
 * Deshalb gilt hier eine Regel ohne Ausnahme: Der Rumpf der Fehlerantwort wird
 * **ausgewertet**, um den Fall zu erkennen, aber kein Zeichen daraus landet in
 * der Meldung. Was angezeigt wird, steht in dieser Datei, ist deutsch und sagt,
 * was zu tun ist. Ein Test prüft mit einer Fehlerantwort, in der wirklich etwas
 * zu verraten wäre, dass nichts davon durchkommt.
 *
 * ## `retryable` ist keine Einladung zum Wiederholen
 *
 * Das Feld sagt, ob ein **erneuter Klick** Aussicht auf Erfolg hat – nicht, ob
 * die Anwendung von sich aus noch einmal fragt. Sie tut das nie: Ein
 * automatischer zweiter Versuch bei 429 macht aus einem überschrittenen
 * Kontingent zwei, und beide gehen auf dieselbe Rechnung.
 */

export type GeminiErrorKind =
  /** Kein Schlüssel eingetragen. */
  | 'no-key'
  /** Der Schlüssel wird abgelehnt (400 mit `API_KEY_INVALID`, 401). */
  | 'invalid-key'
  /** Der Schlüssel ist gültig, darf aber nicht (403). */
  | 'forbidden'
  /** Das Modell gibt es nicht oder nicht für diesen Schlüssel (404). */
  | 'unknown-model'
  /** Kontingent oder Rate Limit erschöpft (429). */
  | 'quota'
  /** Fehler bei Google (5xx). */
  | 'server'
  /** Die Anfrage war fehlerhaft (sonstige 4xx). */
  | 'bad-request'
  /** Google hat die Anfrage oder die Antwort inhaltlich gesperrt. */
  | 'blocked'
  /** Die Antwort war unvollständig oder passte nicht zum Schema. */
  | 'bad-response'
  | 'timeout'
  | 'offline'
  | 'aborted';

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiErrorKind,
    message: string,
    /** Hat ein **erneuter Klick** Aussicht auf Erfolg? */
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/**
 * Die Meldungen. Deutsch, ohne Fachbegriffe, jede mit einem nächsten Schritt.
 *
 * Bewusst ohne Statuscodes im Text: „403" hilft niemandem, der wissen will, ob
 * er etwas falsch gemacht hat oder ob er warten soll.
 */
const MESSAGES: Readonly<Record<GeminiErrorKind, string>> = {
  'no-key': 'Es ist kein Gemini-Schlüssel eingetragen. Du findest das Feld unter „Daten & KI".',
  'invalid-key':
    'Der Schlüssel wurde nicht akzeptiert. Bitte prüfe, ob er vollständig kopiert wurde, und trage ihn neu ein.',
  forbidden:
    'Der Schlüssel ist gültig, darf dieses Modell aber nicht verwenden. In der Google-Konsole lässt sich die Berechtigung prüfen.',
  'unknown-model':
    'Dieses Modell gibt es nicht oder es ist für deinen Schlüssel nicht freigeschaltet. Wähle ein anderes Modell.',
  quota:
    'Das Kontingent deines Google-Kontos ist vorerst erschöpft. Später noch einmal versuchen – oder in der Google-Konsole nachsehen.',
  server: 'Bei Google ist gerade etwas schiefgegangen. Ein erneuter Versuch lohnt sich meist.',
  'bad-request':
    'Die Anfrage wurde abgelehnt. Bitte melde das – hier stimmt etwas in LexiFlow nicht.',
  blocked:
    'Google hat diese Anfrage inhaltlich abgelehnt. Häufig hilft es, den Text oder das Thema anders zu fassen.',
  'bad-response':
    'Die Antwort war nicht verwertbar. Nichts wurde übernommen. Ein erneuter Versuch lohnt sich.',
  timeout: 'Die Antwort hat zu lange gedauert. Bitte noch einmal versuchen.',
  offline: 'Keine Verbindung zur Gemini-API. Besteht eine Internetverbindung?',
  aborted: 'Abgebrochen. Es wurde nichts übernommen.',
};

const RETRYABLE: ReadonlySet<GeminiErrorKind> = new Set<GeminiErrorKind>([
  'quota',
  'server',
  'bad-response',
  'timeout',
  'offline',
]);

export function geminiError(kind: GeminiErrorKind): GeminiError {
  return new GeminiError(kind, MESSAGES[kind], RETRYABLE.has(kind));
}

/**
 * Gründe, die Google im Rumpf nennt und die wir **ausschließlich** zur
 * Einordnung lesen.
 *
 * Ein ungültiger Schlüssel kommt bei Gemini als `400` mit
 * `reason: "API_KEY_INVALID"` – nicht als `401`, wie man erwarten würde. Ohne
 * diesen Blick in den Rumpf bekäme die häufigste aller Fehleingaben die
 * unbrauchbarste aller Meldungen („hier stimmt etwas in LexiFlow nicht").
 */
function reasonOf(bodyText: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    const error = (parsed as { error?: { details?: unknown; status?: unknown } }).error;
    if (!error) return undefined;
    const details = Array.isArray(error.details) ? error.details : [];
    for (const detail of details) {
      const reason = (detail as { reason?: unknown }).reason;
      if (typeof reason === 'string') return reason;
    }
    return typeof error.status === 'string' ? error.status : undefined;
  } catch {
    // Ein Rumpf, der kein JSON ist, sagt nichts – und wird auch nicht gezeigt.
    return undefined;
  }
}

/**
 * Ordnet eine Fehlerantwort ein. Der Rumpf geht hier hinein und nie wieder heraus.
 */
export function errorForStatus(status: number, bodyText: string): GeminiError {
  const reason = reasonOf(bodyText);

  if (status === 400 && reason === 'API_KEY_INVALID') return geminiError('invalid-key');
  if (status === 400) return geminiError('bad-request');
  if (status === 401) return geminiError('invalid-key');
  if (status === 403) {
    // Ein gesperrter Schlüssel und ein Schlüssel ohne Recht auf dieses Modell
    // führen zu ganz verschiedenen nächsten Schritten.
    return geminiError(reason === 'API_KEY_INVALID' ? 'invalid-key' : 'forbidden');
  }
  if (status === 404) return geminiError('unknown-model');
  if (status === 429) return geminiError('quota');
  if (status >= 500) return geminiError('server');
  if (status >= 400) return geminiError('bad-request');
  return geminiError('bad-response');
}

/**
 * Macht aus irgendeinem geworfenen Wert einen `GeminiError`.
 *
 * Der `default`-Zweig ist der wichtige: Ein Fehler, den niemand vorhergesehen
 * hat, wird zu „nicht verwertbar" – und nicht zu seiner eigenen `message`, die
 * aus einer fremden Bibliothek stammen und alles Mögliche enthalten könnte.
 */
export function asGeminiError(error: unknown): GeminiError {
  if (error instanceof GeminiError) return error;
  if (error instanceof GeminiTransportError) {
    switch (error.kind) {
      case 'timeout':
        return geminiError('timeout');
      case 'aborted':
        return geminiError('aborted');
      case 'blocked':
        return geminiError('bad-request');
      default:
        return geminiError('offline');
    }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return geminiError('aborted');
  }
  return geminiError('bad-response');
}
