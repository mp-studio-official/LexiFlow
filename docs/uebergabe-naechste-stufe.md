# Übergabe: die nächste Stufe

Zweig `claude/product-wiring`, Worktree `.worktrees/product-wiring`, ab
`25d92b7` auf `codex/integrate-next-product`.

> **Stand: verdrahtet.** Die Bausteine der vorigen Stufe hängen jetzt an
> echten Routen und echten Daten. Was unten unter „Was Codex verdrahten
> muss" stand, ist erledigt — bis auf den Lerncoach, der ausdrücklich bei
> Codex bleibt.

## 0. Die Verdrahtung — Commits und Routen

| Commit | Inhalt |
| --- | --- |
| `0133e51` | Werkstatt produktiv: `#/pakete/neu`, Entwurf statt Automatik |
| `54af440` | Motivation produktiv: Tagesziel, Auszeichnungen, Rundenbalken, Feier |
| `6f43695` | Sprachliche Hilfen in der Übungsrunde |
| `6571c3d` | Das Wörterbuch bleibt aus dem Portalbündel |

### Geänderte Routen

| Route | Änderung |
| --- | --- |
| `#/pakete/neu` | **neu** — die Werkstatt, innerhalb des bestehenden Lehrkraftriegels |
| `#/pakete` | Einstiegsknopf „Neues Lernpaket"; der Kopf steht jetzt auch im Ladefehler |
| `#/heute` | Tagesziel im Abschnitt „Ziele" |
| `#/fortschritt` | neuer Abschnitt „Auszeichnungen" (acht statt sieben) |
| `/lernen/kurs/:id/ueben/:packId` | Rundenbalken, Abschlussfeier, gestufte Hinweise, Fehlererklärung, Formtafel, Beispielsatz |

**Kein neues Hauptnavigationsziel.** Die Werkstatt ist eine Handlung an
den Lernpaketen, kein Ort daneben; E23 lässt kein Ziel zu, das nur
manchmal etwas bedeutet. Eine Prüfung hält fest, dass `#/pakete/neu` in
keiner der beiden Navigationen auftaucht.

### Entscheidungen, die nicht automatisch fallen

Die Werkstatt **legt einen Entwurf an**. Sie veröffentlicht nicht und
weist keiner Lerngruppe zu: Beides sind Entscheidungen einer Lehrkraft
über etwas, das danach andere sehen. Der Abschlussbildschirm erklärt, was
als Nächstes möglich ist, und verweist auf „Lernpakete" — der Weg dorthin
ist ein Verweis, kein Automatismus. Der Knopf heisst deshalb „Lernpaket
anlegen" und nicht mehr „Veröffentlichen und zuweisen".

**Jahrgang und Abfragerichtung werden gefragt**, weil `PackMeta` sie
verlangt und eine Vokabelliste sie nicht hergibt. `cefrLevelOverridden`
bleibt `false`: Niemand hat hier etwas abweichend gesetzt.

### Messung

`npm run portal:messen` gegen den gebauten Stand, **17 Routen × vier
Breiten** (390/768/1024/1440): kein waagerechter Überlauf, kein Tippziel
unter 44 × 44 px, jedes per Tabulator erreichbare Element mit sichtbarem
Fokus, keine Konsolenfehler.

Die Messung selbst hat dabei drei eigene Fehler offengelegt:

1. Sie prüfte Fokus mit `el.focus()` und las die berechnete Umrandung —
   und meldete auf **jeder** Route Befunde. Zu Unrecht: Der Ring hängt an
   `:focus-visible`, und das setzt Chromium bei programmatischem Fokus
   absichtlich nicht. Jetzt wird wirklich getabbt.
2. Ihr Sichtbarkeitsfilter übersah nicht gerenderte Teilbäume (die
   Telefonnavigation am Schreibtisch). `getClientRects()` sagt, was
   wirklich dasteht.
3. Die gemessene lernende Person hatte keine bestätigte Zeitzone — damit
   blieben Woche, Serie, Wochenziel **und** das neue Tagesziel
   unbeziffert. Vier Breiten lang wurde eine Seite voller „zeigen wir
   erst, wenn …" aufgenommen. Die Messung bestätigt die Zone jetzt.

### Bekannte Grenzen dieser Stufe

1. **Die Übungsrunde wird nicht im Browser gemessen.** Sie braucht einen
   Kurs mit zugewiesenem Paket, und das Messkonto hat keinen. Rundenbalken,
   Hinweistreppe, Fehlerkarte, Formtafel und Beispielsatz sind über
   Integrationsprüfungen abgedeckt, nicht über eine Aufnahme.
2. **Die Feier in der Runde kennt nur eine Auszeichnung.** „Ein Paket
   durch" — alles andere braucht Lerntage, Serie und Gesamtstand, die
   diese Seite nicht lädt. Ein zusätzlicher Abruf nur zum Feiern wäre
   Datenhunger.
3. **Benutzte Hinweise beeinflussen den Lernstand nicht.** `checkAnswer`
   bleibt die alleinige Instanz, das Leitner-Fach steigt wie bisher.
   **Offene Produktentscheidung** — siehe unten.
4. **Der Lerncoach ist nicht in `PracticePage` eingebaut.** Ausdrücklich
   bei Codex.
5. **Die Vorschau der Werkstatt bearbeitet Englisch, Deutsch und die
   Auswahl.** Wortart, Beispielsätze und Notizen bleiben, wie erkannt; sie
   zu ändern geht im vorhandenen Paketeditor.

### Offene Produktentscheidungen

| Frage | Heute | Warum offen |
| --- | --- | --- |
| Sollen benutzte Hinweise den Lernstand beeinflussen? | nein | Das ändert die Bedeutung eines Leitner-Fachs. Keine Frage, die sich beim Verdrahten nebenbei beantworten lässt. |
| Wo wird die Bestätigung des KI-Datenhinweises gespeichert? | noch nirgends | `localStorage` genügt für einen ersten Schritt und vergisst beim Gerätewechsel. |
| Soll die Werkstatt einen Schritt „veröffentlichen und zuweisen" anbieten? | nein | Heute führt ein Verweis auf „Lernpakete". Ein Schritt mehr im Assistenten wäre bequemer und nähme die Entscheidung näher an das Speichern heran. |

---

Zweig `claude/next-product-experience`, Worktree
`.worktrees/next-product-experience`, ab `486abb6`. Der Pilotzweig ist
unberührt; nichts davon ist ausgeliefert, verdrahtet oder an eine Route
gehängt.

Alles hier ist **rein**: Daten hinein, Bild heraus, Handlungen als
Rückrufe. Keine Komponente holt sich ein Repository, eine Sitzung, eine
Rolle oder eine Kennung.

---

## 1. Wie verdrahtet wurde — als Beleg, nicht als Auftrag

> **Erledigt.** Die Schritte unten standen hier als Anleitung; sie
> beschreiben jetzt, was in `0133e51`, `54af440` und `6f43695` wirklich
> geschehen ist. Offen ist allein 1.4, der Lerncoach.

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

### 1.4 Lerncoach — **weiterhin offen, bei Codex**

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
