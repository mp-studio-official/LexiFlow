# Übergabe: die nächste Stufe

Zweig `claude/next-product-experience`, Worktree
`.worktrees/next-product-experience`, ab `486abb6`. Der Pilotzweig ist
unberührt; nichts davon ist ausgeliefert, verdrahtet oder an eine Route
gehängt.

Alles hier ist **rein**: Daten hinein, Bild heraus, Handlungen als
Rückrufe. Keine Komponente holt sich ein Repository, eine Sitzung, eine
Rolle oder eine Kennung.

---

## 1. Was Codex verdrahten muss — in dieser Reihenfolge

### 1.1 Werkstatt unter `#/werkstatt`

```tsx
import { Werkstatt } from './teacher/werkstatt/Werkstatt';
import { anfang, werkstattZug, type Werkstattstand } from './teacher/werkstatt/zustand';
```

1. **Navigationsziel** in `src/hosted/navigationsziele.ts` anlegen —
   `#/werkstatt`, Zustand `geplant`, und **erst in dem Commit auf
   `vorhanden` drehen, der die Route baut** (E23).
2. **Route** in `HostedApp.tsx` innerhalb des Lehrkraftriegels, lazy
   geladen wie `TeacherArea`.
3. **Zustand halten** — `useState<Werkstattstand>(anfang())`, jeder Zug
   durch `werkstattZug`. Der Automat ist vollständig; es braucht keinen
   zweiten `useState` daneben.
4. **Datei lesen** — die Komponente meldet `datei-gewaehlt` mit dem Namen
   und erwartet danach `datei-gelesen` mit dem Inhalt:

   ```ts
   const inhalt = /\.xlsx$/i.test(datei.name)
     ? await datei.arrayBuffer()
     : await datei.text();
   setStand((s) => werkstattZug(s, {
     art: 'datei-gelesen',
     quelle: { art: 'datei', name: datei.name, groesse: datei.size, inhalt },
   }));
   ```
   Scheitert das Lesen, `lesen-gescheitert` mit einem Satz.
5. **`aufFertig`** bekommt `{ titel, eintraege }`. Dort gehört hin:
   `packs.saveDraft(...)` → `publication.publish(...)` →
   `publication.assignToCourse(...)`. Welche Lerngruppe, entscheidet ein
   Schritt, den es hier bewusst noch nicht gibt.
6. **`offline`** aus derselben Quelle speisen wie `Verbindungsfehler` in
   den übrigen Portalseiten.

### 1.2 Motivation im Lernbereich

```tsx
import { Tagesziel, Rundenbalken, Abschlussfeier, Auszeichnungsliste }
  from './learner/motivation/Motivation';
import { tagesstand, rundenfortschritt, auszeichnungen, frischErreicht }
  from '../domain/motivation';
```

Alle Werte stammen aus Aufrufen, die „Heute" und „Mein Fortschritt"
**bereits machen** — es kommt kein Repository-Aufruf dazu:

| Baustein | Woher |
| --- | --- |
| `Tagesziel` | `tagesstand(tage.find(t => t.localDay === kalender.heute))` aus `learningDays.myLearningDays()` |
| `Rundenbalken` | aus der laufenden Runde in `PracticePage` |
| `Auszeichnungsliste` | `auszeichnungen({ lerntage, beherrschung, paketstaende, serie, wochenziel, lerntageDerWoche })` — alles schon in `fortschrittDaten.ts` |
| `Abschlussfeier` | `frischErreicht(vorher, nachher)` um die Runde herum |

**Wichtig:** `frischErreicht` braucht den Stand **vor** der Runde. Den
einmal beim Rundenstart berechnen und festhalten; ein zweiter Aufruf am
Ende gegen denselben Stand ergäbe immer eine leere Liste.

### 1.3 Sprachliche Hilfen in der Übungsrunde

```tsx
import { hinweiseFuer, fehlererklaerung, beispielsatz, formangaben }
  from '../domain/sprache';
import { Hinweistreppe, Fehlerkarte, Formtafel, Beispiel }
  from './learner/sprache/Sprache';
```

`Hinweistreppe` hält ihren Stand **nicht selbst**. Wie viele Stufen offen
sind, gehört in die Runde — wer eine Vokabel nach drei Hinweisen löst, hat
sie anders gelöst als jemand ohne.

> **Offene Produktentscheidung:** Ob und wie sich benutzte Hinweise auf den
> Lernstand auswirken sollen. Heute: gar nicht. Die Leitner-Logik ist
> unverändert, und das soll sie bleiben, bis jemand das ausdrücklich
> entscheidet.

### 1.4 Lerncoach

```tsx
import { Lerncoach } from './learner/ki-ui/Lerncoach';
import type { Coachanbieter, Coachaufgabe } from './learner/ki-ui/vertrag';
```

Codex baut den **echten Anbieter** gegen `Coachanbieter` — eine Methode,
ein Ergebnis aus fünf Fällen. Dabei gilt:

- `pruefeAntwort` **vor** der Rückgabe aufrufen. Die Regel „ein Hinweis
  darf die Lösung nicht enthalten" steht auf unserer Seite, damit sie für
  jeden Anbieter gilt.
- `freigegeben` aus `KI_IM_PILOT` speisen, nicht aus dem Vorhandensein
  eines Schlüssels. Beides ist nicht dasselbe.
