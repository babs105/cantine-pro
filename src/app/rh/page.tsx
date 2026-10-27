import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppBaseUrl, isApresHeureLimite, isSupabaseConfigured, todayDakar } from "@/lib/config";
import { isDateValide, joursOuvres, lundiDeLaSemaine } from "@/lib/dates";
import { getRhCompanyId } from "@/lib/rh-session";
import { getCommandesDuJour, lienRestaurant } from "@/lib/cloture";
import { etatAbonnement } from "@/lib/abonnement";
import { RhDashboardClient } from "./rh-dashboard-client";

export const dynamic = "force-dynamic";

/** Heure à partir de laquelle une clôture non confirmée par un restaurant déclenche une alerte */
const HEURE_ALERTE_TRAITEUR = "11:30:00";

interface PageProps {
  searchParams: Promise<{ semaine?: string; bienvenue?: string }>;
}

export default async function RhDashboardPage({ searchParams }: PageProps) {
  const isDemo = !isSupabaseConfigured();
  const appBaseUrl = getAppBaseUrl();
  const todayDate = todayDakar();
  const { semaine, bienvenue } = await searchParams;
  const numeroWave = process.env.WAVE_NUMERO_PAIEMENT || null;
  const semaineLundi = lundiDeLaSemaine(isDateValide(semaine) ? semaine : todayDate);
  const jours = joursOuvres(semaineLundi);

  // Données de démonstration (mode sans Supabase)
  const company = {
    id: "demo-company-thies",
    nom: "Pilote Thiès Innovation",
    slug: "pilote-thies",
    heure_ouverture_vote: "08:00:00",
    heure_limite_vote: "11:10:00",
    trial_ends_at: null,
    responsable_nom: "Awa Fall",
    email_contact: "rh@pilote-thies.sn",
    telephone_contact: "+221770000099",
    plan: "pro" as const,
    statut_abonnement: "active" as const,
    abonnement_fin: null,
  };

  const demoRestaurants = [
    {
      id: "demo-resto-1",
      nom: "Chez Fatou Traiteur Thiès",
      telephone_whatsapp: "+221770000000",
      heure_livraison: "12:30:00",
      token: "token-demo-traiteur",
      is_active: true,
      lien: `${appBaseUrl}/resto/token-demo-traiteur`,
    },
    {
      id: "demo-resto-2",
      nom: "Restaurant Le Teranga",
      telephone_whatsapp: "+221770000001",
      heure_livraison: "12:45:00",
      token: "token-demo-teranga",
      is_active: true,
      lien: `${appBaseUrl}/resto/token-demo-teranga`,
    },
  ];

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
      restaurant_id: "demo-resto-1",
      titre: "Thiéboudienne Rouge Penda Mbaye",
      description: "Riz rouge au poisson avec légumes et beignets de niébé",
      prix_unitaire: 1500,
      is_available: true,
      date: todayDate,
    },
    {
      id: "demo-plat-2",
      restaurant_id: "demo-resto-1",
      titre: "Yassa Poulet au Feu de Bois",
      description: "Poulet mariné citron et oignons caramélisés avec riz blanc",
      prix_unitaire: 1500,
      is_available: true,
      date: todayDate,
    },
    {
      id: "demo-plat-3",
      restaurant_id: "demo-resto-2",
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
      restaurant_id: "demo-resto-1",
    },
    {
      employe_id: "demo-emp-2",
      employe_nom: "Aminata Sow",
      telephone: "+221772223344",
      statut: "choisi" as const,
      plat_titre: "Yassa Poulet au Feu de Bois",
      prix: 1500,
      plat_id: "demo-plat-2",
      restaurant_id: "demo-resto-1",
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
        restaurants={demoRestaurants}
        clotures={[]}
        restaurantsEnRetard={[]}
        votesClos={isApresHeureLimite(company.heure_limite_vote)}
        abonnement={etatAbonnement(company, todayDate)}
        numeroWave={numeroWave}
        bienvenue={false}
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

  const { data: rawComp, error: compError } = await supabase
    .from("companies")
    .select(
      "id, nom, slug, heure_ouverture_vote, heure_limite_vote, trial_ends_at, responsable_nom, email_contact, telephone_contact, plan, statut_abonnement, abonnement_fin"
    )
    .eq("id", companyId)
    .maybeSingle();

  // Erreur de lecture (ex : base pas à jour) : on l'affiche au lieu de renvoyer en boucle vers la connexion
  if (compError) {
    return <ErreurBase message={compError.message} />;
  }

  const comp: any = rawComp;
  if (!comp) {
    redirect("/rh/login");
  }

  const [{ data: emps }, { data: dishes }, { data: weekDishes }, commandes, { data: rawClotures }, { data: restos }] =
    await Promise.all([
    supabase
      .from("employes")
      .select("id, nom, telephone, service, token, is_active")
      .eq("company_id", comp.id)
      .eq("is_active", true)
      .order("nom"),
    supabase
      .from("menus_du_jour")
      .select("id, date, titre, description, prix_unitaire, is_available, restaurant_id")
      .eq("company_id", comp.id)
      .eq("date", todayDate)
      .order("created_at"),
    supabase
      .from("menus_du_jour")
      .select("id, date, titre, description, prix_unitaire, is_available, restaurant_id")
      .eq("company_id", comp.id)
      .gte("date", jours[0])
      .lte("date", jours[4])
      .order("created_at"),
    getCommandesDuJour(supabase, comp.id, todayDate),
    supabase
      .from("clotures")
      .select("restaurant_id, envoi_statut, envoi_erreur, envoye_at, confirme_at, confirme_par, total_repas")
      .eq("company_id", comp.id)
      .eq("date", todayDate),
    supabase
      .from("restaurants")
      .select("id, nom, telephone_whatsapp, heure_livraison, token, is_active")
      .eq("company_id", comp.id)
      .order("created_at"),
  ]);

  const clotures = ((rawClotures as any[]) || []);
  const restaurants = ((restos as any[]) || []).map((r) => ({ ...r, lien: lienRestaurant(r) }));
  // Restaurants à qui le récap a été envoyé et qui n'ont toujours pas confirmé après 11h30
  const restaurantsEnRetard = isApresHeureLimite(HEURE_ALERTE_TRAITEUR)
    ? clotures
        .filter((c) => c.envoi_statut === "envoye" && !c.confirme_at && c.total_repas > 0)
        .map((c) => c.restaurant_id as string)
    : [];

  return (
    <RhDashboardClient
      company={comp}
      initialEmployes={(emps as any[]) || []}
      initialPlats={(dishes as any[]) || []}
      platsSemaine={(weekDishes as any[]) || []}
      semaineLundi={semaineLundi}
      todayDate={todayDate}
      initialCommandes={commandes}
      restaurants={restaurants}
      clotures={clotures}
      restaurantsEnRetard={restaurantsEnRetard}
      votesClos={isApresHeureLimite(comp.heure_limite_vote)}
      abonnement={etatAbonnement(comp, todayDate)}
      numeroWave={numeroWave}
      bienvenue={bienvenue === "1"}
      appBaseUrl={appBaseUrl}
      isDemo={false}
    />
  );
}

function ErreurBase({ message }: { message: string }) {
  const migrationManquante = /does not exist|schema cache|column/i.test(message);
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 max-w-md mx-auto flex flex-col justify-center">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-red-200 space-y-3">
        <h1 className="text-lg font-extrabold text-red-700">Base de données à mettre à jour</h1>
        {migrationManquante ? (
          <p className="text-sm text-neutral-700">
            La base Supabase n&apos;a pas encore la dernière structure. Exécutez le fichier{" "}
            <code className="bg-neutral-100 px-1 rounded">supabase/schema.sql</code> dans l&apos;éditeur SQL de
            Supabase, puis rechargez cette page.
          </p>
        ) : (
          <p className="text-sm text-neutral-700">Impossible de charger les données de l&apos;entreprise.</p>
        )}
        <p className="text-[11px] text-neutral-400 font-mono break-words">{message}</p>
      </div>
    </div>
  );
}
