import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Alert, Badge, Button, EmptyState } from '../../ui/components';
import { PackCard } from '../../ui/PackCard';
import { PackUpdateConfirm } from '../../ui/PackUpdateConfirm';
import { usePackImport } from '../../ui/usePackImport';
import { deletePack, getPack, listPacks } from '../../data/packRepo';
import { db } from '../../data/db';
import { serializePack, suggestFilename } from '../../domain/vocabpack';
import { downloadText } from '../../ui/download';
import { GRADE_LABELS } from '../../domain/cefr';
import { DIRECTION_LABELS } from '../../domain/schema';

/**
 * Creator-Studio statt Verwaltungsmaske (Sprint 3A).
 *
 * Die Seite fragt zuerst, was entstehen soll, und zeigt danach, was schon da
 * ist. Die drei Wege ins Material sind sichtbar unterschieden – Text, Liste,
 * Thema –, alle bisherigen Aktionen bleiben vollständig erhalten.
 */

const CREATE_OPTIONS: readonly {
  index: string;
  label: string;
  text: string;
  /** Bleibt wörtlich die bisherige Beschriftung – sie ist der zugängliche Name. */
  action: string;
  href: string;
}[] = [
  {
    index: '01',
    label: 'Aus einem Text',
    text: 'Englischen Text einfügen, lokal analysieren, Kandidaten prüfen.',
    action: 'Aus englischem Text erstellen',
    href: '/material/import?quelle=text',
  },
  {
    index: '02',
    label: 'Aus einer Liste',
    text: 'Vokabeln einfügen oder eine CSV-, XLSX- oder Paketdatei öffnen.',
    action: 'Neues Paket aus Liste erstellen',
    href: '/material/import',
  },
  {
    index: '03',
    label: 'Zu einem Thema',
    text: 'Vorschläge lokal erzeugen lassen und anschließend prüfen.',
    action: 'Zu einem Thema erstellen',
    href: '/material/import?quelle=thema',
  },
];

function formatChanged(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `geändert ${date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}

export function TeacherHomePage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const importer = usePackImport({
    onSaved: (packId, _summary, isNew) => {
      if (isNew) navigate(`/material/${packId}`);
    },
  });

  const packs = useLiveQuery(() => listPacks(), [], undefined);
  const counts = useLiveQuery(
    async () => {
      const rows = await db.packEntries.toArray();
      const map = new Map<string, number>();
      for (const row of rows) map.set(row.packId, (map.get(row.packId) ?? 0) + 1);
      return map;
    },
    [],
    new Map<string, number>(),
  );

  async function handleExport(packId: string): Promise<void> {
    const pack = await getPack(packId);
    if (!pack) return;
    downloadText(suggestFilename(pack.meta), serializePack(pack));
  }

  async function handleDelete(packId: string): Promise<void> {
    await deletePack(packId);
    setPendingDelete(null);
    importer.setMessage({ tone: 'success', text: 'Paket gelöscht.' });
  }

  return (
    <div className="stack stack--editorial">
      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Material</p>
        <h1 className="display">Was willst du heute erstellen?</h1>
        <p className="lede">
          Dieser Bereich braucht keine Anmeldung. Er dient dem Erstellen und Weitergeben von
          Vokabelpaketen – Lernstände von Schülerinnen und Schülern sind hier grundsätzlich nicht
          einsehbar.
        </p>
      </section>

      {importer.message ? (
        <Alert tone={importer.message.tone}>{importer.message.text}</Alert>
      ) : null}

      {importer.pending ? (
        <PackUpdateConfirm
          pending={importer.pending}
          busy={importer.busy}
          onConfirm={() => void importer.confirm()}
          onCancel={importer.cancel}
        />
      ) : null}

      <section aria-labelledby="erstellen">
        <h2 id="erstellen" className="visually-hidden">
          Erstellungsmöglichkeiten
        </h2>
        <div className="creator-grid">
          {CREATE_OPTIONS.map((option) => (
            /* `aria-label` hält die bisherige Beschriftung wörtlich fest –
               sichtbar wird sie redaktionell gesetzt, für Screenreader und
               Tests bleibt der Name unverändert. */
            <button
              key={option.index}
              type="button"
              className="creator-option"
              aria-label={option.action}
              onClick={() => navigate(option.href)}
            >
              <span className="creator-option__index" aria-hidden="true">
                {option.index}
              </span>
              <span className="creator-option__label">{option.label}</span>
              <span className="creator-option__text">{option.text}</span>
            </button>
          ))}
        </div>

        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button onClick={() => fileInput.current?.click()}>
            Paketdatei öffnen (.vocabpack.json)
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            aria-label="LexiFlow-Paketdatei auswählen"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importer.importFile(file);
            }}
          />
        </div>
      </section>

      <section aria-labelledby="paketliste">
        <div className="section-head">
          <h2 id="paketliste" className="display display--section">
            Dein Material
          </h2>
          {packs && packs.length > 0 ? (
            <p className="small muted">
              {packs.length} {packs.length === 1 ? 'Paket' : 'Pakete'} auf diesem Gerät
            </p>
          ) : null}
        </div>

        {packs === undefined ? (
          <p className="muted">Pakete werden geladen …</p>
        ) : packs.length === 0 ? (
          <EmptyState
            title="Noch kein Material"
            action={
              <Link className="btn btn--accent" to="/material/import">
                Neues Paket aus Liste erstellen
              </Link>
            }
          >
            <p className="empty-state__text">So entsteht das erste Paket:</p>
            <ol>
              <li>Eine der drei Quellen oben wählen – Text, Liste oder Thema.</li>
              <li>Die erkannten Vokabeln prüfen und ergänzen.</li>
              <li>Titel und Jahrgang setzen, speichern, als Datei weitergeben.</li>
            </ol>
          </EmptyState>
        ) : (
          <div className="feed">
            {packs.map((meta) => (
              <PackCard
                key={meta.id}
                title={meta.title}
                to={`/material/${meta.id}`}
                meta={[
                  `${counts?.get(meta.id) ?? 0} Vokabeln`,
                  GRADE_LABELS[meta.grade],
                  meta.cefrLevel,
                  DIRECTION_LABELS[meta.direction],
                  ...(meta.topic ? [meta.topic] : []),
                  ...(formatChanged(meta.updatedAt) ? [formatChanged(meta.updatedAt)] : []),
                ]}
                actions={
                  pendingDelete === meta.id ? (
                    <>
                      <span className="small">Paket und zugehörige Lernstände löschen?</span>
                      <Button small variant="danger" onClick={() => void handleDelete(meta.id)}>
                        Löschen
                      </Button>
                      <Button small variant="quiet" onClick={() => setPendingDelete(null)}>
                        Abbrechen
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link className="btn btn--small" to={`/material/${meta.id}`}>
                        Bearbeiten
                      </Link>
                      <Button small onClick={() => void handleExport(meta.id)}>
                        Exportieren
                      </Button>
                      <Button small variant="danger" onClick={() => setPendingDelete(meta.id)}>
                        Löschen
                      </Button>
                    </>
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      <p className="small muted" style={{ marginBottom: 0 }}>
        <Badge>Hinweis</Badge> Exportierte Dateien enthalten nur die Vokabeln und die Metadaten des
        Pakets. Lernstände werden nie exportiert.
      </p>
    </div>
  );
}
