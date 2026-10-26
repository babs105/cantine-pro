import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // Optionnel : Sécurisation par token Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const today = new Date().toISOString().split("T")[0];

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      status: "simulation",
      message: "Clôture 11h05 simulée avec succès (Supabase non connecté)",
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

    // 1. Récupération des totaux par plat depuis la vue d'agrégation
    const { data: recap, error: recapError } = await supabase
      .from("vue_recapitulatif_traiteur")
      .select("*")
      .eq("date", today);

    if (recapError) {
      return NextResponse.json({ error: recapError.message }, { status: 500 });
    }

    return NextResponse.json({
      status: "success",
      cloture_at: new Date().toISOString(),
      date: today,
      recapitulatifs: recap,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
