"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayDakar } from "@/lib/config";
import { createAdminSession, destroyAdminSession, isAdmin, verifyAdminCode } from "@/lib/admin-session";
import { isPlanId } from "@/lib/abonnement";
import type { StatutAbonnement } from "@/types/database";
import { ipVisiteur } from "@/lib/ip";

export async function loginAdminAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  // v1.10 (T13) : 5 échecs par IP bloquent cette IP, 30 toutes IP confondues bloquent la console (15 minutes).
  // Le code est vérifié ici ; le contrôle et le comptage se font en une transaction sous verrou
  // (tentative_connexion_admin), pour qu'une rafale de requêtes parallèles ne dépasse pas le plafond.
  const codeCorrect = verifyAdminCode(String(formData.get("code") || "").slice(0, 200));
  const supabase = createAdminClient() as any;
  const { data: accepte, error } = await supabase.rpc("tentative_connexion_admin", {
    p_code_correct: codeCorrect,
    p_ip: await ipVisiteur(),
  });
  if (error) {
    if (error.code === "CP429") return { error: error.message };
    // Échec fermé. Détail réservé aux logs : PGRST202 = fonction introuvable, schéma pas encore relancé.
    console.error("[admin] tentative_connexion_admin :", error.code);
    return { error: "Connexion indisponible, réessayez plus tard." };
  }
  if (accepte !== true) return { error: "Code incorrect." };

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
