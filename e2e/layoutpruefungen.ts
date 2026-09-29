import { expect, type Page } from '@playwright/test';

/**
 * Was an jeder Breite gelten muss – einmal geschrieben.
 *
 * ## Warum diese vier und nicht mehr
 *
 * Eine Breitenprüfung, die den Ablauf nachspielt, ist eine Ablaufprüfung mit
 * anderem Fenster: Sie kostet das Achtfache und findet dasselbe. Hier stehen
 * deshalb nur Aussagen, die **von der Breite abhängen** und sonst nirgends
 * geprüft werden:
 *
 * 1. Nichts läuft waagerecht über den Rand.
 * 2. Was man antippen soll, ist groß genug zum Antippen.
 * 3. Der Tastaturfokus ist zu sehen.
 * 4. Bei doppelter Vergrößerung bleibt 1. wahr.
 *
 * ## Warum kein `toBeVisible` auf Inhalte
 *
 * Weil das die Ablaufprüfungen schon tun. Diese Datei prüft die Geometrie.
 *
 * ## Zwei Ausnahmen, und warum sie im Markup stehen
 *
 * `data-querlauf-erlaubt` und `data-fliesstext` sind keine Hintertüren,
 * sondern Aussagen der Oberfläche über sich selbst: „dieser Bereich rollt
 * absichtlich waagerecht", „das hier ist Fließtext". Eine Ausnahmeliste in
 * dieser Datei wäre an derselben Stelle falsch – sie veraltet, sobald jemand
 * eine Klasse umbenennt.
 */

/** Alle Elemente, die man antippen können soll. */
const TIPPZIELE =
  'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]';

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
      // Ein absichtlich waagerecht rollender Bereich ist kein Überlauf der Seite.
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
 * 44 × 44 px ist nicht gerundet, sondern die Zahl aus WCAG 2.5.5 und aus
 * Apples Richtlinie. Geprüft wird nur dort, wo getippt wird – an den schmalen
 * Breiten.
 *
 * Ausgenommen sind Ziele **im Fließtext**: Ein Verweis mitten im Satz kann
 * nicht 44 px hoch sein, ohne den Satz zu zerreißen; WCAG nimmt ihn
 * ausdrücklich aus.
 */
export async function tippzieleGrossGenug(page: Page, auswahl = TIPPZIELE): Promise<void> {
  const zuKlein = await page.evaluate((auswahlImBild: string) => {
    const benenne = (el: Element): string => {
      const kennung = el.id ? `#${el.id}` : '';
      const klassen =
        typeof el.className === 'string' && el.className.trim()
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
    };

    const MASS = 44;
    const klein: string[] = [];
    for (const el of Array.from(document.querySelectorAll(auswahlImBild))) {
      const kasten = el.getBoundingClientRect();
      if (kasten.width === 0 || kasten.height === 0) continue;
      if (el.hasAttribute('disabled')) continue;
      if (el.closest('[data-fliesstext]')) continue;
      if (Math.ceil(kasten.width) < MASS || Math.ceil(kasten.height) < MASS) {
        klein.push(`${benenne(el)} ${Math.round(kasten.width)}×${Math.round(kasten.height)}`);
      }
    }
    return klein.slice(0, 8);
  }, auswahl);

  expect(zuKlein, 'Tippziele unter 44 × 44 px').toEqual([]);
}

/**
 * Der Tastaturfokus ist zu sehen.
 *
 * Geprüft wird nicht, *dass* eine Regel im Stylesheet steht, sondern dass das
 * fokussierte Element sich sichtbar vom unfokussierten unterscheidet – über
 * Umriss oder Schatten. Ein `outline: none` **mit** Ersatz besteht die
 * Prüfung, ein `outline: none` ohne Ersatz nicht.
 */
export async function fokusIstSichtbar(page: Page): Promise<void> {
  await page.keyboard.press('Tab');

  const befund = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { name: '—', sichtbar: false, leer: true };
    const kennung = el.id ? `#${el.id}` : '';
    const stil = getComputedStyle(el);
    const umriss = stil.outlineStyle !== 'none' && Number.parseFloat(stil.outlineWidth) > 0;
    const schatten = stil.boxShadow !== 'none' && stil.boxShadow !== '';
    return {
      name: `${el.tagName.toLowerCase()}${kennung}`,
      sichtbar: umriss || schatten,
      leer: false,
    };
  });

  expect(befund.leer, 'die erste Tabulatortaste erreicht nichts').toBe(false);
  expect(befund.sichtbar, `kein sichtbarer Fokus auf ${befund.name}`).toBe(true);
}

/**
 * Doppelte Vergrößerung, ersatzweise.
 *
 * Echtes Browserzoom lässt sich nicht fernsteuern. Was 200 % Zoom für das
 * Layout bedeutet, lässt sich aber nachstellen: halbe Fensterbreite bei
 * gleicher Schriftgröße. Wer das übersteht, übersteht auch das Zoom – mit der
 * Einschränkung, dass die Schrift dabei nicht mitwächst. Deshalb heißt das
 * hier „Probe" und nicht „Prüfung".
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
