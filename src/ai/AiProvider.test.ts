import { describe, expect, it } from 'vitest';
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_LABELS,
  AiUnavailableError,
  nullAiProvider,
  sourceTypeForAi,
  type AiGenerationContext,
} from './AiProvider';

const context: AiGenerationContext = { grade: '7', cefrLevel: 'A2' };

describe('nullAiProvider', () => {
  it('ist der Standard und kann nichts', () => {
    expect(nullAiProvider.capabilities()).toEqual([]);
    expect(nullAiProvider.info.id).toBe('null');
  });

  it('verarbeitet nichts außerhalb des Geräts', () => {
    expect(nullAiProvider.info.sendsDataOffDevice).toBe(false);
    expect(nullAiProvider.info.processing).toBe('on-device');
  });

  it('meldet jede Fähigkeit asynchron als nicht verfügbar', async () => {
    for (const capability of AI_CAPABILITIES) {
      await expect(nullAiProvider.getAvailability(capability)).resolves.toBe('unavailable');
    }
  });

  it('scheitert bei jedem Aufruf verständlich statt still nichts zu tun', async () => {
    await expect(nullAiProvider.prepare('suggest-from-text')).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    await expect(nullAiProvider.suggestFromText('text', context)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    await expect(nullAiProvider.suggestFromTopic('Umwelt', context)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    await expect(
      nullAiProvider.enrichEntry({ english: 'litter', germanAnswers: ['Müll'] }, context),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(nullAiProvider.alternativeSentence('litter', context)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});

describe('Fähigkeiten', () => {
  it('kennt für jede Fähigkeit eine deutsche Beschriftung', () => {
    for (const capability of AI_CAPABILITIES) {
      expect(AI_CAPABILITY_LABELS[capability]).toBeTruthy();
    }
  });

  it('enthält keine Übersetzung – die hat eine eigene Schnittstelle', () => {
    expect(AI_CAPABILITIES).not.toContain('translate');
  });
});

describe('sourceTypeForAi', () => {
  it('ordnet die Herkunft dem vorhandenen sourceType zu', () => {
    expect(sourceTypeForAi('text')).toBe('text-ai');
    expect(sourceTypeForAi('topic')).toBe('topic-ai');
  });
});
