import { echangerSlugPortail } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EnterprisePortalClient } from "./portal-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CompanyPortalPage({ params }: PageProps) {
  const { slug } = await params;
  // Le slug du portail est échangé contre un JWT court limité au portail de cette entreprise
  const acces = await echangerSlugPortail(slug);
  if (!acces) {
    notFound();
  }
  const { supabase } = acces;

  const { data: rawComp } = await supabase
    .from("companies")
    .select("id, nom, slug, heure_limite_vote")
    .eq("id", acces.companyId)
    .maybeSingle();

  const comp: any = rawComp;

  if (!comp) {
    notFound();
  }

  // Jamais le token : ce composant serveur passe la liste au navigateur, et le portail est public
  const { data: emps } = await supabase
    .from("employes")
    .select("id, nom, service")
    .eq("company_id", comp.id)
    .eq("is_active", true)
    .order("nom");

  return <EnterprisePortalClient company={comp} employes={emps || []} />;
}
