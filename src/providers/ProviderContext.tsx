import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { nullTranslationProvider, type TranslationProvider } from '../translation/TranslationProvider';
import { detectTranslationProvider } from '../translation/chromeTranslationProvider';
import { nullAiProvider, type AiProvider } from '../ai/AiProvider';

/**
 * Kleine Registry statt globalem Singleton.
 *
 * Anbieter werden über React-Context bereitgestellt und lassen sich in Tests
 * vollständig ersetzen, ohne Modulzustand zu verbiegen.
 */
export interface Providers {
  translation: TranslationProvider;
  ai: AiProvider;
}

function createDefaultProviders(): Providers {
  return {
    translation: detectTranslationProvider() ?? nullTranslationProvider,
    // Sprint 2A ruft bewusst keinen KI-Anbieter auf.
    ai: nullAiProvider,
  };
}

const ProviderContext = createContext<Providers | undefined>(undefined);

export function ProviderRegistry({
  children,
  value,
}: {
  children: ReactNode;
  /** Nur für Tests und Sonderfälle; sonst wird automatisch erkannt. */
  value?: Partial<Providers>;
}) {
  const providers = useMemo<Providers>(
    () => ({ ...createDefaultProviders(), ...value }),
    [value],
  );
  return <ProviderContext.Provider value={providers}>{children}</ProviderContext.Provider>;
}

/** Fällt ohne Registry auf die Standardanbieter zurück – nie auf `undefined`. */
export function useProviders(): Providers {
  const fromContext = useContext(ProviderContext);
  const fallback = useMemo(() => createDefaultProviders(), []);
  return fromContext ?? fallback;
}

export function useTranslationProvider(): TranslationProvider {
  return useProviders().translation;
}
