/**
 * Ob der Skip-Link ins Bild kommt, wenn man ihn fokussiert.
 *
 * ## Warum er hier steht und nicht bei den Tippzielen
 *
 * Der vierte Mac-Lauf meldete `a.skip-link` in jeder Ansicht als „verstecktes
 * Bedienelement ohne sichtbaren Auslöser". Das war die falsche Frage an das
 * falsche Element: Der Skip-Link liegt absichtlich über dem Bild
 * (`top: -3rem`) und kommt bei `:focus` herein. Er ist ein Tastaturwerkzeug,
 * kein Touchziel – dass ihn niemand antippt, ist sein Zweck.
 *
 * Die richtige Frage lautet: **Kommt er, wenn man ihn braucht?**
 *
 * ## Woran er erkannt wird
 *
 * Nicht an der Klasse `.skip-link`, sondern an seiner Bauform: ein Verweis auf
 * eine Stelle **derselben** Seite, der zu Beginn nicht im Bild liegt. Eine
 * Prüfung auf den Klassennamen veraltete beim nächsten Umbenennen.
 *
 * ## Warum zwei Funktionen
 *
 * Weil `.skip-link` seinen Weg ins Bild animiert (`transition: top`). Ein
 * Messwert unmittelbar nach `focus()` zeigte die alte Lage. Playwright
 * fokussiert deshalb mit der ersten Funktion und misst mit der zweiten,
 * solange bis der Kasten steht – eine Zusicherung auf den Endzustand, keine
 * Wartezeit, die einen Fehler verdeckt.
 */

export interface Skiplinkstelle {
  gefunden: boolean;
  name: string;
  /** Lag er vorher im Bild? Dann ist er keiner. */
  imBild: boolean;
  /** Fingerabdruck der Fokusgestaltung – zum Vergleich mit dem Nachher. */
  stil: string;
}

/** Liegt ein Kasten ganz im Bild? Reine Funktion, damit sie prüfbar ist. */
export function imBild(
  kasten: { top: number; bottom: number; left: number; right: number },
  breite: number,
  hoehe: number,
): boolean {
  return kasten.top >= 0 && kasten.left >= 0 && kasten.bottom <= hoehe && kasten.right <= breite;
}

/**
 * Suchen, messen, fokussieren.
 *
 * Läuft serialisiert im Browser und direkt unter jsdom – alle Vorgaben als
 * Literale im Rumpf, keine freie Benennung.
 */
export function skiplinkFokussieren(): Skiplinkstelle {
  const benenne = (el: Element): string => {
    const kennung = el.id ? `#${el.id}` : '';
    const klassen =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${el.tagName.toLowerCase()}${kennung}${klassen}`;
  };

  const liegtImBild = (el: Element): boolean => {
    const k = el.getBoundingClientRect();
    /*
      `clientWidth` ist das richtige Maß für „im Bild" – es lässt die
      Bildlaufleiste weg. Es kann aber 0 sein, bevor ein Layout gerechnet
      wurde; dann läge jedes Element außerhalb, und jeder Verweis sähe aus wie
      ein Skip-Link. Deshalb der Rückfall auf `innerWidth`.
    */
    const breite = document.documentElement.clientWidth || window.innerWidth;
    const hoehe = document.documentElement.clientHeight || window.innerHeight;
    return k.top >= 0 && k.left >= 0 && k.bottom <= hoehe && k.right <= breite;
  };

  const stilVon = (el: Element): string => {
    const s = getComputedStyle(el);
    return [
      s.outlineStyle,
      s.outlineWidth,
      s.outlineColor,
      s.boxShadow,
      s.borderColor,
      s.borderWidth,
      s.backgroundColor,
    ].join('|');
  };

  const kandidaten = Array.from(document.querySelectorAll('a[href]')).filter((el) => {
    const ziel = el.getAttribute('href') ?? '';
    if (!ziel.startsWith('#') || ziel.length < 2) return false;
    if (el.getClientRects().length === 0) return false;
    return !liegtImBild(el);
  });

  const ziel = kandidaten[0];
  if (!ziel) return { gefunden: false, name: '—', imBild: false, stil: '' };

  const vorher = { gefunden: true, name: benenne(ziel), imBild: false, stil: stilVon(ziel) };
  (ziel as HTMLElement).focus();
  return vorher;
}

/**
 * Wo das gerade fokussierte Element jetzt liegt – und wie es aussieht.
 *
 * Playwright ruft das wiederholt auf, bis der Kasten steht.
 */
export function skiplinkNachmessen(): Skiplinkstelle {
  const el = document.activeElement;
  if (!el || el === document.body) {
    return { gefunden: false, name: '—', imBild: false, stil: '' };
  }

  const benenne = (element: Element): string => {
    const kennung = element.id ? `#${element.id}` : '';
    const klassen =
      typeof element.className === 'string' && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    return `${element.tagName.toLowerCase()}${kennung}${klassen}`;
  };

  const k = el.getBoundingClientRect();
  const breite = document.documentElement.clientWidth || window.innerWidth;
  const hoehe = document.documentElement.clientHeight || window.innerHeight;
  const s = getComputedStyle(el);

  return {
    gefunden: true,
    name: benenne(el),
    imBild: k.top >= 0 && k.left >= 0 && k.bottom <= hoehe && k.right <= breite,
    stil: [
      s.outlineStyle,
      s.outlineWidth,
      s.outlineColor,
      s.boxShadow,
      s.borderColor,
      s.borderWidth,
      s.backgroundColor,
    ].join('|'),
  };
}
