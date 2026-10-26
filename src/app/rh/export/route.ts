import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, todayDakar } from "@/lib/config";
import { getRhCompanyId } from "@/lib/rh-session";

export const dynamic = "force-dynamic";

const STATUTS: Record<string, string> = {
  choisi: "Repas",
  absent: "Absent(e)",
  ne_mange_pas: "Ne mange pas",
};

function cellule(valeur: string | number | null | undefined): string {
  const s = String(valeur ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export comptable CSV (séparateur ";" pour Excel FR)
 * - /rh/export?date=2026-10-26 : facture du jour
 * - /rh/export?mois=2026-10    : facture du mois
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Export disponible une fois Supabase connecté." }, { status: 400 });
  }

  const companyId = await getRhCompanyId();
  if (!companyId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get("mois");
  const date = searchParams.get("date") || todayDakar();

  let debut: string;
  let fin: string;
  let libelle: string;
  if (mois && /^\d{4}-\d{2}$/.test(mois)) {
    const [annee, m] = mois.split("-").map(Number);
    debut = `${mois}-01`;
    fin = new Date(Date.UTC(annee, m, 0)).toISOString().slice(0, 10); // dernier jour du mois
    libelle = mois;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    debut = fin = libelle = date;
  } else {
    return NextResponse.json({ error: "Paramètre date ou mois invalide" }, { status: 400 });
  }

  const supabase = await createClient();
  const [{ data: comp }, { data: cmds, error }] = await Promise.all([
    supabase.from("companies").select("nom, slug").eq("id", companyId).single(),
    supabase
      .from("commandes")
      .select("date, statut, employes(nom, telephone), menus_du_jour(titre, prix_unitaire)")
      .eq("company_id", companyId)
      .gte("date", debut)
      .lte("date", fin)
      .order("date"),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const company: any = comp;
  let totalRepas = 0;
  let totalMontant = 0;

  const lignes = (cmds || [])
    .map((c: any) => {
      const montant = c.statut === "choisi" ? c.menus_du_jour?.prix_unitaire ?? 0 : 0;
      if (c.statut === "choisi") {
        totalRepas += 1;
        totalMontant += montant;
      }
      return {
        date: c.date as string,
        nom: (c.employes?.nom as string) || "",
        cells: [
          c.date,
          c.employes?.nom,
          c.employes?.telephone,
          STATUTS[c.statut] || c.statut,
          c.menus_du_jour?.titre || "-",
          montant,
        ],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom, "fr"))
    .map((l) => l.cells.map(cellule).join(";"));

  const csv = [
    ["Date", "Employé", "Téléphone", "Statut", "Plat", "Montant (FCFA)"].join(";"),
    ...lignes,
    "",
    ["TOTAL", "", "", `${totalRepas} repas`, "", totalMontant].join(";"),
  ].join("\r\n");

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cantine-pro-${company?.slug || "export"}-${libelle}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
