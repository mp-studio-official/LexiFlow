import { Alert, Field } from '../../ui/components';
import { CEFR_LEVELS, GRADE_LABELS, GRADES, suggestCefrLevel, type CefrLevel, type Grade } from '../../domain/cefr';
import { DIRECTION_LABELS, LEARNING_DIRECTIONS, type LearningDirection } from '../../domain/schema';

export interface MetaDraft {
  title: string;
  topic: string;
  grade: Grade;
  cefrLevel: CefrLevel;
  cefrLevelOverridden: boolean;
  direction: LearningDirection;
  description: string;
}

/**
 * Voreinstellung für **neue** Pakete.
 *
 * Seit Sprint 3B.1 stehen sie auf „beide Richtungen“: Wer eine Vokabel kann,
 * kann sie in beide Richtungen, und die Lernenden wählen vor jeder Runde
 * ohnehin selbst. Bestehende und importierte Pakete behalten ihre Angabe –
 * eine gespeicherte Entscheidung wird nie stillschweigend überschrieben.
 */
export function emptyMetaDraft(): MetaDraft {
  return {
    title: '',
    topic: '',
    grade: '5',
    cefrLevel: suggestCefrLevel('5'),
    cefrLevelOverridden: false,
    direction: 'both',
    description: '',
  };
}

interface MetadataFormProps {
  value: MetaDraft;
  onChange: (value: MetaDraft) => void;
  titleError?: string;
}

export function MetadataForm({ value, onChange, titleError }: MetadataFormProps) {
  const suggestion = suggestCefrLevel(value.grade);

  function setGrade(grade: Grade): void {
    onChange({
      ...value,
      grade,
      cefrLevel: value.cefrLevelOverridden ? value.cefrLevel : suggestCefrLevel(grade),
    });
  }

  function setCefr(level: CefrLevel): void {
    onChange({ ...value, cefrLevel: level, cefrLevelOverridden: level !== suggestion });
  }

  return (
    <div className="stack">
      <div className="field-grid">
        <Field
          label="Titel"
          hint="Erscheint in der Paketliste, z. B. „Unit 3 – Sports“."
          {...(titleError ? { error: titleError } : {})}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              value={value.title}
              required
              onChange={(event) => onChange({ ...value, title: event.target.value })}
            />
          )}
        </Field>

        <Field label="Thema" hint="Freies Schlagwort, z. B. „Sports“ oder „Reported Speech“.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={value.topic}
              onChange={(event) => onChange({ ...value, topic: event.target.value })}
            />
          )}
        </Field>
      </div>

      <div className="field-grid">
        <Field label="Jahrgang">
          {(props) => (
            <select {...props} value={value.grade} onChange={(event) => setGrade(event.target.value as Grade)}>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {GRADE_LABELS[grade]}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="GeR-Niveau"
          hint={
            value.cefrLevelOverridden
              ? `Abweichend vom Vorschlag (${suggestion}) gesetzt.`
              : `Automatisch vorgeschlagen: ${suggestion}.`
          }
        >
          {(props) => (
            <select
              {...props}
              value={value.cefrLevel}
              onChange={(event) => setCefr(event.target.value as CefrLevel)}
            >
              {CEFR_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                  {level === suggestion ? ' (Vorschlag)' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="Lernrichtung"
          hint="Bestimmt, welche Richtungen geübt und getrennt gezählt werden. Lückensätze und produktives Abfragen brauchen „Deutsch → Englisch“ oder „beide Richtungen“."
        >
          {(props) => (
            <select
              {...props}
              value={value.direction}
              onChange={(event) =>
                onChange({ ...value, direction: event.target.value as LearningDirection })
              }
            >
              {LEARNING_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {DIRECTION_LABELS[direction]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label="Beschreibung (optional)" hint="Kurzer Hinweis für Lernende, z. B. worauf zu achten ist.">
        {(props) => (
          <input
            {...props}
            type="text"
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
          />
        )}
      </Field>

      <Alert tone="info">
        Die GeR-Zuordnung folgt der üblichen Orientierung für Gymnasien in NRW und ist ein
        Vorschlag – schulinterne Lehrpläne können abweichen.
      </Alert>
    </div>
  );
}
