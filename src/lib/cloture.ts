import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl } from "@/lib/config";
import { buildMessageTraiteur, buildRecap, recapUneLigne, totalRepas } from "@/lib/recap";
import { envoyerWhatsApp } from "@/lib/whatsapp";
import type { Database, RecapLigne } from "@/types/database";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
type Cloture = Database["public"]["Tables"]["clotures"]["Row"];

export interface CommandeDuJour {
  employe_id: string;
  employe_nom: string;
  telephone: string | null;
  statut: "choisi" | "absent" | "ne_mange_pas";
  plat_id?: string | null;
  plat_titre?: string;
  prix?: number;
  restaurant_id?: string | null;
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
      "employe_id, statut, plat_id, modifie_par_rh, updated_at, employes(nom, telephone), menus_du_jour(titre, prix_unitaire, restaurant_id)"
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
    restaurant_id: c.menus_du_jour?.restaurant_id ?? null,
    modifie_par_rh: c.modifie_par_rh,
    updated_at: c.updated_at,
  }));
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

export function lienRestaurant(restaurant: Pick<Restaurant, "token">): string {
  return `${getAppBaseUrl()}/resto/${restaurant.token}`;
}

/** Restaurants qui proposent au moins un plat au menu du jour : ce sont eux qui reçoivent un récapitulatif */
async function getRestaurantsDuJour(supabase: Supabase, companyId: string, date: string): Promise<Restaurant[]> {
  const { data: plats } = await supabase
    .from("menus_du_jour")
    .select("restaurant_id")
    .eq("company_id", companyId)
    .eq("date", date)
    .not("restaurant_id", "is", null);

  const ids = Array.from(new Set((plats || []).map((p: any) => p.restaurant_id as string)));
  if (ids.length === 0) return [];

  const { data } = await supabase.from("restaurants").select("*").in("id", ids).order("nom");
  return (data || []) as Restaurant[];
}

/**
 * Clôture de 11h10 d'une entreprise : pour chaque restaurant du menu du jour, fige le récapitulatif
 * de ses plats dans `clotures`. Avec `envoyer`, le récap part aussi automatiquement (WhatsApp / webhook) ;
 * sinon le RH l'envoie lui-même depuis le cockpit. Idempotent : un récap déjà envoyé n'est pas modifié.
 */
export async function cloturerEntreprise(
  supabase: Supabase,
  company: Company,
  date: string,
  options: { envoyer?: boolean } = {}
): Promise<Array<Cloture & { restaurant_nom: string }>> {
  const envoyer = options.envoyer ?? true;
  const restaurants = await getRestaurantsDuJour(supabase, company.id, date);
  const commandes = await getCommandesDuJour(supabase, company.id, date);

  const { data: existantes } = await supabase
    .from("clotures")
    .select("*")
    .eq("company_id", company.id)
    .eq("date", date);

  const resultats: Array<Cloture & { restaurant_nom: string }> = [];

  for (const restaurant of restaurants) {
    const existante = ((existantes || []) as Cloture[]).find((c) => c.restaurant_id === restaurant.id);
    if (existante && existante.envoi_statut === "envoye") {
      resultats.push({ ...existante, restaurant_nom: restaurant.nom });
      continue;
    }

    const recap: RecapLigne[] = buildRecap(commandes.filter((c) => c.restaurant_id === restaurant.id));
    const lien = lienRestaurant(restaurant);
    const message = buildMessageTraiteur({
      companyNom: company.nom,
      dateStr: formatDateLongue(date),
      recap,
      heureLivraison: restaurant.heure_livraison,
      lienConfirmation: lien,
    });

    const resultat =
      envoyer && restaurant.is_active && restaurant.telephone_whatsapp
        ? await envoyerWhatsApp({
            to: restaurant.telephone_whatsapp,
            message,
            templateParams: [company.nom, recapUneLigne(recap), lien],
            meta: {
              company: company.nom,
              restaurant: restaurant.nom,
              date,
              total_repas: totalRepas(recap),
              recap,
              lien,
            },
          })
        : ({ statut: "manuel" } as const);

    const { data, error } = await (supabase.from("clotures") as any)
      .upsert(
        {
          company_id: company.id,
          restaurant_id: restaurant.id,
          date,
          recap,
          total_repas: totalRepas(recap),
          message,
          envoi_statut: resultat.statut,
          envoi_erreur: resultat.statut === "echec" ? resultat.erreur : null,
          envoye_at: resultat.statut === "envoye" ? new Date().toISOString() : null,
        },
        { onConflict: "restaurant_id,date" }
      )
      .select()
      .single();

    if (error) throw new Error(`${restaurant.nom} : ${error.message}`);
    resultats.push({ ...(data as Cloture), restaurant_nom: restaurant.nom });
  }

  return resultats;
}

/**
 * Après une modification manuelle du RH : recalcule les récapitulatifs des clôtures déjà faites
 * (chaque page restaurant affiche alors les bonnes quantités). Retourne vrai si une clôture existait.
 */
export async function rafraichirRecapCloture(
  supabase: Supabase,
  companyId: string,
  date: string
): Promise<boolean> {
  const { data: clotures } = await supabase
    .from("clotures")
    .select("id, restaurant_id, recap")
    .eq("company_id", companyId)
    .eq("date", date);
  if (!clotures || clotures.length === 0) return false;

  const commandes = await getCommandesDuJour(supabase, companyId, date);
  for (const cloture of clotures as any[]) {
    const recap = buildRecap(commandes.filter((c) => c.restaurant_id === cloture.restaurant_id));
    // Le restaurant ne doit reconfirmer que si ses propres quantités ont changé
    const change = JSON.stringify(recap) !== JSON.stringify(cloture.recap);
    await (supabase.from("clotures") as any)
      .update({ recap, total_repas: totalRepas(recap), ...(change ? { confirme_at: null, confirme_par: null } : {}) })
      .eq("id", cloture.id);
  }
  return true;
}
