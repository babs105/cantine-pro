"use server";

import { placesRestantes } from "@/lib/limite-employes";
import { echangerSlugPortail } from "@/lib/supabase/server";
import { generateToken } from "@/lib/config";

/**
 * Auto-inscription d'un nouvel employé depuis le lien global de l'entreprise (/c/[slug])
 */
export async function inscriptionEmployeAction(
  slug: string,
  nom: string,
  telephone?: string
): Promise<{ success: boolean; message?: string; employe?: { id: string; nom: string; token: string } }> {
  const nomPropre = nom.trim().replace(/\s+/g, " ").slice(0, 80);
  if (nomPropre.length < 2) {
    return { success: false, message: "Renseignez votre prénom et nom." };
  }

  try {
    const acces = await echangerSlugPortail(slug);
    if (!acces) {
      return { success: false, message: "Entreprise introuvable." };
    }
    const { supabase, companyId } = acces;

    const places = await placesRestantes(supabase, companyId);
    if (places.restantes < 1) {
      return { success: false, message: "Inscription impossible : le nombre maximum de salariés est atteint. Contactez votre RH." };
    }

    const { data, error } = await (supabase.from("employes") as any)
      .insert({
        company_id: companyId,
        nom: nomPropre,
        telephone: telephone?.trim().slice(0, 20) || null,
        token: generateToken(),
        is_active: true,
      })
      .select("id, nom, token")
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, employe: data };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
