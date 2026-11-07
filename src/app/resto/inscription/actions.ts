"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashRhCode } from "@/lib/rh-session";
import { createRestoSession } from "@/lib/resto-session";
import { normaliserTelephone } from "@/lib/telephone";
import { limiterInscription } from "@/lib/limite-inscription";

export interface InscriptionRestoState {
  error?: string;
  champs?: Record<string, string>;
}

/**
 * Inscription d'un restaurant en libre-service (client service_role : la fiche n'appartient encore
 * à aucune entreprise). Il donne ensuite son code partenaire à chaque entreprise qu'il livre.
 */
export async function inscriptionRestaurantAction(
  _prev: InscriptionRestoState | undefined,
  formData: FormData
): Promise<InscriptionRestoState> {
  const champs = {
    nom: String(formData.get("nom") || "").trim().slice(0, 120),
    telephone: String(formData.get("telephone") || "").trim(),
    ville: String(formData.get("ville") || "").trim().slice(0, 60),
  };
  const code = String(formData.get("code") || "");
  const confirmation = String(formData.get("confirmation") || "");

  // Champ piège invisible : rempli uniquement par les robots
  if (String(formData.get("site_web") || "")) return { error: "Inscription refusée.", champs };

  const telephone = normaliserTelephone(champs.telephone);
  if (champs.nom.length < 2) return { error: "Indiquez le nom du restaurant.", champs };
  if (!telephone || telephone.replace(/\D/g, "").length < 9) return { error: "Numéro WhatsApp invalide.", champs };
  if (code.trim().length < 8) return { error: "Le code d'accès doit contenir au moins 8 caractères.", champs };
  if (code !== confirmation) return { error: "Les deux codes d'accès ne correspondent pas.", champs };

  // v1.10 (T16) : 5 tentatives en 15 minutes par IP, avant toute lecture (limite aussi l'énumération des numéros)
  const supabase = createAdminClient();
  const refus = await limiterInscription(supabase, "restaurant");
  if (refus) return { error: refus, champs };

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
    // Pas de message Postgres au visiteur (noms de contraintes, colonnes)
    console.error("[resto] inscription :", error?.code);
    // 23505 : numéro inscrit entre la vérification et l'insertion
    if (error?.code === "23505") {
      return { error: "Un restaurant est déjà inscrit avec ce numéro : connectez-vous.", champs };
    }
    return { error: "Inscription impossible pour le moment, réessayez dans quelques minutes.", champs };
  }

  await createRestoSession(compte.id);
  redirect("/resto?bienvenue=1");
}
