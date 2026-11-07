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

  // v1.10 : le portail ne lit plus la table employes ; la fonction ne renvoie que id, nom et service
  // des salariés actifs de cette entreprise (jamais le token : la liste part au navigateur)
  const { data: emps, error } = await (supabase as any).rpc("portail_lister_salaries");
  if (error) console.error("[portail] liste des salariés :", error.code);
  // Colonnes recopiées une à une : une colonne ajoutée plus tard à la fonction ne partirait pas au navigateur
  const employes = ((emps as any[]) || []).map((e) => ({ id: e.id, nom: e.nom, service: e.service ?? null }));

  return <EnterprisePortalClient company={comp} employes={employes} />;
}
