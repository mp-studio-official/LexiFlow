import { expect, test, type Page } from '@playwright/test';

import { fokusIndikatorMessen, indikatorAendertSich } from './fokus';
import { tippzielbefunde } from './tippziele';

/**
 * Was an jeder Breite gelten muss – einmal geschrieben.
 *
 * ## Die fünf Aussagen
 *
 * 1. Nichts läuft waagerecht über den Rand.
 * 2. Was man antippen soll, ist groß genug zum Antippen.
 * 3. Der Tastaturfokus ist zu sehen.
 * 4. Man kommt mit der Tastatur hin.
 * 5. Bei doppelter Vergrößerung bleibt 1. wahr.
 *
 * 3 und 4 waren bis zum zweiten Mac-Lauf **eine** Prüfung. Das war falsch:
 * Sie fiel unter WebKit 28-mal durch, ohne dass an der Gestaltung etwas
 * gewesen wäre – Safari auf macOS springt mit Tab standardmäßig keine
 * Verweise an. Die Begründung steht in `e2e/fokus.ts`.
 *
 * ## Warum die Messungen in eigenen Dateien stehen
 *
 * `e2e/tippziele.ts` und `e2e/fokus.ts` enthalten in sich geschlossene
 * Funktionen ohne Abhängigkeiten. Playwright reicht sie in die Seite hinein,
 * Vitest ruft sie unter jsdom direkt auf. Erst dadurch lassen sich die Regeln
 * selbst prüfen – vorher wäre eine falsche Regel nur durch einen echten
 * Browserlauf aufgefallen, und genau so ist es zweimal gekommen.
 *
 * ## Zwei Ausnahmen, und warum sie im Markup stehen
 *
 * `data-querlauf-erlaubt` und `data-fliesstext` sind Aussagen der Oberfläche
 * über sich selbst. Eine Ausnahmeliste im Testcode veraltete beim nächsten
 * Umbenennen.
 */

/**
 * Kein waagerechter Überlauf.
 *
 * Die Prüfung nennt die Schuldigen. „scrollWidth ist 431 statt 390" schickt
 * einen auf die Suche; „img.cover läuft 41 px über" nicht.
 */
export async function keinQuerlauf(page: Page): Promise<void> {
  const befund = await page.evaluate(() => {
    const benenne = (el: Element): string => {
      const kennung = el.id ? `#${el.id}` : '';
      const klassen =
        typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
    };

    const breite = document.documentElement.clientWidth;
    const schuldige: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const kasten = el.getBoundingClientRect();
      if (kasten.width === 0 && kasten.height === 0) continue;
      const stil = getComputedStyle(el);
      if (stil.visibility === 'hidden' || stil.display === 'none') continue;
      if (el.closest('[data-querlauf-erlaubt]')) continue;
      const ueber = Math.round(kasten.right - breite);
      if (ueber > 1) schuldige.push(`${benenne(el)} +${ueber}px`);
    }
    return {
      breite,
      rollbreite: document.documentElement.scrollWidth,
      schuldige: schuldige.slice(0, 8),
    };
  });

  expect(befund.schuldige, `läuft über den rechten Rand bei ${befund.breite} px`).toEqual([]);
  expect(
    befund.rollbreite,
    `die Seite ist breiter als das Fenster (${befund.rollbreite} statt ${befund.breite})`,
  ).toBeLessThanOrEqual(befund.breite + 1);
}

/**
 * Tippziele, die man mit dem Finger trifft.
 *
 * Die Regel, was als Tippziel zählt, steht in `e2e/tippziele.ts` – samt der
 * Unterscheidung zwischen einem wahrnehmbaren Bedienelement und einem, das
 * nur technisch da ist und dessen sichtbarer Auslöser gemessen gehört.
 */
