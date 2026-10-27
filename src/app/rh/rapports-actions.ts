"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { isDateValide } from "@/lib/dates";
import { getRhCompanyId, hashRhCode, verifyRhCode } from "@/lib/rh-session";
import { getLignesFacturation, periodeMois, regrouperParPlat, type LigneFacturation } from "@/lib/facturation";

const SESSION_EXPIREE = "Session RH expirée, reconnectez-vous.";
const MODE_DEMO = "Disponible une fois Supabase connecté.";

type Resultat<T> = { success: true; data: T } | { success: false; message: string };

async function contexte() {
  if (!isSupabaseConfigured()) return { erreur: MODE_DEMO } as const;
  const companyId = await getRhCompanyId();
  if (!companyId) return { erreur: SESSION_EXPIREE } as const;
  return { companyId, supabase: await createClient() } as const;
}

function moisPrecedents(mois: string, n: number): string[] {
  const [annee, m] = mois.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(annee, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

// ---------------------------------------------------------------------------
// HISTORIQUE
// ---------------------------------------------------------------------------

export interface JourHistorique {
  date: string;
  repasFactures: number;
  nonConfirmes: number;
  absents: number;
  montant: number;
}

/** Synthèse jour par jour d'un mois (YYYY-MM) */
export async function historiqueMoisAction(mois: string): Promise<Resultat<JourHistorique[]>> {
  const ctx = await contexte();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur! };
  const periode = periodeMois(mois);
  if (!periode) return { success: false, message: "Mois invalide." };

  try {
    const lignes = await getLignesFacturation(ctx.supabase, ctx.companyId, periode.debut, periode.fin);
    const parJour = new Map<string, JourHistorique>();
    for (const l of lignes) {
      const j = parJour.get(l.date) || { date: l.date, repasFactures: 0, nonConfirmes: 0, absents: 0, montant: 0 };
      if (l.statut === "choisi") j.repasFactures += 1;
      else if (l.statut === "non_confirme") j.nonConfirmes += 1;
      else j.absents += 1;
      j.montant += l.montant;
      parJour.set(l.date, j);
    }
    return { success: true, data: Array.from(parJour.values()).sort((a, b) => b.date.localeCompare(a.date)) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export interface DetailJour {
  lignes: Omit<LigneFacturation, "telephone">[];
  restaurants: Array<{
    nom: string;
    quantite: number;
    montant: number;
    confirmeAt: string | null;
    confirmePar: "restaurant" | "rh" | null;
    cloture: boolean;
  }>;
}

/** Détail d'une journée : qui a mangé quoi, et l'état de chaque restaurant */
export async function historiqueJourAction(date: string): Promise<Resultat<DetailJour>> {
  const ctx = await contexte();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur! };
  if (!isDateValide(date)) return { success: false, message: "Date invalide." };

  try {
    const [lignes, { data: clotures }] = await Promise.all([
      getLignesFacturation(ctx.supabase, ctx.companyId, date, date),
      (ctx.supabase.from("clotures") as any)
        .select("restaurant_id, total_repas, confirme_at, confirme_par, restaurants(nom)")
        .eq("company_id", ctx.companyId)
        .eq("date", date),
    ]);

    const restaurants = new Map<string, DetailJour["restaurants"][number]>();
    for (const c of (clotures as any[]) || []) {
      restaurants.set(c.restaurant_id, {
        nom: c.restaurants?.nom || "Restaurant",
        quantite: 0,
        montant: 0,
        confirmeAt: c.confirme_at,
        confirmePar: c.confirme_par,
        cloture: true,
      });
    }
    for (const l of lignes) {
      if (l.statut !== "choisi" && l.statut !== "non_confirme") continue;
      const cle = l.restaurantId || "sans";
      const r = restaurants.get(cle) || {
        nom: l.restaurant || "Sans restaurant",
        quantite: 0,
        montant: 0,
        confirmeAt: null,
        confirmePar: null,
        cloture: false,
      };
      r.quantite += 1;
      r.montant += l.montant;
      restaurants.set(cle, r);
    }

    return {
      success: true,
      data: {
        lignes: lignes.map(({ telephone: _t, ...l }) => l),
        restaurants: Array.from(restaurants.values()).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
      },
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ---------------------------------------------------------------------------
// STATISTIQUES DG / DAF
// ---------------------------------------------------------------------------

export interface Statistiques {
  mois: string;
  evolution: Array<{ mois: string; repas: number; montant: number }>;
  services: Array<{
    service: string;
    effectif: number;
    repas: number;
    absents: number;
    montant: number;
    /** Repas facturés / (effectif × jours avec menu), en % */
    taux: number;
  }>;
  joursAvecMenu: number;
  topPlats: Array<{ plat: string; quantite: number }>;
  totaux: { repas: number; montant: number; nonConfirmes: number; coutMoyen: number };
}

export async function statistiquesAction(mois: string): Promise<Resultat<Statistiques>> {
  const ctx = await contexte();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur! };
  if (!periodeMois(mois)) return { success: false, message: "Mois invalide." };

  try {
    const liste = moisPrecedents(mois, 6);
    const debut = periodeMois(liste[0])!.debut;
    const { fin } = periodeMois(mois)!;
    const { debut: debutMois } = periodeMois(mois)!;

    const [lignes, { data: employes }, { data: menus }] = await Promise.all([
      getLignesFacturation(ctx.supabase, ctx.companyId, debut, fin),
      ctx.supabase.from("employes").select("service").eq("company_id", ctx.companyId).eq("is_active", true),
      ctx.supabase.from("menus_du_jour").select("date").eq("company_id", ctx.companyId).gte("date", debutMois).lte("date", fin),
    ]);

    const evolution = liste.map((m) => {
      const duMois = lignes.filter((l) => l.date.startsWith(m) && l.statut === "choisi");
      return { mois: m, repas: duMois.length, montant: duMois.reduce((a, l) => a + l.montant, 0) };
    });

    const lignesMois = lignes.filter((l) => l.date.startsWith(mois));
    const joursAvecMenu = new Set(((menus as any[]) || []).map((m) => m.date)).size;

    const effectifs = new Map<string, number>();
    for (const e of (employes as any[]) || []) effectifs.set(e.service || "Général", (effectifs.get(e.service || "Général") || 0) + 1);
    for (const l of lignesMois) if (!effectifs.has(l.service)) effectifs.set(l.service, 0);

    const services = Array.from(effectifs.entries())
      .map(([service, effectif]) => {
        const duService = lignesMois.filter((l) => l.service === service);
        const repas = duService.filter((l) => l.statut === "choisi").length;
        const possibles = effectif * joursAvecMenu;
        return {
          service,
          effectif,
          repas,
          absents: duService.filter((l) => l.statut === "absent" || l.statut === "ne_mange_pas").length,
          montant: duService.reduce((a, l) => a + l.montant, 0),
          taux: possibles > 0 ? Math.round((repas / possibles) * 100) : 0,
        };
      })
      .sort((a, b) => b.montant - a.montant || a.service.localeCompare(b.service, "fr"));

    const facturees = lignesMois.filter((l) => l.statut === "choisi");
    const montant = facturees.reduce((a, l) => a + l.montant, 0);

    return {
      success: true,
      data: {
        mois,
        evolution,
        services,
        joursAvecMenu,
        topPlats: regrouperParPlat(lignesMois)
          .slice(0, 5)
          .map(({ plat, quantite }) => ({ plat, quantite })),
        totaux: {
          repas: facturees.length,
          montant,
          nonConfirmes: lignesMois.filter((l) => l.statut === "non_confirme").length,
          coutMoyen: facturees.length > 0 ? Math.round(montant / facturees.length) : 0,
        },
      },
    };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------

export interface ParametresEntreprise {
  nom: string;
  heureOuverture: string;
  heureLimite: string;
  responsable: string;
  email: string;
  telephone: string;
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function modifierParametresAction(p: ParametresEntreprise): Promise<{ success: boolean; message?: string }> {
  const ctx = await contexte();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur };

  const nom = p.nom.trim();
  if (nom.length < 2) return { success: false, message: "Le nom de l'entreprise est obligatoire." };
  if (!HEURE.test(p.heureOuverture) || !HEURE.test(p.heureLimite)) {
    return { success: false, message: "Heures invalides (format HH:MM)." };
  }
  if (p.heureOuverture >= p.heureLimite) {
    return { success: false, message: "L'heure d'ouverture doit être avant l'heure de fin des commandes." };
  }
  const email = p.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: "Adresse e-mail invalide." };

  if (email) {
    const { data: autre } = await ctx.supabase
      .from("companies")
      .select("id")
      .eq("email_contact", email)
      .neq("id", ctx.companyId)
      .limit(1);
    if (autre && autre.length > 0) return { success: false, message: "Cet e-mail est déjà utilisé par une autre entreprise." };
  }

  const { error } = await (ctx.supabase.from("companies") as any)
    .update({
      nom,
      heure_ouverture_vote: `${p.heureOuverture}:00`,
      heure_limite_vote: `${p.heureLimite}:00`,
      responsable_nom: p.responsable.trim() || null,
      email_contact: email || null,
      telephone_contact: p.telephone.trim() || null,
    })
    .eq("id", ctx.companyId);
  if (error) return { success: false, message: error.message };

  revalidatePath("/rh");
  return { success: true };
}

export async function changerCodeRhAction(
  ancien: string,
  nouveau: string
): Promise<{ success: boolean; message?: string }> {
  const ctx = await contexte();
  if ("erreur" in ctx) return { success: false, message: ctx.erreur };
  if (nouveau.trim().length < 8) return { success: false, message: "Le nouveau code doit contenir au moins 8 caractères." };

  const { data: comp } = await ctx.supabase.from("companies").select("rh_code_hash").eq("id", ctx.companyId).single();
  if (!verifyRhCode(ancien, (comp as any)?.rh_code_hash ?? null)) {
    return { success: false, message: "Code actuel incorrect." };
  }

  const { error } = await (ctx.supabase.from("companies") as any)
    .update({ rh_code_hash: hashRhCode(nouveau) })
    .eq("id", ctx.companyId);
  if (error) return { success: false, message: error.message };
  return { success: true };
}
