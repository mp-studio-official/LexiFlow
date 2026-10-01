/*
  Die Hülle, gemessen statt behauptet.

  ## Warum ein eigener Lauf

  Die Hülle ist in 5B.2c von keiner Route eingebunden — die Breitensuite kann
  sie also nicht erreichen. Gemessen werden muss sie trotzdem: Ob die Leiste
  bei Hover ihre Breite hält, ob der Tooltip auch bei Tastaturfokus erscheint,
  ob die andere Navigation am Haltepunkt wirklich aus dem Accessibility-Baum
  verschwindet — das sind Fragen an einen Browser. jsdom beantwortet keine
  davon, weil es kein Layout rechnet.

  ## Wie die Seite entsteht

  Die Hülle wird **aus ihrem eigenen Quelltext** gerendert: esbuild bündelt
  `Huelle.tsx`, `renderToStaticMarkup` macht daraus HTML, und dazu kommt
  `huelle.css` mitsamt den Token. Ein von Hand nachgebautes Markup wäre eine
  zweite Quelle — und die liefe irgendwann auseinander, ohne dass dieser Lauf
  es merkt.

      node scripts/huelle-messen.mjs

  Braucht einen Browser (`npx playwright install chromium`) und React.
  `LEXIFLOW_CHROMIUM` setzt einen vorinstallierten Browser.
*/

import { chromium } from '@playwright/test';
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const befunde = [];
const melde = (text) => befunde.push(text);

/* ------------------------------------------------- Die Hülle als Markup */

/*
  Die Ziele kommen **aus der echten Quelle**, nicht aus einer Liste in diesem
  Skript. Seit 5B.2d leitet `PortalShell` sie aus `navigationsziele.ts` ab;
  stünde hier eine zweite Liste, misst dieser Lauf irgendwann eine Navigation,
  die es so nicht mehr gibt. Dieselben Funktionen, dieselbe Zuordnung.
*/
const EINSTIEG = `
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Huelle } from ${JSON.stringify(resolve(WURZEL, 'src/ui/Huelle.tsx'))};
import { beschriftung } from ${JSON.stringify(resolve(WURZEL, 'src/ui/navigation.ts'))};
import { aktivesZiel, sichtbareZiele } from ${JSON.stringify(
  resolve(WURZEL, 'src/hosted/navigationsziele.ts'),
)};

/* Wortgleich zu \`zieleFuerHuelle\` im Adapter. */
const zieleFuer = (profil, groesse) =>
  sichtbareZiele(profil, groesse).map((ziel) => {
    const kurz = beschriftung(ziel, groesse);
    return {
      pfad: ziel.pfad,
      label: ziel.label,
      zeichen: ziel.zeichen,
      ...(kurz === ziel.label ? {} : { labelKurz: kurz }),
    };
  });

const rahmen = (profil, pfad, zusatz = {}) => {
  const schreibtisch = profil ? zieleFuer(profil, 'schreibtisch') : [];
  const telefon = profil ? zieleFuer(profil, 'telefon') : [];
  const aktivS = profil ? aktivesZiel(pfad, 'schreibtisch') : undefined;
  const aktivT = profil ? aktivesZiel(pfad, 'telefon') : undefined;
  return {
    markup: renderToStaticMarkup(
      h(
        Huelle,
        {
          zieleSchreibtisch: schreibtisch,
          zieleTelefon: telefon,
          ...(aktivS ? { aktiverPfadSchreibtisch: aktivS } : {}),
          ...(aktivT ? { aktiverPfadTelefon: aktivT } : {}),
          marke: h('span', null, 'LF'),
          markePfad: '/',
          fusszeile: h('p', null, 'Fußzeile mit Datenschutz'),
          ...zusatz,
        },
        h('h1', null, 'Inhalt'),
        h('p', null, 'Ein Absatz, der bis an das untere Ende reicht.'.repeat(40)),
      ),
    ),
    aktivS: aktivS ?? '—',
    aktivT: aktivT ?? '—',
    zieleS: schreibtisch.length,
    zieleT: telefon.length,
  };
};

export const faelle = [
  {
    name: 'Lehrkraft auf /ki',
    ausfuehrlich: true,
    ...rahmen('lehrkraft', '/ki', {
      kopfAktionen: h('a', { href: '/lernen' }, 'Als Lernende ansehen'),
      fussAktionen: [{ label: 'Abmelden', zeichen: 'abmelden', ausloesen: () => {} }],
    }),
  },
  { name: 'Lehrkraft auf /verwaltung', ...rahmen('lehrkraft', '/verwaltung') },
  { name: 'Lehrkraft auf /material', ...rahmen('lehrkraft', '/material') },
  { name: 'Lehrkraft auf /pakete', ...rahmen('lehrkraft', '/pakete') },
  { name: 'Lernende auf /lernen', ...rahmen('lernende', '/lernen') },
  { name: 'Öffentlich auf /anmelden', ohneNavigation: true, ...rahmen(null, '/anmelden') },
];
`;

