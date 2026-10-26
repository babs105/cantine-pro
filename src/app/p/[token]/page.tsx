import { createClient } from "@/lib/supabase/server";
import { VoteClient } from "./vote-client";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isApresHeureLimite, isSupabaseConfigured, secondesAvantHeure, TIMEZONE, todayDakar } from "@/lib/config";

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


  if (!isSupabaseConfigured()) {
    // Mode Démo / Mock local si Supabase non encore connecté
    return { success: true, enregistreAt: new Date().toISOString() };
  }

  try {
    const supabase = await createClient();

    // 1. Trouver l'employé et l'entreprise via le token
    const { data: rawEmploye, error: empError } = await supabase
      .from("employes")
      .select("id, company_id, companies(heure_limite_vote)")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    const employe: any = rawEmploye;

    if (empError || !employe) {
      return { success: false, message: "Employé introuvable ou inactif." };
    }

    const companyData: any = employe.companies;
    const heureLimite = companyData?.heure_limite_vote || "11:00:00";

    // 2. Vérification heure de clôture (fuseau Thiès/Dakar GMT)
    if (isApresHeureLimite(heureLimite)) {
      return {
        success: false,
        message: `Les votes sont clôturés depuis ${heureLimite.slice(0, 5)}.`,
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

export default async function EmployeVotePage({ params }: PageProps) {
  const { token } = await params;


  let employeNom = "Moussa Ndiaye";
  let companyNom = "Pilote Thiès Innovation";
  let heureLimite = "11:00:00";
  let platsDisponibles = [
    {
      id: "demo-plat-1",
      titre: "Thiéboudienne Rouge Penda Mbaye",
      description: "Riz rouge au mérou, légumes locaux et beignets de niébé",
      prix_unitaire: 1500,
      is_available: true,
    },
    {
      id: "demo-plat-2",
      titre: "Yassa Poulet au Feu de Bois",
      description: "Poulet mariné au citron vert et oignons caramélisés avec riz blanc",
      prix_unitaire: 1500,
      is_available: true,
    },
    {
      id: "demo-plat-3",
      titre: "Soupou Kandia (Sauce Gombo)",
      description: "Riz blanc parfumé avec sauce gombo fraîche et poisson fumé",
      prix_unitaire: 1700,
      is_available: true,
    },
  ];
  let commandeExistante = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    // 1. Récupérer l'employé
    const { data: rawEmp, error: empError } = await supabase
      .from("employes")
      .select("id, nom, company_id, companies(nom, heure_limite_vote)")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    const employe: any = rawEmp;

    if (empError || !employe) {
      notFound();
    }

    employeNom = employe.nom;
    const comp: any = employe.companies;
    companyNom = comp?.nom || "Entreprise Pilote";
    heureLimite = comp?.heure_limite_vote || "11:00:00";

    const todayDate = todayDakar();

    // 2. Plats du jour disponibles
    const { data: plats } = await supabase
      .from("menus_du_jour")
      .select("id, titre, description, prix_unitaire, is_available")
      .eq("company_id", employe.company_id)
      .eq("date", todayDate)
      .eq("is_available", true);

    // Pas de repli sur les plats de démo : sans menu publié, l'employé voit "menu pas encore publié"
    platsDisponibles = plats || [];

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
  }

  // Vérification si l'heure limite est dépassée
  const now = new Date();
  const isVerrouille = isApresHeureLimite(heureLimite, now);
  const secondesRestantes = secondesAvantHeure(heureLimite, now);

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
      dateAujourdhuiStr={dateAujourdhuiStr}
      isVerrouille={isVerrouille}
      secondesRestantes={secondesRestantes}
      platsDisponibles={platsDisponibles}
      commandeExistante={commandeExistante}
      onVoteAction={submitVoteAction}
    />
  );
}
