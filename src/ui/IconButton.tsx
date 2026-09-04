import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Eine Schaltfläche, die nur ein Zeichen zeigt – aber immer einen Namen hat.
 *
 * `label` ist Pflicht und wandert an zwei Stellen: in `aria-label`, damit
 * Vorlesehilfen und Sprachsteuerung die Schaltfläche ansprechen können, und
 * in `title`, damit die Maus nach einer Sekunde dasselbe erfährt. Der Name
 * soll den Gegenstand nennen, nicht nur die Handlung: „Unit 7 als Lerndatei
 * herunterladen“ – in einer Liste mit acht Paketen stünden sonst acht
 * gleichnamige Schaltflächen.
 *
 * Die Trefferfläche ist `--tap-target` groß (44 px), auch wenn das Zeichen
 * darin nur 18 px misst. Ein Zeichen ist kein Grund für eine kleinere Fläche:
 * Wer auf einem Telefon mit dem Daumen zielt, trifft die Fläche, nicht den
 * Strich.
 */

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label' | 'title' | 'type'> {
  icon: IconName;
  /** Vollständiger Name der Handlung samt Gegenstand. Pflicht. */
  label: string;
}

export function IconButton({ icon, label, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={['icon-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
