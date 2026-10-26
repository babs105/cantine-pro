import { createClient } from "@/lib/supabase/server";
import { RhDashboardClient } from "./rh-dashboard-client";

export default async function RhDashboardPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Données par défaut pour démonstration / essai immédiat
  let company = {
    id: "demo-company-thies",
    nom: "Pilote Thiès Innovation",
    slug: "pilote-thies",
    traiteur_nom: "Chez Fatou Traiteur Thiès",
    traiteur_telephone: "+221770000000",
    heure_limite_vote: "11:00:00",
  };

  let initialEmployes = [
    {
      id: "demo-emp-1",
      nom: "Moussa Ndiaye",
      telephone: "+221771112233",
      token: "token-demo-moussa",
      is_active: true,
    },
    {
      id: "demo-emp-2",
      nom: "Aminata Sow",
      telephone: "+221772223344",
      token: "token-demo-aminata",
      is_active: true,
    },
    {
      id: "demo-emp-3",
      nom: "Cheikh Diop",
      telephone: "+221773334455",
      token: "token-demo-cheikh",
      is_active: true,
    },
    {
      id: "demo-emp-4",
      nom: "Fatou Bintou Fall",
      telephone: "+221774445566",
      token: "token-demo-fatou",
      is_active: true,
    },
    {
      id: "demo-emp-5",
      nom: "Ousmane Kane",
      telephone: "+221775556677",
      token: "token-demo-ousmane",
      is_active: true,
    },
  ];

  let initialPlats = [
    {
      id: "demo-plat-1",
      titre: "Thiéboudienne Rouge Penda Mbaye",
      description: "Riz rouge au poisson avec légumes et beignets de niébé",
      prix_unitaire: 1500,
      is_available: true,
    },
    {
      id: "demo-plat-2",
      titre: "Yassa Poulet au Feu de Bois",
      description: "Poulet mariné citron et oignons caramélisés avec riz blanc",
      prix_unitaire: 1500,
      is_available: true,
    },
    {
      id: "demo-plat-3",
      titre: "Soupou Kandia (Sauce Gombo)",
      description: "Riz blanc parfumé avec sauce gombo et poisson fumé",
      prix_unitaire: 1700,
      is_available: true,
    },
  ];

  let initialCommandes = [
    {
      employe_id: "demo-emp-1",
      employe_nom: "Moussa Ndiaye",
      telephone: "+221771112233",
      statut: "choisi" as const,
      plat_titre: "Thiéboudienne Rouge Penda Mbaye",
      prix: 1500,
    },
    {
      employe_id: "demo-emp-2",
      employe_nom: "Aminata Sow",
      telephone: "+221772223344",
      statut: "choisi" as const,
      plat_titre: "Yassa Poulet au Feu de Bois",
      prix: 1500,
    },
    {
      employe_id: "demo-emp-3",
      employe_nom: "Cheikh Diop",
      telephone: "+221773334455",
      statut: "absent" as const,
    },
    // emp-4 et emp-5 sont "en_attente"
  ];

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();

      // Récupérer la première entreprise active
      const { data: rawComp } = await supabase
        .from("companies")
        .select("id, nom, slug, traiteur_nom, traiteur_telephone, heure_limite_vote")
        .limit(1)
        .single();

      const comp: any = rawComp;

      if (comp) {
        company = comp;

        // Employés de cette entreprise
        const { data: emps } = await supabase
          .from("employes")
          .select("id, nom, telephone, token, is_active")
          .eq("company_id", comp.id)
          .eq("is_active", true)
          .order("nom");

        if (emps && emps.length > 0) {
          initialEmployes = emps;
        }

        const todayDate = new Date().toISOString().split("T")[0];

        // Plats du jour
        const { data: dishes } = await supabase
          .from("menus_du_jour")
          .select("id, titre, description, prix_unitaire, is_available")
          .eq("company_id", comp.id)
          .eq("date", todayDate);

        if (dishes && dishes.length > 0) {
          initialPlats = dishes;
        }

        // Commandes du jour
        const { data: cmds } = await supabase
          .from("commandes")
          .select("id, employe_id, plat_id, statut, employes(nom, telephone), menus_du_jour(titre, prix_unitaire)")
          .eq("company_id", comp.id)
          .eq("date", todayDate);

        if (cmds) {
          initialCommandes = cmds.map((c: any) => ({
            employe_id: c.employe_id,
            employe_nom: c.employes?.nom || "Employé",
            telephone: c.employes?.telephone || null,
            statut: c.statut,
            plat_titre: c.menus_du_jour?.titre,
            prix: c.menus_du_jour?.prix_unitaire,
          }));
        }
      }
    } catch {
      // Utilisation des données par défaut si erreur de connexion
    }
  }

  return (
    <RhDashboardClient
      company={company}
      initialEmployes={initialEmployes}
      initialPlats={initialPlats}
      initialCommandes={initialCommandes}
      appBaseUrl={appBaseUrl}
    />
  );
}
