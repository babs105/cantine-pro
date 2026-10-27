import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, todayDakar } from "@/lib/config";
import { getRhCompanyId } from "@/lib/rh-session";
import { STATUTS, getLignesFacturation, periodeMois, type LigneFacturation } from "@/lib/facturation";

export const dynamic = "force-dynamic";

const FORMAT_FCFA = '#,##0" FCFA"';
const ORANGE = "FFF97316";

type Ligne = LigneFacturation;

function cellule(valeur: string | number | null | undefined): string {
  const s = String(valeur ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function styleEntete(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE } };
  row.alignment = { vertical: "middle" };
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } };
}

function construireCsv(lignes: Ligne[]): string {
  const repas = lignes.filter((l) => l.statut === "choisi");
  return [
    ["Date", "Service", "Employé", "Téléphone", "Statut", "Plat", "Restaurant", "Montant (FCFA)"].join(";"),
    ...lignes.map((l) =>
      [l.date, l.service, l.nom, l.telephone, STATUTS[l.statut] || l.statut, l.plat || "-", l.restaurant || "-", l.montant]
        .map(cellule)
        .join(";")
    ),
    "",
    ["TOTAL", "", "", "", `${repas.length} repas`, "", "", repas.reduce((a, l) => a + l.montant, 0)].join(";"),
  ].join("\r\n");
}

