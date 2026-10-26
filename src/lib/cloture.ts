import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl } from "@/lib/config";
import { buildMessageTraiteur, buildRecap, recapUneLigne, totalRepas } from "@/lib/recap";
import { envoyerWhatsApp } from "@/lib/whatsapp";
import type { Database, RecapLigne } from "@/types/database";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Cloture = Database["public"]["Tables"]["clotures"]["Row"];

export interface CommandeDuJour {
  employe_id: string;
  employe_nom: string;
  telephone: string | null;
  statut: "choisi" | "absent" | "ne_mange_pas";
  plat_id?: string | null;
  plat_titre?: string;
  prix?: number;
  modifie_par_rh?: boolean;
  updated_at?: string;
}

export async function getCommandesDuJour(
  supabase: Supabase,
  companyId: string,
  date: string
): Promise<CommandeDuJour[]> {
  const { data } = await supabase
    .from("commandes")
    .select(
      "employe_id, statut, plat_id, modifie_par_rh, updated_at, employes(nom, telephone), menus_du_jour(titre, prix_unitaire)"
    )
    .eq("company_id", companyId)
    .eq("date", date);

  return (data || []).map((c: any) => ({
    employe_id: c.employe_id,
    employe_nom: c.employes?.nom || "Employé",
    telephone: c.employes?.telephone || null,
    statut: c.statut,
    plat_id: c.plat_id,
    plat_titre: c.menus_du_jour?.titre,
    prix: c.menus_du_jour?.prix_unitaire,
    modifie_par_rh: c.modifie_par_rh,
    updated_at: c.updated_at,
  }));
}

/**
 * Après une modification manuelle du RH : recalcule le récapitulatif d'une clôture déjà faite
 * (la page traiteur affiche alors les bonnes quantités). Retourne vrai si une clôture existait.
 */
export async function rafraichirRecapCloture(
  supabase: Supabase,
  companyId: string,
  date: string
): Promise<boolean> {
  const { data: cloture } = await supabase
    .from("clotures")
    .select("id")
    .eq("company_id", companyId)
    .eq("date", date)
    .maybeSingle();
  if (!cloture) return false;

  const recap = buildRecap(await getCommandesDuJour(supabase, companyId, date));
  await (supabase.from("clotures") as any)
    .update({ recap, total_repas: totalRepas(recap), confirme_at: null })
    .eq("id", (cloture as any).id);
  return true;
}

export function formatDateLongue(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function lienTraiteur(company: Pick<Company, "traiteur_token">): string {
  return `${getAppBaseUrl()}/resto/${company.traiteur_token}`;
}

/**
 * Clôture 11h05 d'une entreprise : fige le récapitulatif du jour dans `clotures`
 * et l'envoie au traiteur. Idempotent : un récap déjà envoyé n'est pas renvoyé.
 */
export async function cloturerEntreprise(
  supabase: Supabase,
  company: Company,
  date: string
): Promise<Cloture> {
  const { data: existante } = await supabase
    .from("clotures")
    .select("*")
    .eq("company_id", company.id)
    .eq("date", date)
    .maybeSingle();

  if (existante && (existante as Cloture).envoi_statut === "envoye") {
    return existante as Cloture;
  }

  const recap: RecapLigne[] = buildRecap(await getCommandesDuJour(supabase, company.id, date));
  const lien = lienTraiteur(company);
  const message = buildMessageTraiteur({
    companyNom: company.nom,
    dateStr: formatDateLongue(date),
    recap,
    heureLivraison: company.heure_livraison_souhaitee,
    lienConfirmation: lien,
  });

  const resultat = company.traiteur_telephone
    ? await envoyerWhatsApp({
        to: company.traiteur_telephone,
        message,
        templateParams: [company.nom, recapUneLigne(recap), lien],
        meta: { company: company.nom, date, total_repas: totalRepas(recap), recap, lien },
      })
    : ({ statut: "manuel" } as const);

  const { data, error } = await (supabase.from("clotures") as any)
    .upsert(
      {
        company_id: company.id,
        date,
        recap,
        total_repas: totalRepas(recap),
        message,
        envoi_statut: resultat.statut,
        envoi_erreur: resultat.statut === "echec" ? resultat.erreur : null,
        envoye_at: resultat.statut === "envoye" ? new Date().toISOString() : null,
      },
      { onConflict: "company_id,date" }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Cloture;
}
