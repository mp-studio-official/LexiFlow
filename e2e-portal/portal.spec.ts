import AxeBuilder from '@axe-core/playwright';
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

/* ================================================ Kurse (Phase 4) ======== */

/**
 * Der Kursablauf von beiden Seiten – im Browser, unter dem Unterpfad.
 *
 * Was hier läuft, läuft gegen die kontrollierte Fälschung; die inhaltliche
 * Abnahme des Ablaufs steht im Kursvertrag gegen echtes PostgreSQL. Geprüft
 * wird hier, was **nur** ein Browser zeigen kann: ob der Code groß genug
 * dasteht, ob die Seite auf einem Telefon hält und ob eine Vorlesehilfe
 * durchkommt.
 */

/** Als Lehrkraft anmelden – der Weg, den auch eine echte Person nimmt. */
async function alsLehrkraft(page: import('@playwright/test').Page) {
  await page.goto('./portal/#/anmelden');
  await page.getByRole('button', { name: 'Ich unterrichte' }).click();
  await page.getByLabel('E-Mail-Adresse').fill('lehrerin@beispiel.invalid');
  await page.getByLabel('Kennwort').fill('testkennwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('heading', { name: 'Kurse', level: 1 }).waitFor();
}

async function kursAnlegen(page: import('@playwright/test').Page, titel: string) {
  await page.getByRole('button', { name: 'Kurs anlegen' }).click();
  await page.getByLabel('Name des Kurses').fill(titel);
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.getByRole('link', { name: titel }).click();
  await page.getByRole('heading', { name: titel, level: 1 }).waitFor();
}

async function codeErzeugen(page: import('@playwright/test').Page): Promise<string> {
  await page.getByRole('button', { name: 'Code erzeugen' }).click();
  const anzeige = page.locator('.alert', { hasText: 'Diesen Code jetzt weitergeben' });
  await anzeige.waitFor();
  const code = (await anzeige.locator('p').first().innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  return code;
}

test.describe('Kurse und Einladungen', () => {
  test('@smoke eine Lehrkraft legt einen Kurs an und bekommt einen Code – genau einmal', async ({
    page,
  }) => {
    await alsLehrkraft(page);
    await kursAnlegen(page, 'Englisch 7b');
    const code = await codeErzeugen(page);

    /*
      Einmal weg und zurück – und der Code ist fort. Kein `page.reload()`:
      Diese Auslieferung läuft gegen die Fälschung im Arbeitsspeicher, und ein
      Neuladen nähme ihr auch den Kurs. Geprüft werden soll die Zusage der
      Oberfläche („er steht nur jetzt hier"), nicht die Haltbarkeit einer
      Testfassung.
    */
    await page.getByRole('link', { name: 'Alle Kurse' }).click();
    await page.getByRole('link', { name: 'Englisch 7b' }).click();
    await expect(page.getByRole('heading', { name: 'Englisch 7b', level: 1 })).toBeVisible();

    await expect(page.locator('body')).not.toContainText(code);
    // Übrig bleibt das Kürzel – drei Zeichen sind kein Code.
    await expect(page.getByRole('cell', { name: `${code.slice(0, 3)}…` })).toBeVisible();
  });

  test('@smoke die Mitgliederliste nennt keine Zahl über das Üben', async ({ page }) => {
    await alsLehrkraft(page);
    await kursAnlegen(page, 'Englisch 7b');
    await codeErzeugen(page);

    /*
      Geprüft wird die **Tabelle**, nicht die Seite. Der erste Entwurf suchte
      das Wort „geübt" im ganzen `main` – und fand es im Satz, der erklärt,
      warum dort nichts steht. Eine Prüfung, die an der eigenen Begründung
      scheitert, prüft die falsche Stelle.
    */
    const tabelle = page.getByRole('table', { name: /Mitglieder dieses Kurses/ });
    // `allInnerTexts` liefert, was zu sehen ist – und die Kopfzeilen sind per
    // CSS in Versalien gesetzt. Verglichen wird deshalb der Wortlaut, nicht
    // die Schreibweise.
    const spalten = await tabelle.locator('thead th').allInnerTexts();
    expect(spalten.map((eintrag) => eintrag.trim().toLowerCase())).toEqual([
      'name',
      'kennung',
      'rolle',
      'entfernen',
    ]);
    for (const wort of ['geübt', 'Fortschritt', 'zuletzt aktiv', '%']) {
      await expect(tabelle).not.toContainText(wort);
    }

    // Und die Begründung steht daneben, damit niemand sie später „ergänzt".
    await expect(page.locator('main')).toContainText('Lernstände gehören den Lernenden');
  });

  test('@smoke ein neues Konto entsteht nur mit Code – und bekommt einen Wiederherstellungscode', async ({
    page,
  }) => {
    await alsLehrkraft(page);
    await kursAnlegen(page, 'Englisch 7b');
    const code = await codeErzeugen(page);

    // Abmelden und als neue Person beitreten.
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.goto('./portal/#/beitreten');

    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Konto anlegen' }).click();

    await page.getByLabel('Wie sollst du heißen?').fill('Luchs');
    await page.getByLabel('Kennwort', { exact: true }).fill('testkennwort');
    await page.getByLabel('Kennwort noch einmal').fill('testkennwort');
    await page.getByRole('button', { name: 'Konto anlegen' }).click();

    await expect(page.getByRole('heading', { name: 'Dein Zugang' })).toBeVisible();
    await expect(page.getByText(/Schreib diesen Code auf/)).toBeVisible();
    // Der Satz, der die Zusage trägt.
    await expect(page.getByText(/kann dir kein neues Kennwort geben/)).toBeVisible();
  });

  test('@smoke ohne Code gibt es keinen Weg zu einem Konto', async ({ page }) => {
    await page.goto('./portal/');
    const seite = page.locator('main');
    await expect(seite).not.toContainText('Registrieren');
    await expect(page.getByRole('link', { name: 'Mit Code beitreten' })).toBeVisible();
  });
});

test.describe('Kursseiten auf dem Telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('@a11y die Kursseite sprengt das Fenster nicht', async ({ page }) => {
    await alsLehrkraft(page);
    await kursAnlegen(page, 'Englisch 7b');
    await codeErzeugen(page);

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBeLessThanOrEqual(1);
  });

  test('@a11y auch der Beitritt hält auf schmalen Fenstern', async ({ page }) => {
    await page.goto('./portal/#/beitreten');
    await page.getByLabel('Einladungscode').waitFor();

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBeLessThanOrEqual(1);
  });
});