export async function tippzieleGrossGenug(page: Page): Promise<void> {
  const befund = await page.evaluate(tippzielbefunde, {});

  expect(
    befund.ohneAusloeser,
    'versteckte Bedienelemente ohne sichtbaren Auslöser – die kann niemand antippen',
  ).toEqual([]);
  expect(befund.zuKlein, 'Tippziele unter 44 × 44 px').toEqual([]);
  expect(befund.gemessen, 'es wurde kein einziges Tippziel gemessen').toBeGreaterThan(0);
}

/**
 * Der Tastaturfokus ist zu sehen – engineneutral.
 *
 * Gezielt fokussieren, davor und danach messen. Kein Tab, also keine
 * Abhängigkeit davon, was eine Engine mit der Tabulatortaste anspringt.
 *
 * Wertet die Engine einen Fokus aus dem Skript nicht als `:focus-visible`
 * – auf Verweisen und Schaltflächen kommt das vor –, fällt die Prüfung auf
 * die Regel zurück: Gibt es in den **eigenen** Stylesheets eine
 * `:focus-visible`-Regel, die auf dieses Element passt und einen Ring
 * beschreibt? Das prüft weiterhin die Gestaltung der Anwendung. Welcher der
 * beiden Wege gegriffen hat, steht in der Meldung.
 */
export async function fokusIndikatorIstSichtbar(page: Page): Promise<void> {
  /*
    Ein Tastendruck vorweg setzt in beiden Engines die „Bedienung per
    Tastatur"-Merkung, an der `:focus-visible` hängt. Wo er landet, ist
    gleichgültig – gemessen wird danach an einem gezielt gewählten Element.
  */
  await page.keyboard.press('Tab');

  const befund = await page.evaluate(fokusIndikatorMessen, {});

  expect(befund.gefunden, 'auf dieser Seite gibt es kein sichtbares Bedienelement').toBe(true);
  expect(befund.fokussiert, `${befund.name} nimmt den Fokus nicht an`).toBe(true);

  const gerendert = indikatorAendertSich(befund.vorher, befund.nachher);
  if (gerendert) return;

  expect(
    befund.regelGefunden,
    befund.alsSichtbarGewertet
      ? `${befund.name} ist fokussiert und wird als :focus-visible gewertet, ` +
        `aber es ändert sich nichts am gerenderten Bild – und es gibt auch ` +
        `keine passende :focus-visible-Regel mit Ring oder Schatten.`
      : `${befund.name} ist fokussiert, diese Engine wertet einen Fokus aus dem ` +
        `Skript hier aber nicht als :focus-visible. Der Rückfall auf die Regel ` +
        `greift ebenfalls nicht: In den eigenen Stylesheets steht keine ` +
        `passende :focus-visible-Regel mit Ring oder Schatten.`,
  ).toBe(true);
}

/**
 * Kommt man mit der Tastatur hin?
 *
 * Eine eigene Aussage – und eine, die man nicht stellen kann, ohne die
 * Wirklichkeit der Engines abzubilden:
 *
 * | Engine | was Tab anspringt |
 * | --- | --- |
 * | Chromium | alles Bedienbare |
 * | WebKit auf macOS | **nur Formularfelder**, solange „Tabulatortaste bewegt den Fokus zwischen allen Steuerelementen" aus ist |
 *
 * Deshalb: Unter Chromium muss Tab irgendein Bedienelement erreichen. Unter
 * WebKit muss Tab die **Formularfelder** erreichen, wenn es welche gibt; gibt
 * es auf der Seite keine, sagt die Prüfung das und hält sich zurück, statt
 * eine Systemeinstellung als Mangel der Oberfläche auszugeben.
 */
