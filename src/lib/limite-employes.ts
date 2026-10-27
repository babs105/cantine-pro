import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PLANS, isPlanId } from "@/lib/abonnement";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Places restantes sur l'offre de l'entreprise (Starter 30, Pro 100, Business 300 salariés actifs) */
export async function placesRestantes(
  supabase: Supabase,
  companyId: string
): Promise<{ restantes: number; message: string }> {
  const { data: comp } = await supabase.from("companies").select("plan").eq("id", companyId).maybeSingle();
  const planId = (comp as any)?.plan;
  const plan = PLANS[isPlanId(planId) ? planId : "pro"];

  const { count } = await supabase
    .from("employes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true);

  const restantes = Math.max(0, plan.maxEmployes - (count || 0));
  return {
    restantes,
    message: `Offre ${plan.nom} : ${plan.maxEmployes} salariés maximum (${restantes} place(s) restante(s)). Passez à l'offre supérieure pour en ajouter.`,
  };
}