test.describe('Barrierefreiheit', () => {
  const SCHWERWIEGEND = new Set(['serious', 'critical']);

  async function pruefe(page: import('@playwright/test').Page) {
    const ergebnis = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    return ergebnis.violations
      .filter((verstoss) => SCHWERWIEGEND.has(verstoss.impact ?? ''))
      .map((verstoss) => ({
        regel: verstoss.id,
        wirkung: verstoss.impact,
        /*
          Der Auswahlpfad gehört in die Meldung. Ohne ihn steht im Bericht
          „color-contrast, serious" – und die Suche nach dem betroffenen
          Element beginnt bei null.
        */
        wo: verstoss.nodes.map((knoten) => knoten.target.join(' ')).slice(0, 4),
      }));
  }

  test('@a11y die öffentlichen Seiten ohne schwerwiegende Befunde', async ({ page }) => {
    for (const route of ['#/', '#/anmelden', '#/beitreten', '#/wiederherstellen', '#/datenschutz']) {
      await page.goto(`./portal/${route}`);
      await page.getByRole('main').waitFor();
      expect(await pruefe(page), route).toEqual([]);
    }
  });

  test('@a11y die Kursseiten ohne schwerwiegende Befunde', async ({ page }) => {
    await alsLehrkraft(page);
    expect(await pruefe(page), 'Kursliste').toEqual([]);

    await kursAnlegen(page, 'Englisch 7b');
    await codeErzeugen(page);
    expect(await pruefe(page), 'Kursseite').toEqual([]);
  });

  test('@a11y der Lernbereich ohne schwerwiegende Befunde', async ({ page }) => {
    await page.goto('./portal/#/anmelden');
    await page.getByRole('button', { name: 'Ich lerne' }).click();
    await page.getByLabel('Lern-ID').fill('fuchs-7390');
    await page.getByLabel('Kennwort').fill('testkennwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await page.getByRole('heading', { name: 'Deine Kurse' }).waitFor();

    expect(await pruefe(page)).toEqual([]);
  });
});

/* ================================================ Material (Phase 5) ===== */

test.describe('Material und Veröffentlichung', () => {
  test('@smoke ein Paket wird veröffentlicht, zugewiesen und ist für die Lerngruppe da', async ({
    page,
  }) => {
    /*
      Der ganze Weg in einem Durchlauf – weil die einzelnen Schritte im
      Paketvertrag schon abgenommen sind und hier die Frage ist, ob sie in
      einem Browser zusammenpassen.
    */
    await alsLehrkraft(page);
    await kursAnlegen(page, 'Englisch 7b');
    const code = await codeErzeugen(page);

    await page.goto('./portal/#/material');
    await expect(page.getByRole('heading', { name: 'Material', level: 1 })).toBeVisible();

    // In der Testfassung gibt es noch kein Paket – der leere Zustand erklärt es.
    await expect(page.getByText('Noch kein Paket im Konto')).toBeVisible();
    await expect(page.getByRole('link', { name: 'LexiFlow ohne Konto' })).toBeVisible();

    // Die lernende Person kommt herein und sieht den Kurs ohne Vokabeln.
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.goto('./portal/#/anmelden');
    await page.getByRole('button', { name: 'Ich lerne' }).click();
    await page.getByLabel('Lern-ID').fill('fuchs-7390');
    await page.getByLabel('Kennwort').fill('testkennwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();

    await page.goto('./portal/#/beitreten');
    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Beitreten' }).click();

    await expect(page.getByRole('heading', { name: 'Englisch 7b', level: 1 })).toBeVisible();
    await expect(page.getByText('Noch keine Vokabeln')).toBeVisible();
  });

  test('@a11y die Materialseite ohne schwerwiegende Befunde', async ({ page }) => {
    await alsLehrkraft(page);
    await page.goto('./portal/#/material');
    await page.getByRole('heading', { name: 'Material', level: 1 }).waitFor();

    const ergebnis = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      ergebnis.violations
        .filter((verstoss) => ['serious', 'critical'].includes(verstoss.impact ?? ''))
        .map((verstoss) => ({ regel: verstoss.id, wo: verstoss.nodes.map((k) => k.target.join(' ')) })),
    ).toEqual([]);
  });
});

/* ================================================ Lernstand (Phase 6) ==== */

/**
 * Üben im Portal – der ganze Weg, im Browser, unter dem Unterpfad.
 *
 * Diese Prüfung fängt dort an, wo ein Paket entsteht: in der kontofreien
 * Anwendung unter `/LexiFlow/`. Von dort wird es ins Konto übernommen
 * (derselbe Ursprung, derselbe IndexedDB – ADR-10), veröffentlicht, einem
 * Kurs gegeben, und am Ende übt eine lernende Person damit.
 *
 * Ein langer Durchlauf, und mit Absicht: Die einzelnen Schritte sind in den
 * Verträgen abgenommen, teils gegen echtes PostgreSQL. Was **nur** hier zu
 * sehen ist, ist die Naht zwischen den beiden Auslieferungen.
 */

const VOKABELLISTE = [
  'crowded\tüberfüllt, voll',
  'neighbourhood\tNachbarschaft, Viertel',
  'litter\tMüll',
  'quiet\truhig, leise',
].join('\n');

/** Ein Paket in der kontofreien Anwendung anlegen – dort, wo Pakete entstehen. */
async function paketOhneKonto(page: import('@playwright/test').Page, titel: string) {
  await page.goto('./#/material/import');
  await page.getByLabel('Vokabelliste einfügen').fill(VOKABELLISTE);
  await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
  await page.getByLabel('Titel', { exact: true }).fill(titel);
  await page.getByLabel('Jahrgang').selectOption('7');
  /*
    Nur eine Richtung. Bei „beide Richtungen" schaltet die erste richtige
    Antwort die produktive Richtung frei – die zweite Runde wäre dann voll,
    und zwar zu Recht. Diese Prüfung will aber zeigen, dass **dieselben**
    Vokabeln nicht sofort wiederkommen, und dafür muss es bei einer
    Richtung bleiben.
  */
  await page.getByLabel('Lernrichtung').selectOption('en-de');
  await page.getByRole('button', { name: /Paket speichern/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: titel })).toBeVisible();
}

