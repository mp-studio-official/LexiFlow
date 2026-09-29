import { devices } from '@playwright/test';

/**
 * Die Prüfbank: vier Breiten, zwei Maschinen.
 *
 * ## Warum das der erste Block von 5B ist und nicht der letzte
 *
 * Bis hierher führte `playwright.config.ts` genau ein Projekt: Desktop Chrome.
 * Damit war jede Aussage über Mobilfähigkeit und über Safari eine Behauptung –
 * geprüft war die eine Breite, auf der ohnehin niemand ein Problem hat.
 *
 * Wer eine Oberfläche umbaut und die Prüfbank danach nachzieht, hat für die
 * Dauer des Umbaus keine. Deshalb steht sie vorn.
 *
 * ## Warum nicht alles über acht Projekte läuft
 *
 * Die bestehenden Suiten beschreiben Abläufe: Text einlesen, Vokabeln
 * auswählen, Paket speichern. Sie achtmal zu fahren kostet das Achtfache und
 * findet nichts, was sie nicht schon beim ersten Mal finden – ein Ablauf ist
 * kein Layout.
 *
 * Deshalb zwei Arten von Projekten:
 *
 *   - Das **Ablaufprojekt** (`chromium`) fährt alles **außer** den Prüfungen
 *     mit der Marke `@breiten`. Es bleibt, wie es war.
 *   - Die **Breitenprojekte** fahren **nur** die Prüfungen mit dieser Marke.
 *     Acht Stück: vier Breiten mal zwei Maschinen.
 *
 * Wer eine Prüfung über alle Breiten haben will, schreibt `@breiten` in ihren
 * Namen. Wer eine Ablaufprüfung schreibt, merkt von alledem nichts.
 */

/** Die vier Breiten aus dem Konzept – mit einer Höhe, die zu ihnen passt. */
export const BREITEN = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
] as const;

/**
 * Zwei Maschinen, und Safari ist die wichtigere.
 *
 * `Desktop Safari` fährt WebKit – dieselbe Maschine, die auf jedem iPhone
 * steht, unabhängig davon, welcher Browser darauf installiert ist. Ein Fehler,
 * den nur WebKit zeigt, trifft damit genau die Geräte, auf denen die meisten
 * Lernenden üben.
 */
export const MASCHINEN = [
  { name: 'chromium', geraet: devices['Desktop Chrome'] },
  { name: 'webkit', geraet: devices['Desktop Safari'] },
] as const;

/** Die Marke, an der die Breitenprüfungen erkannt werden. */
export const BREITENMARKE = /@breiten/;

interface Projekt {
  name: string;
  use: Record<string, unknown>;
  grep?: RegExp;
  grepInvert?: RegExp;
}

/**
 * Das Ablaufprojekt: alles außer den Breitenprüfungen, auf einer Breite.
 */
export function ablaufProjekt(name = 'chromium'): Projekt {
  return {
    name,
    use: { ...devices['Desktop Chrome'] },
    grepInvert: BREITENMARKE,
  };
}

/**
 * Die acht Breitenprojekte: nur die markierten Prüfungen.
 *
 * Der Name trägt Maschine und Breite, damit im Protokoll sofort dasteht, wo
 * etwas gefallen ist – `webkit-390` sagt mehr als „Projekt 7".
 */
export function breitenProjekte(): Projekt[] {
  return MASCHINEN.flatMap((maschine) =>
    BREITEN.map((breite) => ({
      name: `${maschine.name}-${breite.name}`,
      use: {
        ...maschine.geraet,
        viewport: { width: breite.width, height: breite.height },
      },
      grep: BREITENMARKE,
    })),
  );
}

/** Die Breite eines Breitenprojekts aus seinem Namen – für `test.skip`. */
export function breiteAus(projektname: string): number {
  const teile = projektname.split('-');
  const letzte = teile[teile.length - 1] ?? '';
  const zahl = Number.parseInt(letzte, 10);
  return Number.isNaN(zahl) ? 0 : zahl;
}
