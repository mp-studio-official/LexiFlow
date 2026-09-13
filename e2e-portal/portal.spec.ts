import { expect, test } from '@playwright/test';

/**
 * Das Portal unter dem Unterpfad `/LexiFlow/` – so, wie es auf GitHub Pages liegt.
 *
 * Diese Suite prüft vier Dinge, die sich lokal unter `/` **nicht** prüfen
 * lassen, weil sie dort immer gutgehen:
 *
 * 1. Die beiden Auslieferungen liegen nebeneinander und kommen sich nicht in
 *    die Quere.
 * 2. Kein Pfad im Portal ist fest geschrieben.
 * 3. Der Service Worker der kontofreien PWA verschluckt das Portal nicht.
 * 4. Die Rückkehradresse einer Anmeldung funktioniert unter dem Unterpfad –
 *    und der verbrauchte Code verschwindet danach aus der Adresszeile.
 */

test.describe('zwei Auslieferungen unter einem Grundpfad', () => {
  test('@smoke die kontofreie Anwendung liegt weiterhin unter /LexiFlow/', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    // Und sie hat keine Anmeldung – sie ist die Fassung ohne Konto.
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toHaveCount(0);
  });

  test('@smoke das Portal liegt unter /LexiFlow/portal/ – ohne Dateinamen', async ({ page }) => {
    const antwort = await page.goto('./portal/');
    expect(antwort?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'LexiFlow', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mit Code beitreten' })).toBeVisible();
  });

  test('@smoke das Portal lädt nichts außerhalb seines eigenen Pfads', async ({ page }) => {
    /*
      Die Prüfung gegen fest geschriebene Adressen. Ein `/portal/assets/…`
      im Quelltext funktionierte lokal tadellos und führte auf GitHub Pages
      ins Leere – dort liegt alles unter `/LexiFlow/`.
    */
    const adressen: string[] = [];
    page.on('request', (anfrage) => adressen.push(anfrage.url()));

    await page.goto('./portal/');
    await page.getByRole('heading', { name: 'LexiFlow', level: 1 }).waitFor();

    const eigene = adressen.filter((adresse) => adresse.startsWith('http://localhost:4183/'));
    const daneben = eigene.filter((adresse) => {
      const pfad = new URL(adresse).pathname;
      return !pfad.startsWith('/LexiFlow/');
    });
    expect(daneben, `außerhalb des Grundpfads geladen: ${daneben.join(', ')}`).toEqual([]);
  });

  test('@smoke die Testfassung sagt, dass sie eine ist', async ({ page }) => {
    // Diese Suite baut mit erfundenen Konten. Eine Auslieferung, die so
    // gebaut ist, muss es sagen – sonst ist sie von der echten nicht zu
    // unterscheiden.
    await page.goto('./portal/');
    await expect(page.getByText('Testfassung ohne Server')).toBeVisible();
  });
});

