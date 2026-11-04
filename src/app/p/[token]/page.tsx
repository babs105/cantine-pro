import type { Metadata } from "next";
import { echangerJetonSalarie } from "@/lib/supabase/server";
import { VoteClient } from "./vote-client";
import { notFound } from "next/navigation";
import { NOMS_JOURS, jourIso, normaliserJoursTravail } from "@/lib/dates";
import { revalidatePath } from "next/cache";
import { isApresHeureLimite, secondesAvantHeure, TIMEZONE, todayDakar } from "@/lib/config";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Server Action pour enregistrer instantanément le vote dans Supabase
async function submitVoteAction(
  token: string,
  statut: "choisi" | "absent" | "ne_mange_pas",
  platId: string | null
): Promise<{ success: boolean; message?: string; enregistreAt?: string }> {
  "use server";


  try {
    // 1. Échanger le token contre un JWT court limité à ce salarié (politiques RLS)
    const acces = await echangerJetonSalarie(token);
    if (!acces) {
      return { success: false, message: "Employé introuvable ou inactif." };
    }
    const { supabase } = acces;

    const { data: rawEmploye, error: empError } = await supabase
      .from("employes")
      .select("id, company_id, companies(heure_ouverture_vote, heure_limite_vote, jours_travail)")
      .eq("id", acces.employeId)
      .single();

    const employe: any = rawEmploye;

    if (empError || !employe) {
      return { success: false, message: "Employé introuvable ou inactif." };
    }

    const companyData: any = employe.companies;
    const heureLimite = companyData?.heure_limite_vote || "11:10:00";
    const heureOuverture = companyData?.heure_ouverture_vote || "08:00:00";

    // Pas de commande les jours sans service (jours de travail de l'entreprise)
    if (!normaliserJoursTravail(companyData?.jours_travail).includes(jourIso(todayDakar()))) {
      return { success: false, message: "Pas de service cantine aujourd'hui." };
    }

    if (!isApresHeureLimite(heureOuverture)) {
      return {
        success: false,
        message: `Les commandes ouvrent à ${heureOuverture.slice(0, 5).replace(":", "h")}.`,
      };
    }

    // 2. Vérification heure de clôture (fuseau Thiès/Dakar GMT)
    if (isApresHeureLimite(heureLimite)) {
      return {
        success: false,
        message: `Les commandes sont clôturées depuis ${heureLimite.slice(0, 5)}.`,
      };
    }

    const todayDate = todayDakar();

    // 3. Le plat doit appartenir au menu du jour de l'entreprise et être disponible
    if (statut === "choisi") {
      const { data: plat } = await supabase
        .from("menus_du_jour")
        .select("id")
        .eq("id", platId ?? "")
        .eq("company_id", employe.company_id)
        .eq("date", todayDate)
        .eq("is_available", true)
        .maybeSingle();

      if (!plat) {
        return { success: false, message: "Ce plat n'est plus disponible, choisissez-en un autre." };
      }
    }

    const enregistreAt = new Date().toISOString();

    // 4. Upsert du vote (choix unique par date)
    const { error: upsertError } = await (supabase.from("commandes") as any).upsert(
      {
        company_id: employe.company_id,
        employe_id: employe.id,
        plat_id: statut === "choisi" ? platId : null,
        date: todayDate,
        statut,
        modifie_par_rh: false,
        updated_at: enregistreAt,
      },
      { onConflict: "employe_id,date" }
    );

    if (upsertError) {
      return {
        success: false,
        message: "Erreur lors de l'enregistrement de la commande.",
      };
    }

    revalidatePath(`/p/${token}`);
    return { success: true, enregistreAt };
  } catch (err: any) {
    return { success: false, message: err.message || "Erreur serveur." };
  }
}

// Manifeste propre au salarié : installée, l'application rouvre directement sa page de commande
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/p/${encodeURIComponent(token)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Cantine Pro", statusBarStyle: "default" },
  };
}

