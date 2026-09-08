import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sprint 2A: der Weg vom englischen Text zum fertigen Paket.
 *
 * Der Test läuft in einem gewöhnlichen Chromium **ohne** Translator-API. Genau
 * das ist der Normalfall: Die Textwerkstatt muss ohne jede Übersetzungs-API
 * vollständig benutzbar sein. Es wird nie ein echtes Browsermodell geladen.
 */

const TEXT = [
  'The neighbourhood is crowded today.',
  'Litter is a problem in the neighbourhood.',
  'Volunteers collect litter every Saturday.',
].join(' ');

const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

async function expectNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ''),
  );

  expect(
    blocking.map((violation) => ({
      zustand: label,
      regel: violation.id,
      wirkung: violation.impact,
      beschreibung: violation.help,
      elemente: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

/**
 * Entfernt die eingebauten Modell-APIs, bevor die App startet.
 *
 * Seit Sprint 2B.1a erkennt LexiFlow die echten Web-IDL-Interfaces – und je
 * nach Browserbuild ist `Translator` auf einer http-Herkunft tatsächlich
 * vorhanden. Dieser Test beschreibt aber ausdrücklich den Normalfall „Browser
 * ohne Übersetzungs-API", also wird sie hier verlässlich abgeschaltet.
 */
async function withoutBrowserModels(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: undefined });
  });
}

/** Der Hinweis steht hinter einer Schaltfläche – aufklappen und lesen. */
async function readNotice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }).click();
  await expect(
    page.getByText(/vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/),
  ).toBeVisible();
  await page.keyboard.press('Escape');
}

async function analyze(page: Page): Promise<void> {
  await withoutBrowserModels(page);
  await page.goto('/#/material/import?quelle=text');
  await readNotice(page);
  await page.getByLabel('Englischer Text').fill(TEXT);
  await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
}

/** Und der zweite Schritt: Anzahl setzen, empfehlen lassen. */
async function recommend(page: Page, count = '20'): Promise<void> {
  const knopf = page.getByRole('button', { name: 'Empfehlungen generieren', exact: true });
  await expect(knopf).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Anzahl').selectOption(count);
  await knopf.click();
  await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeVisible();
}

