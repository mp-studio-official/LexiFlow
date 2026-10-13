import { renderToStaticMarkup } from 'react-dom/server';
import { Schaufenster } from './Schaufenster';

/** Nur für `scripts/schaufenster-bauen.mjs`; kein Einstiegspunkt der Anwendung. */
export function rendern(): string {
  return renderToStaticMarkup(<Schaufenster />);
}
