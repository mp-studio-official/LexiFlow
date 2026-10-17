import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Field } from '../../../ui/components';
import { PART_OF_SPEECH, PART_OF_SPEECH_LABELS, type PartOfSpeech } from '../../../domain/schema';
import { pickFromSource } from '../../../import/sourcePick';
import { mergeMultiwordTokens, tokenizeSource } from '../../../import/sourceTokens';
import { Quelltext, Quelltextlegende } from './Quelltext';
import { kompakteVorschlaege } from './kompaktauswahl';
import { datenschutzsatz, zuFragende } from './kivertrag';
import {
  type Kandidatenzeile,
  type Textstand,
  type Textzug,
  aufgenommene,
  formbeschreibung,
  textEntwurf,
  textIstFertig,
  wasFehlt,
  wortzustand,
} from './textzustand';
import type { GepruefterEntwurf } from './zustand';
import './werkstatt.css';

/**
 * Die Textwerkstatt an der Oberfläche.
 *
 * ## Warum sie nicht `TextCandidateReview.tsx` ist
 *
 * Jene Datei hat 2329 Zeilen und zieht vier Dinge mit, die es im Portal
 * nicht geben darf: den 6,1-MB-Wörterbuchbestand, `recommendation.ts`
 * und `learningFormProposal.ts` (beide am Wörterbuch) und
 * `geminiAssistant` — den direkten Anbieteraufruf aus dem Browser. Eine
 * „portierte" Fassung wäre eine Neufassung mit altem Namen gewesen.
 *
 * Übernommen sind ihre **Entscheidungen**: Quelltext und kompakte
 * Auswahlliste nebeneinander, ein Wort im Text nimmt sich selbst auf,
 * jede Zeile ist einzeln prüf-, änder- und entfernbar, und gespeichert
 * wird erst auf ausdrücklichen Klick. Übersetzung und Fachdaten folgen
 * in einem eigenen zweiten Schritt; sonst wird aus einer Auswahl eine
 * Wand aus Formularen.
 *
 * ## Warum es keine Vorauswahl gibt
 *
 * Weil ein Vorschlag, der schon angehakt ist, kein Vorschlag mehr ist.
 * Was die Analyse findet, steht als Angebot da — angehakt wird es von
 * der Lehrkraft. Die Zusage selbst steht in `textzustand.ts`; hier
 * steht nur, dass die Oberfläche sie nicht umgeht.
 *
 * ## Warum der KI-Knopf fehlen darf
 *
 * `aufVorschlaege` ist optional. Fehlt der Rückruf — weil keine
 * freigegebene KI-Fähigkeit vorhanden ist —, erscheint der Knopf gar
 * nicht erst. Ein Knopf, der
 * nichts auslöst, ist schlimmer als keiner, und die Werkstatt
 * funktioniert ohne ihn vollständig.
 */

export interface TextwerkstattProps {
  readonly stand: Textstand;
  readonly aufZug: (zug: Textzug) => void;
  readonly aufFertig: (entwurf: GepruefterEntwurf) => void;
  /**
   * Übersetzungsvorschläge holen — über den Gateway, nicht von hier.
   *
   * Fehlt der Rückruf, gibt es die Karte dazu nicht. Dass diese
   * Komponente den Anbieter nicht selbst ruft, ist keine Bequemlichkeit,
   * sondern Bedingung: `src/integrationsgrenze.test.ts` verbietet ihr
   * jeden Zugriff auf `application` und `cloud`.
   */
  readonly aufVorschlaege?: () => void;
  readonly gibtAb?: boolean;
}

export function Textwerkstatt({
  stand,
  aufZug,
  aufFertig,
  aufVorschlaege,
  gibtAb = false,
}: TextwerkstattProps) {
  if (stand.schritt === 'quelle') return <Quellenschritt aufZug={aufZug} />;
  return (
    <Pruefschritt
      stand={stand}
      aufZug={aufZug}
      aufFertig={aufFertig}
      {...(aufVorschlaege === undefined ? {} : { aufVorschlaege })}
      gibtAb={gibtAb}
    />
  );
}

