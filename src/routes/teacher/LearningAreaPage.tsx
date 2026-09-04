import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';

import { Alert, Button, Card, EmptyState, Field } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { PackArt } from '../../ui/PackArt';
import { downloadLearningAreaFile } from '../../ui/packDownloads';
import { createArea, deleteArea, getArea, updateArea } from '../../data/areaRepo';
import { countEntries, getPack, listPacks } from '../../data/packRepo';
import { areaBlockers, LEARNING_AREA_MAX_PACKS } from '../../domain/learningArea';
import { GRADE_LABELS } from '../../domain/cefr';
import type { PackMeta } from '../../domain/schema';

/**
 * Einen Lernbereich zusammenstellen und ausgeben.
 *
 * Ein Lernbereich ist eine **Auswahl mit Reihenfolge**: welche Pakete, in
 * welcher Folge. Beides steht hier nebeneinander – links, was drin ist, in der
 * Reihenfolge, in der es bei den Lernenden erscheint; rechts, was es sonst
 * noch gibt.
 *
 * ## Warum zwei Listen und keine Kästchen
 *
 * Eine Liste mit Ankreuzfeldern wäre kürzer und beantwortet die zweite Frage
 * nicht: Sie hat keine Reihenfolge. Man müsste sie danebenschreiben – „Position
 * 3“ – und dann steht die Auswahl an einer Stelle und ihre Ordnung an einer
 * anderen. Zwei Listen zeigen beides an dem Ort, an dem es gilt: Was links
 * steht, steht dort in genau der Folge, in der es ankommt.
 *
 * ## Was hier ausdrücklich nicht entsteht
 *
 * Keine Lerngruppe, keine Klassenliste, kein Zugang. Der Bereich trägt einen
 * Titel und Material – keine Namen. Es gibt keinen Rückkanal und keine
 * Einsicht in Lernstände; es kann keinen geben, weil die erzeugte Datei nichts
 * sendet.
 *
 * ## Die Kennung
 *
 * Sie entsteht beim Anlegen und ändert sich nie – auch nicht, wenn Titel und
 * Auswahl sich vollständig ändern. An ihr hängt der Lernstand auf den Geräten
 * der Lernenden (siehe `domain/learningArea.ts`). Deshalb ist „speichern und
 * neu ausgeben“ hier der normale Weg und „neu anlegen“ der Sonderfall.
 */

interface PackRow {
  meta: PackMeta;
  count: number;
}

/** Was auf einer Zeile steht – einmal für beide Listen. */
function packLine(row: PackRow): string {
  return [
    `${row.count} ${row.count === 1 ? 'Vokabel' : 'Vokabeln'}`,
    GRADE_LABELS[row.meta.grade],
    row.meta.cefrLevel,
    ...(row.meta.topic ? [row.meta.topic] : []),
  ].join(' · ');
}

