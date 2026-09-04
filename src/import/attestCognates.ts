import { attestsIdenticalMeaning, cognateFingerprint, identicalMeanings } from './cognates';
import type { DraftRow } from './draft';
import type { DictionaryProvider } from '../dictionary/DictionaryProvider';

/**
 * Den Kognaten-Befund einmal nachschlagen – für die Zeilen, die ihn haben.
 *
 * Der Rest der Entwurfsprüfung ist reine Rechnung (`validateDrafts`); ein
 * Wörterbuch ist es nicht, denn Nachschlagen dauert. Deshalb steht dieser
 * Schritt daneben und nicht darin: Er belegt, was zu belegen ist, schreibt das
 * Ergebnis in die Zeile, und die Prüfung bleibt danach so schnell und so
 * testbar wie zuvor.
 *
 * ## Was hier nicht passiert
 *
 * Nachgeschlagen wird **nur** für Zeilen, in denen Lernform und Übersetzung
 * tatsächlich übereinstimmen. In einem Paket mit sechzig Vokabeln sind das
 * typischerweise null bis drei – und nicht sechzig Anfragen an ein 6-MB-Archiv.
 *
 * Zeilen mit gültigem Beleg werden ebenfalls übersprungen. Wer in der
 * Prüftabelle tippt, löst diesen Pass mehrfach aus; ein zweites Nachschlagen
 * für einen Fall, der schon geklärt ist, wäre reine Wartezeit.
 *
 * ## Warum das Ergebnis auch „nicht belegt" festhält
 *
 * Es tut es nicht. Ein fehlgeschlagener Beleg hinterlässt **keine** Spur: Das
 * Feld bleibt leer, der Befund steht, und beim nächsten Anlauf – mit einem
 * Wörterbuch, das inzwischen geladen ist – wird es erneut versucht. Ein
 * gespeichertes „nein" würde einen Ladezustand zu einer fachlichen Aussage
 * machen.
 */
export async function attestCognates(
  drafts: readonly DraftRow[],
  dictionary: DictionaryProvider,
): Promise<DraftRow[]> {
  const offen = drafts.filter((draft) => needsAttestation(draft));
  if (offen.length === 0) return [...drafts];

  /*
    Ein Nachschlagen je **Lernform**, nicht je Zeile: Zwei Zeilen mit derselben
    Vokabel sind in einem Entwurf nicht selten (der Dublettenbefund kommt
    getrennt), und sie zweimal nachzuschlagen brächte zweimal dieselbe Antwort.
  */
  const belegt = new Map<string, boolean>();

  for (const draft of offen) {
    const key = cognateFingerprint(draft.english, draft.partOfSpeech);
    if (belegt.has(key)) continue;
    try {
      const entries = await dictionary.lookup(draft.english.trim());
      belegt.set(
        key,
        attestsIdenticalMeaning(entries, draft.english, draft.partOfSpeech || undefined),
      );
    } catch {
      /*
        Ein Wörterbuch, das nicht antwortet, ist kein Beleg – und kein Grund,
        die Prüftabelle scheitern zu lassen. Der Befund bleibt stehen, die
        Lehrkraft kann ihn wie bisher bestätigen.
      */
      belegt.set(key, false);
    }
  }

  return drafts.map((draft) => {
    if (!needsAttestation(draft)) return draft;
    const key = cognateFingerprint(draft.english, draft.partOfSpeech);
    return belegt.get(key) === true ? { ...draft, cognateAttestedFor: key } : draft;
  });
}

/** Hat diese Zeile einen offenen Kognaten-Befund? */
function needsAttestation(draft: DraftRow): boolean {
  if (!draft.english.trim()) return false;
  if (identicalMeanings(draft.english, draft.german).length === 0) return false;
  return draft.cognateAttestedFor !== cognateFingerprint(draft.english, draft.partOfSpeech);
}

/**
 * Die Zeilen, für die ein Nachschlagen offen ist – als stabiler Schlüssel.
 *
 * Die Oberfläche braucht ihn, um den Pass **einmal je Sachverhalt** und nicht
 * einmal je Tastendruck auszulösen: Solange sich dieser Schlüssel nicht
 * ändert, gibt es nichts Neues nachzuschlagen.
 */
export function attestationKey(drafts: readonly DraftRow[]): string {
  return drafts
    .filter((draft) => needsAttestation(draft))
    .map((draft) => cognateFingerprint(draft.english, draft.partOfSpeech))
    .sort()
    .join('|');
}
