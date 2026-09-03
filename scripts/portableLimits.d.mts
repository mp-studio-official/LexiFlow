/**
 * Typen zu `portableLimits.mjs`, damit die Artefakttests die Schranken ohne
 * `any` lesen können.
 *
 * Das Skript bleibt JavaScript: Es läuft in einem nackten Node-Prozess ohne
 * Transpilierung. Diese Datei ist die Vertragsseite, keine zweite Wahrheit.
 */

/** Schranke der Lehrkraftdatei in Mebibyte. */
export const TEACHER_LIMIT_MIB: number;

/** Schranke der Lernlaufzeit in Kibibyte. */
export const RUNTIME_LIMIT_KIB: number;
