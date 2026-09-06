import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Alert, Badge, Button, EmptyState } from '../../ui/components';
import { PackCard } from '../../ui/PackCard';
import { PackArt } from '../../ui/PackArt';
import { IconButton } from '../../ui/IconButton';
import { Icon } from '../../ui/Icon';
import { PackUpdateConfirm } from '../../ui/PackUpdateConfirm';
import { usePackImport } from '../../ui/usePackImport';
import { deletePack, getPack, listPacks } from '../../data/packRepo';
import { listAreas } from '../../data/areaRepo';
import { db } from '../../data/db';
import { downloadPackFile, downloadStudentFile } from '../../ui/packDownloads';
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
  const areas = useLiveQuery(() => listAreas(), [], undefined);
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

  /**
   * Die beiden Downloads aus der Liste heraus.
   *
   * Beide laden das Paket frisch aus der Datenbank, statt sich auf die
   * Listenzeile zu verlassen: Die Liste kennt nur Metadaten, und der Export
   * braucht die Vokabeln. Das Ergebnis wird gemeldet – ein Download, der
   * stumm nicht passiert, ist der schlimmste Fall.
   */
  async function handlePackDownload(packId: string): Promise<void> {
    const pack = await getPack(packId);
    if (!pack) return;
    const outcome = downloadPackFile(pack);
    importer.setMessage({ tone: outcome.ok ? 'success' : 'error', text: outcome.message });
  }

  async function handleStudentDownload(packId: string): Promise<void> {
    const pack = await getPack(packId);
    if (!pack) return;
    const outcome = await downloadStudentFile(pack);
    /*
      Ein Größenhinweis macht aus dem Erfolg eine Warnung im Ton, aber keine
      Fehlermeldung: Die Datei liegt im Downloadordner.
    */
    importer.setMessage({
      tone: !outcome.ok ? 'error' : outcome.warning ? 'warning' : 'success',
      text: outcome.ok && outcome.warning ? `${outcome.message} ${outcome.warning}` : outcome.message,
    });
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
      </section>

      <section aria-labelledby="paketliste">
        {/*
          „Paketdatei öffnen“ stand bis 4B.2 als vierter Knopf unter den drei
          Erstellungswegen – zwischen Dingen, die etwas Neues anfangen, obwohl
          es etwas Vorhandenes hereinholt. Jetzt steht es am Kopf der Liste,
          in die das geöffnete Paket hineinfällt.
        */}
        <div className="section-head">
          <div className="section-head__title">
            <h2 id="paketliste" className="display display--section">
              Dein Material
            </h2>
            {packs && packs.length > 0 ? (
              <p className="small muted">
                {packs.length} {packs.length === 1 ? 'Paket' : 'Pakete'} auf diesem Gerät
              </p>
            ) : null}
          </div>
          <Button small onClick={() => fileInput.current?.click()}>
            <Icon name="upload" size={16} />
            Paketdatei öffnen (.vocabpack.json)
          </Button>
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
                count={`${counts?.get(meta.id) ?? 0} Vokabeln`}
                meta={[
                  GRADE_LABELS[meta.grade],
                  meta.cefrLevel,
                  DIRECTION_LABELS[meta.direction],
                  ...(meta.topic ? [meta.topic] : []),
                  ...(formatChanged(meta.updatedAt) ? [formatChanged(meta.updatedAt)] : []),
                ]}
                /*
                  Die zwei Downloads als Zeichen: Sie sind der häufigste
                  Griff in dieser Liste und brauchten bisher den Umweg über
                  die Paketseite. Der Name jeder Schaltfläche nennt das Paket
                  – in einer Liste mit acht Paketen stünden sonst acht
                  gleichnamige „Herunterladen“.
                */
                tools={
                  <>
                    <IconButton
                      icon="download"
                      label={`${meta.title} als Lerndatei herunterladen (.html)`}
                      onClick={() => void handleStudentDownload(meta.id)}
                    />
                    <IconButton
                      icon="package"
                      label={`${meta.title} als LexiFlow-Paket herunterladen (.vocabpack.json)`}
                      onClick={() => void handlePackDownload(meta.id)}
                    />
                  </>
                }
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
                      <Button small variant="quiet" onClick={() => setPendingDelete(meta.id)}>
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

      {/*
        Die Lernbereiche stehen **unter** dem Material und nicht darüber.

        Sie sind der zweite Schritt: Man stellt zusammen, was schon da ist. Ein
        leerer Lernbereich über einer leeren Bibliothek wäre eine Aufforderung,
        die man noch gar nicht befolgen kann.
      */}
      <section aria-labelledby="lernbereiche">
        <div className="section-head">
          <div className="section-head__title">
            <h2 id="lernbereiche" className="display display--section">
              Lernbereiche
            </h2>
            <p className="small muted">
              Mehrere Pakete in einer Datei für die Lerngruppe – ohne Konto und ohne Internet.
            </p>
          </div>
          <Link className="btn btn--small" to="/material/lernbereiche/neu">
            <Icon name="stack" size={16} />
            Lernbereich anlegen
          </Link>
        </div>

        {areas === undefined ? (
          <p className="muted">Lernbereiche werden geladen …</p>
        ) : areas.length === 0 ? (
          <p className="muted">
            Noch keiner angelegt. Ein Lernbereich bündelt mehrere Pakete zu einer einzigen Datei –
            praktisch für ein Halbjahr, in dem sonst sechs Dateien im Umlauf wären.
          </p>
        ) : (
          <ul className="area-list">
            {areas.map((area) => (
              <li className="area-item" key={area.id}>
                <span className="area-item__art" aria-hidden="true">
                  <PackArt seed={area.title} />
                </span>
                <span className="area-item__text">
                  <strong className="area-item__title">{area.title}</strong>
                  <span className="small muted">
                    {area.packIds.length} {area.packIds.length === 1 ? 'Paket' : 'Pakete'}
                    {formatChanged(area.updatedAt) ? ` · ${formatChanged(area.updatedAt)}` : ''}
                  </span>
                </span>
                <span className="area-item__tools">
                  <Link className="btn btn--small" to={`/material/lernbereiche/${area.id}`}>
                    Öffnen
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="small muted" style={{ marginBottom: 0 }}>
        <Badge>Hinweis</Badge> Exportierte Dateien enthalten nur die Vokabeln und die Metadaten des
        Pakets. Lernstände werden nie exportiert.
      </p>

      {/*
        Der Assistent steht unten und klein. Er ist eine Zutat und kein Weg:
        Wer hier zum ersten Mal ist, soll ein Paket anlegen und nicht zuerst
        einen Zugang einrichten, den die Anwendung nicht braucht.
      */}
      <p className="small muted" style={{ marginBottom: 0 }}>
        <Link to="/material/assistent">Optionaler Gemini-Assistent</Link> – ein Online-Dienst von
        Google für einzelne Vorschläge bei der Materialerstellung. Nicht eingerichtet bleibt alles
        wie bisher: offline und ohne fremde Anfragen.
      </p>
    </div>
  );
}
