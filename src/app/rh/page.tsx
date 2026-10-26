import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl, isApresHeureLimite, isSupabaseConfigured, todayDakar } from "@/lib/config";
import { isDateValide, joursOuvres, lundiDeLaSemaine } from "@/lib/dates";
import { getRhCompanyId } from "@/lib/rh-session";
import { getCommandesDuJour, lienTraiteur } from "@/lib/cloture";
import { RhDashboardClient } from "./rh-dashboard-client";

export const dynamic = "force-dynamic";

/** Heure à partir de laquelle une clôture non confirmée par le traiteur déclenche une alerte */
const HEURE_ALERTE_TRAITEUR = "11:30:00";

interface PageProps {
  searchParams: Promise<{ semaine?: string }>;
}

export default async function RhDashboardPage({ searchParams }: PageProps) {
  const isDemo = !isSupabaseConfigured();
  const appBaseUrl = getAppBaseUrl();
  const todayDate = todayDakar();
  const { semaine } = await searchParams;
  const semaineLundi = lundiDeLaSemaine(isDateValide(semaine) ? semaine : todayDate);
  const jours = joursOuvres(semaineLundi);

  // Données de démonstration (mode sans Supabase)
  const company = {
    id: "demo-company-thies",
    nom: "Pilote Thiès Innovation",
    slug: "pilote-thies",
    traiteur_nom: "Chez Fatou Traiteur Thiès",
    traiteur_telephone: "+221770000000",
    heure_limite_vote: "11:00:00",
    heure_livraison_souhaitee: "12:30:00",
    trial_ends_at: null,
  };

  const initialEmployes = [
    {
      id: "demo-emp-1",
      nom: "Moussa Ndiaye",
      telephone: "+221771112233",
      token: "token-demo-moussa",
      service: "Production",
      is_active: true,
    },
    {
      id: "demo-emp-2",
      nom: "Aminata Sow",
      telephone: "+221772223344",
      token: "token-demo-aminata",
      service: "Administration",
      is_active: true,
    },
    {
      id: "demo-emp-3",
      nom: "Cheikh Diop",
      telephone: "+221773334455",
      token: "token-demo-cheikh",
      service: "Production",
      is_active: true,
    },
    {
      id: "demo-emp-4",
      nom: "Fatou Bintou Fall",
      telephone: "+221774445566",
      token: "token-demo-fatou",
      service: "Commercial",
      is_active: true,
    },
    {
      id: "demo-emp-5",
      nom: "Ousmane Kane",
      telephone: "+221775556677",
      token: "token-demo-ousmane",
      service: "Production",
      is_active: true,
    },
  ];

  const initialPlats = [
    {
      id: "demo-plat-1",
      titre: "Thiéboudienne Rouge Penda Mbaye",
      description: "Riz rouge au poisson avec légumes et beignets de niébé",
      prix_unitaire: 1500,
      is_available: true,
      date: todayDate,
    },
    {
      id: "demo-plat-2",
      titre: "Yassa Poulet au Feu de Bois",
      description: "Poulet mariné citron et oignons caramélisés avec riz blanc",
      prix_unitaire: 1500,
      is_available: true,
      date: todayDate,
    },
    {
      id: "demo-plat-3",
      titre: "Soupou Kandia (Sauce Gombo)",
      description: "Riz blanc parfumé avec sauce gombo et poisson fumé",
      prix_unitaire: 1700,
      is_available: true,
      date: todayDate,
    },
  ];

  const initialCommandes = [
    {
      employe_id: "demo-emp-1",
      employe_nom: "Moussa Ndiaye",
      telephone: "+221771112233",
      statut: "choisi" as const,
      plat_titre: "Thiéboudienne Rouge Penda Mbaye",
      prix: 1500,
      plat_id: "demo-plat-1",
    },
    {
      employe_id: "demo-emp-2",
      employe_nom: "Aminata Sow",
      telephone: "+221772223344",
      statut: "choisi" as const,
      plat_titre: "Yassa Poulet au Feu de Bois",
      prix: 1500,
      plat_id: "demo-plat-2",
    },
    {
      employe_id: "demo-emp-3",
      employe_nom: "Cheikh Diop",
      telephone: "+221773334455",
      statut: "absent" as const,
    },
    // emp-4 et emp-5 sont "en_attente"
  ];

  if (isDemo) {
    return (
      <RhDashboardClient
        company={company}
        initialEmployes={initialEmployes}
        initialPlats={initialPlats}
        platsSemaine={initialPlats}
        semaineLundi={semaineLundi}
        todayDate={todayDate}
        initialCommandes={initialCommandes}
        cloture={null}
        alerteTraiteur={false}
        lienTraiteur={`${appBaseUrl}/resto/token-demo-traiteur`}
        appBaseUrl={appBaseUrl}
        isDemo
      />
    );
  }

  const companyId = await getRhCompanyId();
  if (!companyId) {
    redirect("/rh/login");
  }

  const supabase = await createClient();

  const { data: rawComp } = await supabase
    .from("companies")
    .select(
      "id, nom, slug, traiteur_nom, traiteur_telephone, traiteur_token, heure_limite_vote, heure_livraison_souhaitee, trial_ends_at"
    )
    .eq("id", companyId)
    .maybeSingle();

  const comp: any = rawComp;
  if (!comp) {
    redirect("/rh/login");
  }

  const [{ data: emps }, { data: dishes }, { data: weekDishes }, commandes, { data: rawCloture }] = await Promise.all([
    supabase
      .from("employes")
      .select("id, nom, telephone, service, token, is_active")
      .eq("company_id", comp.id)
      .eq("is_active", true)
      .order("nom"),
    supabase
      .from("menus_du_jour")
      .select("id, date, titre, description, prix_unitaire, is_available")
      .eq("company_id", comp.id)
      .eq("date", todayDate)
      .order("created_at"),
    supabase
      .from("menus_du_jour")
      .select("id, date, titre, description, prix_unitaire, is_available")
      .eq("company_id", comp.id)
      .gte("date", jours[0])
      .lte("date", jours[4])
      .order("created_at"),
    getCommandesDuJour(supabase, comp.id, todayDate),
    supabase
      .from("clotures")
      .select("envoi_statut, envoi_erreur, envoye_at, confirme_at, total_repas")
      .eq("company_id", comp.id)
      .eq("date", todayDate)
      .maybeSingle(),
  ]);

  const cloture: any = rawCloture;
  const alerteTraiteur = Boolean(
    cloture && !cloture.confirme_at && isApresHeureLimite(HEURE_ALERTE_TRAITEUR)
  );

  return (
    <RhDashboardClient
      company={comp}
      initialEmployes={(emps as any[]) || []}
      initialPlats={(dishes as any[]) || []}
      platsSemaine={(weekDishes as any[]) || []}
      semaineLundi={semaineLundi}
      todayDate={todayDate}
      initialCommandes={commandes}
      cloture={cloture || null}
      alerteTraiteur={alerteTraiteur}
      lienTraiteur={lienTraiteur(comp)}
      appBaseUrl={appBaseUrl}
      isDemo={false}
    />
  );
}