export function LearningAreaPage() {
  const { areaId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(areaId);
  const [message, setMessage] = useState<{ tone: 'success' | 'warning' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Alle Pakete der Bibliothek, mit ihrer Vokabelzahl. */
  const library = useLiveQuery<PackRow[]>(async () => {
    const packs = await listPacks();
    return Promise.all(
      packs.map(async (meta) => ({ meta, count: await countEntries(meta.id) })),
    );
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!areaId) {
        if (active) setLoaded(true);
        return;
      }
      const found = await getArea(areaId);
      if (!active) return;
      if (found) {
        setTitle(found.title);
        setDescription(found.description ?? '');
        setChosen([...found.packIds]);
        setSavedId(found.id);
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [areaId]);

  const byId = useMemo(
    () => new Map((library ?? []).map((row) => [row.meta.id, row])),
    [library],
  );

  /*
    Die gewählten Pakete in **ihrer** Reihenfolge – und zwar auch die, die es
    nicht mehr gibt. Ein gelöschtes Paket verschwindet hier nicht still: Eine
    Auswahl, die sich von selbst ändert, ist keine Auswahl mehr. Es steht als
    fehlende Zeile da, und die Lehrkraft entscheidet.

    `libraryReady` ist dabei nicht bloß Vorsicht: Solange die Bibliothek noch
    lädt, ist sie leer – und ohne diese Unterscheidung stünde für einen
    Wimpernschlag hinter **jedem** gewählten Paket „nicht mehr vorhanden“. Ein
    Fehlalarm, der so schnell wieder verschwindet, ist schlimmer als keine
    Meldung: Man sieht ihn, glaubt ihn, und findet ihn nicht wieder.
  */
  const libraryReady = library !== undefined;
  const chosenRows = chosen.map((packId) => ({ packId, row: byId.get(packId) }));
  const missing = libraryReady ? chosenRows.filter((entry) => !entry.row).length : 0;
  const available = (library ?? []).filter((row) => !chosen.includes(row.meta.id));
  const blockers = areaBlockers({ title, packIds: chosen });
  const wordCount = chosenRows.reduce((sum, entry) => sum + (entry.row?.count ?? 0), 0);

  function move(index: number, delta: number): void {
    setChosen((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const moved = next[index];
      const other = next[target];
      if (moved === undefined || other === undefined) return current;
      next[index] = other;
      next[target] = moved;
      return next;
    });
  }

  async function persist(): Promise<string | undefined> {
    const draft = { title, description, packIds: chosen };
    if (savedId) {
      await updateArea(savedId, draft);
      return savedId;
    }
    const created = await createArea(draft);
    setSavedId(created.id);
    // Die Adresse mitziehen, damit ein Neuladen denselben Bereich zeigt.
    navigate(`/material/lernbereiche/${created.id}`, { replace: true });
    return created.id;
  }

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      await persist();
      setMessage({ tone: 'success', text: 'Lernbereich gespeichert.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true);
    try {
      const id = await persist();
      if (!id) return;

      /*
        Gelesen wird jetzt aus der Bibliothek und nicht aus dem Zustand der
        Seite: In die Datei kommt, was wirklich gespeichert ist. Ein Paket,
        das in einem anderen Tab gerade gelöscht wurde, fehlt hier – und das
        soll auffallen, bevor die Datei verteilt ist.
      */
      const packs = [];
      const fehlend: string[] = [];
      for (const packId of chosen) {
        const pack = await getPack(packId);
        if (pack) packs.push(pack);
        else fehlend.push(packId);
      }

      if (fehlend.length > 0) {
        setMessage({
          tone: 'error',
          text: `${fehlend.length} ${fehlend.length === 1 ? 'Paket ist' : 'Pakete sind'} nicht mehr vorhanden. Nimm sie aus dem Lernbereich heraus oder öffne sie erneut.`,
        });
        return;
      }

      const outcome = await downloadLearningAreaFile(
        { id, title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
        packs,
      );
      /*
        Drei Ausgänge, nicht zwei: erstellt; erstellt, aber ungewöhnlich groß;
        gar nicht erstellt. Der mittlere ist kein Fehler – die Datei liegt im
        Downloadordner –, aber er soll auffallen, bevor sie verteilt ist.
      */
      setMessage({
        tone: !outcome.ok ? 'warning' : outcome.warning ? 'warning' : 'success',
        text:
          outcome.ok && outcome.warning
            ? `${outcome.message} ${outcome.warning}`
            : outcome.message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!savedId) return;
    await deleteArea(savedId);
    navigate('/material', { replace: true });
  }

  if (!loaded) return <p className="muted">Lernbereich wird geladen …</p>;

  return (
    <div className="stack">
      <div className="row">
        <Link className="btn" to="/material">
          Zurück zum Material
        </Link>
      </div>

      <section className="hero" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Lernbereich</p>
        <h1 className="display">{savedId ? 'Lernbereich bearbeiten' : 'Neuer Lernbereich'}</h1>
        <p className="lede">
          Mehrere Pakete in einer Datei. Die Datei geht an die Lerngruppe und läuft dort ohne
          Konto und ohne Internet – Lernstände bleiben auf den Geräten und sind für dich nicht
          einsehbar.
        </p>
      </section>

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      <Card>
        <div className="stack stack--tight">
          <Field
            label="Titel"
            hint="Steht als Überschrift in der Datei – zum Beispiel „Englisch 9b – Halbjahr 1“."
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Beschreibung"
            hint="Optional. Ein Satz, der auf der Startseite der Datei steht."
          >
            {(props) => (
              <textarea
                {...props}
                className="growing prose"
                rows={2}
                value={description}
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>

      <div className="area-picker">
        {/* ------------------------------------------------- was drin ist */}
        <section className="area-picker__column" aria-labelledby="im-bereich">
          <div className="section-head">
            <div className="section-head__title">
              <h2 id="im-bereich" className="display display--section">
                Im Lernbereich
              </h2>
              <p className="small muted">
                {chosen.length === 0
                  ? 'Noch nichts ausgewählt'
                  : `${chosen.length} von höchstens ${LEARNING_AREA_MAX_PACKS} · in dieser Reihenfolge`}
              </p>
            </div>
          </div>

          {chosen.length === 0 ? (
            <p className="muted">
              Wähle rechts die Pakete aus, die in die Datei sollen. Die Reihenfolge hier ist die,
              in der sie bei den Lernenden erscheinen.
            </p>
          ) : (
            <ol className="area-list">
              {chosenRows.map((entry, index) => (
                <li className="area-item" key={entry.packId}>
                  <span className="area-item__art" aria-hidden="true">
                    <PackArt seed={entry.row?.meta.title ?? entry.packId} />
                  </span>

                  <span className="area-item__text">
                    <strong className="area-item__title">
                      {entry.row?.meta.title ??
                        (libraryReady ? 'Paket nicht mehr vorhanden' : 'Paket wird geladen …')}
                    </strong>
                    <span className="small muted">
                      {entry.row
                        ? packLine(entry.row)
                        : libraryReady
                          ? 'Es wurde gelöscht oder liegt auf einem anderen Gerät.'
                          : ''}
                    </span>
                  </span>

                  <span className="area-item__tools">
                    {/*
                      Pfeile und keine Ziehgeste: Ziehen ist auf einem Trackpad
                      hübsch und mit der Tastatur unmöglich. Zwei Knöpfe kann
                      jeder bedienen, und ihr Name nennt das Paket – in einer
                      Liste mit acht Paketen stünden sonst acht gleichnamige
                      „nach oben“.
                    */}
                    <IconButton
                      icon="arrow-up"
                      label={`${entry.row?.meta.title ?? 'Paket'} nach oben`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      label={`${entry.row?.meta.title ?? 'Paket'} nach unten`}
                      disabled={index === chosenRows.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <Button
                      small
                      variant="quiet"
                      onClick={() =>
                        setChosen((current) => current.filter((id) => id !== entry.packId))
                      }
                    >
                      Entfernen
                    </Button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ------------------------------------------------ was es sonst gibt */}
        <section className="area-picker__column" aria-labelledby="bibliothek">
          <div className="section-head">
            <div className="section-head__title">
              <h2 id="bibliothek" className="display display--section">
                Deine Pakete
              </h2>
              <p className="small muted">
                {available.length} {available.length === 1 ? 'Paket' : 'Pakete'} zur Auswahl
              </p>
            </div>
          </div>

          {library === undefined ? (
            <p className="muted">Pakete werden geladen …</p>
          ) : available.length === 0 ? (
            <EmptyState
              title={chosen.length > 0 ? 'Alles ausgewählt' : 'Noch kein Material'}
              action={
                <Link className="btn btn--accent" to="/material/import">
                  Paket erstellen
                </Link>
              }
            >
              <p className="empty-state__text">
                {chosen.length > 0
                  ? 'Jedes Paket auf diesem Gerät ist bereits im Lernbereich.'
                  : 'Ein Lernbereich besteht aus Paketen – erstelle zuerst eines.'}
              </p>
            </EmptyState>
          ) : (
            <ul className="area-list">
              {available.map((row) => (
                <li className="area-item" key={row.meta.id}>
                  <span className="area-item__art" aria-hidden="true">
                    <PackArt seed={row.meta.title} />
                  </span>
                  <span className="area-item__text">
                    <strong className="area-item__title">{row.meta.title}</strong>
                    <span className="small muted">{packLine(row)}</span>
                  </span>
                  <span className="area-item__tools">
                    <Button
                      small
                      disabled={chosen.length >= LEARNING_AREA_MAX_PACKS}
                      onClick={() => setChosen((current) => [...current, row.meta.id])}
                    >
                      <Icon name="plus" size={16} />
                      Hinzufügen
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/*
        Die Aktionsleiste sagt zuerst, was hinausgeht, und dann erst, was man
        drücken kann. Ein Knopf „Datei erzeugen“ ohne die Zeile darüber wäre
        eine Ausgabe, deren Umfang man erst nach dem Öffnen kennt.
      */}
      <div className="actionbar" role="group" aria-label="Lernbereich ausgeben">
        <p className="actionbar__status">
          {blockers.length > 0 ? (
            blockers.join(' ')
          ) : (
            <>
              <strong>{title.trim()}</strong> · {chosen.length}{' '}
              {chosen.length === 1 ? 'Paket' : 'Pakete'} · {wordCount}{' '}
              {wordCount === 1 ? 'Vokabel' : 'Vokabeln'}
              {missing > 0 ? ` · ${missing} fehlt` : null}
            </>
          )}
        </p>
        <div className="row">
          {savedId ? (
            confirmDelete ? (
              <>
                <span className="small">Lernbereich löschen? Die Pakete bleiben.</span>
                <Button small variant="danger" onClick={() => void handleDelete()}>
                  Löschen
                </Button>
                <Button small variant="quiet" onClick={() => setConfirmDelete(false)}>
                  Abbrechen
                </Button>
              </>
            ) : (
              <Button small variant="quiet" onClick={() => setConfirmDelete(true)}>
                Löschen
              </Button>
            )
          ) : null}
          <span className="spacer" />
          <Button disabled={busy || blockers.length > 0} onClick={() => void handleSave()}>
            Speichern
          </Button>
          <Button
            variant="primary"
            disabled={busy || blockers.length > 0 || missing > 0}
            onClick={() => void handleExport()}
          >
            <Icon name="download" size={16} />
            Lerndatei erzeugen (.html)
          </Button>
        </div>
      </div>

      <p className="small muted">
        Die Datei enthält nur Vokabeln und die Angaben zu den Paketen. Lernstände werden nie
        exportiert – weder in diese Datei noch irgendwohin sonst.
      </p>
    </div>
  );
}

export default LearningAreaPage;
