"use server";

import { createClient } from "@/lib/supabase/server";
import { generateToken, isSupabaseConfigured } from "@/lib/config";

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

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      employe: { id: "mock-" + Date.now(), nom: nomPropre, token: "token-demo-moussa" },
    };
  }

  try {
    const supabase = await createClient();
    const { data: comp } = await supabase
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!comp) {
      return { success: false, message: "Entreprise introuvable." };
    }

    const { data, error } = await (supabase.from("employes") as any)
      .insert({
        company_id: (comp as any).id,
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
