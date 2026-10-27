import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, todayDakar } from "@/lib/config";
import { getRhCompanyId } from "@/lib/rh-session";
import { getLignesFacturation, periodeMois } from "@/lib/facturation";
import { genererFacturePdf } from "@/lib/facture-pdf";

export const dynamic = "force-dynamic";

/** Relevé mensuel PDF : /rh/facture?mois=2026-10 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Facture disponible une fois Supabase connecté." }, { status: 400 });
  }
  const companyId = await getRhCompanyId();
  if (!companyId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const mois = new URL(request.url).searchParams.get("mois") || todayDakar().slice(0, 7);
  const periode = periodeMois(mois);
  if (!periode) return NextResponse.json({ error: "Paramètre mois invalide" }, { status: 400 });

  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("companies")
    .select("nom, slug, responsable_nom, email_contact, telephone_contact")
    .eq("id", companyId)
    .single();
  const company: any = comp;

  try {
    const lignes = await getLignesFacturation(supabase, companyId, periode.debut, periode.fin);
    const pdf = await genererFacturePdf(
      {
        companyNom: company?.nom || "Entreprise",
        companySlug: company?.slug || "entreprise",
        responsable: company?.responsable_nom ?? null,
        email: company?.email_contact ?? null,
        telephone: company?.telephone_contact ?? null,
        mois,
      },
      lignes
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-cantine-pro-${company?.slug || "export"}-${mois}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
