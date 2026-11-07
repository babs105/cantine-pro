import "server-only";
import type { SupabaseServeur } from "@/lib/supabase/client-serveur";

/** Ce que le salarié et le restaurant voient de l'entreprise (fonction SQL entreprise_visible, v1.10 T14) */
export interface EntrepriseVisible {
  nom: string;
  heure_ouverture_vote: string;
  heure_limite_vote: string;
  jours_travail: number[];
}

/**
 * Fiche entreprise à colonnes fixes, pour un client JWT salarié ou restaurant. Depuis la v1.10 (T14),
 * ces rôles ne lisent plus la table companies : ni e-mail ni téléphone du responsable, ni abonnement.
 * Renvoie null si la fonction échoue ou si le rôle n'y a pas droit.
 */
export async function lireEntrepriseVisible(supabase: SupabaseServeur): Promise<EntrepriseVisible | null> {
  const { data, error } = await (supabase as any).rpc("entreprise_visible");
  if (error) {
    console.error("[entreprise] entreprise_visible :", error.code);
    return null;
  }
  const ligne = Array.isArray(data) ? data[0] : null;
  if (!ligne) return null;
  // Colonnes recopiées une à une : une colonne ajoutée plus tard à la fonction ne partirait pas plus loin
  return {
    nom: ligne.nom,
    heure_ouverture_vote: ligne.heure_ouverture_vote,
    heure_limite_vote: ligne.heure_limite_vote,
    jours_travail: ligne.jours_travail ?? [],
  };
}
