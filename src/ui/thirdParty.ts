/**
 * Was LexiFlow von anderen mitliefert – an einer Stelle, maschinenlesbar.
 *
 * Diese Liste ist keine Fleißarbeit für den Rechtsordner. Sie steht in der
 * Anwendung selbst sichtbar (unter **Daten & Datenschutz**), weil dort ohnehin
 * die Frage beantwortet wird, was in dieser Datei drinsteckt. Wer eine
 * portable Einzeldatei weitergibt, gibt diese Bestandteile mit weiter – und
 * soll das ohne Repository nachlesen können.
 *
 * Das **Wörterbuch fehlt hier bewusst**: Es hat eine eigene Karte mit Quelle,
 * Prüfsumme, Stand und Exportknopf, weil es Daten sind und nicht Code, und
 * weil seine Lizenz (CC BY-SA 4.0) andere Pflichten auslöst.
 */

export interface ThirdPartyComponent {
  name: string;
  version: string;
  urheber: string;
  lizenz: string;
  url: string;
  /** Wozu es dient – ein Satz, in der Anwendung sichtbar. */
  zweck: string;
  /** Wo im Repository die Lizenzangaben vollständig liegen. */
  ablage?: string;
}

export const THIRD_PARTY: readonly ThirdPartyComponent[] = [
  {
    name: 'pdf.js (pdfjs-dist)',
    version: '4.10.38',
    urheber: 'Mozilla Foundation',
    lizenz: 'Apache License 2.0',
    url: 'https://github.com/mozilla/pdf.js',
    zweck:
      'Liest Text aus PDF-Dateien – vollständig auf diesem Gerät, ohne Netzzugriff und ohne Nachladen weiterer Dateien.',
    ablage: 'third_party/pdfjs/',
  },
  {
    name: 'Manrope Variable',
    version: '5.3',
    urheber: 'Copyright 2019 The Manrope Project Authors',
    lizenz: 'SIL Open Font License 1.1',
    url: 'https://github.com/sharpType/Manrope',
    zweck:
      'Die eingebettete Schrift der Oberfläche. Es wird keine Schrift von fremden Servern geladen.',
  },
  {
    name: 'Newsreader Variable',
    version: '5.3',
    urheber: 'Copyright 2020 The Newsreader Project Authors',
    lizenz: 'SIL Open Font License 1.1',
    url: 'https://github.com/productiontype/Newsreader',
    zweck: 'Die eingebettete Serifenschrift für große redaktionelle Überschriften.',
  },
];
