import { redirect } from "next/navigation";
import { createClientRh } from "@/lib/supabase/server";
import { getAppBaseUrl, isApresHeureLimite, todayDakar } from "@/lib/config";
import { ajouterJours, isDateValide, lundiDeLaSemaine } from "@/lib/dates";
import { getRhCompanyId } from "@/lib/rh-session";
import { getCommandesDuJour } from "@/lib/cloture";
import { etatAbonnement } from "@/lib/abonnement";
import { RhDashboardClient } from "./rh-dashboard-client";

export const dynamic = "force-dynamic";

/** Heure à partir de laquelle une clôture non confirmée par un restaurant déclenche une alerte */
const HEURE_ALERTE_TRAITEUR = "11:30:00";

interface PageProps {
  searchParams: Promise<{ semaine?: string; bienvenue?: string }>;
}

export default async function RhDashboardPage({ searchParams }: PageProps) {
  const appBaseUrl = getAppBaseUrl();
  const todayDate = todayDakar();
  const { semaine, bienvenue } = await searchParams;
  const numeroWave = process.env.WAVE_NUMERO_PAIEMENT || null;
  const semaineLundi = lundiDeLaSemaine(isDateValide(semaine) ? semaine : todayDate);

  const companyId = await getRhCompanyId();
  if (!companyId) {
    redirect("/rh/login");
  }

  const supabase = createClientRh(companyId);

  const { data: rawComp, error: compError } = await supabase
    .from("companies")
    .select(
      "id, nom, slug, heure_ouverture_vote, heure_limite_vote, trial_ends_at, responsable_nom, email_contact, telephone_contact, plan, statut_abonnement, abonnement_fin, jours_travail"
    )
    .eq("id", companyId)
    .maybeSingle();

  // Erreur de lecture (ex : base pas à jour) : page d'explication au lieu de renvoyer en boucle vers la
  // connexion. v1.10 (T17) : le message Postgres reste dans les journaux, le détail est dans /api/diagnostic
  if (compError) {
    console.error("[rh/page] lecture de l'entreprise :", compError.code ?? "erreur");
    // 42703 / 42P01 : colonne ou table absente ; PGRST204 / PGRST202 : schéma pas encore relancé
    const migrationManquante = ["42703", "42P01", "PGRST204", "PGRST202"].includes(compError.code ?? "");
    return <ErreurBase migrationManquante={migrationManquante} />;
  }

  const comp: any = rawComp;
  if (!comp) {
    redirect("/rh/login");
  }

  const [
    { data: emps },
    { data: dishes },
    { data: weekDishes },
    commandes,
    { data: rawClotures },
    { data: restos },
    { data: rawCartes },
  ] =
    await Promise.all([
    supabase
      .from("employes")
      .select("id, nom, telephone, service, token, is_active")
      .eq("company_id", comp.id)
      .eq("is_active", true)
      .order("nom"),
    supabase
      .from("menus_du_jour")
      .select("id, date, titre, description, prix_unitaire, is_available, restaurant_id, ajoute_par")
      .eq("company_id", comp.id)
      .eq("date", todayDate)
      .order("created_at"),
    supabase
      .from("menus_du_jour")
      .select("id, date, titre, description, prix_unitaire, is_available, restaurant_id, ajoute_par")
      .eq("company_id", comp.id)
      .gte("date", semaineLundi)
      .lte("date", ajouterJours(semaineLundi, 6))
      .order("created_at"),
    getCommandesDuJour(supabase, comp.id, todayDate),
    supabase
      .from("clotures")
      .select("restaurant_id, envoi_statut, envoi_erreur, envoye_at, confirme_at, confirme_par, total_repas")
      .eq("company_id", comp.id)
      .eq("date", todayDate),
    supabase
      .from("restaurants")
      .select("id, nom, telephone_whatsapp, heure_livraison, is_active, compte_id")
      .eq("company_id", comp.id)
      .order("created_at"),
    // Cartes saisies par les restaurants depuis leur espace : le RH y pioche les menus des restaurants sans compte
    supabase
      .from("plats_restaurant")
      .select("id, restaurant_id, titre, description, prix_unitaire")
      .eq("company_id", comp.id)
      .eq("is_active", true)
      .order("created_at"),
  ]);

  const clotures = ((rawClotures as any[]) || []);
  const restaurants = (restos as any[]) || [];
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
      cartesRestaurants={(rawCartes as any[]) || []}
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
    />
  );
}

function ErreurBase({ migrationManquante }: { migrationManquante: boolean }) {
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
      </div>
    </div>
  );
}
