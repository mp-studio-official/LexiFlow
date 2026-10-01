/**
 * Die Navigationsziele als Daten — Darstellung, nicht Berechtigung.
 *
 * ## Was diese Datei weiß
 *
 * Welche Ziele es gibt, wie sie heißen, welches Zeichen sie tragen, auf
 * welcher Größe sie erscheinen und in welcher Reihenfolge. Das ist
 * Darstellung, und Darstellung gehört in `src/ui/`.
 *
 * ## Was sie ausdrücklich nicht weiß
 *
 * Wer angemeldet ist, welche Rolle diese Person trägt, was sie darf, und ob
 * eine Route überhaupt existiert. Keine dieser Fragen lässt sich hier
 * beantworten, weil keine Antwort hier hereinkommt: Das Profil ist ein
 * Parameter, kein Zustand.
 *
 * Der Unterschied ist nicht akademisch. Diese Datei liegt in `src/ui/` und
 * darf deshalb in jedem Bündel landen — auch in der portablen Lerndatei, die
 * kein Konto, keine Anmeldung und keinen Server kennt. Ein `useSession()`
 * hier zöge den halben Cloudzweig hinter sich her, und zwar unbemerkt, weil
 * ein Import niemandem auffällt.
 *
 * Der **Umsetzungszustand** eines Ziels — gibt es die Route schon? — steht
 * aus demselben Grund nicht hier, sondern in `src/hosted/navigationsziele.ts`.
 * Welche Routen das Portal hat, ist Portalwissen.
 *
 * ## Warum `#/verwaltung` nicht vorkommt
 *
 * Weil es kein Navigationsziel ist (E23). Die Verwaltung liegt hinter
 * `RequireArea area="admin"`; eine normale Lehrkraft darf sie nicht öffnen.
 * Sie hier aufzuführen und später herauszufiltern hieße, die Autorisierung in
 * einer Darstellungsdatei nachzubilden — und die erste Stelle zu schaffen, an
 * der sie schiefgehen kann. Sie steht in keiner Matrix.
 */

/** Die beiden Größen, auf denen die Navigation verschieden aussieht. */
export const GROESSEN = ['schreibtisch', 'telefon'] as const;
export type Groesse = (typeof GROESSEN)[number];

/**
 * Die Navigationsprofile.
 *
 * Nicht zu verwechseln mit einer Rolle: `lehrkraft` ist hier die **Form** der
 * Navigation, nicht die Aussage „diese Person ist Lehrkraft". Wer welches
 * Profil bekommt, entscheidet das Portal.
 */
export const PROFILE = ['lehrkraft', 'lernende'] as const;
export type Profil = (typeof PROFILE)[number];

/** Die Zeichen, die die Icon-Leiste kennt. Gezeichnet werden sie in 5B.2b. */
export type Zeichen =
  | 'start'
  | 'kurse'
  | 'pakete'
  | 'ki'
  | 'einstellungen'
  | 'heute'
  | 'lernen'
  | 'ueben'
  | 'fortschritt';

export interface Ziel {
  /** Die Adresse hinter dem `#`, so wie sie in E23 steht. */
  readonly pfad: string;
  /** Der Name, den Hilfsmittel vorlesen und die untere Leiste anzeigt. */
  readonly label: string;
  /**
   * Die Kurzfassung für die untere Leiste, wo der volle Name nicht hinpasst.
   *
   * „Mein Fortschritt" braucht in einem 98 px breiten Ziel mehr Platz, als es
   * hat — das ist bei den Entwürfen gemessen worden, nicht geschätzt. Das
   * `aria-label` trägt weiterhin den vollen Namen; verkürzt wird nur, was man
   * sieht.
   */
  readonly labelTelefon?: string;
  readonly zeichen: Zeichen;
  /** Ob das Ziel auf dem Telefon erscheint. Am Schreibtisch erscheinen alle. */
  readonly aufTelefon: boolean;
}

/**
 * Die Matrix aus E23 — der **Endzustand** am Ende von 5B.
 *
 * Was davon heute schon erreichbar ist, steht hier nicht. Diese Liste ist das
 * Ziel; die sichtbare Teilmenge bestimmt das Portal.
 */
const MATRIX: Readonly<Record<Profil, readonly Ziel[]>> = {
  lehrkraft: [
    { pfad: '#/start', label: 'Start', zeichen: 'start', aufTelefon: true },
    { pfad: '#/kurse', label: 'Kurse', zeichen: 'kurse', aufTelefon: true },
    { pfad: '#/pakete', label: 'Lernpakete', zeichen: 'pakete', aufTelefon: true },
    /*
      KI-Zugang ist am Schreibtisch ein eigenes Ziel, obwohl er einmal im
      Halbjahr gebraucht wird: Eine Icon-Leiste mit fünf Symbolen kostet keine
      Breite. Auf dem Telefon, wo jedes Ziel beschriftet ist, liegt er
      innerhalb der Einstellungen (E23).
    */
    { pfad: '#/ki', label: 'KI-Zugang', zeichen: 'ki', aufTelefon: false },
    { pfad: '#/einstellungen', label: 'Einstellungen', zeichen: 'einstellungen', aufTelefon: true },
  ],
  lernende: [
    { pfad: '#/heute', label: 'Heute', zeichen: 'heute', aufTelefon: true },
    { pfad: '#/lernen', label: 'Lernen', zeichen: 'lernen', aufTelefon: true },
    { pfad: '#/ueben', label: 'Üben', zeichen: 'ueben', aufTelefon: true },
    {
      pfad: '#/fortschritt',
      label: 'Mein Fortschritt',
      labelTelefon: 'Fortschritt',
      zeichen: 'fortschritt',
      aufTelefon: true,
    },
  ],
};

/** Alle Ziele eines Profils, in der Reihenfolge aus E23. */
export function zieleFuer(profil: Profil): readonly Ziel[] {
  return MATRIX[profil];
}

/**
 * Die Ziele eines Profils auf einer Größe.
 *
 * Am Schreibtisch alle, auf dem Telefon die mit `aufTelefon`. Die Reihenfolge
 * bleibt die der Matrix — eine Navigation, deren Einträge je nach Fenster die
 * Plätze tauschen, zwingt zum Suchen.
 */
export function zieleAuf(profil: Profil, groesse: Groesse): readonly Ziel[] {
  const alle = MATRIX[profil];
  return groesse === 'schreibtisch' ? alle : alle.filter((ziel) => ziel.aufTelefon);
}

/** Der Name, der auf dieser Größe sichtbar ist. Vorgelesen wird immer `label`. */
export function beschriftung(ziel: Ziel, groesse: Groesse): string {
  return groesse === 'telefon' ? (ziel.labelTelefon ?? ziel.label) : ziel.label;
}
