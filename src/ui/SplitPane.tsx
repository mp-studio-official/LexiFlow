import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Zwei Spalten mit einem Griff dazwischen (Sprint 4B.3, Entwurfsroute B).
 *
 * ## Wozu
 *
 * Der Importweg zeigt links die Quelle und rechts das Ergebnis. Wie breit die
 * Quelle sein soll, hängt am Text: Ein Zeitungsartikel will mehr Platz als eine
 * Vokabelliste, und wer gerade Antworten tippt, will ihn schmal. Eine feste
 * Breite ist deshalb immer für jemanden falsch.
 *
 * ## Warum der Griff eine Schaltfläche mit `role="separator"` ist
 *
 * Ein `<div>` mit Mauslauschern wäre für die Maus dasselbe und für alle anderen
 * nichts: kein Tabstopp, kein Name, keine Ansage. Als `separator` mit
 * `aria-orientation="vertical"` und `aria-valuenow` sagt der Griff, was er ist
 * und wo er steht – und die Pfeiltasten tun dasselbe wie das Ziehen. Wer keine
 * Maus benutzt, kann die Spalte trotzdem einstellen.
 *
 * ## Warum die Lauscher am `window` hängen
 *
 * Der sichtbare Griff ist ein paar Pixel breit. Beim Ziehen fährt der Zeiger
 * regelmäßig daneben – und wären die Lauscher am Griff, endete die Bewegung
 * genau dann, wenn sie interessant wird. Sie hängen deshalb ab dem ersten
 * Druck am Fenster und werden beim Loslassen wieder abgeräumt.
 *
 * ## Auf schmalen Fenstern gibt es keine zwei Spalten
 *
 * Unter `--split-breakpoint` stapelt sich alles untereinander (siehe
 * `global.css`); der Griff ist dann `display: none` und damit auch aus dem
 * Accessibility-Baum. Eine Breite einzustellen, die es nicht gibt, wäre eine
 * leere Zusage.
 */

export interface SplitPaneProps {
  /** Linke Spalte – die Quelle. */
  source: ReactNode;
  /** Rechte Spalte – das Ergebnis. */
  children: ReactNode;
  /** Startbreite der linken Spalte in `rem`. */
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Name des Griffs für Hilfstechnik. */
  label?: string;
  className?: string;
}

/** Ein `rem` in Pixeln – gelesen, nicht geraten (Zoom, Systemschriftgröße). */
function remInPixels(): number {
  if (typeof window === 'undefined') return 16;
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SplitPane({
  source,
  children,
  initialWidth = 21,
  minWidth = 15,
  maxWidth = 38,
  label = 'Breite der Quellspalte',
  className = '',
}: SplitPaneProps) {
  const [width, setWidth] = useState(initialWidth);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const apply = useCallback(
    (clientX: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      setWidth(clamp((clientX - box.left) / remInPixels(), minWidth, maxWidth));
    },
    [minWidth, maxWidth],
  );

  useEffect(() => {
    function move(event: PointerEvent): void {
      if (!dragging.current) return;
      // Ohne das markiert der Browser beim Ziehen den Text beider Spalten.
      event.preventDefault();
      apply(event.clientX);
    }
    function stop(): void {
      dragging.current = false;
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [apply]);

  return (
    <div
      ref={frame}
      className={['split', className].filter(Boolean).join(' ')}
      style={{ ['--split-width' as string]: `${width}rem` }}
    >
      <div className="split__source">{source}</div>

      {/*
        `separator` statt `button`: Der Griff löst nichts aus, er stellt einen
        Wert ein. Genau dafür ist die Rolle da – und Hilfstechnik liest damit
        „21 von 15 bis 38“ statt „Schaltfläche“.
      */}
      <div
        className="split__grip"
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuenow={Math.round(width)}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          // Ein Schritt ist 1 rem, mit Umschalt 4 – grob und fein, wie beim
          // Ziehen mit und ohne ruhige Hand.
          const step = event.shiftKey ? 4 : 1;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setWidth((current) => clamp(current - step, minWidth, maxWidth));
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            setWidth((current) => clamp(current + step, minWidth, maxWidth));
          } else if (event.key === 'Home') {
            event.preventDefault();
            setWidth(minWidth);
          } else if (event.key === 'End') {
            event.preventDefault();
            setWidth(maxWidth);
          }
        }}
      />

      <div className="split__main">{children}</div>
    </div>
  );
}
