// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Angewandte Migrationen ändern sich nicht mehr — jetzt auch geprüft.
 *
 * ## Warum eine Prüfung und nicht nur ein Satz in der Anleitung
 *
 * Der Satz steht seit Migration 12 in jedem Protokoll: `db push` vergleicht
 * **Fassungen**, nicht Inhalte. Eine nachträglich geänderte Datei gilt als
 * angewandt und läuft nie wieder — lokal steht dann etwas anderes als
 * entfernt, und niemand merkt es, bis eine Prüfung auf dem einen Stand grün
 * und auf dem anderen rot ist.
 *
 * Bisher war das eine Zusage. Eine Zusage, die vier Dateien betrifft und bei
 * jedem Tippfehler brechen kann, gehört in eine Prüfung.
 *
 * ## Warum Prüfsummen und nicht „die Datei wurde seit Commit X nicht
 * angefasst"
 *
 * Weil Letzteres die Geschichte braucht und beim ersten `rebase` daneben
 * liegt. Eine Prüfsumme beschreibt den Inhalt selbst, und genau der ist die
 * Zusage.
 *
 * ## Was zu tun ist, wenn diese Prüfung rot wird
 *
 * **Nicht die Prüfsumme anpassen.** Die Änderung an der Datei rückgängig
 * machen und als **neue additive Migration** schreiben. Die Prüfsumme hier
 * ändert sich nur, wenn eine weitere Migration angewandt **wurde** — und
 * dann steht ihr Datum im zugehörigen Protokoll unter `docs/abnahme/`.
 */

const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ordner = join(wurzel, 'supabase', 'migrations');

/**
 * Die im Staging angewandten Fassungen, mit dem Tag ihrer Abnahme.
 *
 * Die Prüfsummen stammen aus den Dateien zum Zeitpunkt ihrer Abnahme. Wer
 * hier eine Zeile hinzufügt, sagt damit: „Diese Fassung läuft im Staging."
 */
const ANGEWANDT = [
  /*
    1 bis 11 sind seit der Angleichung der Historie am 29.09.2026 im
    Staging; 12 bis 15 tragen den Tag ihrer eigenen Abnahme. Die Daten
    stehen hier als Lesehilfe – geprüft wird die Prüfsumme.
  */
  { datei: '20260913120000_grundgeruest.sql', am: '29.09.2026', summe: '5b446bd98b0df35d528dcb71e5b008fa63701ba45c2b555e5adf30fa4e3daf67' },
  { datei: '20260913120100_hilfsfunktionen.sql', am: '29.09.2026', summe: '21234b5ca454928701297e635eadf71e2da0c4de92c01ebd2a6e5be6d550f623' },
  { datei: '20260913120200_zugriffsregeln.sql', am: '29.09.2026', summe: 'b37378a9abafbb7cff562965cdd9281b62febc4b62a554c1deb222a59d1e1672' },
  { datei: '20260913120300_anmeldung.sql', am: '29.09.2026', summe: '470bd37d3714fa9ddec4d0c503a7fc7fc121bfb4629b579514b5b46659ccd2b3' },
  { datei: '20260913120400_kurse_und_codes.sql', am: '29.09.2026', summe: '697352d11d6a058d965854516c3c224efdb617985824886fadf4abee6cdb0f59' },
  { datei: '20260913120500_pakete_und_revisionen.sql', am: '29.09.2026', summe: '7e866dc1f90715778062ee23605ce2e81fccbc17bacb7256a502ef5f6eaecb42' },
  { datei: '20260913120600_lernstand.sql', am: '29.09.2026', summe: 'a4145b782811bcfb405f9ca66ab1e79845a23d29027f483c06f73835c06535f5' },
  { datei: '20260913120700_ki.sql', am: '29.09.2026', summe: '987fcf3c693751dbc13216e351339f371d64993104b038d814935b4cdbb3c1ce' },
  { datei: '20260920090000_dienstrechte.sql', am: '29.09.2026', summe: '47e2631baf8d5ace0c4058df0ef3ea9a2b31d907ed9ccafa3695baf32dc3198e' },
  { datei: '20260920140000_rechte_zuruecksetzen.sql', am: '29.09.2026', summe: '3cc67496948b92359057806f17fddf63dcadd530317f1d8face5770047662c34' },
  { datei: '20260929170000_lernstandszugriff.sql', am: '29.09.2026', summe: 'e8f5791eb2613cd9702c0f6eee278c835bc692fe7727d6f66e59042e4ad3aa4c' },
  { datei: '20261002090000_lernendeneinstellungen.sql', am: '02.10.2026', summe: '8774531e9441ea9dfc453aa452c304aa373d42d0354ddcee0c77020248363569' },
  { datei: '20261003090000_lokale_lerntage.sql', am: '03.10.2026', summe: '94328104cb8ae1acb8c04a1e782a1619907a279575754591ad76ca25c0e0cb7a' },
  { datei: '20261004090000_rollenriegel.sql', am: '06.10.2026', summe: 'd07c0a04974328c4b0c3d419da277c57c6b2bd75fecb95dd181b7e519b59a0e9' },
  { datei: '20261005090000_konto_stilllegen.sql', am: '06.10.2026', summe: '65a9667224b770b271804d7b25ff9a3dba9f33a02b03ef6459d854e67dc27aa4' },
  { datei: '20261006090000_archivierte_kurse_schliessen.sql', am: '09.10.2026', summe: '2c8dfbb405160363784abd6eff4ca631d0af34e8a7d11d37ec0455388ca892b3' },
];

function summeVon(datei) {
  return createHash('sha256').update(readFileSync(join(ordner, datei))).digest('hex');
}

describe('Was im Staging läuft, bleibt im Projekt unverändert', () => {
  for (const { datei, am, summe } of ANGEWANDT) {
    it(`${datei} ist seit dem ${am} unverändert`, () => {
      expect(summeVon(datei)).toBe(summe);
    });
  }

  it('erkennt eine Änderung überhaupt', () => {
    /*
      Die Prüfung an sich selbst: Ein Zeichen mehr, eine andere Summe. Ohne
      das hier wäre nicht gezeigt, dass `summeVon` wirklich den Inhalt liest.
    */
    const inhalt = readFileSync(join(ordner, ANGEWANDT[0].datei), 'utf8');
    const verändert = createHash('sha256').update(`${inhalt}\n-- Tippfehler\n`).digest('hex');
    expect(verändert).not.toBe(ANGEWANDT[0].summe);
  });

  it('nennt jede Migration, die angewandt sein könnte', () => {
    /*
      Der blinde Fleck dieser Datei: eine angewandte Migration, die oben
      nicht steht. Deshalb hier die Gegenrichtung — jede Migrationsdatei ist
      entweder in der Liste oder **jünger** als die jüngste darin. Eine
      ältere, die fehlt, ist ein Versehen.
    */
    const juengste = ANGEWANDT[ANGEWANDT.length - 1].datei;
    const fehlend = readdirSync(ordner)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => name < juengste)
      .filter((name) => !ANGEWANDT.some((eintrag) => eintrag.datei === name));
    expect(fehlend).toEqual([]);
  });
});
