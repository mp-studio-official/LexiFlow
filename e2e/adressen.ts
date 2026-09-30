/**
 * Wo die Breitensuiten ihren eigenen Server erwarten – und unter welchem Pfad.
 *
 * ## Warum eigene Ports
 *
 * Der erste echte Mac-Lauf der Prüfbank fand keinen einzigen Layoutbefund,
 * sondern einen Fehler in der Prüfbank selbst: Auf Port 4173 lief bereits eine
 * andere Vorschau – der Staging-Bau unter `/LexiFlow/`. Playwright hat sie
 * wegen `reuseExistingServer` **still übernommen**. `page.goto('/')` landete
 * auf `/LexiFlow/`, sämtliche `/assets/…` kamen als 404 zurück, `#root` blieb
 * leer, und 48 Prüfungen scheiterten nach je sieben Sekunden im `beforeEach` –
 * ohne dass je eine Layoutprüfung gelaufen wäre.
 *
 * Ein grüner Lauf wäre schlimmer gewesen als ein roter: Er hätte behauptet,
 * geprüft zu haben, was nie geladen war.
 *
 * Deshalb hier drei Dinge an einer Stelle:
 *
 * 1. **Eigene Ports**, weit weg von 4173 (Ablaufsuite), 4183 (Portalablauf),
 *    5173/5174 (Vite-Entwicklung) und 4173 in fremder Nutzung.
 * 2. **Kein Wiederverwenden** eines fremden Servers – das steht in den beiden
 *    Breitenkonfigurationen als `reuseExistingServer: false`.
 * 3. Der **erwartete Grundpfad** als prüfbarer Wert, nicht als Annahme.
 *
 * ## Warum der Grundpfad hier steht und nicht im Test
 *
 * Weil genau er der Unterschied zwischen dem eigenen und dem fremden Server
 * war. Eine Auslieferung unter `/LexiFlow/` ist für die kontofreie App kein
 * Schönheitsfehler, sondern eine andere Anwendung.
 */

export interface Breitenziel {
  /** Der eigene Port dieser Suite. */
  readonly port: number;
  /** Die Grundadresse, die Playwright den Prüfungen gibt. */
  readonly baseURL: string;
  /** Der Pfad, unter dem die Anwendung wirklich liegen muss. */
  readonly grundpfad: string;
  /** Was der Aufbauprüfer abruft, relativ zur Grundadresse. */
  readonly probe: string;
  /** Für Fehlermeldungen. */
  readonly name: string;
}

/** Die kontofreie Anwendung – wirklich unter `/`, nicht unter `/LexiFlow/`. */
export const BREITEN_APP: Breitenziel = {
  name: 'kontofreie Anwendung',
  port: 4291,
  baseURL: 'http://127.0.0.1:4291/',
  grundpfad: '/',
  probe: './',
};

/** Das Portal – wirklich unter `/LexiFlow/portal/`. */
export const BREITEN_PORTAL: Breitenziel = {
  name: 'Portal',
  port: 4292,
  baseURL: 'http://127.0.0.1:4292/LexiFlow/',
  grundpfad: '/LexiFlow/portal/',
  probe: './portal/',
};

export const BREITENZIELE: readonly Breitenziel[] = [BREITEN_APP, BREITEN_PORTAL];

/** Das Ziel zu einer Grundadresse – der Aufbauprüfer kennt nur sie. */
export function zielZu(baseURL: string | undefined): Breitenziel | undefined {
  return BREITENZIELE.find((ziel) => ziel.baseURL === baseURL);
}
