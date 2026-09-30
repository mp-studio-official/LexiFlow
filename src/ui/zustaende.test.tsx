// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { ErrorState, PageTitle, Skeleton } from './zustaende';

/**
 * Die drei Zustandsbausteine — was sie zusagen.
 *
 * ## Warum hier Rollen geprüft werden und keine Pixel
 *
 * jsdom rechnet kein Layout; wie breit ein Platzhalter wird, kann dieser Test
 * nicht wissen. Was er prüfen kann, ist das, worauf Hilfsmittel angewiesen
 * sind — und genau dort gehen Zustandsbausteine schief: Ein Ladeplatzhalter,
 * der nur aus grauen Kästen besteht, ist für eine Bildschirmleserin nichts.
 * Ein Fehler, der nicht angesagt wird, kommt nicht an. Eine Seite mit zwei
 * `h1` hat keine Hauptüberschrift mehr.
 *
 * Die Größen prüft die Breitensuite im echten Browser, sobald diese Bausteine
 * auf einem Bildschirm stehen.
 */

afterEach(cleanup);

describe('Skeleton', () => {
  it('sagt Hilfsmitteln, dass geladen wird — höflich', () => {
    /*
      Höflich (`polite`), nicht dringend: Laden ist keine Unterbrechung wert.
      Ein `assertive` hier risse die lesende Person aus dem Satz, in dem sie
      gerade ist.
    */
    render(<Skeleton />);

    const ansage = screen.getByRole('status');
    expect(ansage).toHaveTextContent('Wird geladen');
    expect(ansage).toHaveAttribute('aria-live', 'polite');
  });

  it('versteckt die grauen Formen vor Hilfsmitteln', () => {
    // Sie tragen keine Information. Vorgelesen wären sie Lärm.
    const { container } = render(<Skeleton lines={3} />);

    const formen = container.querySelector('.skeleton__stack');
    expect(formen).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.skeleton__line')).toHaveLength(3);
  });

  it('nimmt einen eigenen Satz an', () => {
    render(<Skeleton label="Deine Kurse werden geladen" />);
    expect(screen.getByRole('status')).toHaveTextContent('Deine Kurse werden geladen');
  });

  it('begrenzt die Zeilenzahl nach unten und oben', () => {
    /*
      Null Zeilen wären ein leerer Kasten ohne Aussage, fünfzig eine Wand. Die
      Grenzen stehen im Baustein, damit sie nicht an jeder Aufrufstelle neu
      bedacht werden müssen.
    */
    const { container: wenig } = render(<Skeleton lines={0} />);
    expect(wenig.querySelectorAll('.skeleton__line')).toHaveLength(1);

    const { container: viel } = render(<Skeleton lines={99} />);
    expect(viel.querySelectorAll('.skeleton__line')).toHaveLength(12);
  });

  it('zeigt als Titelbild eine Fläche statt Zeilen', () => {
    const { container } = render(<Skeleton variant="cover" />);

    expect(container.querySelector('.skeleton__cover')).not.toBeNull();
    expect(container.querySelectorAll('.skeleton__line')).toHaveLength(0);
  });
});

describe('PageTitle', () => {
  it('macht den Titel zur Hauptüberschrift', () => {
    // Eine Seite hat eine `h1`. Dass sie es ist, entscheidet nicht das Aussehen.
    render(<PageTitle title="Deine Kurse" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Deine Kurse' })).toBeVisible();
  });

  it('zeigt Einordnung, Beschreibung und Handlungen, wenn es sie gibt', () => {
    render(
      <PageTitle
        title="Unit 3 — City life"
        eyebrow="Englisch 7b"
        description="Zwölf Vokabeln, zuletzt am 12. September geübt."
        actions={<button type="button">Üben</button>}
      />,
    );

    expect(screen.getByText('Englisch 7b')).toBeVisible();
    expect(screen.getByText(/Zwölf Vokabeln/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Üben' })).toBeVisible();
  });

  it('lässt weg, was nicht mitgegeben wurde', () => {
    /*
      Kein leerer Absatz und keine leere Leiste: Ein Kopf ohne Beschreibung
      soll keine Lücke haben, wo eine stehen könnte.
    */
    const { container } = render(<PageTitle title="Einstellungen" />);

    expect(container.querySelector('.page-title__eyebrow')).toBeNull();
    expect(container.querySelector('.page-title__description')).toBeNull();
    expect(container.querySelector('.page-title__actions')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('sagt den Fehler an', () => {
    /*
      `alert` und nicht `status`: Ein Fehler, der beim Absenden erscheint, muss
      ankommen. Dafür gibt es ihn.
    */
    render(
      <ErrorState title="Speichern ging nicht">
        <p>Die Verbindung wurde unterbrochen.</p>
      </ErrorState>,
    );

    const meldung = screen.getByRole('alert');
    expect(within(meldung).getByRole('heading', { name: 'Speichern ging nicht' })).toBeVisible();
    expect(within(meldung).getByText('Die Verbindung wurde unterbrochen.')).toBeVisible();
  });

  it('schweigt, wenn er schon beim Öffnen dasteht', () => {
    /*
      Dann ist er Teil des Inhalts und keine Unterbrechung. Eine Ansage, die
      bei jedem Seitenaufruf kommt, wird zu Lärm und danach überhört — auch
      die, die zählt.
    */
    render(<ErrorState title="Diese Seite gibt es nicht" announce={false} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Diese Seite gibt es nicht' })).toBeVisible();
  });

  it('trägt den Ausweg, wenn einer mitgegeben wurde', () => {
    render(
      <ErrorState title="Nicht geladen" action={<button type="button">Erneut versuchen</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  });

  it('unterscheidet offline von kaputt', () => {
    /*
      Wer im Bus übt, ist nicht kaputt. Derselbe Ton für beides täuschte eine
      Dringlichkeit vor, die es nicht gibt — und stumpfte die ab, die es gibt.
    */
    const { container: fehler } = render(<ErrorState title="Serverfehler" />);
    expect(fehler.querySelector('.error-state--error')).not.toBeNull();

    const { container: offline } = render(<ErrorState title="Gerade offline" tone="offline" />);
    expect(offline.querySelector('.error-state--offline')).not.toBeNull();
  });
});
