/**
 * Messages d'erreur montrés au RH ou au restaurant (v1.10 T17). Une erreur Postgres brute révèle des noms
 * de tables, de colonnes ou de contraintes : on ne la renvoie jamais telle quelle.
 */

/** Erreur dont le message est écrit pour l'utilisateur (ex. format de fichier refusé) */
export class ErreurAffichable extends Error {}

/**
 * Codes levés par nos fonctions et triggers SQL, au message écrit en français pour l'utilisateur :
 * CP403 / CP404 / CP423 (commande salarié), CP409 (plafond), CP412 (journée confirmée), CP422 (restaurant fermé ce jour-là), CP429 (trop d'essais)
 */
const CODES_METIER = new Set(["CP403", "CP404", "CP409", "CP412", "CP422", "CP423", "CP429"]);

/**
 * Traduit une erreur (Supabase ou levée) en message lisible. `doublon` : message pour une valeur déjà
 * utilisée (code 23505). Pour toute autre erreur, seul le code part dans les journaux serveur.
 */
export function messageErreur(
  contexte: string,
  err: unknown,
  defaut = "Opération impossible pour le moment, réessayez.",
  doublon?: string
): string {
  if (err instanceof ErreurAffichable) return err.message;
  const code = typeof (err as any)?.code === "string" ? (err as any).code : undefined;
  const message = (err as any)?.message;
  if (code && CODES_METIER.has(code) && typeof message === "string" && message) return message;
  if (code === "23505" && doublon) return doublon;
  console.error(`[${contexte}]`, code ?? "erreur");
  return defaut;
}

/** Erreur Supabase relancée avec son code, et son message seulement s'il est écrit pour l'utilisateur */
export function erreurAvecCode(prefixe: string, err: { code?: string; message?: string }): Error {
  const lisible = err.code && CODES_METIER.has(err.code) && err.message ? err.message : "enregistrement impossible";
  return Object.assign(new Error(`${prefixe} : ${lisible}`), { code: err.code });
}
