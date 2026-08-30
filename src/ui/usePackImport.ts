import { useCallback, useState } from 'react';
import { parsePackFile } from '../domain/vocabpack';
import {
  describeUpdateSummary,
  summarizeDiff,
  type PackUpdateSummary,
} from '../domain/packDiff';
import { getPackMeta, previewPackUpdate, savePack } from '../data/packRepo';
import type { VocabPack } from '../domain/schema';

export interface PendingPackUpdate {
  pack: VocabPack;
  /** Titel der bereits vorhandenen Fassung. */
  existingTitle: string;
  summary: PackUpdateSummary;
}

export interface ImportMessage {
  tone: 'success' | 'error';
  text: string;
}

export interface UsePackImportOptions {
  onSaved?: (packId: string, summary: PackUpdateSummary, isNew: boolean) => void;
}

/**
 * Gemeinsame Logik für das Einlesen einer `.vocabpack.json`.
 *
 * Ein unbekanntes Paket wird direkt hinzugefügt. Ist die Paket-ID bereits
 * vorhanden, wird zuerst gezeigt, was die Aktualisierung mit den Lernständen
 * machen würde – gespeichert wird erst nach Bestätigung.
 */
export function usePackImport(options: UsePackImportOptions = {}) {
  const { onSaved } = options;
  const [pending, setPending] = useState<PendingPackUpdate | null>(null);
  const [message, setMessage] = useState<ImportMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const store = useCallback(
    async (pack: VocabPack): Promise<void> => {
      const result = await savePack(pack);
      setPending(null);
      setMessage({
        tone: 'success',
        text: result.isNew
          ? `„${pack.meta.title}“ wurde hinzugefügt (${pack.entries.length} Vokabeln).`
          : `„${pack.meta.title}“ wurde aktualisiert. ${describeUpdateSummary(result.summary)}`,
      });
      onSaved?.(result.packId, result.summary, result.isNew);
    },
    [onSaved],
  );

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      setBusy(true);
      try {
        const parsed = parsePackFile(await file.text());
        if (!parsed.ok) {
          setPending(null);
          setMessage({
            tone: 'error',
            text: `Import fehlgeschlagen: ${parsed.errors[0] ?? 'Unbekannter Fehler'}`,
          });
          return;
        }

        const pack: VocabPack = { meta: parsed.pack.meta, entries: parsed.pack.entries };
        const existing = await getPackMeta(pack.meta.id);
        if (!existing) {
          await store(pack);
          return;
        }

        const diff = await previewPackUpdate(pack);
        setMessage(null);
        setPending({ pack, existingTitle: existing.title, summary: summarizeDiff(diff) });
      } finally {
        setBusy(false);
      }
    },
    [store],
  );

  const confirm = useCallback(async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    try {
      await store(pending.pack);
    } finally {
      setBusy(false);
    }
  }, [pending, store]);

  const cancel = useCallback((): void => {
    setPending(null);
    setMessage({ tone: 'success', text: 'Aktualisierung abgebrochen. Es wurde nichts geändert.' });
  }, []);

  return { pending, message, busy, importFile, confirm, cancel, setMessage } as const;
}
