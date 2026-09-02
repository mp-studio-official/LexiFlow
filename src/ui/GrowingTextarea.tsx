import { useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * Ein Textfeld, das mit seinem Inhalt wächst – und mit **einer** Zeile beginnt.
 *
 * ## Warum das keine Kosmetik ist
 *
 * Die Beschreibung eines Pakets ist optional und meistens leer. Ein Feld, das
 * dafür von vornherein zwei oder drei Zeilen Platz belegt, sagt das Gegenteil:
 * Es sieht aus wie eine Aufgabe, drängt die Felder darunter aus dem Bild und
 * schiebt auf einem Telefon die Hauptaktion unter den Falz. Wer dann doch fünf
 * Zeilen schreibt, bekommt beim starren Feld ein Rollbalken-Guckloch und sieht
 * seinen eigenen Text nicht mehr im Zusammenhang.
 *
 * Eine Zeile am Anfang, so viele wie nötig danach: Das Feld beansprucht genau
 * den Platz, den sein Inhalt gerade braucht.
 *
 * ## Wie gemessen wird
 *
 * `height: auto` setzen, `scrollHeight` lesen, `height` darauf setzen. Der
 * erste Schritt ist der wichtige – ohne ihn misst man die alte Höhe und das
 * Feld kann nie wieder schrumpfen.
 *
 * `useLayoutEffect` statt `useEffect`, damit die Höhe **vor** dem Zeichnen
 * steht: Sonst blitzt bei jedem Öffnen kurz die einzeilige Fassung auf.
 *
 * Wo `scrollHeight` 0 ist – in einer Testumgebung ohne Layout –, wird nichts
 * gesetzt. Ein `height: 0px` wäre dort ein unsichtbares Feld, und ein Test, der
 * an einer Layoutfrage scheitert, prüft die falsche Sache.
 */
export type GrowingTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'rows' | 'ref'
> & {
  /** Wie viele Zeilen mindestens sichtbar bleiben. Standard: eine. */
  minRows?: number;
};

export function GrowingTextarea({ minRows = 1, onChange, ...rest }: GrowingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback((): void => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    if (element.scrollHeight > 0) element.style.height = `${element.scrollHeight}px`;
  }, []);

  // Auch beim Wechsel des Werts von außen – etwa beim Zurückspringen im
  // Assistenten, wo plötzlich ein vorhandener Text im Feld steht.
  useLayoutEffect(resize, [resize, rest.value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={minRows}
      className={['growing', rest.className].filter(Boolean).join(' ')}
      onChange={(event) => {
        resize();
        onChange?.(event);
      }}
    />
  );
}

export default GrowingTextarea;
