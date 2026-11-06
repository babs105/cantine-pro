import { redirect } from "next/navigation";
import { createClientAvecClaims, createClientCompteSession } from "@/lib/supabase/server";
import { todayDakar } from "@/lib/config";
import { getCommandesDuJour } from "@/lib/cloture";
import { periodeMois } from "@/lib/facturation";
import { buildRecap } from "@/lib/recap";
import { ajouterJours, isApresHeureLimite, isDateValide, lundiDeLaSemaine, normaliserJoursTravail } from "@/lib/dates";
import type { RecapLigne } from "@/types/database";
import type { PlatCarte, PlatMenuResto } from "./actions";
import { EspaceRestaurantClient, type EntrepriseResto } from "./espace-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ mois?: string; semaine?: string; bienvenue?: string; onglet?: string }>;
}

/** Dashboard du compte restaurant : commandes du jour, carte, historique et profil, pour toutes ses entreprises */
export default async function EspaceRestaurantPage({ searchParams }: PageProps) {
  const session = await createClientCompteSession();
  if (!session) redirect("/resto/login");
  const { supabase, compteId } = session;

  const today = todayDakar();
  const { mois: moisParam, semaine, bienvenue, onglet } = await searchParams;
  const semaineLundi = lundiDeLaSemaine(isDateValide(semaine) ? semaine : today);
  const mois = periodeMois(moisParam || "") ? moisParam! : today.slice(0, 7);
  const periode = periodeMois(mois)!;

  const [{ data: rawCompte }, { data: rawPartenariats }] = await Promise.all([
    supabase
      .from("comptes_restaurant")
      .select("id, nom, telephone_whatsapp, ville, code_partenaire")
      .eq("id", compteId)
      .maybeSingle(),
    supabase
      .from("restaurants")
      .select("id, company_id, heure_livraison")
      .eq("compte_id", compteId)
      .eq("is_active", true)
      .order("created_at"),
  ]);

  const compte: any = rawCompte;
  if (!compte) redirect("/resto/login");

  // Chaque entreprise est lue avec un JWT « restaurant » limité à ce partenariat (politiques RLS existantes)
  const entreprises: EntrepriseResto[] = await Promise.all(
    ((rawPartenariats as any[]) || []).map(async (p): Promise<EntrepriseResto> => {
      const client = createClientAvecClaims({ role_app: "restaurant", company_id: p.company_id, restaurant_id: p.id });
      const [{ data: comp }, { data: cloture }, { data: carte }, { data: historique }, { data: menus }] = await Promise.all([
        client.from("companies").select("nom, heure_ouverture_vote, heure_limite_vote, jours_travail").eq("id", p.company_id).maybeSingle(),
        client
          .from("clotures")
          .select("recap, confirme_at, confirme_par")
          .eq("restaurant_id", p.id)
          .eq("date", today)
          .maybeSingle(),
        client
          .from("plats_restaurant")
          .select("id, titre, description, prix_unitaire, is_active")
          .eq("restaurant_id", p.id)
          .order("created_at"),
        client
          .from("clotures")
          .select("date, recap, total_repas, confirme_at")
          .eq("restaurant_id", p.id)
          .gte("date", periode.debut)
          .lte("date", periode.fin)
          .order("date", { ascending: false }),
        // Menus de la semaine affichée : uniquement les plats de ce restaurant
        client
          .from("menus_du_jour")
          .select("id, date, titre, description, prix_unitaire, is_available, ajoute_par")
          .eq("company_id", p.company_id)
          .eq("restaurant_id", p.id)
          .gte("date", semaineLundi)
          .lte("date", ajouterJours(semaineLundi, 6))
          .order("created_at"),
      ]);

      const cl: any = cloture;
      let recap: RecapLigne[];
      if (cl) {
        recap = cl.recap || [];
      } else {
        const commandes = await getCommandesDuJour(client, p.company_id, today);
        recap = buildRecap(commandes.filter((c) => c.restaurant_id === p.id));
      }

      return {
        restaurantId: p.id,
        companyNom: (comp as any)?.nom || "Entreprise",
        heureOuverture: (comp as any)?.heure_ouverture_vote || "08:00:00",
        heureLimite: (comp as any)?.heure_limite_vote || "11:10:00",
        heureLivraison: p.heure_livraison,
        aujourdhui: {
          recap,
          isCloture: !!cl,
          confirmeAt: cl?.confirme_at ?? null,
          confirmeParRh: cl?.confirme_par === "rh",
        },
        carte: ((carte as PlatCarte[] | null) || []),
        joursTravail: normaliserJoursTravail((comp as any)?.jours_travail),
        // Le menu du jour reste modifiable avant l'heure limite et tant que la journée n'est pas clôturée
        aujourdhuiModifiable: !cl && !isApresHeureLimite((comp as any)?.heure_limite_vote || "11:10:00"),
        menusSemaine: ((menus as PlatMenuResto[] | null) || []),
        historique: ((historique as any[]) || []).map((h) => ({
          date: h.date,
          totalRepas: h.total_repas,
          montant: ((h.recap as RecapLigne[]) || []).reduce((acc, l) => acc + l.quantite * l.prix_unitaire, 0),
          confirme: !!h.confirme_at,
        })),
      };
    })
  );

  return (
    <EspaceRestaurantClient
      compte={compte}
      entreprises={entreprises}
      mois={mois}
      semaineLundi={semaineLundi}
      ongletInitial={onglet}
      todayDate={today}
      bienvenue={bienvenue === "1"}
    />
  );
}
