import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderRegistry, useProviders } from './ProviderContext';
import { nullAiProvider } from '../ai/AiProvider';
import { nullTranslationProvider } from '../translation/TranslationProvider';
import { createFakeTranslationProvider } from '../test/fakeTranslator';

function Probe() {
  const providers = useProviders();
  return (
    <ul>
      <li>Übersetzung: {providers.translation.info.id}</li>
      <li>KI: {providers.ai.info.id}</li>
    </ul>
  );
}

describe('Anbieter-Registry', () => {
  it('nutzt ohne Registry die Standardanbieter statt undefined', () => {
    render(<Probe />);
    // jsdom kennt keine Translator-API – also der ehrliche Nullanbieter.
    expect(screen.getByText(`Übersetzung: ${nullTranslationProvider.info.id}`)).toBeInTheDocument();
    expect(screen.getByText(`KI: ${nullAiProvider.info.id}`)).toBeInTheDocument();
  });

  it('lässt einzelne Anbieter ersetzen, ohne Modulzustand zu verbiegen', () => {
    const { provider } = createFakeTranslationProvider();
    render(
      <ProviderRegistry value={{ translation: provider }}>
        <Probe />
      </ProviderRegistry>,
    );
    expect(screen.getByText('Übersetzung: fake')).toBeInTheDocument();
    expect(screen.getByText(`KI: ${nullAiProvider.info.id}`)).toBeInTheDocument();
  });

  it('bleibt in Sprint 2A beim Null-KI-Anbieter', () => {
    render(
      <ProviderRegistry>
        <Probe />
      </ProviderRegistry>,
    );
    expect(screen.getByText('KI: null')).toBeInTheDocument();
  });
});