export async function tastaturErreichbarkeit(page: Page, maschine: string): Promise<void> {
  const formularfelder = await page
    .locator('input:not([type=hidden]), select, textarea')
    .filter({ visible: true })
    .count();

  if (maschine === 'webkit' && formularfelder === 0) {
    /*
      Kein Mangel, sondern eine Systemeinstellung: Safari auf macOS springt
      mit Tab keine Verweise an. Die Aussage „mit Tab erreichbar" lässt sich
      hier nicht treffen; sie ohne diesen Hinweis rot zu machen hieße, eine
      Einstellung des Betriebssystems der Oberfläche anzulasten.
    */
    test.skip(
      true,
      'WebKit auf macOS springt mit Tab nur Formularfelder an; diese Ansicht hat keine.',
    );
    return;
  }

  const erreicht: string[] = [];
  for (let schritt = 0; schritt < 20 && erreicht.length === 0; schritt += 1) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return '';
      return el.tagName.toLowerCase();
    });
    if (name) erreicht.push(name);
  }

  expect(
    erreicht.length,
    maschine === 'webkit'
      ? `zwanzig Tabulatorschritte erreichen keines der ${formularfelder} Formularfelder`
      : 'zwanzig Tabulatorschritte erreichen kein Bedienelement',
  ).toBeGreaterThan(0);
}

/**
 * Doppelte Vergrößerung, ersatzweise.
 *
 * Echtes Browserzoom lässt sich nicht fernsteuern. Was 200 % Zoom für das
 * Layout bedeutet, lässt sich aber nachstellen: halbe Fensterbreite bei
 * gleicher Schriftgröße. Deshalb „Probe" und nicht „Prüfung".
 */
export async function zoomProbe(page: Page): Promise<void> {
  const vorher = page.viewportSize();
  if (!vorher) return;
  await page.setViewportSize({
    width: Math.max(320, Math.round(vorher.width / 2)),
    height: vorher.height,
  });
  try {
    await keinQuerlauf(page);
  } finally {
    await page.setViewportSize(vorher);
  }
}

/**
 * Beobachtet, was der Browser vergeblich anfordert.
 *
 * Ohne das lautet die Meldung eines fehlenden Bündels „element(s) not found"
 * – die Folge, nicht die Ursache.
 */
export function fehlschlaegeBeobachten(page: Page): () => string[] {
  const fehlschlaege: string[] = [];
  page.on('response', (antwort) => {
    if (antwort.status() >= 400) {
      fehlschlaege.push(`${antwort.status()} ${new URL(antwort.url()).pathname}`);
    }
  });
  page.on('requestfailed', (anfrage) => {
    fehlschlaege.push(`abgebrochen ${new URL(anfrage.url()).pathname}`);
  });
  return () => [...new Set(fehlschlaege)];
}

/**
 * Ist das hier überhaupt die Anwendung, die geprüft werden soll?
 *
 * Drei Fragen in dieser Reihenfolge, weil jede die nächste erklärt:
 * Liegt die Seite, wo sie liegen soll? Ist die React-Wurzel gefüllt? Erst
 * dann: Gibt es ein `<main>`? Vorher meldete sich Frage 1 als Antwort auf
 * Frage 3, nach sieben Sekunden Warten, achtundvierzigmal.
 */
export async function seiteIstDa(
  page: Page,
  grundpfad: string,
  fehlschlaege: () => string[] = () => [],
): Promise<void> {
  const pfad = new URL(page.url()).pathname;
  expect(
    pfad,
    `die Seite liegt unter ${pfad} statt unter ${grundpfad} – auf diesem Port ` +
      `antwortet ein fremder Server`,
  ).toBe(grundpfad);

  const wurzel = page.locator('#root');
  await expect(wurzel, 'im HTML steht keine React-Wurzel (#root)').toHaveCount(1, {
    timeout: 2_000,
  });

  try {
    await expect(wurzel.locator(':scope > *').first()).toBeAttached({ timeout: 5_000 });
  } catch {
    const liste = fehlschlaege();
    throw new Error(
      `Die React-Wurzel ist leer geblieben – die Anwendung hat nicht gestartet.\n` +
        (liste.length > 0
          ? `Der Browser bekam diese Antworten nicht:\n  ${liste.join('\n  ')}`
          : `Es wurde nichts vergeblich angefordert; der Fehler liegt dann im ` +
            `JavaScript selbst (siehe Trace).`),
    );
  }

  await expect(page.getByRole('main'), 'die Anwendung startete, zeigt aber kein <main>').toBeVisible(
    { timeout: 5_000 },
  );
}
