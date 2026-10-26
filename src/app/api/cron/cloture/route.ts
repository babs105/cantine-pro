import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isApresHeureLimite, isSupabaseConfigured, todayDakar } from "@/lib/config";
import { cloturerEntreprise } from "@/lib/cloture";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Sécurisation par token Vercel Cron (Authorization: Bearer CRON_SECRET)
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 500 });
  }

  const today = todayDakar();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      status: "simulation",
      message: "Clôture 11h10 simulée avec succès (Supabase non connecté)",
      date: today,
      sample_summary: {
        company: "Pilote Thiès Innovation",
        total_repas: 30,
        breakdown: [
          { plat: "Thiéboudienne Rouge Penda Mbaye", quantite: 18 },
          { plat: "Yassa Poulet au Feu de Bois", quantite: 12 },
        ],
      },
    });
  }

  try {
    const supabase = await createClient();
    const { data: companies, error } = await supabase
      .from("companies")
      .select("*")
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const resultats = [];
    for (const company of (companies || []) as any[]) {
      // Une entreprise avec une heure limite plus tardive sera clôturée au prochain passage
      if (!isApresHeureLimite(company.heure_limite_vote)) {
        resultats.push({ company: company.nom, statut: "votes_en_cours" });
        continue;
      }
      try {
        const clotures = await cloturerEntreprise(supabase, company, today);
        resultats.push({
          company: company.nom,
          restaurants: clotures.map((c) => ({
            restaurant: c.restaurant_nom,
            total_repas: c.total_repas,
            envoi: c.envoi_statut,
            erreur: c.envoi_erreur,
          })),
        });
      } catch (err: any) {
        resultats.push({ company: company.nom, statut: "erreur", erreur: err.message });
      }
    }

    return NextResponse.json({
      status: "success",
      cloture_at: new Date().toISOString(),
      date: today,
      resultats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