test.describe('der Service Worker verschluckt das Portal nicht', () => {
  test('@smoke nach dem Besuch der PWA ist /LexiFlow/portal/ weiterhin das Portal', async ({
    page,
  }) => {
    /*
      Der Fall, der ohne die Ausnahmeliste im Service Worker passiert wäre –
      und zwar am zuverlässigsten bei Menschen, die die PWA installiert haben:
      Der Worker beantwortet jede Navigation im eigenen Zuständigkeitsbereich
      mit der zwischengespeicherten Startseite. Aus dem Portal würde dann die
      kontofreie Anwendung.
    */
    await page.goto('./');
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
      timeout: 20_000,
    });

    await page.goto('./portal/');
    await expect(page.getByRole('link', { name: 'Mit Code beitreten' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toHaveCount(0);
  });
});

test.describe('Anmeldung unter dem Unterpfad', () => {
  test('@smoke eine lernende Person kommt herein und landet im Lernbereich', async ({ page }) => {
    await page.goto('./portal/#/anmelden');

    await page.getByRole('button', { name: 'Ich lerne' }).click();
    await page.getByLabel('Lern-ID').fill('fuchs-7390');
    await page.getByLabel('Kennwort').fill('testkennwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByRole('heading', { name: 'Deine Kurse' })).toBeVisible();
    // Der Weg dorthin bleibt innerhalb des Unterpfads.
    expect(new URL(page.url()).pathname).toBe('/LexiFlow/portal/');
    expect(page.url()).toContain('#/lernen');
  });

  test('@smoke ihre Navigation führt nirgends in den Lehrkraftbereich', async ({ page }) => {
    await page.goto('./portal/#/anmelden');
    await page.getByRole('button', { name: 'Ich lerne' }).click();
    await page.getByLabel('Lern-ID').fill('fuchs-7390');
    await page.getByLabel('Kennwort').fill('testkennwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.getByRole('heading', { name: 'Deine Kurse' }).waitFor();

    const ziele = await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .getByRole('link')
      .evaluateAll((verweise) => verweise.map((verweis) => verweis.getAttribute('href')));

    expect(ziele.filter((ziel) => ziel?.includes('/kurse'))).toEqual([]);
    expect(ziele.filter((ziel) => ziel?.includes('/material'))).toEqual([]);
  });

  test('@smoke eine Lehrkraft kommt in ihren Bereich', async ({ page }) => {
    await page.goto('./portal/#/anmelden');

    await page.getByRole('button', { name: 'Ich unterrichte' }).click();
    await page.getByLabel('E-Mail-Adresse').fill('lehrerin@beispiel.invalid');
    await page.getByLabel('Kennwort').fill('testkennwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByRole('heading', { name: 'Kurse' })).toBeVisible();
  });

  test('@smoke ein falsches Kennwort verrät nicht, ob es das Konto gibt', async ({ page }) => {
    await page.goto('./portal/#/anmelden');
    await page.getByRole('button', { name: 'Ich unterrichte' }).click();
    await page.getByLabel('E-Mail-Adresse').fill('gibtsnicht@beispiel.invalid');
    await page.getByLabel('Kennwort').fill('falsch');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await expect(page.getByText('Anmeldung nicht möglich.')).toBeVisible();
  });
});

test.describe('die Rückkehr aus einer Wiederherstellungs-E-Mail', () => {
  test('@smoke der Code steht im Abfrageteil und überschreibt die Route nicht', async ({ page }) => {
    /*
      Der Grund für PKCE. Ein Anmeldeablauf, der seine Antwort hinter der
      Raute zurückgibt, überschriebe genau den Teil, der bei `HashRouter` die
      Route trägt – die Anwendung landete auf einer unbekannten Seite, und das
      Token stünde in der Adresszeile.

      Hier wird die Adresse nachgestellt, wie sie aus einer E-Mail käme.
    */
    await page.goto('./portal/?code=test-code-ohne-bedeutung#/kennwort-neu');

    // Die Route hat überlebt: Es ist die Kennwortseite, nicht die Startseite.
    await expect(
      page.getByRole('heading', { name: /Neues Kennwort|gilt nicht mehr/ }),
    ).toBeVisible();
    expect(page.url()).toContain('#/kennwort-neu');
  });

  test('@smoke der verbrauchte Code verschwindet aus der Adresszeile', async ({ page }) => {
    // Was in der Adresszeile steht, landet im Verlauf, in jedem geteilten
    // Screenshot und im `Referer` der nächsten Anfrage.
    await page.goto('./portal/?code=test-code-ohne-bedeutung#/kennwort-neu');
    await page.getByRole('heading', { name: /Neues Kennwort|gilt nicht mehr/ }).waitFor();

    await expect
      .poll(() => new URL(page.url()).searchParams.get('code'))
      .toBeNull();
    // Der Grundpfad bleibt dabei unangetastet.
    expect(new URL(page.url()).pathname).toBe('/LexiFlow/portal/');
  });
});