- `hinweisGesehen` muss **pro Person** gespeichert werden. Wo, ist eine
  offene Entscheidung: `localStorage` genügt für einen ersten Schritt und
  ist zugleich die Variante, die bei einem Gerätewechsel vergisst.

---

## 2. Öffentliche Props

### `Werkstatt`

```ts
{
  stand: Werkstattstand;
  aufZug: (zug: Werkstattzug) => void;
  aufFertig: (entwurf: { titel: string; eintraege: readonly VocabEntry[] }) => void;
  offline?: boolean;
  gibtAb?: boolean;
}
```

`Werkstattzug` = `text-eingefuegt` | `datei-gewaehlt` | `datei-gelesen` |
`lesen-gescheitert` | `zeilen-geaendert` | `neu-erkannt` |
`titel-geaendert` | `verworfen`.

### Motivation

```ts
Tagesziel            { stand: Tagesstand }
Rundenbalken         { stand: Rundenfortschritt }
Abschlussfeier       { frisch: readonly Auszeichnung[]; runde?: Rundenfortschritt; aufWeiter?: () => void }
Auszeichnungsliste   { auszeichnungen: readonly Auszeichnung[] }
```

### Sprache

```ts
Hinweistreppe  { hinweise: readonly Hinweis[]; offen: number; aufMehr: () => void }
Fehlerkarte    { erklaerung: Fehlererklaerung }
Formtafel      { angaben: readonly Formangabe[]; titel?: string }
Beispiel       { englisch: string; deutsch?: string; aufAnderen?: () => void }
```

### Lerncoach

```ts
{
  aufgabe: Coachaufgabe;      // lernform, richtung, beispielsatz?, antwort?, loesung?, sprache, niveau
  freigegeben: boolean;
  anbieter?: Coachanbieter;   // fehlt = kein Zugang eingerichtet
  hinweisGesehen: boolean;
  aufHinweisVerstanden: () => void;
}
```

---

## 3. Bekannte Grenzen

1. **Keine produktive Route.** Nichts davon ist erreichbar. Das ist die
   Zusage dieses Zweigs, nicht ein unfertiger Rest.
2. **Nur fünf Quellformate.** Eingefügter Text, getrennte Listen, CSV/TSV,
   Excel (.xlsx), LexiFlow-Pakete. Anki, Quizlet, Word, PDF, Foto und Scan
   sind **Erweiterungspunkte**: `erkenneQuelle` entscheidet an einer
   Stelle, und ein neues Format ist dort ein Zweig mehr. PDF ginge heute
   schon über das vorhandene `pdfText.ts` — bewusst nicht angeschlossen,
   weil ein halber Spezialimport schlimmer ist als keiner.
3. **Die Vorschau bearbeitet Englisch, Deutsch und die Auswahl.** Wortart,
   Beispielsätze und Notizen bleiben, wie erkannt; sie zu ändern geht im
   vorhandenen Paketeditor. Ein zweiter vollständiger Editor in der
   Vorschau wäre eine zweite Wahrheit über dasselbe.
4. **Der Lerncoach hat keinen echten Anbieter.** `fakeAnbieter` antwortet
   aus festen Bausteinen und ruft nichts an.
5. **Aussprache und Hörverstehen sind ein Vertrag, keine Umsetzung.**
   `aussprachequelle()` gibt heute immer `undefined`. Was eine solche
   Stufe bräuchte, steht in `src/domain/sprache/index.ts`.
6. **Die Abschlussfeier bleibt im Schaufenster unsichtbar.** Ihr Einblenden
   läuft in einem Effekt, und das Schaufenster ist statisch gerendert.
   Ihre Tippziele und ihr Fokus wurden trotzdem gemessen — sie hat Layout,
   nur keine Deckkraft.
7. **`src/schaufenster/**` ist kein Produktcode.** Es wird nur von
   `scripts/schaufenster-bauen.mjs` gerendert und landet in keinem
   ausgelieferten Bündel. Sobald die Bausteine verdrahtet sind, ersetzen
   die echten Seiten es.

---

## 4. Was bewusst **nicht** geändert wurde

| Bereich | Stand |
| --- | --- |
| `src/ai/**`, `src/cloud/**` | unverändert |
| `supabase/functions/**`, `supabase/migrations/**` | unverändert |
| `.github/workflows/**` | unverändert |
| `src/hosted/HostedApp.tsx` | unverändert — Routen sind Übergabe |
| `src/hosted/teacher/AiPage.tsx` | unverändert |
| `src/hosted/learner/PracticePage.tsx` | unverändert |
| `src/application/repositories.ts` | unverändert — **kein neuer Vertrag nötig** |
| `package.json` | unverändert |
| `src/domain/leitner.ts` | unverändert |
| portable Dateien (`AppShell`, `StudentShell`, `components.tsx`) | unverändert |

Nachgeprüft, nicht versprochen: `src/produktgrenze.test.ts` fragt `git`,
was sich seit `486abb6` wirklich geändert hat.

**Zwei bestehende Dateien wurden erweitert**, beide additiv und mit
grünen Bestandstests:

- `src/import/columnDetect.ts` — ein Stichentscheid über die
  Grossschreibung, **nur** wenn Umlaute und Artikel auf beiden Spalten
  schweigen. Ohne ihn kam `Haus → house` seitenverkehrt an.
- `src/hosted/portal.test.ts` — liest jetzt alle Portalstilblätter statt
  nur `portal.css`.
- `src/ui/zustaende.unbenutzt.test.ts` — zwei neue Verbraucher eingetragen.
