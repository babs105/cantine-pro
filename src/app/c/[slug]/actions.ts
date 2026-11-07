"use server";

import { echangerSlugPortail } from "@/lib/supabase/server";
import { PLANS, isPlanId } from "@/lib/abonnement";
import { normaliserTelephone } from "@/lib/telephone";

const INSCRIPTION_IMPOSSIBLE = "Inscription impossible pour le moment, contactez votre RH.";

/**
 * Auto-inscription d'un nouvel employé depuis le lien global de l'entreprise (/c/[slug]).
 * v1.10 : passe par la fonction SQL portail_inscrire_salarie, qui contrôle le plafond de l'offre sous verrou
 * et ne renvoie que la fiche créée ; le portail n'écrit plus dans employes en direct.
 */
export async function inscriptionEmployeAction(
  slug: string,
  nom: string,
  telephone?: string
): Promise<{ success: boolean; message?: string; employe?: { id: string; nom: string; token: string } }> {
  if (
    typeof slug !== "string" ||
    slug.length > 100 ||
    typeof nom !== "string" ||
    (telephone != null && typeof telephone !== "string")
  ) {
    return { success: false, message: "Requête invalide." };
  }
  const nomPropre = nom.trim().replace(/\s+/g, " ").slice(0, 80);
  if (nomPropre.length < 2) {
    return { success: false, message: "Renseignez votre prénom et nom." };
  }
  // Téléphone facultatif, mais au format E.164 s'il est saisi (il sert aux liens WhatsApp du RH)
  const tel = normaliserTelephone(telephone);
  if (telephone?.trim() && (!tel || tel.length > 20 || tel.replace(/\D/g, "").length < 8)) {
    return { success: false, message: "Numéro de téléphone invalide." };
  }

  try {
    const acces = await echangerSlugPortail(slug);
    if (!acces) {
      return { success: false, message: "Entreprise introuvable." };
    }
    const { supabase, companyId } = acces;

    // Plafond de l'offre (Starter 30, Pro 100, Business 300), passé à la fonction qui compte sous verrou
    const { data: comp } = await supabase.from("companies").select("plan").eq("id", companyId).maybeSingle();
    const planId = (comp as any)?.plan;
    const plan = PLANS[isPlanId(planId) ? planId : "pro"];

    const { data, error } = await (supabase as any).rpc("portail_inscrire_salarie", {
      p_nom: nomPropre,
      p_telephone: tel,
      p_max: plan.maxEmployes,
    });

    if (error?.code === "CP409") {
      return { success: false, message: "Inscription impossible : le nombre maximum de salariés est atteint. Contactez votre RH." };
    }
    const employe = Array.isArray(data) ? data[0] : null;
    if (error || !employe) {
      console.error("[portail] inscription :", error?.code);
      return { success: false, message: INSCRIPTION_IMPOSSIBLE };
    }

    return { success: true, employe };
  } catch {
    return { success: false, message: INSCRIPTION_IMPOSSIBLE };
  }
}
