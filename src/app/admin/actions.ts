"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayDakar } from "@/lib/config";
import { createAdminSession, destroyAdminSession, isAdmin, verifyAdminCode } from "@/lib/admin-session";
import { isPlanId } from "@/lib/abonnement";
import type { StatutAbonnement } from "@/types/database";

/** Clé du compteur d'échecs de la console (table tentatives_connexion, v1.8 du schéma) */
const CLE_TENTATIVES_ADMIN = "admin";

export async function loginAdminAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  // Même limite que l'Espace RH : 5 échecs en 15 minutes bloquent la console 15 minutes
  const supabase = createAdminClient() as any;
  const { error: blocage } = await supabase.rpc("controler_tentatives", { p_cle: CLE_TENTATIVES_ADMIN });
  if (blocage) {
    if (blocage.code === "CP429") return { error: blocage.message };
    // Détail réservé aux logs serveur : la page de connexion ne doit rien dire de l'architecture.
    // PGRST202 = fonction introuvable, le schéma v1.8 n'a pas été relancé dans Supabase.
    console.error("[admin] controler_tentatives :", blocage.code);
    return { error: "Connexion indisponible, réessayez plus tard." };
  }

  if (!verifyAdminCode(String(formData.get("code") || "").slice(0, 200))) {
    // Échec fermé : un échec non compté rendrait la limite inopérante
    const { error: comptage } = await supabase.rpc("noter_echec_connexion", { p_cle: CLE_TENTATIVES_ADMIN });
    if (comptage) {
      console.error("[admin] noter_echec_connexion :", comptage.code);
      return { error: "Connexion indisponible, réessayez plus tard." };
    }
    return { error: "Code incorrect." };
  }

  // Le code est bon : un compteur non effacé n'est pas une faille, on se contente de le journaliser
  const { error: effacement } = await supabase.rpc("effacer_tentatives", { p_cle: CLE_TENTATIVES_ADMIN });
  if (effacement) console.error("[admin] effacer_tentatives :", effacement.code);
  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdminAction(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

async function contexteAdmin() {
  if (!(await isAdmin())) return { erreur: "Session SuperAdmin expirée." } as const;
  return { supabase: createAdminClient() } as const;
}

export async function modifierAbonnementAction(
  companyId: string,
  champs: { plan?: string; statut?: StatutAbonnement; trialEndsAt?: string }
): Promise<{ success: boolean; message?: string }> {
  const ctx = await contexteAdmin();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur };

  const maj: Record<string, unknown> = {};
  if (champs.plan !== undefined) {
    if (!isPlanId(champs.plan)) return { success: false, message: "Offre inconnue." };
    maj.plan = champs.plan;
  }
  if (champs.statut !== undefined) {
    if (!["trial", "active", "suspended", "cancelled"].includes(champs.statut)) {
      return { success: false, message: "Statut inconnu." };
    }
    maj.statut_abonnement = champs.statut;
  }
  if (champs.trialEndsAt !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(champs.trialEndsAt)) return { success: false, message: "Date invalide." };
    maj.trial_ends_at = `${champs.trialEndsAt}T23:59:59Z`;
  }

  const { error } = await (ctx.supabase.from("companies") as any).update(maj).eq("id", companyId);
  if (error) return { success: false, message: error.message };
  revalidatePath("/admin");
  return { success: true };
}

function ajouterMois(date: string, n: number): string {
  const [a, m, j] = date.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, j));
  // 31 janvier + 1 mois → dernier jour de février
  if (d.getUTCDate() !== j) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Paiement Wave reçu : l'abonnement passe « actif » et est prolongé de `mois` mois
 * à partir de la fin de la période en cours (ou d'aujourd'hui si elle est dépassée).
 */
export async function enregistrerPaiementAction(
  companyId: string,
  paiement: { montant: number; mois: number; reference: string }
): Promise<{ success: boolean; message?: string }> {
  const ctx = await contexteAdmin();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur };
  if (!Number.isFinite(paiement.montant) || paiement.montant <= 0) return { success: false, message: "Montant invalide." };
  if (!Number.isInteger(paiement.mois) || paiement.mois < 1 || paiement.mois > 12) {
    return { success: false, message: "Durée invalide (1 à 12 mois)." };
  }

  const { data: comp } = await ctx.supabase.from("companies").select("abonnement_fin").eq("id", companyId).single();
  const today = todayDakar();
  const finActuelle = (comp as any)?.abonnement_fin as string | null;
  const depart = finActuelle && finActuelle >= today ? finActuelle : today;
  const periodeFin = ajouterMois(depart, paiement.mois);

  const { error: errPaiement } = await (ctx.supabase.from("paiements") as any).insert({
    company_id: companyId,
    montant: Math.round(paiement.montant),
    mode: "wave",
    reference: paiement.reference.trim() || null,
    periode_fin: periodeFin,
  });
  if (errPaiement) return { success: false, message: errPaiement.message };

  const { error } = await (ctx.supabase.from("companies") as any)
    .update({ statut_abonnement: "active", abonnement_fin: periodeFin })
    .eq("id", companyId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin");
  return { success: true, message: `Abonnement prolongé jusqu'au ${periodeFin}.` };
}
