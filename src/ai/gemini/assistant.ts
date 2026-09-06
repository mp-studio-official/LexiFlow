import { loadKey } from './credentials';
import { createGeminiAiProvider, type GeminiAssistant } from './geminiAiProvider';
import { loadModel } from './settings';

/**
 * Der eine Assistent, den die Werkstätten benutzen.
 *
 * ## Warum er nicht in der Anbieter-Registry steht
 *
 * `ProviderContext` erzeugt seine Anbieter beim Start – für die
 * Lehrkraftanwendung **und** für die Lern-Datei, die denselben Kontext
 * benutzt. Ein Gemini-Eintrag dort zöge den ganzen Zweig samt Adresse in die
 * Datei, die an eine Lerngruppe geht. Deshalb wird er hier geholt, von Modulen,
 * die nur der Lehrkraftbereich lädt – und `verify:portable` prüft nach, dass
 * davon nichts in der Lernlaufzeit landet.
 *
 * ## Warum ein Modul und keine Instanz je Ansicht
 *
 * Der Assistent hält keinen Zustand: Schlüssel und Modell holt er bei **jeder**
 * Anfrage neu aus dem Speicher. Ein Objekt genügt deshalb für die ganze
 * Anwendung, und „Zugangsdaten vergessen“ wirkt sofort in jeder offenen
 * Ansicht – ohne dass irgendwo ein Anbieter mit einem alten Schlüssel
 * weiterlebte.
 */

let instance: GeminiAssistant | undefined;

export function geminiAssistant(): GeminiAssistant {
  instance ??= createGeminiAiProvider({
    getKey: () => loadKey()?.key,
    getModel: () => loadModel(),
  });
  return instance;
}

/**
 * Ist der Assistent eingerichtet?
 *
 * Ein Blick in den Speicher, keine Anfrage. Ob der Schlüssel gilt, weiß nur
 * Google – und das zu erfragen ist eine Handlung, keine Nebenwirkung des
 * Öffnens einer Seite.
 */
export function geminiReady(): boolean {
  return loadKey() !== undefined;
}

/** Nur für Tests: die gemerkte Instanz verwerfen. */
export function resetAssistantForTests(): void {
  instance = undefined;
}
