import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EnterprisePortalClient } from "./portal-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CompanyPortalPage({ params }: PageProps) {
  const { slug } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Données par défaut pour démonstration / pilote immédiat
  let company = {
    id: "demo-company-thies",
    nom: "Pilote Thiès Innovation",
    slug: slug || "pilote-thies",
    heure_limite_vote: "11:00:00",
  };

  let employes = [
    { id: "demo-emp-1", nom: "Moussa Ndiaye", token: "token-demo-moussa" },
    { id: "demo-emp-2", nom: "Aminata Sow", token: "token-demo-aminata" },
    { id: "demo-emp-3", nom: "Cheikh Diop", token: "token-demo-cheikh" },
    { id: "demo-emp-4", nom: "Fatou Bintou Fall", token: "token-demo-fatou" },
    { id: "demo-emp-5", nom: "Ousmane Kane", token: "token-demo-ousmane" },
  ];

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();

      const { data: rawComp, error: compError } = await supabase
        .from("companies")
        .select("id, nom, slug, heure_limite_vote")
        .eq("slug", slug)
        .single();

      const comp: any = rawComp;

      if (compError || !comp) {
        notFound();
      }

      company = comp;

      const { data: emps } = await supabase
        .from("employes")
        .select("id, nom, token")
        .eq("company_id", comp.id)
        .eq("is_active", true)
        .order("nom");

      if (emps && emps.length > 0) {
        employes = emps;
      }
    } catch {
      // Fallback vers démo
    }
  }

  return <EnterprisePortalClient company={company} employes={employes} />;
}
