/**
 * Die Anbieter – und was an ihnen fest ist.
 *
 * ## Warum die Adresse zum Anbieter gehört und nicht ins Formular
 *
 * Seit Sprint 4C steht in `src/ai/gemini/endpoint.ts` der Grund: Neben dem
 * Feld „API-Schlüssel" stünde sonst ein Feld, das bestimmt, **wohin** dieser
 * Schlüssel samt Schülertexten geht. Wer eine solche Zeichenkette aus einer
 * Anleitung kopiert, prüft sie nicht.
 *
 * Für die offiziellen Anbieter ist die Adresse deshalb hier eingetragen und
 * nicht einstellbar. Für die beiden „kompatiblen" Anbieter – das sind die, bei
 * denen eine Schule tatsächlich einen eigenen Server betreibt – ist sie
 * einstellbar, aber nur auf einen Host, den eine **Verwaltung** freigegeben
 * hat. Das ist der Unterschied zwischen einer Entscheidung und einem Feld.
 *
 * ## Das lokale Browsermodell
 *
 * Es steht in dieser Liste und hat trotzdem keine Adresse: Es läuft im Browser
 * der Lehrkraft und verlässt das Gerät nie. Die Serverfunktion ruft es nicht
 * auf – sie **kann** es nicht, und ein Aufruf dafür wird abgelehnt statt
 * stillschweigend ins Netz umgeleitet.
 */

export const ADAPTER = [
  'gemini',
  'openai-kompatibel',
  'anthropic-kompatibel',
  'browsermodell',
] as const;
export type Adapter = (typeof ADAPTER)[number];

export function istAdapter(wert: unknown): wert is Adapter {
  return typeof wert === 'string' && (ADAPTER as readonly string[]).includes(wert);
}

export interface Anbieter {
  id: Adapter;
  label: string;
  /** Die voreingestellte Adresse – bei `browsermodell` gibt es keine. */
  baseUrl?: string;
  /** Der Host, der ohne Zutun einer Verwaltung erlaubt ist. */
  presetHost?: string;
  /** Darf eine Lehrkraft eine andere Adresse eintragen? */
  eigeneAdresse: boolean;
  /** Wie der Schlüssel übergeben wird. `undefined` heißt: gar nicht. */
  schluesselKopf?: { name: string; praefix: string };
  /** Weitere feste Kopfzeilen – keine, die von außen kommen. */
  festeKopfzeilen?: Readonly<Record<string, string>>;
}

export const ANBIETER: Readonly<Record<Adapter, Anbieter>> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
    presetHost: 'generativelanguage.googleapis.com',
    /*
      Nein. Der offizielle Endpunkt ist der offizielle Endpunkt; ein zweiter
      „Gemini" auf einer anderen Adresse ist kein Gemini.
    */
    eigeneAdresse: false,
    /*
      Der Schlüssel geht in eine Kopfzeile und nie in die Adresse. Adressen
      landen in Server-Logs, in Proxy-Logs und in Fehlerberichten; ein
      Schlüssel in der Adresse ist ein Schlüssel in fremden Logdateien. Dass
      Google `?key=` anbietet, ändert daran nichts.
    */
    schluesselKopf: { name: 'x-goog-api-key', praefix: '' },
  },
  'openai-kompatibel': {
    id: 'openai-kompatibel',
    label: 'OpenAI-kompatibel',
    baseUrl: 'https://api.openai.com/v1/',
    presetHost: 'api.openai.com',
    eigeneAdresse: true,
    schluesselKopf: { name: 'authorization', praefix: 'Bearer ' },
  },
  'anthropic-kompatibel': {
    id: 'anthropic-kompatibel',
    label: 'Anthropic-kompatibel',
    baseUrl: 'https://api.anthropic.com/v1/',
    presetHost: 'api.anthropic.com',
    eigeneAdresse: true,
    schluesselKopf: { name: 'x-api-key', praefix: '' },
    festeKopfzeilen: { 'anthropic-version': '2023-06-01' },
  },
  browsermodell: {
    id: 'browsermodell',
    label: 'Modell im Browser',
    /*
      Kein `baseUrl`, kein Host, kein Schlüssel. Dieses Modell läuft im Gerät
      der Lehrkraft (siehe `src/ai/chromePromptAiProvider.ts`) und geht nie
      ins Netz – auch nicht über diese Funktion.
    */
    eigeneAdresse: false,
  },
};

/** Die Hosts, die ohne Zutun einer Verwaltung erreichbar sind. */
export function voreingestellteHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const anbieter of Object.values(ANBIETER)) {
    if (anbieter.presetHost) hosts.add(anbieter.presetHost);
  }
  return hosts;
}

/**
 * Die Kopfzeilen einer Anfrage – vollständig hier gebaut.
 *
 * Es gibt keinen Weg, von außen eine Kopfzeile mitzugeben. Das ist Absicht:
 * Mit freien Kopfzeilen ließe sich der `Host` umbiegen, ein `X-Forwarded-For`
 * fälschen oder ein interner Dienst mit einer Dienstkennung ansprechen, die
 * diese Funktion zufällig hat.
 */
export function kopfzeilenFuer(anbieter: Anbieter, schluessel: string): Record<string, string> {
  const kopf: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...(anbieter.festeKopfzeilen ?? {}),
  };
  if (anbieter.schluesselKopf) {
    kopf[anbieter.schluesselKopf.name] = `${anbieter.schluesselKopf.praefix}${schluessel}`;
  }
  return kopf;
}
