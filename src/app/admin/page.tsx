import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, todayDakar } from "@/lib/config";
import { isAdmin } from "@/lib/admin-session";
import { PLANS, etatAbonnement, isPlanId } from "@/lib/abonnement";
import { AdminClient, type EntrepriseAdmin } from "./admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "SuperAdmin — Cantine Pro", robots: { index: false } };

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  if (!isSupabaseConfigured()) {
    return <p className="p-8 text-sm">Supabase non connecté.</p>;
  }

  const supabase = await createClient();
  const today = todayDakar();
  const debutMois = `${today.slice(0, 7)}-01`;

  const [{ data: companies, error }, { data: employes }, { data: commandes }, { data: paiements }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, nom, slug, responsable_nom, email_contact, telephone_contact, plan, statut_abonnement, trial_ends_at, abonnement_fin, is_active, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("employes").select("company_id").eq("is_active", true),
    supabase.from("commandes").select("company_id").eq("statut", "choisi").gte("date", debutMois),
    supabase.from("paiements").select("company_id, montant, created_at"),
  ]);

  if (error) {
    return (
      <p className="p-8 text-sm text-red-700">
        Lecture impossible : {error.message}. Relancez supabase/schema.sql si la base n&apos;est pas à jour.
      </p>
    );
  }

  const compter = (rows: any[] | null) =>
    (rows || []).reduce<Record<string, number>>((acc, r) => ((acc[r.company_id] = (acc[r.company_id] || 0) + 1), acc), {});
  const nbEmployes = compter(employes as any[]);
  const nbRepas = compter(commandes as any[]);
  const payeurs = new Set(((paiements as any[]) || []).map((p) => p.company_id));
  const encaisseMois = ((paiements as any[]) || [])
    .filter((p) => (p.created_at as string).slice(0, 10) >= debutMois)
    .reduce((a, p) => a + p.montant, 0);

  const entreprises: EntrepriseAdmin[] = ((companies as any[]) || []).map((c) => {
    const plan = isPlanId(c.plan) ? c.plan : "pro";
    return {
      id: c.id,
      nom: c.nom,
      slug: c.slug,
      responsable: c.responsable_nom,
      email: c.email_contact,
      telephone: c.telephone_contact,
      plan,
      statut: c.statut_abonnement,
      trialEndsAt: c.trial_ends_at ? String(c.trial_ends_at).slice(0, 10) : null,
      abonnementFin: c.abonnement_fin,
      creeLe: String(c.created_at).slice(0, 10),
      employes: nbEmployes[c.id] || 0,
      repasMois: nbRepas[c.id] || 0,
      aDejaPaye: payeurs.has(c.id),
      etat: etatAbonnement(c, today),
    };
  });

  // MRR : abonnements payants en cours (actifs avec une échéance, hors pilotes gratuits sans échéance)
  const payantes = entreprises.filter((e) => e.statut === "active" && e.abonnementFin && !e.etat.envoiBloque);
  const mrr = payantes.reduce((a, e) => a + PLANS[e.plan].prix, 0);
  const inscrites = entreprises.length;
  const converties = entreprises.filter((e) => e.aDejaPaye).length;

  return (
    <AdminClient
      entreprises={entreprises}
      kpis={{
        inscrites,
        enEssai: entreprises.filter((e) => e.etat.etat === "essai").length,
        payantes: payantes.length,
        bloquees: entreprises.filter((e) => e.etat.envoiBloque).length,
        mrr,
        encaisseMois,
        conversion: inscrites > 0 ? Math.round((converties / inscrites) * 100) : 0,
      }}
    />
  );
}
