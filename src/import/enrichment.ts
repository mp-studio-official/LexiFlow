import { guessPartOfSpeech, suggestTopicTag } from '../domain/wordRules';
import { splitAnswers, splitList } from '../domain/normalize';
import type { CefrLevel, Grade } from '../domain/cefr';
import type { AiVocabSuggestion } from '../ai/AiProvider';
import type { DraftRow } from './draft';
import { addSuggestions, isFieldEmpty, type DraftSuggestion } from './suggestions';

/**
 * Bindeglied zwischen den Vorschlagsquellen und dem Entwurf.
 *
 * Alles hier ist rein: Quellen liefern Werte, diese Datei macht daraus
 * Vorschläge, und `suggestions.ts` entscheidet, ob ein Vorschlag überhaupt
 * aufgenommen wird. Kein Netzwerk, kein Zustand, keine Seiteneffekte.
 */

/** Der Lernkontext, den die Vorschläge brauchen – mehr wird nie übergeben. */
export interface LearningContext {
  grade: Grade;
  cefrLevel: CefrLevel;
  topic: string;
}

/**
 * Regelbasierte Vorschläge – sofort verfügbar, ohne Download und ohne Modell.
 * Deshalb dürfen sie direkt nach dem Import berechnet werden; übernommen wird
 * trotzdem nichts von allein.
 */
export function ruleSuggestions(draft: DraftRow, context: LearningContext): DraftSuggestion[] {
  const suggestions: DraftSuggestion[] = [];

  if (isFieldEmpty(draft, 'partOfSpeech')) {
    const sentence = draft.sentences.find((item) => item.english.trim().length > 0)?.english;
    const guess = guessPartOfSpeech(draft.english, sentence);
    if (guess.partOfSpeech) {
      suggestions.push({
        field: 'partOfSpeech',
        value: guess.partOfSpeech,
        source: 'local-rule',
        status: 'suggested',
        confidence: 'eindeutig',
      });
    }
  }

  const tag = suggestTopicTag(context.topic, splitList(draft.tags));
  if (tag) {
    suggestions.push({
      field: 'topicTags',
      value: tag,
      source: 'local-rule',
      status: 'suggested',
      confidence: 'eindeutig',
    });
  }

  return suggestions;
}

export function applyRuleSuggestions(
  drafts: readonly DraftRow[],
  context: LearningContext,
): DraftRow[] {
  return drafts.map((draft) => addSuggestions(draft, ruleSuggestions(draft, context)));
}

/** Zeilen, für die eine Übersetzung überhaupt sinnvoll ist. */
export function needsTranslation(draft: DraftRow): boolean {
  return draft.include && draft.english.trim().length > 0 && isFieldEmpty(draft, 'german');
}

export function translationTargets(drafts: readonly DraftRow[]): DraftRow[] {
  return drafts.filter(needsTranslation);
}

/**
 * Zeilen, für die das Sprachmodell etwas beitragen kann.
 *
 * Alle drei Felder zählen: Auch eine Zeile, der **nur** die Themen-Tags fehlen,
 * ist ein sinnvolles Ziel – sonst bliebe genau dieses Feld ohne Vorschlag.
 */
export function needsModel(draft: DraftRow): boolean {
  if (!draft.include || draft.english.trim().length === 0) return false;
  return (
    isFieldEmpty(draft, 'partOfSpeech') ||
    isFieldEmpty(draft, 'difficulty') ||
    isFieldEmpty(draft, 'topicTags')
  );
}

export function modelTargets(drafts: readonly DraftRow[]): DraftRow[] {
  return drafts.filter(needsModel);
}

export function translationSuggestion(value: string): DraftSuggestion[] {
  const german = value.trim();
  if (german.length === 0) return [];
  return [
    {
      field: 'german',
      value: german,
      source: 'local-translator',
      status: 'suggested',
      confidence: 'unsicher',
    },
  ];
}

/**
 * Wandelt eine geprüfte Modellantwort in Vorschläge um.
 *
 * Was das Modell nicht geliefert hat, erzeugt keinen Vorschlag – geraten wird
 * an dieser Stelle nichts mehr.
 */
export function modelSuggestions(result: AiVocabSuggestion): DraftSuggestion[] {
  const suggestions: DraftSuggestion[] = [];

  if (result.partOfSpeech) {
    suggestions.push({
      field: 'partOfSpeech',
      value: result.partOfSpeech,
      source: 'local-language-model',
      status: 'suggested',
      confidence: 'unsicher',
    });
  }

  if (typeof result.difficulty === 'number') {
    suggestions.push({
      field: 'difficulty',
      value: String(result.difficulty),
      source: 'local-language-model',
      status: 'suggested',
      confidence: 'unsicher',
    });
  }

  const tags = (result.topicTags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  if (tags.length > 0) {
    suggestions.push({
      field: 'topicTags',
      value: tags.join(', '),
      source: 'local-language-model',
      status: 'suggested',
      confidence: 'unsicher',
    });
  }

  return suggestions;
}

/**
 * Der Ausschnitt einer Zeile, der das Sprachmodell erreichen darf.
 *
 * Bewusst eng: Stichwort, vorhandene Antworten, **ein** Beispielsatz und der
 * Lernkontext. Keine Rohdatei, kein Volltext, kein Lernstand, keine IDs.
 */
export interface ModelRequest {
  english: string;
  germanAnswers: string[];
  exampleSentence?: string;
  grade: Grade;
  cefrLevel: CefrLevel;
  topic?: string;
}

export function modelRequestFor(draft: DraftRow, context: LearningContext): ModelRequest {
  const sentence = draft.sentences.find((item) => item.english.trim().length > 0)?.english.trim();
  const topic = context.topic.trim();
  return {
    english: draft.english.trim(),
    germanAnswers: splitAnswers(draft.german),
    ...(sentence ? { exampleSentence: sentence } : {}),
    grade: context.grade,
    cefrLevel: context.cefrLevel,
    ...(topic ? { topic } : {}),
  };
}
