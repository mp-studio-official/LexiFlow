export interface HinweisSpeicher {
  getItem(key: string): string | null;
  setItem(key: string, wert: string): void;
  removeItem(key: string): void;
}

const PRAEFIX = 'lexiflow:lerncoach-hinweis:v1:';

function schluessel(profilId: string): string {
  const id = profilId.trim();
  if (id === '') throw new Error('Für den Datenhinweis fehlt das Profil.');
  return `${PRAEFIX}${encodeURIComponent(id)}`;
}

/**
 * Die Bestätigung bleibt bewusst auf diesem Gerät. Sie enthält weder Namen
 * noch Lernstand und ist durch die Profilkennung auf gemeinsam genutzten
 * Geräten getrennt. Ein Gerätewechsel fragt erneut — die sichere Richtung.
 */
export function coachHinweisGesehen(speicher: HinweisSpeicher, profilId: string): boolean {
  return speicher.getItem(schluessel(profilId)) === 'verstanden';
}

export function coachHinweisBestaetigen(speicher: HinweisSpeicher, profilId: string): void {
  speicher.setItem(schluessel(profilId), 'verstanden');
}

export function coachHinweisVergessen(speicher: HinweisSpeicher, profilId: string): void {
  speicher.removeItem(schluessel(profilId));
}