test.describe('Textwerkstatt', () => {
  test('@smoke Text analysieren, Vokabeln übernehmen und üben', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
        externalRequests.push(request.url());
    });

    await withoutBrowserModels(page);
    await page.goto('/#/material');
    await page.getByRole('button', { name: 'Aus englischem Text erstellen' }).click();
    await expect(page.getByLabel('Englischer Text')).toBeVisible();

    // Der Hinweis nennt beides: Gesamttext bleibt außen vor, Originalsätze nicht.
    await page.getByRole('button', { name: 'Hinweis zur Textverarbeitung' }).click();
    await expect(
      page.getByText(/vollständige eingefügte Text wird nicht als eigener Datensatz gespeichert/),
    ).toBeVisible();
    await expect(
      page.getByText(/Originalsätze der übernommenen Vokabeln werden dagegen als Beispielsätze/),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByLabel('Englischer Text').fill(TEXT);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();

    // Schritt 2: Jahrgang setzen, empfehlen lassen.
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await page.getByLabel('Jahrgang').selectOption('7');
    await recommend(page);

    /*
      Empfehlungen mit Originalsatz – und mit dem, was das Wörterbuch ohne
      Rückfrage hergibt (seit 4B.4). „Ohne erfundene Übersetzung“ gilt
      unverändert: Erfunden wird nichts, eingetragen nur Eindeutiges.
    */
    await expect(page.getByText('„The neighbourhood is crowded today.“').first()).toBeVisible();
    await expect(page.getByLabel('Deutsche Antwort für „neighbourhood“')).toHaveValue('');

    // Ohne Translator-API bleibt alles benutzbar. Die Begründung steht seit
    // 4B.2 im benannten Aufklapper unter den Ergebnissen statt als Kasten davor.
    await page
      .getByRole('button', { name: /Übersetzungsvorschläge aus dem Sprachmodell/ })
      .click();
    await expect(page.getByText(/Dieser Browser bietet keine lokale Übersetzung/)).toBeVisible();

    // Es gibt keine Häkchen – die Antwort entscheidet.
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    // Drei Vokabeln von Hand übersetzen; der Rest bleibt offen und geht nicht mit.
    for (const [english, german] of [
      ['crowded', 'überfüllt'],
      ['litter', 'Müll'],
      ['neighbourhood', 'Nachbarschaft'],
    ] as const) {
      await page.getByLabel(`Deutsche Antwort für „${english}“`).fill(german);
    }
    /*
      Wie viele mitkommen, hängt seit 4B.4 auch daran, zu wie vielen das
      Wörterbuch ohne Rückfrage etwas weiß. Geprüft wird deshalb der
      Zusammenhang – die Zahl im Satz und die im Knopf sind dieselbe –, nicht
      ihr Wert.
    */
    const zahl = Number(
      /(\d+) Vokabeln? werden übernommen/.exec(
        (await page.getByText(/Vokabeln? werden übernommen/).first().textContent()) ?? '',
      )?.[1] ?? '0',
    );
    expect(zahl).toBeGreaterThanOrEqual(3);

    await page.getByRole('button', { name: `${zahl} Vokabeln prüfen & speichern` }).click();

    /*
      Übergabe an die bekannte Tabelle samt Beispielsatz aus dem Quelltext.

      Die Zeilenreihenfolge folgt jetzt der Empfehlung, nicht mehr dem Text –
      deshalb wird hier auf Werte geprüft und nicht auf Zeilennummern.
    */
    await expect(page.getByText(`${zahl} Zeilen ·`)).toBeVisible();
    const germanValues = await page
      .locator('table input[type="text"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
    for (const german of ['Nachbarschaft', 'überfüllt', 'Müll']) {
      expect(germanValues).toContain(german);
    }
    await page.getByRole('button', { name: 'Beispielsatz für crowded anzeigen' }).click();
    await expect(page.getByLabel('Beispielsatz 1 Englisch, crowded')).toHaveValue(
      'The neighbourhood is crowded today.',
    );
    await page.getByRole('button', { name: 'Beispielsatz für crowded ausblenden' }).click();

    // Titel und Speichern stehen in **demselben** Schritt wie die Tabelle.
    await page.getByLabel('Titel', { exact: true }).fill('Aus Text – City life');
    await page.getByRole('button', { name: /Paket speichern/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Aus Text – City life' }),
    ).toBeVisible();

    // Der Quelltext landet nicht im Paket.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Als LexiFlow-Paket herunterladen (.vocabpack.json)' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    const content = await (await import('node:fs/promises')).readFile(path, 'utf8');
    /*
      Die Zusage ist: Der **ganze** Quelltext wird nicht als Datensatz
      gespeichert. Einzelne Sätze daraus schon – als Beispielsatz derjenigen
      Vokabel, in der sie vorkommen; das ist der Zweck der Textwerkstatt.

      Bis 4B.3 stand hier ein einzelner Satz als Gegenprobe. Das trug nur,
      solange genau drei Vokabeln mitkamen; seit das Wörterbuch von selbst
      einträgt, kommt auch „Volunteers collect litter…“ als Beispielsatz mit –
      völlig richtig, aber es macht den Satz zum untauglichen Zeugen.

      Geprüft wird deshalb der Text als Ganzes: Er steht nirgends am Stück.
    */
    expect(content).not.toContain(TEXT);
    expect(content).toContain('The neighbourhood is crowded today.');

    // Lernbereich funktioniert unverändert.
    await page.getByRole('link', { name: 'Im Lernbereich ansehen' }).click();
    /*
      Seit 4B.6 steht der Lernstand als schlanke Zeile da: die Zahl vorne, die
      Fächer hinter dem i. Hier reicht die Zeile – dieser Test handelt vom Weg
      vom Text bis ins Üben, nicht von der Verteilung auf die Fächer.
    */
    await expect(page.getByText(new RegExp(`von ${zahl} sicher`))).toBeVisible();
    await page.getByRole('button', { name: 'Lernrunde starten' }).click();
    await expect(page.getByText(`Aufgabe 1 von ${zahl}`)).toBeVisible();
    await page.getByRole('button', { name: 'Lösung anzeigen' }).click();
    await page.getByRole('button', { name: 'Gewusst', exact: true }).click();

    // Kein einziger Zugriff auf einen fremden Host.
    expect(externalRequests).toEqual([]);
  });

  test('@smoke lehnt zu lange Texte ab, statt still zu kürzen', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill('a '.repeat(11_000));
    await expect(page.getByText('22.000 von 20.000 Zeichen')).toBeVisible();
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('20.000 Zeichen');
    await expect(page.getByLabel('Englischer Text')).toBeVisible();
  });

  /*
    Sprint 4B.3: Die Werkbank.

    Ob eine Spalte wirklich schmaler wird, wenn man am Griff zieht, lässt sich
    nur im echten Browser beantworten – jsdom rechnet kein Layout, und
    `SplitPane.test.tsx` prüft deshalb nur die Tastatur und die Ansage. Hier
    wird gemessen.
  */
  test('@smoke die Quellspalte lässt sich ziehen und mit den Pfeiltasten stellen', async ({
    page,
  }) => {
    await analyze(page);
    await recommend(page);

    const quelle = page.locator('.split__source');
    const griff = page.getByRole('separator', { name: 'Breite der Quellspalte' });

    // Der analysierte Text steht links zum Nachschlagen.
    await expect(page.getByRole('group', { name: 'Analysierter Text' })).toContainText(
      'crowded',
    );

    const vorher = (await quelle.boundingBox())?.width ?? 0;
    expect(vorher).toBeGreaterThan(0);

    // Ziehen: 80 px nach rechts. Die Bewegung geht in zwei Schritten, damit
    // ein `pointermove` zwischen Druck und Loslassen wirklich stattfindet.
    const box = await griff.boundingBox();
    if (!box) throw new Error('Der Griff hat keine Fläche.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2);
    await page.mouse.move(box.x + 80, box.y + box.height / 2);
    await page.mouse.up();

    const nachher = (await quelle.boundingBox())?.width ?? 0;
    expect(nachher).toBeGreaterThan(vorher + 40);

    // Und dasselbe ohne Maus.
    const gezogen = Number(await griff.getAttribute('aria-valuenow'));
    await griff.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(Number(await griff.getAttribute('aria-valuenow'))).toBe(gezogen - 2);
    expect((await quelle.boundingBox())?.width ?? 0).toBeLessThan(nachher);
  });

  /*
    Sprint 4D: Der Griff springt nicht mehr auf den Finger.

    Bis dahin rechnete `SplitPane` die Breite als `clientX − box.left`. Damit
    wurde die Spaltenbreite gleich der Zeigerposition, unabhängig davon, wo
    innerhalb der Greifzone man zugefasst hatte. Die Greifzone ist 16 px breit
    (4 px Griff, ±6 px Polster) und liegt asymmetrisch zur Kante: Wer rechts
    außen zufasste, sah die Spalte um bis zu 10 px nach rechts schnappen,
    bevor sie überhaupt folgte.

    Der Test fasst deshalb ausdrücklich **nicht** in der Mitte zu – dort ist
    der Versatz fast null und der Fehler unsichtbar. Er fasst am rechten Rand
    an und bewegt sich um genau einen Pixel: Die Spalte darf sich um diesen
    einen Pixel ändern und um keinen mehr.
  */
  test('@smoke der Griff folgt dem Finger, statt auf ihn zu springen', async ({ page }) => {
    await analyze(page);
    await recommend(page);

    const quelle = page.locator('.split__source');
    const griff = page.getByRole('separator', { name: 'Breite der Quellspalte' });

    const box = await griff.boundingBox();
    if (!box) throw new Error('Der Griff hat keine Fläche.');
    const vorher = (await quelle.boundingBox())?.width ?? 0;
    expect(vorher).toBeGreaterThan(0);

    // Am äußeren Rand des Trefferpolsters zufassen, nicht in der Mitte.
    const rand = box.x + box.width + 5;
    const mitte = box.y + box.height / 2;
    await page.mouse.move(rand, mitte);
    await page.mouse.down();
    await page.mouse.move(rand + 1, mitte);

    const nachher = (await quelle.boundingBox())?.width ?? 0;
    await page.mouse.up();

    /*
      Ein Pixel Bewegung, ein Pixel Breite. Vor der Korrektur stand hier ein
      Sprung von rund neun Pixeln – die Toleranz ist deshalb eng genug, ihn zu
      fangen, und weit genug für die Rundung des Rasters.
    */
    expect(Math.abs(nachher - vorher - 1)).toBeLessThan(3);
  });

  /*
    Sprint 4B.3, Block A: die vollständige englische Lernform – mit dem
    **echten** Offline-Wörterbuch.

    Die Komponententests arbeiten mit einem eingesetzten Miniwörterbuch; sie
    prüfen die Regel. Ob der ausgelieferte Bestand sie trägt, prüft nur ein
    Lauf im Browser: ob er `single out` wirklich als Mehrwortverb führt und
    `depend on` wirklich nicht.
  */
  test('@smoke baut vollständige Lernformen und fragt, wo es nicht sicher ist', async ({
    page,
  }) => {
    const QUELLE = [
      'Communities along the shore depend on natural barriers to survive.',
      'Planners often single out the cheapest option to save money.',
      'Residents endure the noise of construction for years.',
    ].join(' ');

    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(QUELLE);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await recommend(page);

    const formen = page.locator('.candidate__word');

    // Ein Verb bekommt seinen Infinitiv.
    await expect(formen.filter({ hasText: /^to endure$/ })).toHaveCount(1);

    // Ein vom Wörterbuch belegtes Phrasal Verb behält seine Partikel – ohne
    // Rückfrage, weil Satz und Wörterbuch dasselbe sagen.
    await expect(formen.filter({ hasText: /^to single out$/ })).toHaveCount(1);

    /*
      Und die Gegenprobe: `depend on` steht im Satz, aber nicht im Wörterbuch.
      Die Rektion wird deshalb **nicht** stillschweigend gebaut – die Zeile
      bleibt bei `to depend` und stellt die Frage.
    */
    await expect(formen.filter({ hasText: /^to depend$/ })).toHaveCount(1);
    const frage = page.locator('.candidate__review');
    await expect(frage).toContainText('Gehört „on“ zur Vokabel?');

    // Ein Klick beantwortet sie – das ist die Entscheidung der Lehrkraft.
    await page
      .getByRole('button', { name: 'Lernform „to depend on sb./sth.“ übernehmen' })
      .click();
    await expect(formen.filter({ hasText: /^to depend on sb\.\/sth\.$/ })).toHaveCount(1);
    await expect(page.locator('.candidate__review')).toHaveCount(0);
  });

  /*
    Sprint 4B.3: Die klebende Aktionsleiste.

    Ob sie wirklich klebt, kann nur der Browser sagen – jsdom rechnet kein
    Layout. Und der zweite Teil ist der wichtigere: Die offene Frage zur
    Lernform muss **vor dem Speichern** auffallen, also dort stehen, wo der
    Speichern-Knopf steht.
  */
  test('@smoke die Aktionsleiste bleibt sichtbar und führt zur offenen Frage', async ({
    page,
  }) => {
    const QUELLE = [
      'Communities along the shore depend on natural barriers to survive.',
      'Residents endure the noise of construction for years.',
      'Engineers try to surmount obstacles by building sea walls.',
      'Planners often single out the cheapest option to save money.',
    ].join(' ');

    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(QUELLE);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await recommend(page, '10');

    const leiste = page.locator('.actionbar');
    await expect(leiste).toBeVisible();

    /*
      Der Fortschritt zählt mit – und zwar die **Veränderung**.

      Wie viele Zeilen beim Empfehlen schon gefüllt sind, hängt am Wörterbuch
      und darf sich ändern, ohne diesen Test zu brechen. Was sich nicht ändern
      darf: Ein Feld leeren senkt die Zahl um genau eins, es wieder füllen hebt
      sie um genau eins.
    */
    const feld = page.getByLabel('Deutsche Antwort für „to depend“');
    await feld.fill('abhängen');
    const gezaehlt = async (): Promise<number> => {
      const text = (await leiste.textContent()) ?? '';
      return Number(/(\d+) von \d+/.exec(text)?.[1] ?? '-1');
    };
    const voll = await gezaehlt();
    expect(voll).toBeGreaterThan(0);
    await feld.fill('');
    await expect(leiste).toContainText(`${voll - 1} von 10`);
    await feld.fill('abhängen');
    await expect(leiste).toContainText(`${voll} von 10`);

    /*
      Und sie klebt: Auch ganz unten in einer langen Liste steht sie im Bild.
      Gemessen wird die Unterkante gegen die Fensterhöhe – eine Leiste, die
      mit hinausgescrollt wäre, läge weit darunter.
    */
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(200);
    const box = await leiste.boundingBox();
    const hoehe = page.viewportSize()?.height ?? 0;
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(hoehe + 2);

    /*
      Die offene Frage steht neben dem Speichern-Knopf – und der Knopf führt
      hin. Eine Frage, die man nur beim Scrollen findet, ist vor dem Speichern
      keine.
    */
    const frage = leiste.getByRole('button', { name: /offene Frage zur Lernform/ });
    await expect(frage).toBeVisible();
    await frage.click();

    // Der Fokus liegt jetzt auf der Bestätigung in der betroffenen Zeile.
    const bestaetigen = page.getByRole('button', {
      name: 'Lernform „to depend on sb./sth.“ übernehmen',
    });
    await expect(bestaetigen).toBeFocused();

    // Beantwortet – und die Leiste meldet nichts Offenes mehr.
    await bestaetigen.click();
    await expect(leiste.getByRole('button', { name: /offene Frage/ })).toHaveCount(0);
  });

  /*
    Sprint 4B.4: Der Quelltext links ist Werkzeug geworden – ohne aufzuhören,
    ein Text zu sein.

    Was jsdom nicht kann und der Browser schon: zeigen, dass ein Klick auf ein
    Wort im Fließtext rechts eine Zeile erzeugt – mit dem
    Übersetzungsvorschlag aus dem **echten** Wörterbuch, nicht aus einem
    eingesetzten Miniatursatz.

    Der Text ist mit Absicht ein anderer als oben: `erosion` ist eines der
    wenigen Wörter, über deren Bedeutung die Quelle sich einig ist. Genau
    daran hängt die Zusage „samt Vorschlag“.
  */
  const KUeSTE = [
    'The village suffers from erosion every winter.',
    'People there depend on natural barriers to survive.',
  ].join(' ');

  function word(page: Page, text: string) {
    return page
      .getByRole('group', { name: 'Analysierter Text' })
      .locator('[data-word]')
      .filter({ hasText: new RegExp(`^${text}$`) })
      .first();
  }

  test('@smoke ein Klick im Quelltext nimmt ein Wort samt Vorschlag auf', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(KUeSTE);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();

    /*
      Warten, bis das Wörterbuch fertig ist: Vorher erzeugte ein Klick eine
      Zeile **ohne** Vorschlag, obwohl er zwei Sekunden später dagestanden
      hätte. Dieselbe Bedingung sperrt auch die Hauptaktion.
    */
    await expect(
      page.getByRole('button', { name: 'Empfehlungen generieren', exact: true }),
    ).toBeEnabled({ timeout: 30_000 });

    await word(page, 'erosion').click();

    // Die Zeile ist da – und das Wörterbuch hat schon geantwortet.
    const feld = page.getByLabel('Deutsche Antwort für „erosion“');
    await expect(feld).toBeVisible();
    await expect(feld).not.toHaveValue('');

    // Und das Wort im Text sagt jetzt, dass es übernommen wird.
    await expect(word(page, 'erosion')).toHaveAttribute('data-state', 'taken');
  });

  /*
    Sprint 4B.4: Wortgruppen.

    `depend on` ist die Lernform, um die es im Unterricht geht – und ein Klick
    auf ein einzelnes Wort erreicht sie nicht. Umschalt und Pfeiltaste sind der
    Weg dorthin. Geprüft wird im Browser, weil es um echte Tastendrücke und um
    echten Fokus geht.
  */
  test('@smoke eine Wortgruppe im Text wird eine Lernform', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(KUeSTE);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Empfehlungen generieren', exact: true }),
    ).toBeEnabled({ timeout: 30_000 });

    await word(page, 'depend').focus();
    await page.keyboard.press('Shift+ArrowRight');

    const knopf = page.getByRole('button', { name: '„depend on“ aufnehmen' });
    await expect(knopf).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByLabel(/Deutsche Antwort für „(to )?depend on“/)).toBeVisible();
  });

  /*
    Sprint 4B.4: Ein Tabstopp für den ganzen Text.

    Der Grund für den ganzen Umbau. Vorher war jedes gefundene Wort ein
    `<button>` – bei 220 Kandidaten 220 Tabstopps, durch die man sich
    hindurchdrücken musste, um zu den Einstellungen zu kommen.
  */
  test('@a11y der Quelltext kostet genau einen Tabstopp', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(KUeSTE);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();

    const quelle = page.getByRole('group', { name: 'Analysierter Text' });
    await expect(quelle.locator('[data-word][tabindex="0"]')).toHaveCount(1);
    // Und keine Schaltflächen: Der Absatz ist Text, keine Werkzeugleiste.
    await expect(quelle.getByRole('button')).toHaveCount(0);
  });

  test('@smoke die eingetragenen Übersetzungen stehen ohne Knopf da', async ({ page }) => {
    /*
      Der Sammelknopf „Übersetzungsvorschläge eintragen“ ist weg: Was das
      Wörterbuch **ohne Rückfrage** hergibt, steht gleich da. Geprüft wird
      beides – dass etwas dasteht und dass der Knopf verschwunden ist.

      Der Küstentext steht hier, weil er `erosion` enthält. Über die meisten
      Wörter ist die Quelle sich uneins, und dann bleibt das Feld mit gutem
      Grund leer – siehe `safeAutoAnswer`.
    */
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').fill(KUeSTE);
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await recommend(page);

    await expect(
      page.getByRole('button', { name: 'Übersetzungsvorschläge eintragen' }),
    ).toHaveCount(0);

    const gefuellt = await page
      .getByLabel(/^Deutsche Antwort für/)
      .evaluateAll((felder) =>
        felder.filter((feld) => (feld as HTMLInputElement).value.trim().length > 0).length,
      );
    expect(gefuellt).toBeGreaterThan(0);
  });

  test('@a11y Empfehlungsschritt ohne schwerwiegende Befunde', async ({ page }) => {
    await analyze(page);
    await recommend(page);
    await expectNoSeriousViolations(page, 'Empfehlungen');
  });

  test('@a11y Fokus liegt nach der Analyse auf der Schrittüberschrift', async ({ page }) => {
    await analyze(page);
    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeFocused();
  });

  test('@a11y Fokus wandert nach dem Empfehlen ans Ergebnis', async ({ page }) => {
    await analyze(page);
    await recommend(page);
    await expect(page.getByRole('heading', { name: /Vorgeschlagene Vokabeln/ })).toBeFocused();
  });

  test('@a11y Der Stepper führt zurück, ohne die Arbeit zu verlieren', async ({ page }) => {
    await analyze(page);
    await recommend(page);
    await page.getByLabel('Deutsche Antwort für „crowded“').fill('überfüllt');

    await page.getByRole('button', { name: 'Schritt 1: Text analysieren' }).click();
    await expect(page.getByLabel('Englischer Text')).toHaveValue(TEXT);
    await page.getByRole('button', { name: 'Schritt 2: Empfehlungen generieren' }).click();
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  test('@a11y Textwerkstatt ist mit der Tastatur bedienbar', async ({ page }) => {
    await withoutBrowserModels(page);
    await page.goto('/#/material/import?quelle=text');
    await page.getByLabel('Englischer Text').focus();
    await page.keyboard.type('The neighbourhood is crowded today.');
    await page.getByRole('button', { name: 'Text analysieren', exact: true }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Empfehlungen generieren' })).toBeVisible();
    await recommend(page);
    // Leeren vor dem Tippen: Das Wörterbuch hat hier schon geantwortet, und
    // getippt werden soll die Eingabe, nicht ein Anhängsel.
    await page.getByLabel('Deutsche Antwort für „crowded“').fill('');
    await page.getByLabel('Deutsche Antwort für „crowded“').focus();
    await page.keyboard.type('überfüllt');
    await expect(page.getByLabel('Deutsche Antwort für „crowded“')).toHaveValue('überfüllt');
  });

  test.describe('Smartphone-Breite', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('@a11y Empfehlungsschritt ohne horizontalen Überlauf', async ({ page }) => {
      await analyze(page);
      await recommend(page);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  });
});
