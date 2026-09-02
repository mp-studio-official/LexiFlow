import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from '../../ui/components';
import {
  MAX_PDF_PAGES,
  NO_TEXT_MESSAGE,
  extractPdfText,
  type PdfProgress,
} from '../../import/pdfText';

/**
 * Eine PDF als Quelle – vollständig auf diesem Gerät.
 *
 * ## Was hier bewusst **nicht** passiert
 *
 * Kein Upload, kein Dienst, keine Erkennung von Bildern. Die Datei verlässt
 * den Browser nicht; `pdfText.ts` liest sie mit einer eingebetteten
 * Bibliothek. Eine gescannte Seite ist ein Bild ohne Textebene, und statt so
 * zu tun, als ließe sich das mit genug Mühe schon lesen, sagt diese Ansicht
 * es geradeheraus und nennt den Ausweg.
 *
 * ## Warum eine Vorschau dazwischen liegt
 *
 * Der extrahierte Text ist nie perfekt: Kopfzeilen, Seitenzahlen und
 * Trennstriche landen mit darin. Ginge er direkt in den Parser, müsste die
 * Lehrkraft den Müll hinterher aus zwanzig Entwurfszeilen klauben. In einem
 * Textfeld ist er in zehn Sekunden aufgeräumt – deshalb steht die Vorschau
 * dazwischen und ist **bearbeitbar**.
 */

export interface PdfSourcePanelProps {
  /** Wird mit dem geprüften und ggf. bearbeiteten Text aufgerufen. */
  onAccept: (text: string) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; progress?: PdfProgress; name: string }
  | { kind: 'preview'; text: string; name: string; pages: number }
  | { kind: 'message'; tone: 'info' | 'error'; text: string };

export function PdfSourcePanel({ onAccept }: PdfSourcePanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Ein abgebrochener Lauf darf nicht weiterlaufen, wenn die Ansicht geht.
  useEffect(() => () => abort.current?.abort(), []);

  const read = useCallback(async (file: File): Promise<void> => {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setPhase({
        kind: 'message',
        tone: 'error',
        text: `„${file.name}“ ist keine PDF-Datei. Bitte wähle eine PDF oder füge den Text ein.`,
      });
      return;
    }

    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: 'reading', name: file.name });

    const result = await extractPdfText(await file.arrayBuffer(), {
      signal: controller.signal,
      onProgress: (progress) =>
        setPhase((current) =>
          current.kind === 'reading' ? { ...current, progress } : current,
        ),
    });
    abort.current = null;

    if (result.kind === 'cancelled') {
      setPhase({ kind: 'idle' });
      return;
    }
    if (result.kind === 'error') {
      setPhase({ kind: 'message', tone: 'error', text: result.message });
      return;
    }
    if (result.kind === 'no-text') {
      // Ehrlich benennen, was fehlt – und was stattdessen hilft.
      setPhase({ kind: 'message', tone: 'info', text: NO_TEXT_MESSAGE });
      return;
    }

    setPhase({ kind: 'preview', text: result.text, name: file.name, pages: result.pages });
  }, []);

  return (
    <div className="stack">
      <p className="muted small">
        Die PDF wird <strong>auf diesem Gerät</strong> gelesen – nichts wird hochgeladen. Es
        werden bis zu {MAX_PDF_PAGES} Seiten mit auswählbarem Text verarbeitet; gescannte Seiten
        ohne Textebene kann LexiFlow nicht lesen.
      </p>

      {phase.kind === 'idle' || phase.kind === 'message' ? (
        <>
          {/*
            Die Ablagefläche ist zugleich die Schaltfläche: Ein Klick öffnet die
            Dateiauswahl, ein Fallenlassen liest direkt. Beides führt zum selben
            Weg, und mit der Tastatur ist es ein ganz normaler Knopf.
          */}
          <div
            className={['dropzone', dragging ? 'dropzone--over' : ''].filter(Boolean).join(' ')}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void read(file);
            }}
          >
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              PDF auswählen
            </Button>
            <span className="small muted">oder eine PDF hierher ziehen</span>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf"
            aria-label="PDF-Datei auswählen"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void read(file);
            }}
          />

          {phase.kind === 'message' ? (
            <Alert tone={phase.tone}>{phase.text}</Alert>
          ) : null}
        </>
      ) : null}

      {phase.kind === 'reading' ? (
        <div className="stack" role="status" aria-live="polite">
          <p>
            „{phase.name}“ wird gelesen
            {phase.progress ? ` – Seite ${phase.progress.page} von ${phase.progress.pages}` : ' …'}
          </p>
          <div className="meter">
            <div
              className="meter__fill"
              style={{
                width: phase.progress
                  ? `${Math.round((phase.progress.page / phase.progress.pages) * 100)}%`
                  : '10%',
              }}
            />
          </div>
          <div className="row">
            <Button
              variant="quiet"
              onClick={() => {
                abort.current?.abort();
                setPhase({ kind: 'idle' });
              }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}

      {phase.kind === 'preview' ? (
        <div className="stack">
          <p className="small muted">
            „{phase.name}“, {phase.pages} {phase.pages === 1 ? 'Seite' : 'Seiten'} gelesen. Prüfe
            den Text und entferne, was nicht in die Liste gehört – Kopfzeilen, Seitenzahlen,
            Fußnoten.
          </p>
          <div className="field">
            <label htmlFor="pdf-preview">Erkannter Text</label>
            <textarea
              id="pdf-preview"
              rows={14}
              spellCheck={false}
              value={phase.text}
              onChange={(event) =>
                setPhase((current) =>
                  current.kind === 'preview' ? { ...current, text: event.target.value } : current,
                )
              }
            />
          </div>
          <div className="row">
            <Button
              variant="primary"
              disabled={phase.text.trim().length === 0}
              onClick={() => onAccept(phase.text)}
            >
              Text übernehmen
            </Button>
            <Button variant="quiet" onClick={() => setPhase({ kind: 'idle' })}>
              Andere Datei wählen
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PdfSourcePanel;