const gebaut = await esbuild.build({
  stdin: { contents: EINSTIEG, resolveDir: WURZEL, loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  /*
    `react-dom/server` ist CommonJS und ruft `require('util')`. In einem
    ESM-Bündel gibt es kein `require` — der Lauf brach dort ab. Der Vorspann
    stellt eines her, verankert an der `package.json` des Projekts: Das Modul
    wird gleich als `data:`-URL geladen, und `import.meta.url` wäre dort kein
    Pfad, von dem aus sich etwas auflösen ließe.
  */
  banner: {
    js:
      "import { createRequire as __erzeugeRequire } from 'node:module';\n" +
      `const require = __erzeugeRequire(${JSON.stringify(
        new URL(`file://${resolve(WURZEL, 'package.json')}`).href,
      )});`,
  },
  write: false,
  logLevel: 'silent',
  /* Das Stylesheet kommt unten als Text dazu, nicht über den Bündler. */
  loader: { '.css': 'empty' },
});

const quelltext = gebaut.outputFiles[0].text;
const { faelle } = await import(
  `data:text/javascript;base64,${Buffer.from(quelltext).toString('base64')}`
);

/* ------------------------------------------------------- Die Testseite */

const TOKEN = readFileSync(resolve(WURZEL, 'src/styles/tokens.css'), 'utf8');
const GLAS = readFileSync(resolve(WURZEL, 'src/styles/glas.css'), 'utf8');
const HUELLE = readFileSync(resolve(WURZEL, 'src/ui/huelle.css'), 'utf8').replace(
  /@import[^;]+;/g,
  '',
);

const seiteFuer = (markup) => `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0}${TOKEN}${GLAS}${HUELLE}</style>
<body>${markup}</body></html>`;

/* ------------------------------------------------------------ Messen */

const browserPfad = process.env['LEXIFLOW_CHROMIUM'];
const browser = await chromium.launch(browserPfad ? { executablePath: browserPfad } : {});

const BREITEN = [390, 768, 1024, 1440];
/** Ab hier gilt die Icon-Leiste: 62rem = 992 px. */
const SCHREIBTISCH_AB = 992;

console.log('Die Hülle, gemessen in Chromium — mit den Zielen aus der echten Quelle:\n');

for (const fall of faelle) {
  const seite = seiteFuer(fall.markup);
  console.log('%s  (Schreibtisch %d Ziele, aktiv %s · Telefon %d Ziele, aktiv %s)',
    fall.name, fall.zieleS, fall.aktivS, fall.zieleT, fall.aktivT);

for (const breite of BREITEN) {
    const kontext = await browser.newContext({ viewport: { width: breite, height: 900 } });
    const blatt = await kontext.newPage();
    await blatt.setContent(seite);

    const amSchreibtisch = breite >= SCHREIBTISCH_AB;
    const leiste = blatt.locator('.huelle-leiste');
    const unten = blatt.locator('.huelle-unten');

    const sichtbar = async (ort) =>
      (await ort.evaluate((el) => getComputedStyle(el).display)) !== 'none';

    /*
      Vor der Anmeldung gibt es keine Bereichsnavigation — und zwar keine
      leere, sondern gar keine. Ein leeres `<nav>` mit Namen stünde im
      Accessibility-Baum und verspräche etwas, das es nicht gibt.
    */
    if (fall.ohneNavigation) {
      const zahl = (await leiste.count()) + (await unten.count());
      if (zahl !== 0) {
        melde(`${fall.name} @ ${breite} px: ${zahl} Navigationsleiste(n), erwartet war keine`);
      }
      const navs = await blatt.locator('nav').count();
      if (navs !== 0) melde(`${fall.name} @ ${breite} px: ${navs} <nav> im Baum`);
      console.log('  %d px  keine Bereichsnavigation, kein <nav> im Baum', breite);
    } else {
    const leisteDa = await sichtbar(leiste);
    const untenDa = await sichtbar(unten);

    if (leisteDa === untenDa) {
      melde(`${fall.name} @ ${breite} px: beide Navigationen ${leisteDa ? 'sichtbar' : 'verborgen'}`);
    }
    if (leisteDa !== amSchreibtisch) {
      melde(`${fall.name} @ ${breite} px: die Icon-Leiste ist ${leisteDa ? 'da' : 'weg'} — erwartet war das Gegenteil`);
    }

    /* Aus dem Accessibility-Baum heraus, nicht nur unsichtbar. */
    const versteckte = amSchreibtisch ? unten : leiste;
    const imBaum = await versteckte.evaluate((el) => {
      const stil = getComputedStyle(el);
      return stil.display !== 'none' && stil.visibility !== 'hidden';
    });
    if (imBaum) melde(`${fall.name} @ ${breite} px: die verborgene Navigation steht noch im Accessibility-Baum`);

    }

    /* Kein waagerechter Überlauf. */
    const ueberlauf = await blatt.evaluate(
      (b) => document.documentElement.scrollWidth - b,
      breite,
    );
    if (ueberlauf > 1) melde(`${fall.name} @ ${breite} px: ${ueberlauf} px waagerechter Überlauf`);

    /* Jedes anklickbare Ziel misst mindestens 44 × 44 px. */
    /*
      Gemessen werden die Bedienelemente **der Hülle**. Was ihr als `children`
      oder `kopfAktionen` übergeben wird, gehört dem Aufrufer — ein nackter
      `<button>` in diesem Gerüst sagt nichts darüber aus, wie groß derselbe
      Knopf im Portal mit seinen Klassen ist. Dort misst ihn die Breitensuite.
    */
    const zuKlein = await blatt.evaluate(() => {
      const klein = [];
      for (const el of document.querySelectorAll('[class*="huelle"]')) {
        if (!/^(A|BUTTON)$/.test(el.tagName)) continue;
        const k = el.getBoundingClientRect();
        if (k.width === 0 && k.height === 0) continue;
        if (getComputedStyle(el).position === 'fixed' && k.height === 0) continue;
        if (Math.ceil(k.width) < 44 || Math.ceil(k.height) < 44) {
          klein.push(`${el.className || el.tagName} ${Math.round(k.width)}×${Math.round(k.height)}`);
        }
      }
      return [...new Set(klein)];
    });
    /* Das Sprungziel liegt außerhalb des Bildes und wird unten eigens geprüft. */
    const echtZuKlein = zuKlein.filter((e) => !e.includes('huelle__sprung'));
    if (echtZuKlein.length) melde(`${fall.name} @ ${breite} px: zu klein — ${echtZuKlein.join(', ')}`);

    /* Das Sprungziel: anfangs außerhalb, nach Fokus im Bild. */
    const sprung = blatt.locator('.huelle__sprung');
    const vorher = await sprung.boundingBox();
    await sprung.focus();
    const nachher = await sprung.boundingBox();
    if (!vorher || vorher.y + vorher.height > 0) {
      melde(`${fall.name} @ ${breite} px: das Sprungziel steht schon vor dem Fokus im Bild`);
    }
    if (!nachher || nachher.y < 0) {
      melde(`${fall.name} @ ${breite} px: das Sprungziel kommt beim Fokus nicht ins Bild`);
    }

    /* Genau ein aktiver Eintrag je sichtbarer Navigation. */
    if (!fall.ohneNavigation) {
    const versteckte = amSchreibtisch ? unten : leiste;
    const aktive = await (amSchreibtisch ? leiste : unten).evaluate(
      (el) => el.querySelectorAll('[aria-current="page"]').length,
    );
    if (aktive !== 1) melde(`${fall.name} @ ${breite} px: ${aktive} aktive Einträge in der sichtbaren Navigation`);

    /*
      Und die verborgene Navigation trägt zwar einen eigenen Aktivwert, ist aber
      trotzdem nicht erreichbar. Das ist der Fall, den zwei getrennte Werte erst
      schaffen: Vorher stand links wie unten dasselbe, jetzt steht dort
      Verschiedenes — und beides darf nicht gleichzeitig vorgelesen werden.
    */
    const aktivVersteckt = await versteckte.evaluate((el) => ({
      markiert: el.querySelectorAll('[aria-current="page"]').length,
      sichtbar: getComputedStyle(el).display !== 'none',
    }));
    if (aktivVersteckt.sichtbar) {
      melde(`${fall.name} @ ${breite} px: die verborgene Navigation ist sichtbar, obwohl sie es nicht sein darf`);
    }

    /* Das aktive Ziel der sichtbaren Navigation — gemeldet, nicht geraten. */
    const aktivesZiel = await (amSchreibtisch ? leiste : unten).evaluate(
      (el) => el.querySelector('[aria-current="page"]')?.getAttribute('aria-label') ?? '—',
    );
    console.log(
      '  %d px  sichtbar: %s · aktiv: %s · verborgen trägt %d Markierung(en), nicht im Baum',
      breite,
      amSchreibtisch ? 'Icon-Leiste' : 'untere Leiste',
      aktivesZiel,
      aktivVersteckt.markiert,
    );
    }


  /*
    Die feste untere Leiste darf nichts verdecken. Gemessen wird nicht die
    Zusage im Stylesheet, sondern die Lage im Bild: Reicht ein Landmark bis
    unter die Leiste, steht dort Inhalt, den niemand lesen kann.
  */
  const verdeckt = await blatt.evaluate(() => {
    const leiste = document.querySelector('.huelle-unten');
    if (!leiste || getComputedStyle(leiste).display === 'none') return [];
    window.scrollTo(0, document.documentElement.scrollHeight);
    const bar = leiste.getBoundingClientRect();
    const treffer = [];
    for (const wahl of ['header.huelle__kopf', 'main.huelle__inhalt', 'footer.huelle__fusszeile']) {
      const el = document.querySelector(wahl);
      if (!el) continue;
      const k = el.getBoundingClientRect();
      const schnitt = Math.min(k.bottom, bar.bottom) - Math.max(k.top, bar.top);
      if (schnitt > 1) treffer.push(`${wahl} ${Math.round(schnitt)} px`);
    }
    window.scrollTo(0, 0);
    return treffer;
  });
  if (verdeckt.length) {
    melde(`${fall.name} @ ${breite} px: die feste Leiste verdeckt ${verdeckt.join(', ')}`);
  }

    if (amSchreibtisch && fall.ausfuehrlich) {
      /* ---------------------------- Breite vor, während und nach Tooltip */
      const breiteVon = async () => (await leiste.boundingBox())?.width ?? -1;
      const ruhe = await breiteVon();

      const ziel = blatt.locator('.huelle-leiste__ziel').nth(1);
      const tipp = ziel.locator('.huelle-leiste__tipp');

      const tippSichtbar = async () =>
        Number(await tipp.evaluate((el) => getComputedStyle(el).opacity)) > 0.5;

      if (await tippSichtbar()) melde(`${breite} px: der Tooltip steht schon im Ruhezustand da`);

      await ziel.hover();
      const beiHover = await breiteVon();
      const tippBeiHover = await tippSichtbar();

      /* Den Zeiger wegbewegen, bevor der Fokus gemessen wird — sonst misst man
         Hover und nennt es Fokus. */
      await blatt.mouse.move(breite - 5, 880);
      await blatt.waitForTimeout(60);
      const tippNachHover = await tippSichtbar();

      await ziel.evaluate((el) => el.focus());
      const beiFokus = await breiteVon();
      const tippBeiFokus = await tippSichtbar();

      await ziel.evaluate((el) => el.blur());
      await blatt.waitForTimeout(60);
      const danach = await breiteVon();
      const tippDanach = await tippSichtbar();

      console.log(
        '  %d px  Leiste: Ruhe %s · Hover %s · Fokus %s · danach %s',
        breite,
        ruhe,
        beiHover,
        beiFokus,
        danach,
      );
      console.log(
        '          Tooltip: Ruhe %s · Hover %s · nach Hover %s · Fokus %s · danach %s',
        tippSichtbar ? 'aus' : 'aus',
        tippBeiHover ? 'an' : 'aus',
        tippNachHover ? 'an' : 'aus',
        tippBeiFokus ? 'an' : 'aus',
        tippDanach ? 'an' : 'aus',
      );

      for (const [was, wert] of [
        ['im Ruhezustand', ruhe],
        ['bei Hover', beiHover],
        ['bei Fokus', beiFokus],
        ['danach', danach],
      ]) {
        if (Math.round(wert) !== 76) melde(`${breite} px: die Leiste misst ${was} ${wert} px statt 76`);
      }
      if (!tippBeiHover) melde(`${breite} px: der Tooltip erscheint bei Hover nicht`);
      if (tippNachHover) melde(`${breite} px: der Tooltip bleibt stehen, wenn der Zeiger weg ist`);
      if (!tippBeiFokus) melde(`${breite} px: der Tooltip erreicht die Tastatur nicht`);
      if (tippDanach) melde(`${breite} px: der Tooltip bleibt nach dem Fokus stehen`);

      /* ------------------- Der aktive Zustand ohne jeden Farbunterschied */

      /*
        Die eigentliche Frage: Bleibt der aktive Eintrag erkennbar, wenn Farbe
        nichts mehr unterscheidet?

        Dafür reicht es nicht, in Graustufen zu schalten — die gefüllte Fläche
        ist auch dort noch dunkler als die ruhige, und das wäre Helligkeit, nicht
        Geometrie. Also wird die Füllung **gleichgesetzt**: beide Einträge
        derselbe Hintergrund, dieselbe Schriftfarbe, alles in Graustufen. Was
        danach übrig bleibt, kann nur Form sein.

        Verglichen werden die Bildpunkte beider Einträge. Bleiben sie gleich, ist
        der aktive Zustand reine Farbe.
      */
      const aufraeumen = await blatt.evaluate(() => {
        const stil = document.createElement('style');
        stil.id = 'farbe-weg';
        stil.textContent = `
          .huelle-leiste { filter: grayscale(1) !important; }
          .huelle-leiste__ziel,
          .huelle-leiste__ziel[data-aktiv] {
            background: #ffffff !important;
            color: #000000 !important;
          }`;
        document.head.append(stil);
        return true;
      });
      void aufraeumen;

      /*
        Verglichen wird **derselbe** Eintrag, einmal aktiv und einmal nicht.

        Die erste Fassung verglich den aktiven Eintrag mit einem anderen, ruhigen
        — und maß damit vor allem, dass "Kurse" anders aussieht als "Start". Sie
        war grün, auch als der Marker versuchsweise unsichtbar gemacht wurde:
        Zwei verschiedene Zeichen unterscheiden sich immer. Ein Vergleich, der
        die falschen Dinge nebeneinanderlegt, prüft nichts.
      */
      const probe = blatt.locator('.huelle-leiste__ziel[aria-current="page"]');
      if ((await probe.count()) === 0) {
        melde(`${breite} px: kein aktiver Eintrag zum Vergleich`);
      } else {
        /*
          Ein Griff auf das Element, kein Locator: Sobald `aria-current` fällt,
          findet der Locator nichts mehr und wartet dreißig Sekunden auf ein
          Element, das er selbst gerade weggeschaltet hat.
        */
        const griff = await probe.elementHandle();
        if (!griff) throw new Error('kein Griff auf den aktiven Eintrag');

        const mitZustand = (await griff.screenshot()).toString('base64');
        await griff.evaluate((el) => {
          el.removeAttribute('aria-current');
          el.removeAttribute('data-aktiv');
        });
        const ohneZustand = (await griff.screenshot()).toString('base64');
        await griff.evaluate((el) => {
          el.setAttribute('aria-current', 'page');
          el.setAttribute('data-aktiv', 'ja');
        });

        const unterschied = await blatt.evaluate(
          async ([eins, zwei]) => {
            const lade = async (daten) => {
              const bild = new Image();
              bild.src = `data:image/png;base64,${daten}`;
              await bild.decode();
              const leinwand = document.createElement('canvas');
              leinwand.width = bild.width;
              leinwand.height = bild.height;
              const stift = leinwand.getContext('2d');
              stift.drawImage(bild, 0, 0);
              return stift.getImageData(0, 0, bild.width, bild.height).data;
            };
            const [x, y] = [await lade(eins), await lade(zwei)];
            if (x.length !== y.length) return 1;
            let anders = 0;
            for (let i = 0; i < x.length; i += 4) {
              if (Math.abs(x[i] - y[i]) > 24) anders += 1;
            }
            return anders / (x.length / 4);
          },
          [mitZustand, ohneZustand],
        );

        console.log(
          '          Aktiv ohne Farbe: %s %% derselben Fläche ändern sich',
          (unterschied * 100).toFixed(1),
        );
        /*
          Der Marker misst 3 × 22 px auf 48 × 48 px, also gut 2,8 % der Fläche.
          Die Schranke liegt bei 1 % — deutlich über null und deutlich unter dem,
          was der Marker allein trägt.
        */
        if (unterschied < 0.01) {
          melde(
            `${breite} px: der aktive Zustand ist ohne Farbe nicht zu erkennen ` +
              `(${(unterschied * 100).toFixed(1)} % Unterschied)`,
          );
        }

        await blatt.evaluate(() => document.getElementById('farbe-weg')?.remove());
      }
    }

    await kontext.close();
  }
  console.log('');
}

await browser.close();

if (befunde.length) {
  console.error('\n%d Befunde:\n', befunde.length);
  for (const b of befunde) console.error('  ' + b);
  process.exit(1);
}

console.log(
  '\nBestanden: vier Breiten, Leiste konstant 76 px, Tooltip bei Maus und Tastatur,',
);
console.log(
  'genau eine sichtbare Navigation je Haltepunkt, kein Überlauf, 44-px-Tippziele,',
);
console.log('Sprungziel kommt bei Fokus ins Bild.');
