import "server-only";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export { STATUTS_LIBELLES as STATUTS } from "@/lib/libelles";

export interface LigneFacturation {
  date: string;
  nom: string;
  telephone: string;
  service: string;
  /** choisi (facturé), non_confirme (restaurant pas confirmé : non facturé), absent, ne_mange_pas */
  statut: string;
  plat: string;
  restaurant: string;
  restaurantId: string | null;
  montant: number;
}

/** Bornes d'un mois YYYY-MM : premier et dernier jour */
export function periodeMois(mois: string): { debut: string; fin: string } | null {
  if (!/^\d{4}-\d{2}$/.test(mois)) return null;
  const [annee, m] = mois.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  return { debut: `${mois}-01`, fin: new Date(Date.UTC(annee, m, 0)).toISOString().slice(0, 10) };
}

/**
 * Commandes d'une période, prêtes pour la facturation.
 * Règle : un repas n'est facturé que si la commande de son restaurant a été confirmée ce jour-là
 * (par le restaurant ou par le RH après accord au téléphone) ; sinon il passe en « non_confirme » à 0 FCFA.
 */
export async function getLignesFacturation(
  supabase: Supabase,
  companyId: string,
  debut: string,
  fin: string
): Promise<LigneFacturation[]> {
  const [{ data: cmds, error }, { data: confirmees }] = await Promise.all([
    supabase
      .from("commandes")
      .select(
        "date, statut, employes(nom, telephone, service), menus_du_jour(titre, prix_unitaire, restaurant_id, restaurants(nom))"
      )
      .eq("company_id", companyId)
      .gte("date", debut)
      .lte("date", fin)
      .order("date"),
    supabase
      .from("clotures")
      .select("restaurant_id, date")
      .eq("company_id", companyId)
      .gte("date", debut)
      .lte("date", fin)
      .not("confirme_at", "is", null),
  ]);
  if (error) throw new Error(error.message);

  const joursConfirmes = new Set(((confirmees as any[]) || []).map((c) => `${c.restaurant_id}|${c.date}`));

  return ((cmds as any[]) || [])
    .map((c) => {
      const facture = c.statut === "choisi" && joursConfirmes.has(`${c.menus_du_jour?.restaurant_id}|${c.date}`);
      return {
        date: c.date as string,
        nom: (c.employes?.nom as string) || "",
        telephone: (c.employes?.telephone as string) || "",
        service: (c.employes?.service as string) || "Général",
        statut: c.statut === "choisi" && !facture ? "non_confirme" : (c.statut as string),
        plat: (c.menus_du_jour?.titre as string) || "",
        restaurant: (c.menus_du_jour?.restaurants?.nom as string) || "",
        restaurantId: (c.menus_du_jour?.restaurant_id as string) ?? null,
        montant: facture ? c.menus_du_jour?.prix_unitaire ?? 0 : 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom, "fr"));
}

/** Quantités × prix par plat pour un ensemble de repas facturés */
export function regrouperParPlat(lignes: LigneFacturation[]): Array<{ plat: string; prix: number; quantite: number }> {
  const parPlat = new Map<string, { plat: string; prix: number; quantite: number }>();
  for (const l of lignes.filter((x) => x.statut === "choisi")) {
    const cle = `${l.plat}|${l.montant}`;
    const p = parPlat.get(cle) || { plat: l.plat, prix: l.montant, quantite: 0 };
    p.quantite += 1;
    parPlat.set(cle, p);
  }
  return Array.from(parPlat.values()).sort((a, b) => b.quantite - a.quantite || a.plat.localeCompare(b.plat, "fr"));
}
