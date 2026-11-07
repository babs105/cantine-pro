import "server-only";
import { ipVisiteur } from "@/lib/ip";

/**
 * Limite de débit des inscriptions en libre-service (v1.10 T16) : 5 tentatives en 15 minutes depuis une
 * même IP, par type d'inscription. Renvoie le message à afficher si l'inscription est refusée, sinon null.
 * Refus aussi si le contrôle est impossible (fonction absente, base injoignable) : on ne crée pas de compte
 * sans avoir pu compter la tentative.
 * `admin` : le client service_role de l'action d'inscription (createAdminClient reste dans les fichiers
 * autorisés par CLAUDE.md).
 */
export async function limiterInscription(
  admin: unknown,
  type: "entreprise" | "restaurant"
): Promise<string | null> {
  const ip = await ipVisiteur();
  // Sans IP, toutes les inscriptions partagent le compteur « inconnue » : à voir dans les journaux Vercel
  if (!ip && process.env.VERCEL_ENV === "production") console.warn("[inscription] IP du visiteur introuvable");
  const { error } = await (admin as any).rpc("limiter_inscription", {
    p_type: type,
    p_ip: ip,
  });
  if (!error) return null;
  if (error.code === "CP429") {
    return "Trop d'inscriptions depuis cette connexion. Réessayez dans 15 minutes.";
  }
  console.error(`[inscription] limiter_inscription (${type}) :`, error.code);
  return "Inscription impossible pour le moment, réessayez dans quelques minutes.";
}
