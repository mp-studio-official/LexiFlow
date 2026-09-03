import { blocksSaving, hasBlockingError, needsReview, type DraftRow } from './draft';

/**
 * Was das Speichern aufhält – in einer festen, erklärbaren Reihenfolge.
 *
 * ## Wozu
 *
 * „Speichern“ ist der Moment, in dem sich entscheidet, ob eine halbe Stunde
 * Arbeit ein Paket wird. Bis 4B.4 endete ein blockierter Versuch in einem Satz
 * über dem Knopf – bei dreißig Zeilen Tabelle stand die betroffene Stelle
 * irgendwo weit oben, und wer sie suchte, scrollte.
 *
 * Dieses Modul beantwortet deshalb nicht nur „warum nicht?“, sondern
 * **„wo?“**. Die Ansicht springt an die erste Stelle und setzt den Fokus
 * dorthin; die Reihenfolge hier ist die Reihenfolge, in der man sie abarbeitet.
 *
 * ## Die Reihenfolge
 *
 * 1. **Titel** – ohne ihn gibt es kein Paket, und er steht ganz oben.
 * 2. **Fehlende englische Lernform** – die Vokabel selbst.
 * 3. **Fehlende deutsche Antwort** – ihre Entsprechung.
 * 4. **Offene fachliche Frage** – etwas, das jemand entscheiden muss.
 * 5. **Sonstige Schemafehler** – alles Übrige, in Zeilenreihenfolge.
 *
 * Sie ist bewusst nicht „die Zeile mit dem schlimmsten Fehler zuerst“: Wer von
 * oben nach unten arbeitet, soll die Liste in einer Richtung durchlaufen, und
 * innerhalb einer Sorte gilt die Reihenfolge der Tabelle. Eine Reihenfolge, die
 * sich beim Beheben umsortiert, fühlt sich an wie ein Fehler in der Software.
 *
 * ## Was hier nicht passiert
 *
 * Es wird nichts repariert und nichts abgewählt. Eine Zeile, die
 * stillschweigend aus dem Paket verschwindet, weil sie im Weg war, ist der
 * Fehler, den dieses Modul verhindern soll.
 */

export type SaveBlockerKind =
  | 'title'
  | 'english'
  | 'german'
  | 'review'
  | 'schema'
  | 'selection';

export interface SaveBlocker {
  kind: SaveBlockerKind;
  /** Was fehlt – ein Satz, den man ohne die Tabelle daneben versteht. */
  message: string;
  /** Die betroffene Zeile; fehlt beim Titel und bei „nichts ausgewählt“. */
  draftId?: string;
}

/** Die Nummer der Zeile, wie sie in der Tabelle steht. */
function rowNumber(drafts: readonly DraftRow[], id: string): number {
  return drafts.findIndex((draft) => draft.id === id) + 1;
}

function label(draft: DraftRow, drafts: readonly DraftRow[]): string {
  return draft.english.trim() || `Zeile ${rowNumber(drafts, draft.id)}`;
}

export function saveBlockers(options: {
  title: string;
  drafts: readonly DraftRow[];
}): SaveBlocker[] {
  const { title, drafts } = options;
  const blockers: SaveBlocker[] = [];

  if (!title.trim()) {
    blockers.push({ kind: 'title', message: 'Das Paket braucht einen Titel.' });
  }

  /*
    Nur übernommene Zeilen zählen.

    Eine abgewählte Zeile darf unvollständig bleiben – sie landet in keinem
    Paket. Jemanden zu einer Entscheidung über etwas zu zwingen, das er gerade
    weggelegt hat, wäre Beschäftigung.
  */
  const relevant = drafts.filter((draft) => draft.include);

  for (const draft of relevant) {
    if (draft.issues.some((issue) => issue.level === 'error' && issue.field === 'english')) {
      blockers.push({
        kind: 'english',
        draftId: draft.id,
        message: `Zeile ${rowNumber(drafts, draft.id)}: Die englische Lernform fehlt.`,
      });
    }
  }

  for (const draft of relevant) {
    if (draft.issues.some((issue) => issue.level === 'error' && issue.field === 'german')) {
      blockers.push({
        kind: 'german',
        draftId: draft.id,
        message: `„${label(draft, drafts)}“: Die deutsche Antwort fehlt.`,
      });
    }
  }

  for (const draft of relevant) {
    if (needsReview(draft)) {
      const reason = draft.issues.find((issue) => issue.review)?.message ?? 'Bitte prüfen.';
      blockers.push({
        kind: 'review',
        draftId: draft.id,
        message: `„${label(draft, drafts)}“: ${reason}`,
      });
    }
  }

  for (const draft of relevant) {
    if (!hasBlockingError(draft)) continue;
    const rest = draft.issues.filter(
      (issue) => issue.level === 'error' && issue.field !== 'english' && issue.field !== 'german',
    );
    for (const issue of rest) {
      blockers.push({
        kind: 'schema',
        draftId: draft.id,
        message: `„${label(draft, drafts)}“: ${issue.message}`,
      });
    }
  }

  /*
    Zum Schluss der Fall, der keine Stelle hat: Es ist überhaupt nichts
    Brauchbares ausgewählt. Er steht hinten, weil er meistens eine Folge der
    Punkte darüber ist – wer sie behebt, behebt auch diesen.
  */
  if (blockers.length === 0 && relevant.filter((draft) => !blocksSaving(draft)).length === 0) {
    blockers.push({
      kind: 'selection',
      message: 'Es ist keine Vokabel ausgewählt, die gespeichert werden könnte.',
    });
  }

  return blockers;
}

/**
 * Die Zusammenfassung über der Liste – ein Satz, keine Fehlerwolke.
 *
 * Sie geht in eine `role="alert"`-Meldung. Deshalb nennt sie die Zahl und die
 * erste Stelle: Wer sie vorgelesen bekommt, weiß danach, wie viel Arbeit
 * ansteht und wo sie anfängt, ohne die Tabelle abzusuchen.
 */
export function describeBlockers(blockers: readonly SaveBlocker[]): string {
  const first = blockers[0];
  if (!first) return '';
  if (blockers.length === 1) return `Speichern ist noch nicht möglich. ${first.message}`;
  return (
    `Speichern ist noch nicht möglich: ${blockers.length} offene Stellen. ` +
    `Die erste: ${first.message}`
  );
}
