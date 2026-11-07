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
    // 1. Validation manuelle des entrées
    if (typeof token !== "string" || token.length < 8 || token.length > 128) {
      return { success: false, message: "Employé introuvable ou inactif." };
    }
    if (statut !== "choisi" && statut !== "absent" && statut !== "ne_mange_pas") {
      return { success: false, message: "Choix invalide." };
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (statut === "choisi") {
      if (typeof platId !== "string" || !UUID_RE.test(platId)) {
        return { success: false, message: "Ce plat n'est plus disponible, choisissez-en un autre." };
      }
    } else if (platId !== null) {
      return { success: false, message: "Choix invalide." };
    }

    // 2. Échanger le token contre un JWT court limité à ce salarié (politiques RLS)
    const acces = await echangerJetonSalarie(token);
    if (!acces) {
      return { success: false, message: "Employé introuvable ou inactif." };
    }

    // 3. Toutes les vérifications (jour, heures, plat, clôture, verrou RH) et l'upsert
    // sont faits par la fonction SQL passer_commande
    const { data, error } = await (acces.supabase as any).rpc("passer_commande", {
      p_statut: statut,
      p_plat_id: platId,
    });

    if (error) {
      // Codes métier : le message est déjà écrit en français pour le salarié
      if (error.code === "CP423" || error.code === "CP404" || error.code === "CP403") {
        return { success: false, message: error.message };
      }
      console.error("[salarié] passer_commande :", error.code);
      return { success: false, message: "Erreur lors de l'enregistrement de la commande." };
    }

    const enregistreAt = typeof data === "string" ? new Date(data).toISOString() : new Date().toISOString();

    revalidatePath(`/p/${token}`);
    return { success: true, enregistreAt };
  } catch {
    return { success: false, message: "Erreur serveur." };
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
  // v1.10 : le salarié ne lit plus la table restaurants (token, WhatsApp) ; la fonction ne renvoie que
  // id, nom et is_active des restaurants de son entreprise, joints ici aux plats par restaurant_id
  const [{ data: plats }, { data: restos, error: erreurRestos }] = await Promise.all([
    supabase
      .from("menus_du_jour")
      .select("id, titre, description, prix_unitaire, is_available, created_at, restaurant_id")
      .eq("company_id", employe.company_id)
      .eq("date", todayDate)
      .eq("is_available", true),
    (supabase as any).rpc("restaurants_visibles_salarie"),
  ]);
  if (erreurRestos) console.error("[salarié] restaurants :", erreurRestos.code);
  const restaurantsParId = new Map<string, { nom: string; is_active: boolean }>(
    ((restos as any[]) || []).map((r) => [r.id, { nom: r.nom, is_active: r.is_active }])
  );

  // Sans menu publié, l'employé voit "menu pas encore publié". Filtre fermé : un plat rattaché à un restaurant
  // ne s'affiche que si ce restaurant est connu ET actif (si la fonction échoue, on ne montre pas les plats
  // d'un restaurant peut-être désactivé). Un plat sans restaurant reste visible, comme avant.
  const platsDisponibles = ((plats || []) as any[])
    .filter((p) => !p.restaurant_id || restaurantsParId.get(p.restaurant_id)?.is_active === true)
    .map((p) => ({
      id: p.id,
      titre: p.titre,
      description: p.description,
      prix_unitaire: p.prix_unitaire,
      is_available: p.is_available,
      restaurant_nom: (p.restaurant_id && restaurantsParId.get(p.restaurant_id)?.nom) || "Restaurant",
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