const BEISPIEL =
  'Scotland is in the North of Britain. Just over five million people live there.';

function Quellenschritt({ aufZug }: { aufZug: (zug: Textzug) => void }) {
  const [text, setText] = useState('');
  const genug = text.trim().length > 0;

  return (
    <div className="stack werkstatt">
      <Card>
        <h2 className="werkstatt__titel">Text einfügen</h2>
        <p className="small muted werkstatt__hinweis">
          Ein zusammenhängender englischer Text — ein Lehrbuchabschnitt, ein Artikel, ein
          Hörtextskript. Keine Vokabelliste: LexiFlow sucht die Lernwörter selbst darin.
        </p>
        <Field
          label="Englischer Text"
          hint="Die Analyse läuft hier im Browser. Es wird nichts gesendet."
        >
          {(props) => (
            <textarea
              {...props}
              rows={12}
              value={text}
              spellCheck={false}
              onChange={(ereignis) => setText(ereignis.target.value)}
              placeholder={BEISPIEL}
            />
          )}
        </Field>
        <div className="row werkstatt__handlungen">
          <Button
            variant="primary"
            disabled={!genug}
            onClick={() => aufZug({ art: 'text-analysiert', text })}
          >
            Text analysieren
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Pruefschritt({
  stand,
  aufZug,
  aufFertig,
  aufVorschlaege,
  gibtAb,
}: {
  stand: Textstand;
  aufZug: (zug: Textzug) => void;
  aufFertig: (entwurf: GepruefterEntwurf) => void;
  aufVorschlaege?: () => void;
  gibtAb: boolean;
}) {
  const [phase, setPhase] = useState<'auswahl' | 'uebersetzen'>('auswahl');
  const [alleAnzeigen, setAlleAnzeigen] = useState(false);

  /*
    Zerlegung und Kandidaten aus **einer** Analyse.

    Zwei getrennte Läufe wären zwei Wahrheiten darüber, was ein Wort
    ist: Der Text markierte dann Wörter, die in der Liste fehlen.
  */
  const tokens = useMemo(() => {
    const kandidaten = stand.zeilen.map((zeile) => zeile.kandidat);
    return mergeMultiwordTokens(tokenizeSource(stand.text, kandidaten), kandidaten);
  }, [stand.text, stand.zeilen]);

  const gewaehlt = aufgenommene(stand);
  const offen = zuFragende(stand.zeilen).length;
  const geordnet = useMemo(() => {
    const empfohlen = kompakteVorschlaege(stand.zeilen, 15);
    const empfohlenIds = new Set(empfohlen.map((zeile) => zeile.kandidat.id));
    return [...empfohlen, ...stand.zeilen.filter((zeile) => !empfohlenIds.has(zeile.kandidat.id))];
  }, [stand.zeilen]);
  const erste = geordnet.slice(0, 15);
  const sichtbar = alleAnzeigen ? geordnet : erste;
  const alleSichtbarenAufgenommen = sichtbar.every((zeile) => zeile.aufgenommen);

  function aufnehmenAusText(von: number, bis: number) {
    const auswahl = pickFromSource({
      sourceText: stand.text,
      tokens,
      from: von,
      to: bis,
      candidates: stand.zeilen.map((zeile) => zeile.kandidat),
    });
    if (auswahl.kind === 'existing') {
      aufZug({ art: 'aufgenommen', id: auswahl.candidateId });
      return;
    }
    if (auswahl.kind === 'new') aufZug({ art: 'aus-quelltext', auswahl });
  }

  if (phase === 'uebersetzen') {
    return (
      <Uebersetzungsschritt
        stand={stand}
        aufZug={aufZug}
        aufFertig={aufFertig}
        aufZurueck={() => setPhase('auswahl')}
        geordneteAuswahl={geordnet.filter((zeile) => zeile.aufgenommen)}
        {...(aufVorschlaege === undefined ? {} : { aufVorschlaege })}
        offen={offen}
        gibtAb={gibtAb}
      />
    );
  }

  return (
    <div className="stack werkstatt">
      <Card quiet>
        <p className="werkstatt__schritt">Schritt 1 von 2 · Wörter auswählen</p>
        <p className="werkstatt__erkennung" role="status">
          {stand.zeilen.length} mögliche Lernwörter aus {stand.saetze} Sätzen. Zuerst siehst du
          15 kompakte Vorschläge; weitere kannst du jederzeit einblenden.
        </p>
      </Card>

      <div className="werkstatt__zweispaltig">
        <Card className="werkstatt__quellkarte">
          <h2 className="werkstatt__titel">Dein Text</h2>
          <div className="small muted werkstatt__hinweis">
            <Quelltextlegende />
          </div>
          <Quelltext
            tokens={tokens}
            zustandVon={(id) => wortzustand(stand, id)}
            aufAufnehmen={aufnehmenAusText}
          />
        </Card>

        <Card className="werkstatt__auswahlkarte">
          <div className="row werkstatt__handlungen werkstatt__listen-kopf">
            <div>
              <h2 className="werkstatt__titel">Wörter auswählen</h2>
              <p className="small muted werkstatt__offen">
                Übersetzungen und weitere Angaben kommen im nächsten Schritt.
              </p>
            </div>
            <Badge>{gewaehlt.length} ausgewählt</Badge>
          </div>

          <div className="row werkstatt__handlungen werkstatt__werkzeuge">
            <Button
              variant="default"
              onClick={() =>
                aufZug({
                  art: 'auswahl-gesetzt',
                  ids: sichtbar.map((zeile) => zeile.kandidat.id),
                  aufgenommen: !alleSichtbarenAufgenommen,
                })
              }
            >
              {alleSichtbarenAufgenommen
                ? `Diese ${sichtbar.length} abwählen`
                : `Alle ${sichtbar.length} auswählen`}
            </Button>
            {stand.zeilen.length > 15 ? (
              <Button variant="quiet" onClick={() => setAlleAnzeigen((bisher) => !bisher)}>
                {alleAnzeigen ? 'Nur erste 15 zeigen' : `Alle ${stand.zeilen.length} zeigen`}
              </Button>
            ) : null}
          </div>

          <ul className="werkstatt__kompaktliste">
            {sichtbar.map((zeile) => (
              <KompakterKandidat key={zeile.kandidat.id} zeile={zeile} aufZug={aufZug} />
            ))}
          </ul>

          <div className="row werkstatt__handlungen werkstatt__weiter">
            <Button
              variant="primary"
              disabled={gewaehlt.length === 0}
              onClick={() => setPhase('uebersetzen')}
            >
              {gewaehlt.length === 0
                ? 'Wörter auswählen'
                : `${gewaehlt.length} ${gewaehlt.length === 1 ? 'Wort' : 'Wörter'} übersetzen`}
            </Button>
          </div>
        </Card>
      </div>

      <Button variant="quiet" onClick={() => aufZug({ art: 'verworfen' })}>
        Anderen Text einfügen
      </Button>
    </div>
  );
}

function KompakterKandidat({
  zeile,
  aufZug,
}: {
  zeile: Kandidatenzeile;
  aufZug: (zug: Textzug) => void;
}) {
  const id = zeile.kandidat.id;
  return (
    <li className="werkstatt__kompaktzeile" data-aufgenommen={zeile.aufgenommen ? 'ja' : undefined}>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={zeile.aufgenommen}
          onChange={(ereignis) =>
            aufZug({ art: ereignis.target.checked ? 'aufgenommen' : 'abgewaehlt', id })
          }
        />
        <span className="werkstatt__kompaktwort">{zeile.kandidat.english}</span>
      </label>
      <span className="small muted werkstatt__kurzinfo">
        {zeile.german.trim() ||
          (zeile.kandidat.occurrences === 1
            ? '1× im Text'
            : `${zeile.kandidat.occurrences}× im Text`)}
      </span>
    </li>
  );
}

function Uebersetzungsschritt({
  stand,
  aufZug,
  aufFertig,
  aufZurueck,
  geordneteAuswahl,
  aufVorschlaege,
  offen,
  gibtAb,
}: {
  stand: Textstand;
  aufZug: (zug: Textzug) => void;
  aufFertig: (entwurf: GepruefterEntwurf) => void;
  aufZurueck: () => void;
  geordneteAuswahl: readonly Kandidatenzeile[];
  aufVorschlaege?: () => void;
  offen: number;
  gibtAb: boolean;
}) {
  const gewaehlt = geordneteAuswahl;
  const fehlt = wasFehlt(stand);
  const fertig = textIstFertig(stand);

  return (
    <div className="stack werkstatt">
      <Card quiet>
        <p className="werkstatt__schritt">Schritt 2 von 2 · Übersetzen und prüfen</p>
        <div className="row werkstatt__handlungen">
          <p className="werkstatt__erkennung" role="status">
            {gewaehlt.length} {gewaehlt.length === 1 ? 'Wort' : 'Wörter'} ausgewählt. Trage jetzt
            die deutsche Bedeutung ein; weitere Angaben sind optional.
          </p>
          <Button variant="quiet" onClick={aufZurueck}>Auswahl ändern</Button>
        </div>
      </Card>

      <Card>
        <Field label="Name des Lernpakets" hint="Zum Beispiel der Titel des Textes.">
          {(props) => (
            <input
              {...props}
              type="text"
              value={stand.titel}
              onChange={(ereignis) =>
                aufZug({ art: 'titel-geaendert', titel: ereignis.target.value })
              }
            />
          )}
        </Field>
      </Card>

      {aufVorschlaege ? (
        <Kivorschlagskarte stand={stand} offen={offen} aufVorschlaege={aufVorschlaege} />
      ) : null}

      <Card>
        <h2 className="werkstatt__titel">Übersetzungen</h2>
        <p className="small muted werkstatt__hinweis">
          Die Pflichtangaben stehen direkt in der Liste. Quellsatz, Wortart und Lernform findest
          du nur bei Bedarf unter „Details“.
        </p>
        <ul className="werkstatt__uebersetzungsliste">
          {gewaehlt.map((zeile) => (
            <Uebersetzungszeile key={zeile.kandidat.id} zeile={zeile} aufZug={aufZug} />
          ))}
        </ul>
      </Card>

      <Card>
        <div className="row werkstatt__handlungen">
          <Button
            variant="primary"
            disabled={!fertig || gibtAb}
            onClick={() => {
              const entwurf = textEntwurf(stand);
              if (entwurf) aufFertig(entwurf);
            }}
          >
            {gibtAb ? 'Wird angelegt …' : 'Lernpaket anlegen'}
          </Button>
          <Button variant="quiet" onClick={aufZurueck}>Auswahl ändern</Button>
        </div>
        {fehlt.length > 0 ? (
          <ul className="werkstatt__befunde" role="status">
            {fehlt.map((satz) => <li key={satz}>{satz}</li>)}
          </ul>
        ) : (
          <p className="small muted werkstatt__offen" role="status">
            Das Lernpaket wird als Entwurf gespeichert. Es wird nicht veröffentlicht und keiner
            Lerngruppe zugewiesen.
          </p>
        )}
      </Card>
    </div>
  );
}

function Kivorschlagskarte({
  stand,
  offen,
  aufVorschlaege,
}: {
  stand: Textstand;
  offen: number;
  aufVorschlaege: () => void;
}) {
  return (
    <Card quiet>
      <h2 className="werkstatt__titel">Übersetzungsvorschläge holen</h2>
      <p className="small muted werkstatt__hinweis">{datenschutzsatz(offen)}</p>
      {stand.kiStand === 'gescheitert' && stand.kiMeldung ? (
        <Alert tone="warning" title="Die Vorschläge kamen nicht an">
          <p>{stand.kiMeldung}</p>
          <p className="small muted">
            Die Werkstatt funktioniert ohne sie weiter — die Bedeutungen lassen sich eintippen.
          </p>
        </Alert>
      ) : null}
      {stand.kiStand === 'fertig' && stand.kiVerworfen > 0 ? (
        <Alert tone="info" title="Nicht alles war brauchbar">
          <p>
            {stand.kiVerworfen === 1
              ? 'Ein Vorschlag gehörte zu keinem Wort aus deinem Text und wurde verworfen.'
              : `${stand.kiVerworfen} Vorschläge gehörten zu keinem Wort aus deinem Text und wurden verworfen.`}
          </p>
        </Alert>
      ) : null}
      <div className="row werkstatt__handlungen">
        <Button
          variant="default"
          disabled={offen === 0 || stand.kiStand === 'laeuft'}
          onClick={aufVorschlaege}
        >
          {stand.kiStand === 'laeuft'
            ? 'Wird geholt …'
            : `Vorschläge für ${offen} ${offen === 1 ? 'Wort' : 'Wörter'} holen`}
        </Button>
      </div>
      <p className="small muted werkstatt__offen">
        Vorschläge füllen nur leere Felder. Was du selbst geschrieben hast, bleibt stehen.
      </p>
    </Card>
  );
}

function Uebersetzungszeile({
  zeile,
  aufZug,
}: {
  zeile: Kandidatenzeile;
  aufZug: (zug: Textzug) => void;
}) {
  const id = zeile.kandidat.id;
  const { formen, beugungen } = formbeschreibung(zeile);

  type Aenderung = Extract<Textzug, { art: 'zeile-geaendert' }>['teil'];
  function aendere(teil: Aenderung) {
    aufZug({ art: 'zeile-geaendert', id, teil });
  }

  return (
    <li className="werkstatt__uebersetzungszeile">
      <div className="werkstatt__uebersetzung">
        <strong className="werkstatt__englisch">{zeile.kandidat.english}</strong>
        <Field label={`Deutsche Bedeutung für ${zeile.kandidat.english}`}>
          {(props) => (
            <input
              {...props}
              type="text"
              value={zeile.german}
              placeholder="Deutsche Übersetzung"
              onChange={(ereignis) => aendere({ german: ereignis.target.value })}
            />
          )}
        </Field>
        {zeile.herkunft === 'quelltext' ? <Badge>aus dem Text ergänzt</Badge> : null}
        {zeile.vorschlagUebernommen ? <Badge>KI-Vorschlag</Badge> : null}
      </div>

      <details className="werkstatt__details">
        <summary>Details zu {zeile.kandidat.english}</summary>
        <div className="werkstatt__felder">
          <p className="small muted werkstatt__formen">{formen}</p>
          {beugungen.length > 0 ? (
            <p className="small muted werkstatt__formen">{beugungen.join(' · ')}</p>
          ) : null}
          <p className="small werkstatt__satz"><q>{zeile.kandidat.sourceSentence}</q></p>
          <Field label="Lernform" hint="Leer lassen heisst: die Form aus dem Text gilt.">
            {(props) => (
              <input
                {...props}
                type="text"
                value={zeile.learningForm}
                placeholder={zeile.kandidat.english}
                onChange={(ereignis) => aendere({ learningForm: ereignis.target.value })}
              />
            )}
          </Field>
          <Field label="Wortart">
            {(props) => (
              <select
                {...props}
                value={zeile.partOfSpeech}
                onChange={(ereignis) =>
                  aendere({ partOfSpeech: ereignis.target.value as PartOfSpeech | '' })
                }
              >
                <option value="">— nicht gesetzt —</option>
                {PART_OF_SPEECH.map((art) => (
                  <option key={art} value={art}>
                    {PART_OF_SPEECH_LABELS[art]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={zeile.beispielsatzUebernehmen}
              onChange={(ereignis) =>
                aendere({ beispielsatzUebernehmen: ereignis.target.checked })
              }
            />
            <span className="werkstatt__auswahltext">Satz aus dem Text als Beispiel übernehmen</span>
          </label>
          <Button variant="quiet" onClick={() => aufZug({ art: 'abgewaehlt', id })}>
            Dieses Wort nicht verwenden
          </Button>
        </div>
      </details>
    </li>
  );
}

export default Textwerkstatt;
