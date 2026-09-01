/**
 * Akzeptanzfixture: ein Zeitschriftenartikel über psychische Ausfälle im
 * Abnutzungskrieg.
 *
 * **Herkunft, ehrlich benannt.** Der Originaltext, den Marc geliefert hatte,
 * lag beim Erstellen dieser Fixture nicht mehr im Sitzungsverlauf vor. Was hier
 * steht, ist deshalb kein Zitat, sondern ein nachgebauter Fachartikel desselben
 * Zuschnitts: englischsprachig, mit Publikationsapparat am Kopf, mit einem
 * Anfang aus Alltagssprache und mit genau den Fachbegriffen, an denen der
 * Auftrag die Empfehlung gemessen sehen will.
 *
 * Er ist bewusst so gebaut, dass er die Heuristik **herausfordert**:
 *
 * - Die ersten beiden Sätze bestehen fast nur aus Alltagswortschatz. Wer die
 *   ersten N Inhaltswörter nimmt, landet bei *young*, *soldier*, *winter*.
 * - Der Kopf trägt Zeitschriftenapparat („Vol. 12, Issue 3“). *issue* ist hier
 *   Heftnummer, nicht Lernvokabel.
 * - Die tragenden Begriffe sind teils Mehrwortbegriffe und stehen mehrfach im
 *   Text – sonst gäbe es sie als Kandidaten gar nicht.
 * - `casualty` und `casualties` sind dieselbe Familie; sie dürfen nicht zweimal
 *   vorgeschlagen werden.
 *
 * Die Fixture wird **nicht verändert**, wenn ein Test rot wird. Rot heißt: Die
 * Heuristik trifft eine Entscheidung, die sich nicht verteidigen lässt.
 */
export const ATTRITIONAL_COMBAT_TEXT = [
  'Military History Quarterly, Vol. 12, Issue 3.',
  'This issue collects four studies; the issue appeared in spring.',
  '',
  'The young soldier wrote home every week during the cold winter.',
  'His letters were short and his mother kept them in a small wooden box.',
  '',
  'Behind those letters lies a harder story.',
  'Psychological casualties rose sharply once attritional combat replaced rapid advance,',
  'and psychological casualties soon outnumbered the wounded in several sectors.',
  'Attritional combat wore down units that had been considered fresh.',
  'Sustained bombardment, and the noise of bombardment at night, left men unable to endure',
  'another tour; those who could not endure were moved to the rear.',
  '',
  'Manpower shortages made every evacuation a decision with consequences.',
  'Manpower shortages also pushed commanders to keep exhausted men at the frontline,',
  'because a thinned frontline invited a breakthrough.',
  'Evacuation of a single company could undermine a whole sector, and staff officers argued',
  'that returning men too early would undermine their recovery.',
  '',
  'Standardized regulations governing neuropsychiatric cases arrived late.',
  'Before those standardized regulations, each clinician judged alone; one clinician might',
  'send a man back within a day, another might not.',
  'The neuropsychiatric wards filled faster than the regulations were written.',
  '',
  'Archival research on divisional records shows how uneven the practice was.',
  'Archival research also uncovered a tacit admission in a staff memorandum:',
  'the tacit admission that morale, not cowardice, decided who broke.',
  'Officers considered morale paramount, and keeping morale paramount shaped every order.',
  '',
  'What the records call resilience was rarely individual.',
  'Resilience depended on rest, on food and on the certainty that evacuation was possible.',
].join('\n');
