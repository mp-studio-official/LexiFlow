/**
 * Ein Bildmotiv für jedes Paket – erzeugt, nicht geladen.
 *
 * ## Warum die Datei nicht `packArt.ts` heißt
 *
 * Sie hieß so, eine halbe Stunde lang. Daneben liegt `PackArt.tsx`, die
 * Zeichnung – und auf einem Dateisystem, das Groß- und Kleinschreibung nicht
 * unterscheidet (macOS, Windows), sind `./packArt` und `./PackArt` derselbe
 * Pfad. TypeScript löste `./PackArt` dann auf **diese** Datei auf, fand hier
 * einen Typ statt einer Komponente und meldete acht Fehler, die nichts mit
 * dem Problem zu tun hatten.
 *
 * Auf Linux fällt das nicht auf. Zwei Dateien nebeneinander, die sich nur in
 * der Schreibung unterscheiden, sind deshalb keine Geschmacksfrage.
 *
 * ## Warum keine Fotos
 *
 * Fotos wären schöner, und sie gehen hier nicht. Drei Gründe, jeder für sich
 * ausreichend:
 *
 * - **Keine fremden Requests.** Die Lernansicht läuft offline und unter
 *   `file://`. Ein Bild von einem fremden Server macht aus jedem Öffnen einen
 *   Besuch dort – mit der IP-Adresse der lernenden Person. Das widerspricht
 *   dem Versprechen, das auf der Startseite steht.
 * - **Die Größengrenze.** Die portable Lernlaufzeit darf 1 MiB nicht
 *   überschreiten. Ein einziges brauchbares Foto ist größer als der halbe
 *   Rest der Anwendung.
 * - **Die Zuordnung.** Ein Foto zu „Unit 3 – City life“ ist eine Behauptung
 *   über den Inhalt. Bei „Unit 7 – Renewable energy“ müsste jemand ein
 *   passendes aussuchen, und bei einem Paket, das eine Lehrkraft heute
 *   Nachmittag erstellt, gibt es niemanden, der das täte.
 *
 * ## Was stattdessen entsteht
 *
 * Aus dem Titel wird ein Motiv: dieselbe Eingabe, dasselbe Bild, jedes Mal.
 * Sechs Kompositionen, zwei Grundtöne, vier Drehungen – 48 Möglichkeiten, die
 * sich beim Überfliegen einer Paketliste auseinanderhalten lassen, ohne dass
 * eine davon etwas behauptet.
 *
 * Gezeichnet wird ausschließlich in den drei Farben des Projekts. Kein Motiv
 * bringt eine eigene Farbe mit: Eine Bildwelt, die neben der Palette
 * herläuft, ist keine Bildwelt, sondern ein zweites Design.
 *
 * ## Was ein Motiv nicht ist
 *
 * Es ist **Schmuck**. Es trägt keine Auskunft, und deshalb steht es für
 * Vorlesehilfen nicht im Baum (`aria-hidden`). Ein Bild ohne Aussage, das
 * beschrieben wird, ist Lärm – und „Abstraktes Motiv in Aubergine“ hilft
 * niemandem beim Lernen.
 */

/** Die sechs Kompositionen. Die Namen sind Arbeitsnamen, keine Bedeutungen. */
export const PACK_MOTIF_VARIANTS = [
  'arcs',
  'bands',
  'horizon',
  'grid',
  'waves',
  'rays',
] as const;

export type PackMotifVariant = (typeof PACK_MOTIF_VARIANTS)[number];

/**
 * Welche der beiden Marken­farben die Fläche trägt.
 *
 * Aubergine ist der Grundton des Projekts und deshalb häufiger; Tomate setzt
 * den Akzent. Eine Liste, in der jedes zweite Motiv leuchtend rot ist, wäre
 * ein Feuerwerk und keine Lernumgebung – deshalb kommt Tomate nur in einem
 * von drei Fällen als Grundton vor.
 */
export type PackMotifGround = 'aubergine' | 'tomato';

export interface PackMotif {
  variant: PackMotifVariant;
  ground: PackMotifGround;
  /**
   * Drehung der Komposition in Grad – zwölf Stufen zu 30°.
   *
   * Vier Stufen waren zu wenig. Mit sechs Kompositionen und sieben Paketen
   * trifft der Zufall regelmäßig zweimal dasselbe, und zwei Karten in
   * derselben Lage sehen dann identisch aus. Zwölf Stufen machen aus einer
   * Wiederholung eine Variation – dieselbe Form, anders gelegt.
   */
  rotation: number;
  /**
   * Wie nah die Komposition heranrückt: 1, 1.3 oder 1.6.
   *
   * Der zweite Grund, aus dem zwei gleiche Kompositionen verschieden
   * aussehen. Zusammen: 6 × 2 × 12 × 3 = 432 Möglichkeiten – genug, dass zwei
   * Pakete auf einem Bildschirm praktisch nie dasselbe Bild tragen.
   */
  scale: number;
}

/**
 * FNV-1a – dieselbe Streufunktion, die auch das Wörterbuch benutzt.
 *
 * Sie muss nicht kryptografisch sein, sie muss **stabil** sein: Dasselbe
 * Paket soll auf jedem Gerät und nach jedem Update dasselbe Motiv haben. Ein
 * Motiv, das sich beim nächsten Öffnen ändert, ist kein Wiedererkennungs-
 * zeichen, sondern eine Irritation.
 */
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * Nachmischen, bevor gerechnet wird.
 *
 * Ohne diesen Schritt bekamen „Unit 1 – At home“ bis „Unit 8 – Media“ nur
 * vier verschiedene Kompositionen: `% 6` greift die untersten Bits ab, und die
 * ändern sich bei ähnlichen Zeichenketten zu wenig. Die Lawinenfunktion aus
 * Murmur3 verteilt jedes einzelne Eingabebit über das ganze Wort – danach
 * genügt der Rest.
 */
function mix(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Das Motiv zu einem Paket.
 *
 * `seed` ist der Titel, nicht die Id: Zwei Geräte, auf denen dasselbe Paket
 * unter verschiedenen Ids liegt, sollen dasselbe Bild zeigen. Wer sein Paket
 * neu importiert, erkennt es wieder.
 */
export function packMotif(seed: string): PackMotif {
  const normalized = seed.trim().toLowerCase();
  const value = hash(normalized || 'lexiflow');

  /*
    Drei unabhängige Entscheidungen aus **drei** Mischungen.

    Aus derselben Zahl drei Stellen abzugreifen koppelte sie: Alle Titel mit
    gerader Streuung bekämen dieselbe Drehung **und** denselben Grundton. Die
    beiden Konstanten sind der goldene Schnitt in 32 Bit und eine weitere
    Primzahl – sie sollen nur verschieden sein, sonst nichts.
  */
  const variant =
    PACK_MOTIF_VARIANTS[mix(value) % PACK_MOTIF_VARIANTS.length] ?? 'arcs';
  const ground: PackMotifGround =
    mix(value ^ 0x9e3779b9) % 3 === 0 ? 'tomato' : 'aubergine';
  const rotation = (mix(value ^ 0x7f4a7c15) % 12) * 30;
  const scale = [1, 1.3, 1.6][mix(value ^ 0x2545f491) % 3] ?? 1;

  return { variant, ground, rotation, scale };
}

/**
 * Ein kurzer, stabiler Schlüssel – für `key`, Tests und Fehlersuche.
 *
 * „arcs/aubergine/90“ liest sich in einer Testausgabe als das, was es ist.
 */
export function packMotifKey(motif: PackMotif): string {
  return `${motif.variant}/${motif.ground}/${motif.rotation}/${motif.scale}`;
}
