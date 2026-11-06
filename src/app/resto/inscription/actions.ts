"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashRhCode } from "@/lib/rh-session";
import { createRestoSession } from "@/lib/resto-session";
import { normaliserTelephone } from "@/lib/telephone";

export interface InscriptionRestoState {
  error?: string;
  champs?: Record<string, string>;
}

/**
 * Inscription d'un restaurant en libre-service (client service_role : la fiche n'appartient encore
 * à aucune entreprise). Si l'inscription part d'un lien /resto/[token] déjà reçu d'une entreprise,
 * ce partenariat est relié au nouveau compte.
 */
export async function inscriptionRestaurantAction(
  _prev: InscriptionRestoState | undefined,
  formData: FormData
): Promise<InscriptionRestoState> {
  const champs = {
    nom: String(formData.get("nom") || "").trim().slice(0, 120),
    telephone: String(formData.get("telephone") || "").trim(),
    ville: String(formData.get("ville") || "").trim().slice(0, 60),
    lien: String(formData.get("lien") || "").trim(),
  };
  const code = String(formData.get("code") || "");
  const confirmation = String(formData.get("confirmation") || "");

  // Champ piège invisible : rempli uniquement par les robots
  if (String(formData.get("site_web") || "")) return { error: "Inscription refusée.", champs };

  const telephone = normaliserTelephone(champs.telephone);
  if (champs.nom.length < 2) return { error: "Indiquez le nom du restaurant.", champs };
  if (!telephone || telephone.replace(/\D/g, "").length < 9) return { error: "Numéro WhatsApp invalide.", champs };
  if (code.trim().length < 6) return { error: "Le code d'accès doit contenir au moins 6 caractères.", champs };
  if (code !== confirmation) return { error: "Les deux codes d'accès ne correspondent pas.", champs };

  const supabase = createAdminClient();

  const { data: existant } = await supabase
    .from("comptes_restaurant")
    .select("id")
    .eq("telephone_whatsapp", telephone)
    .maybeSingle();
  if (existant) {
    return { error: "Un restaurant est déjà inscrit avec ce numéro : connectez-vous.", champs };
  }

  const { data: compte, error } = await (supabase.from("comptes_restaurant") as any)
    .insert({ nom: champs.nom, telephone_whatsapp: telephone, ville: champs.ville || null, code_hash: hashRhCode(code) })
    .select("id")
    .single();
  if (error || !compte) {
    return { error: `Inscription impossible : ${error?.message || "erreur inconnue"}`, champs };
  }

  // Reprise du lien déjà utilisé avec une entreprise : il devient un partenariat du compte
  if (champs.lien) {
    await (supabase.from("restaurants") as any)
      .update({ compte_id: compte.id, nom: champs.nom, telephone_whatsapp: telephone })
      .eq("token", champs.lien)
      .is("compte_id", null);
  }

  await createRestoSession(compte.id);
  redirect("/resto?bienvenue=1");
}