async function construireXlsx(lignes: Ligne[], companyNom: string, libelle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cantine Pro";
  wb.created = new Date();
  const repas = lignes.filter((l) => l.statut === "choisi");

  // 1. Paie : un total par employé, groupé par service (déduction sur salaire)
  const paie = wb.addWorksheet("Paie par service", { views: [{ state: "frozen", ySplit: 3 }] });
  paie.columns = [
    { key: "service", width: 22 },
    { key: "nom", width: 28 },
    { key: "telephone", width: 18 },
    { key: "repas", width: 12 },
    { key: "montant", width: 16, style: { numFmt: FORMAT_FCFA } },
  ];
  paie.addRow([`${companyNom} — Relevé repas ${libelle}`]).font = { bold: true, size: 14 };
  paie.addRow([]);
  styleEntete(paie.addRow(["Service", "Employé", "Téléphone", "Nb repas", "Montant"]));

  const parEmploye = new Map<string, { service: string; nom: string; telephone: string; repas: number; montant: number }>();
  for (const l of repas) {
    const cle = `${l.service}|${l.nom}|${l.telephone}`;
    const e = parEmploye.get(cle) || { service: l.service, nom: l.nom, telephone: l.telephone, repas: 0, montant: 0 };
    e.repas += 1;
    e.montant += l.montant;
    parEmploye.set(cle, e);
  }

  const services = Array.from(new Set(Array.from(parEmploye.values()).map((e) => e.service))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  const recapServices: Array<{ service: string; employes: number; repas: number; montant: number }> = [];

  for (const service of services) {
    const employes = Array.from(parEmploye.values())
      .filter((e) => e.service === service)
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    for (const e of employes) {
      paie.addRow([e.service, e.nom, e.telephone, e.repas, e.montant]);
    }
    const sousTotal = {
      service,
      employes: employes.length,
      repas: employes.reduce((a, e) => a + e.repas, 0),
      montant: employes.reduce((a, e) => a + e.montant, 0),
    };
    recapServices.push(sousTotal);
    styleTotal(paie.addRow([`Sous-total ${service}`, "", "", sousTotal.repas, sousTotal.montant]));
    paie.addRow([]);
  }
  const totalRepas = repas.length;
  const totalMontant = repas.reduce((a, l) => a + l.montant, 0);
  styleEntete(paie.addRow(["TOTAL GÉNÉRAL", "", "", totalRepas, totalMontant]));

  // 2. Récapitulatif par service (DAF)
  const recap = wb.addWorksheet("Récap services");
  recap.columns = [
    { key: "service", width: 24 },
    { key: "employes", width: 16 },
    { key: "repas", width: 12 },
    { key: "montant", width: 16, style: { numFmt: FORMAT_FCFA } },
  ];
  styleEntete(recap.addRow(["Service", "Employés servis", "Nb repas", "Montant"]));
  for (const s of recapServices) recap.addRow([s.service, s.employes, s.repas, s.montant]);
  styleTotal(recap.addRow(["TOTAL", parEmploye.size, totalRepas, totalMontant]));

  // 3. Réconciliation restaurants : quantités × prix par plat, un sous-total par restaurant
  const plats = wb.addWorksheet("Facture restaurants");
  plats.columns = [
    { key: "restaurant", width: 28 },
    { key: "plat", width: 36 },
    { key: "prix", width: 16, style: { numFmt: FORMAT_FCFA } },
    { key: "quantite", width: 12 },
    { key: "total", width: 16, style: { numFmt: FORMAT_FCFA } },
  ];
  styleEntete(plats.addRow(["Restaurant", "Plat", "Prix unitaire", "Quantité", "Total"]));
  const restaurants = Array.from(new Set(repas.map((l) => l.restaurant || "Sans restaurant"))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  for (const restaurant of restaurants) {
    const parPlat = new Map<string, { plat: string; prix: number; quantite: number }>();
    for (const l of repas.filter((x) => (x.restaurant || "Sans restaurant") === restaurant)) {
      const cle = `${l.plat}|${l.montant}`;
      const p = parPlat.get(cle) || { plat: l.plat, prix: l.montant, quantite: 0 };
      p.quantite += 1;
      parPlat.set(cle, p);
    }
    const lignesResto = Array.from(parPlat.values()).sort((a, b) => b.quantite - a.quantite);
    for (const p of lignesResto) {
      plats.addRow([restaurant, p.plat, p.prix, p.quantite, p.prix * p.quantite]);
    }
    styleTotal(
      plats.addRow([
        `Dû à ${restaurant}`,
        "",
        "",
        lignesResto.reduce((a, p) => a + p.quantite, 0),
        lignesResto.reduce((a, p) => a + p.prix * p.quantite, 0),
      ])
    );
    plats.addRow([]);
  }
  styleEntete(plats.addRow(["TOTAL TOUS RESTAURANTS", "", "", totalRepas, totalMontant]));

  // 4. Détail jour par jour (justificatif)
  const detail = wb.addWorksheet("Détail jour par jour", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [
    { key: "date", width: 12 },
    { key: "service", width: 20 },
    { key: "nom", width: 28 },
    { key: "statut", width: 14 },
    { key: "plat", width: 34 },
    { key: "restaurant", width: 26 },
    { key: "montant", width: 14, style: { numFmt: FORMAT_FCFA } },
  ];
  styleEntete(detail.addRow(["Date", "Service", "Employé", "Statut", "Plat", "Restaurant", "Montant"]));
  for (const l of lignes) {
    detail.addRow([
      l.date,
      l.service,
      l.nom,
      STATUTS[l.statut] || l.statut,
      l.plat || "-",
      l.restaurant || "-",
      l.montant,
    ]);
  }
  detail.autoFilter = { from: "A1", to: "G1" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Export comptable
 * - /rh/export?date=2026-10-26            : facture du jour (CSV, séparateur ";" pour Excel FR)
 * - /rh/export?mois=2026-10               : facture du mois (CSV)
 * - /rh/export?mois=2026-10&format=xlsx   : classeur Excel paie par service + facture par restaurant
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
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  let debut: string;
  let fin: string;
  let libelle: string;
  const periode = mois ? periodeMois(mois) : null;
  if (mois && periode) {
    ({ debut, fin } = periode);
    libelle = mois;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    debut = fin = libelle = date;
  } else {
    return NextResponse.json({ error: "Paramètre date ou mois invalide" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: comp } = await supabase.from("companies").select("nom, slug").eq("id", companyId).single();
  let lignes: Ligne[];
  try {
    lignes = await getLignesFacturation(supabase, companyId, debut, fin);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const company: any = comp;
  const nomFichier = `cantine-pro-${company?.slug || "export"}-${libelle}`;

  if (format === "xlsx") {
    const buffer = await construireXlsx(lignes, company?.nom || "Entreprise", libelle);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse("﻿" + construireCsv(lignes), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
