import { describe, expect, it } from 'vitest';

import { contextPartOfSpeech } from './contextPartOfSpeech';

/**
 * Die Wortart des konkreten Vorkommens.
 *
 * Jeder Fall hier hat einen Zweck: Entweder er belegt, dass ein Satz eine
 * Wortart wirklich hergibt, oder er belegt, dass ein Satz sie **nicht**
 * hergibt und deshalb nichts behauptet wird. Die zweite Sorte ist die
 * wichtigere. Eine falsch erkannte Wortart wählt die falsche
 * Bedeutungsgruppe, trägt sie ein, und danach sieht sie aus wie eine geprüfte
 * Antwort.
 */

describe('Substantiv', () => {
  it.each([
    ['The island rises from the sea.', 'island'],
    ['An island lay ahead.', 'island'],
    ['These islands are famous.', 'islands'],
    ['She bought a track for the model railway.', 'track'],
    ['The track was muddy.', 'track'],
    ['1,969 islands belong to the bay.', 'islands'],
    ['Their doctor arrived late.', 'doctor'],
  ])('erkennt „%s“ → %s als Substantiv', (satz, wort) => {
    expect(contextPartOfSpeech(satz, wort)).toBe('noun');
  });

  it('lässt sich vom Nomenzusatz nicht zum Adjektiv machen', () => {
    /*
      „the island chain runs south“: `island` steht vor einem zweiten
      Substantiv, aber der Artikel davor gehört zu ihm. Die Adjektivregel
      greift nicht, weil nach `chain` kein Abschluss steht.
    */
    expect(contextPartOfSpeech('The island chain runs south.', 'island')).toBe('noun');
  });
});

describe('Verb', () => {
  it.each([
    ['Rangers use dogs to track the herd.', 'track'],
    ['We track the herd every spring.', 'track'],
    ['They depend on natural barriers.', 'depend'],
    ['He islands the beds with gravel.', 'islands'],
    ['The team can track every shipment.', 'track'],
  ])('erkennt „%s“ → %s als Verb', (satz, wort) => {
    expect(contextPartOfSpeech(satz, wort)).toBe('verb');
  });

  it('wertet ein folgendes -ly-Adverb als Verbbeleg', () => {
    // Der eine Beleg, der ohne Artikel und ohne Pronomen auskommt.
    expect(contextPartOfSpeech('Prices rose sharply last year.', 'rose')).toBe('verb');
  });
});

describe('Adjektiv', () => {
  it('erkennt ein Gradwort davor', () => {
    // Marcs Beispiel: Die Verbformen von `know` dürfen „bekannt“ nicht sperren.
    expect(contextPartOfSpeech('The best known example is the harbour.', 'known')).toBe(
      'adjective',
    );
  });

  it('erkennt ein Adverb davor', () => {
    expect(contextPartOfSpeech('A widely known author lives here.', 'known')).toBe('adjective');
  });

  it('bleibt still, wenn nach dem Bezugswort ein Inhaltswort weitergeht', () => {
    /*
      „Crowded streets slow the buses.“ – hier ist `Crowded` ein Adjektiv, und
      trotzdem sagt das Modul nichts: Nach `streets` geht es mit `slow` weiter,
      und ob das ein Verb oder ein zweites Adjektiv ist, entscheidet dieses
      Modul nicht. Der Preis dafür ist ein leeres Feld statt einer Behauptung.
    */
    expect(contextPartOfSpeech('Crowded streets slow the buses.', 'Crowded')).toBeUndefined();
  });

  it('erkennt die Adjektivendung vor einem Substantiv am Gruppenende', () => {
    expect(contextPartOfSpeech('Crowded streets are dangerous.', 'Crowded')).toBe('adjective');
    expect(contextPartOfSpeech('They rely on natural barriers to survive.', 'natural')).toBe(
      'adjective',
    );
  });

  it('gewinnt gegen den Artikel, der zum Bezugswort gehört', () => {
    /*
      „the crowded streets are dirty“: Der Artikel steht vor `crowded`, gehört
      aber zu `streets`. Würde die Substantivregel zuerst greifen, stünde hier
      „Gedränge“ statt „überfüllt“.
    */
    expect(contextPartOfSpeech('The crowded streets are dirty.', 'crowded')).toBe('adjective');
  });
});

describe('Was der Satz nicht hergibt, wird nicht behauptet', () => {
  it('lässt ein Wort am Satzanfang vor einem Verb offen', () => {
    /*
      „Litter covers the street.“ – `Litter` steht ohne Artikel am Satzanfang.
      Es ist hier ein Substantiv, aber der Satz belegt das nicht mit einem der
      geprüften Signale, und `litter` hat zehn Bedeutungsgruppen. Also: nichts
      behaupten, Chips anbieten.
    */
    expect(contextPartOfSpeech('Litter covers the street.', 'Litter')).toBeUndefined();
  });

  it('lässt ein Wort vor einer Konjunktion offen', () => {
    expect(contextPartOfSpeech('Track and field is popular here.', 'Track')).toBeUndefined();
  });

  it('lässt ein Wort ohne Nachbarn offen', () => {
    expect(contextPartOfSpeech('Islands.', 'Islands')).toBeUndefined();
  });

  it('sagt nichts über eine Wortgruppe', () => {
    // `depend on` ist die Lernform selbst; ein einzelner Nachbar sagt darüber
    // nichts, und mehrdeutig ist sie ohnehin selten.
    expect(contextPartOfSpeech('They depend on rain.', 'depend on')).toBeUndefined();
  });

  it('sagt nichts, wenn die Form gar nicht in diesem Satz steht', () => {
    expect(contextPartOfSpeech('The harbour was quiet.', 'island')).toBeUndefined();
  });

  it('verwechselt kein Verb mit einem Adjektiv, nur weil ein Wort folgt', () => {
    // „Volunteers collect litter every Saturday.“ – nach `litter` steht `every`,
    // ein Artikelwort. Es eröffnet eine neue Wortgruppe, es schließt keine ab.
    expect(contextPartOfSpeech('Volunteers collect litter every Saturday.', 'collect')).toBe(
      undefined,
    );
  });
});
