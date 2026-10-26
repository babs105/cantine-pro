import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EnterprisePortalClient } from "./portal-client";
import { isSupabaseConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CompanyPortalPage({ params }: PageProps) {
  const { slug } = await params;

  // Données par défaut pour démonstration / pilote immédiat
  let company = {
    id: "demo-company-thies",
    nom: "Pilote Thiès Innovation",
    slug: slug || "pilote-thies",
    heure_limite_vote: "11:10:00",
  };

  let employes = [
    { id: "demo-emp-1", nom: "Moussa Ndiaye", token: "token-demo-moussa" },
    { id: "demo-emp-2", nom: "Aminata Sow", token: "token-demo-aminata" },
    { id: "demo-emp-3", nom: "Cheikh Diop", token: "token-demo-cheikh" },
    { id: "demo-emp-4", nom: "Fatou Bintou Fall", token: "token-demo-fatou" },
    { id: "demo-emp-5", nom: "Ousmane Kane", token: "token-demo-ousmane" },
  ];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    const { data: rawComp } = await supabase
      .from("companies")
      .select("id, nom, slug, heure_limite_vote")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    const comp: any = rawComp;

    if (!comp) {
      notFound();
    }

    company = comp;

    const { data: emps } = await supabase
      .from("employes")
      .select("id, nom, token")
      .eq("company_id", comp.id)
      .eq("is_active", true)
      .order("nom");

    employes = emps || [];
  }

  return <EnterprisePortalClient company={company} employes={employes} />;
}