export default async function EmployeVotePage({ params }: PageProps) {
  const { token } = await params;

  let commandeExistante: {
    id: string;
    plat_id: string | null;
    statut: "choisi" | "absent" | "ne_mange_pas";
    plat_titre?: string;
    enregistre_at?: string;
  } | null = null;

  // 1. Échanger le token du lien magique contre un JWT court limité à ce salarié
  const acces = await echangerJetonSalarie(token);
  if (!acces) {
    notFound();
  }
  const { supabase } = acces;

  const { data: rawEmp, error: empError } = await supabase
    .from("employes")
    .select("id, nom, company_id, companies(nom, heure_ouverture_vote, heure_limite_vote, jours_travail)")
    .eq("id", acces.employeId)
    .single();

  const employe: any = rawEmp;

  if (empError || !employe) {
    notFound();
  }

  const employeNom = employe.nom;
  const comp: any = employe.companies;
  const companyNom = comp?.nom || "Entreprise Pilote";
  const heureLimite = comp?.heure_limite_vote || "11:10:00";
  const heureOuverture = comp?.heure_ouverture_vote || "08:00:00";
  const joursTravail = normaliserJoursTravail(comp?.jours_travail);

  const todayDate = todayDakar();

  // 2. Plats du jour disponibles
  const { data: plats } = await supabase
    .from("menus_du_jour")
    .select("id, titre, description, prix_unitaire, is_available, created_at, restaurants(nom, is_active)")
    .eq("company_id", employe.company_id)
    .eq("date", todayDate)
    .eq("is_available", true);

  // Sans menu publié, l'employé voit "menu pas encore publié"
  const platsDisponibles = ((plats || []) as any[])
    .filter((p) => p.restaurants?.is_active !== false)
    .map((p) => ({
      id: p.id,
      titre: p.titre,
      description: p.description,
      prix_unitaire: p.prix_unitaire,
      is_available: p.is_available,
      restaurant_nom: p.restaurants?.nom || "Restaurant",
    }));

  // 3. Commande existante pour aujourd'hui
  const { data: rawCmd } = await supabase
    .from("commandes")
    .select("id, plat_id, statut, updated_at, menus_du_jour(titre)")
    .eq("employe_id", employe.id)
    .eq("date", todayDate)
    .maybeSingle();

  const cmd: any = rawCmd;

  if (cmd) {
    const menuData: any = cmd.menus_du_jour;
    commandeExistante = {
      id: cmd.id,
      plat_id: cmd.plat_id,
      statut: cmd.statut as "choisi" | "absent" | "ne_mange_pas",
      plat_titre: menuData?.titre || undefined,
      enregistre_at: cmd.updated_at || undefined,
    };
  }

  // Jour sans service : la page l'indique avec le prochain jour de travail
  const jourActuel = jourIso(todayDakar());
  const jourSansService = !joursTravail.includes(jourActuel);
  const prochainJour = [1, 2, 3, 4, 5, 6, 7].map((n) => ((jourActuel - 1 + n) % 7) + 1).find((j) => joursTravail.includes(j));
  const prochainService = jourSansService && prochainJour ? NOMS_JOURS[prochainJour - 1].toLowerCase() : null;

  // Vérification si l'heure limite est dépassée
  const now = new Date();
  const isVerrouille = isApresHeureLimite(heureLimite, now);
  const secondesRestantes = secondesAvantHeure(heureLimite, now);
  const secondesAvantOuverture = secondesAvantHeure(heureOuverture, now);

  // Formatage date locale ex: "Lundi 26 Octobre"
  const dateAujourdhuiStr = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIMEZONE,
  }).format(now);

  return (
    <VoteClient
      token={token}
      employeNom={employeNom}
      companyNom={companyNom}
      heureLimite={heureLimite}
      heureOuverture={heureOuverture}
      secondesAvantOuverture={secondesAvantOuverture}
      dateAujourdhuiStr={dateAujourdhuiStr}
      isVerrouille={isVerrouille}
      jourSansService={jourSansService}
      prochainService={prochainService}
      secondesRestantes={secondesRestantes}
      platsDisponibles={platsDisponibles}
      commandeExistante={commandeExistante}
      onVoteAction={submitVoteAction}
    />
  );
}