/** Als lernende Person anmelden. */
async function alsLernende(page: import('@playwright/test').Page) {
  await page.goto('./portal/#/anmelden');
  await page.getByRole('button', { name: 'Ich lerne' }).click();
  await page.getByLabel('Lern-ID').fill('fuchs-7390');
  await page.getByLabel('Kennwort').fill('testkennwort');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('heading', { name: 'Deine Kurse' }).waitFor();
}

/**
 * Eine Aufgabe beantworten.
 *
 * Bei einem frischen Paket wählt der Planer für Fach 1 die Karteikarte – das
 * ist in `domain/exercises.ts` festgelegt und seit Sprint 1 so. Ändert sich
 * das, fällt diese Hilfe auf, und das ist richtig so: Dann prüft sie etwas
 * anderes als das, was sie zu prüfen behauptet.
 */
async function eineAntwort(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
  await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
}

/** Der ganze Aufbau bis zu einem zugewiesenen Paket. Gibt den Code zurück. */
async function paketImKurs(page: import('@playwright/test').Page, titel: string) {
  await paketOhneKonto(page, titel);

  await alsLehrkraft(page);
  await kursAnlegen(page, 'Englisch 7b');
  const code = await codeErzeugen(page);

  await page.goto('./portal/#/material');
  await page.getByRole('button', { name: 'Alle übernehmen' }).click();
  await expect(page.getByText(/Paket ist übernommen|Pakete sind übernommen/)).toBeVisible();

  await page.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(page.getByText(/als Fassung 1 veröffentlicht/)).toBeVisible();

  await page.getByLabel('Einer Lerngruppe geben').selectOption({ label: 'Englisch 7b' });
  await page.getByRole('button', { name: 'Zuweisen' }).click();
  await expect(page.getByText(/liegt jetzt in „Englisch 7b"/)).toBeVisible();

  await page.getByRole('button', { name: 'Abmelden' }).click();
  return code;
}

test.describe('Üben im Portal', () => {
  test('@smoke ein Paket vom Gerät wird geübt – und der Lernstand bleibt im Konto', async ({
    page,
  }) => {
    const code = await paketImKurs(page, 'Unit 3 – City life');

    await alsLernende(page);
    await page.goto('./portal/#/beitreten');
    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await page.getByRole('heading', { name: 'Englisch 7b', level: 1 }).waitFor();

    // Der Satz, der den Unterschied zum kontofreien LexiFlow erklärt.
    await expect(page.getByText(/auf jedem Gerät, auf dem du dich anmeldest/)).toBeVisible();

    await page.getByRole('link', { name: 'Üben' }).click();
    await expect(page.getByRole('heading', { name: 'Unit 3 – City life', level: 1 })).toBeVisible();
    await expect(page.getByText('Noch 4 in dieser Runde')).toBeVisible();

    for (let uebrig = 4; uebrig > 0; uebrig -= 1) await eineAntwort(page);

    await expect(page.getByRole('heading', { name: 'Runde beendet' })).toBeVisible();
    await expect(page.getByText('4 Antworten in „Unit 3 – City life".')).toBeVisible();

    /*
      Der eigentliche Beweis: Die nächste Runde ist leer, weil der Lernstand
      geblieben ist. Stünde er nirgends, wären dieselben vier Vokabeln sofort
      wieder fällig – und die Seite zählte von vorn.
    */
    await page.getByRole('button', { name: 'Noch eine Runde' }).click();
    await expect(page.getByRole('heading', { name: 'Gerade nichts fällig' })).toBeVisible();
    await expect(page.getByText(/Das Nächste ist am/)).toBeVisible();
  });

  test('@smoke die Lehrkraft sieht davon nichts', async ({ page }) => {
    /*
      Die Zusage, auf der das Produkt steht – hier am fertigen Lernstand
      geprüft und nicht an einer leeren Tabelle: Erst wird wirklich geübt,
      dann sieht die Lehrkraft nach.
    */
    const code = await paketImKurs(page, 'Unit 3 – City life');

    await alsLernende(page);
    await page.goto('./portal/#/beitreten');
    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await page.getByRole('link', { name: 'Üben' }).click();
    await eineAntwort(page);

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await alsLehrkraft(page);
    await page.getByRole('link', { name: 'Englisch 7b' }).click();
    await page.getByRole('heading', { name: 'Englisch 7b', level: 1 }).waitFor();

    /*
      Geprüft wird die Mitgliedertabelle – dort stünde eine Zahl über das
      Üben, wenn es je eine gäbe. Nicht die ganze Seite: Auf ihr steht der
      Satz, der erklärt, warum dort nichts steht.
    */
    const tabelle = page.getByRole('table', { name: /Mitglieder dieses Kurses/ });
    await expect(tabelle).toContainText('Fuchs');
    for (const wort of ['geübt', 'Fortschritt', 'Antworten', 'zuletzt aktiv', 'Fach', '%']) {
      await expect(tabelle).not.toContainText(wort);
    }
  });

  test('@a11y die Übungsseite ohne schwerwiegende Befunde', async ({ page }) => {
    const code = await paketImKurs(page, 'Unit 3 – City life');

    await alsLernende(page);
    await page.goto('./portal/#/beitreten');
    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await page.getByRole('link', { name: 'Üben' }).click();
    await page.getByRole('heading', { name: 'Unit 3 – City life', level: 1 }).waitFor();

    const ergebnis = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      ergebnis.violations
        .filter((verstoss) => ['serious', 'critical'].includes(verstoss.impact ?? ''))
        .map((verstoss) => ({ regel: verstoss.id, wo: verstoss.nodes.map((k) => k.target.join(' ')) })),
    ).toEqual([]);
  });
});

test.describe('Üben auf dem Telefon', () => {
  test('@a11y die Übungsseite sprengt das Fenster nicht', async ({ page }) => {
    /*
      Der Aufbau läuft in Fensterbreite, die Prüfung auf dem Telefon. Grund:
      Auf schmalen Fenstern tritt die untere Leiste an die Stelle der
      Seitenschiene, und in ihr gibt es kein „Abmelden" – der Aufbau braucht
      aber einen Wechsel der Person. Geprüft werden soll die Übungsseite,
      nicht der Weg dorthin.
    */
    const code = await paketImKurs(page, 'Unit 3 – City life');

    await alsLernende(page);
    await page.goto('./portal/#/beitreten');
    await page.getByLabel('Einladungscode').fill(code);
    await page.getByRole('button', { name: 'Beitreten' }).click();
    await page.getByRole('link', { name: 'Üben' }).click();
    await page.getByRole('heading', { name: 'Unit 3 – City life', level: 1 }).waitFor();

    await page.setViewportSize({ width: 390, height: 844 });
    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBeLessThanOrEqual(1);
  });
});
