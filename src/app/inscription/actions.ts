"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientRh } from "@/lib/supabase/server";
import { createRhSession, hashRhCode } from "@/lib/rh-session";
import { DUREE_ESSAI_JOURS, isPlanId } from "@/lib/abonnement";

export interface InscriptionState {
  error?: string;
  champs?: Record<string, string>;
}

/** Identifiant de connexion lisible dérivé du nom : « Bâti Plus SARL » → « bati-plus-sarl » */
function slugifier(nom: string): string {
  return (
    nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "entreprise"
  );
}

/**
 * Inscription en libre-service : crée l'entreprise en essai gratuit de 14 jours,
 * ouvre la session RH et redirige vers l'Espace RH.
 */
export async function inscriptionEntrepriseAction(
  _prev: InscriptionState | undefined,
  formData: FormData
): Promise<InscriptionState> {
  const champs = {
    nom: String(formData.get("nom") || "").trim(),
    responsable: String(formData.get("responsable") || "").trim(),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    telephone: String(formData.get("telephone") || "").trim(),
    plan: String(formData.get("plan") || "pro"),
  };
  const code = String(formData.get("code") || "");
  const confirmation = String(formData.get("confirmation") || "");

  // Champ piège invisible : rempli uniquement par les robots
  if (String(formData.get("site_web") || "")) return { error: "Inscription refusée.", champs };

  if (champs.nom.length < 2) return { error: "Indiquez le nom de l'entreprise.", champs };
  if (champs.responsable.length < 2) return { error: "Indiquez le nom du responsable.", champs };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(champs.email)) return { error: "Adresse e-mail invalide.", champs };
  if (champs.telephone.replace(/\D/g, "").length < 9) return { error: "Numéro de téléphone invalide.", champs };
  if (!isPlanId(champs.plan)) return { error: "Choisissez une offre.", champs };
  if (code.trim().length < 8) return { error: "Le code d'accès doit contenir au moins 8 caractères.", champs };
  if (code !== confirmation) return { error: "Les deux codes d'accès ne correspondent pas.", champs };

  const supabase = createAdminClient();

  const { data: dejaInscrite } = await supabase
    .from("companies")
    .select("id")
    .eq("email_contact", champs.email)
    .limit(1);
  if (dejaInscrite && dejaInscrite.length > 0) {
    return { error: "Une entreprise est déjà inscrite avec cet e-mail : connectez-vous à l'Espace RH.", champs };
  }

  // Identifiant unique : bati-plus, puis bati-plus-2, bati-plus-3...
  const base = slugifier(champs.nom);
  const { data: existants } = await supabase.from("companies").select("slug").like("slug", `${base}%`);
  const pris = new Set(((existants as any[]) || []).map((c) => c.slug));
  let slug = base;
  for (let i = 2; pris.has(slug); i++) slug = `${base}-${i}`;

  const { data: company, error } = await (supabase.from("companies") as any)
    .insert({
      nom: champs.nom,
      slug,
      responsable_nom: champs.responsable,
      email_contact: champs.email,
      telephone_contact: champs.telephone,
      plan: champs.plan,
      statut_abonnement: "trial",
      trial_ends_at: new Date(Date.now() + DUREE_ESSAI_JOURS * 86400000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !company) {
    // Pas de message Postgres au visiteur (noms de contraintes, colonnes)
    console.error("[inscription] création de l'entreprise :", error?.code);
    return { error: "Inscription impossible pour le moment, réessayez dans quelques minutes.", champs };
  }

  // v1.10 : le code d'accès RH est stocké hors de companies (table acces_rh, illisible par les rôles applicatifs)
  const { error: erreurAcces } = await (supabase.from("acces_rh") as any).insert({
    company_id: company.id,
    code_hash: hashRhCode(code),
  });
  if (erreurAcces) {
    // Pas d'entreprise sans code d'accès : on annule l'inscription
    console.error("[inscription] code d'accès :", erreurAcces.code);
    const { error: erreurAnnulation } = await supabase.from("companies").delete().eq("id", company.id);
    if (erreurAnnulation) {
      // Entreprise orpheline (sans code) : à supprimer depuis la console SuperAdmin
      console.error("[inscription] annulation impossible, entreprise orpheline :", company.id, erreurAnnulation.code);
    }
    return { error: "Inscription impossible pour le moment, réessayez dans quelques minutes.", champs };
  }

  // Invitation d'un restaurant (code partenaire dans le lien) : on le relie avec le JWT RH de la nouvelle entreprise
  const partenaire = String(formData.get("partenaire") || "").trim().toUpperCase();
  if (/^[A-Z0-9]{6,16}$/.test(partenaire)) {
    await (createClientRh(company.id) as any).rpc("rattacher_compte_restaurant", {
      p_code: partenaire,
      p_heure_livraison: "12:30",
    });
  }

  await createRhSession(company.id);
  redirect("/rh?bienvenue=1");
}
