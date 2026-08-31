import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'default' | 'quiet' | 'danger';

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  small?: boolean;
}

export function Button({
  variant = 'default',
  small = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    small ? 'btn--small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  // eslint-disable-next-line react/button-has-type -- `type` ist oben typsicher gesetzt.
  return <button type={type} className={classes} {...rest} />;
}

export function Card({
  children,
  quiet = false,
  className = '',
}: {
  children: ReactNode;
  quiet?: boolean;
  className?: string;
}) {
  return (
    <div className={['card', quiet ? 'card--quiet' : '', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  /**
   * Für Meldungen, die zusätzlich eine Entscheidung verlangen (`alert--decision`).
   * Bewusst kein eigener `tone`: Der Ton beschreibt, *worum* es geht, die
   * Klasse nur, *wieviel Gewicht* die Meldung im Layout bekommt.
   */
  className?: string;
}) {
  return (
    <div
      className={['alert', `alert--${tone}`, className].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {title ? <strong>{title}</strong> : null}
      {title && children ? <br /> : null}
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby': string | undefined }) => ReactNode;
}

/** Label, Hinweis und Fehlermeldung sauber mit dem Feld verknüpft. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy })}
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field__error" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="meter__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="visually-hidden">{children}</span>;
}

/** Höflicher Live-Bereich für Statusmeldungen (Screenreader). */
export function Announcer({ message }: { message: string }) {
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}

/**
 * Statische Metadaten. Ein Badge ist nie eine Aktion und nie das einzige
 * Merkmal, an dem eine Information hängt – der Text trägt sie mit.
 */
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'error' | 'warning' | 'success' | 'accent';
}) {
  return <span className={['badge', tone ? `badge--${tone}` : ''].filter(Boolean).join(' ')}>{children}</span>;
}

/**
 * Gemeinsamer leerer Zustand.
 *
 * Ein leerer Bereich ist kein Fehler, sondern der Anfang: Er erklärt in einem
 * Satz, was hier entsteht, und bietet den ersten Schritt gleich mit an.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3 className="empty-state__title">{title}</h3>
      {children}
      {action}
    </div>
  );
}
