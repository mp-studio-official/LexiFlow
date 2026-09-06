import { useState } from 'react';

import { Badge } from '../../../ui/components';
import { formatAnswers, splitAnswers } from '../../../domain/normalize';
import type { PartOfSpeech } from '../../../domain/schema';
import type { AiGenerationContext } from '../../AiProvider';
import { geminiAssistant } from '../assistant';
import type { GeminiAssistant } from '../geminiAiProvider';
import { GeminiAction } from './GeminiAction';

/**
 * „Gemini-Übersetzungen vorschlagen“ – neben den Wörterbuchtreffern, nicht statt ihrer.
 *
 * ## Die Reihenfolge bleibt, wie sie ist
 *
 * Zuerst das Offline-Wörterbuch mit seinen belegten Bedeutungen, dann – falls
 * jemand danach fragt – Gemini. Diese Ansicht ersetzt nichts und läuft nie von
 * selbst; sie hängt an einem Knopf unter den Chips, die ohnehin da sind.
 *
 * ## Warum die Vorschläge anders aussehen
 *
 * Ein Wörterbuchtreffer ist ein Beleg, ein Gemini-Vorschlag eine Vermutung.
 * Beides gleich darzustellen wäre die bequemere Lösung und die falsche: Die
 * Chips hier tragen sichtbar „Gemini, ungeprüft“, und sie tragen es auch dann
 * noch, wenn sie hübsch aussehen.
 *
 * ## Übernehmen heißt ergänzen
 *
 * Ein Klick fügt die Bedeutung zu dem hinzu, was im Feld steht – über dieselben
 * `splitAnswers`/`formatAnswers` wie das Wörterbuch, mit Semikolon und ohne
 * Dubletten. Nichts von Hand Eingetragenes wird dabei überschrieben; das ist
 * der Unterschied zwischen einem Vorschlag und einer Korrektur.
 */

export interface GeminiTranslationsProps {
  /** Für zugängliche Namen – dieselbe Bezeichnung wie in der Zeile. */
  label: string;
  english: string;
  /** Genau der eine Satz, in dem die Vokabel vorkommt. Nicht der Text. */
  sentence?: string | undefined;
  partOfSpeech?: PartOfSpeech | undefined;
  context: AiGenerationContext;
  /** Was gerade im deutschen Feld steht. */
  current: string;
  onAccept: (german: string) => void;
  /** Nur für Tests. */
  assistant?: GeminiAssistant;
}

export function GeminiTranslations({
  label,
  english,
  sentence,
  partOfSpeech,
  context,
  current,
  onAccept,
  assistant,
}: GeminiTranslationsProps) {
  const [vorschlaege, setVorschlaege] = useState<Array<{ german: string; note?: string }>>([]);

  async function frage(signal: AbortSignal): Promise<void> {
    const gemini = assistant ?? geminiAssistant();
    const antwort = await gemini.translateEntry(
      {
        english,
        ...(sentence ? { sentence } : {}),
        ...(partOfSpeech ? { partOfSpeech } : {}),
      },
      { ...context, signal },
    );
    /*
      `antwort.provenance` trägt Fähigkeit, Modell, Zeitpunkt und den Status
      „ungeprüft“. Angezeigt wird davon der Status – das Übrige gehört in die
      Herkunftsansicht und nicht neben jeden Chip.
    */
    setVorschlaege(
      antwort.value.map((eintrag) => ({
        german: eintrag.german,
        ...(eintrag.note ? { note: eintrag.note } : {}),
      })),
    );
  }

  return (
    <GeminiAction
      capability="translate-entry"
      label="Gemini-Übersetzungen vorschlagen"
      ariaLabel={`Gemini-Übersetzungen für ${label} vorschlagen`}
      run={frage}
    >
      {vorschlaege.length > 0 ? (
        <p className="dictionary__chips" style={{ marginTop: '0.3rem' }}>
          <span className="dictionary__origin small muted">
            <Badge tone="warning">Gemini, ungeprüft</Badge>
          </span>
          {vorschlaege.map((vorschlag) => (
            <button
              key={vorschlag.german}
              type="button"
              className="chip"
              title={vorschlag.note}
              aria-label={`Gemini-Vorschlag „${vorschlag.german}“ als Antwort für ${label} einsetzen`}
              onClick={() =>
                onAccept(
                  formatAnswers([...new Set([...splitAnswers(current), vorschlag.german])]),
                )
              }
            >
              {vorschlag.german}
            </button>
          ))}
        </p>
      ) : null}
    </GeminiAction>
  );
}
