"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateToken, isSupabaseConfigured, todayDakar } from "@/lib/config";
import { ajouterJours, isDateValide, joursOuvres, lundiDeLaSemaine } from "@/lib/dates";
import { getRhCompanyId } from "@/lib/rh-session";
import { lignesVersEmployes, parseCsv, parseFichierEmployes, type LigneEmploye } from "@/lib/excel";
import { rafraichirRecapCloture } from "@/lib/cloture";

const CHAMPS_EMPLOYE = "id, nom, telephone, service, token, is_active";
const SERVICE_DEFAUT = "Général";

const SESSION_EXPIREE = "Session RH expirée, reconnectez-vous.";

function normaliserTelephone(telephone?: string): string | null {
  const t = telephone?.replace(/[^\d+]/g, "");
  if (!t) return null;
  // Numéro local sénégalais à 9 chiffres (77 123 45 67) -> +221
  if (/^\d{9}$/.test(t)) return `+221${t}`;
  if (t.startsWith("00")) return `+${t.slice(2)}`;
  return t.startsWith("+") ? t : `+${t}`;
}

/**
 * Ajout d'un nouvel employé
 */
export async function addEmployeAction(
  nom: string,
  telephone?: string,
  service?: string
): Promise<{ success: boolean; message?: string; employe?: any }> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      employe: {
        id: "mock-" + Date.now(),
        nom,
        telephone: normaliserTelephone(telephone),
        service: service?.trim() || SERVICE_DEFAUT,
        token: "token-" + Math.random().toString(36).substring(2, 10),
        is_active: true,
      },
    };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.from("employes") as any)
      .insert({
        company_id: companyId,
        nom,
        telephone: normaliserTelephone(telephone),
        service: service?.trim() || SERVICE_DEFAUT,
        token: generateToken(),
        is_active: true,
      })
      .select(CHAMPS_EMPLOYE)
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/rh");
    return { success: true, employe: data };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Import en masse d'employés depuis un fichier Excel (.xlsx), CSV, ou un texte collé.
 * Colonnes reconnues : Nom, Prénom, Téléphone, Service. Les doublons (même nom) sont ignorés.
 */
export async function importEmployesAction(
  formData: FormData
): Promise<{ success: boolean; message?: string; employes?: any[]; ignores?: number }> {
  let lignes: LigneEmploye[];
  try {
    const fichier = formData.get("fichier");
    const texte = String(formData.get("texte") || "");
    if (fichier instanceof File && fichier.size > 0) {
      if (fichier.size > 5 * 1024 * 1024) {
        return { success: false, message: "Fichier trop volumineux (5 Mo maximum)." };
      }
      lignes = await parseFichierEmployes(fichier);
    } else {
      lignes = lignesVersEmployes(parseCsv(texte));
    }
  } catch (err: any) {
    return { success: false, message: err.message || "Fichier illisible." };
  }

  if (lignes.length === 0) {
    return { success: false, message: "Aucun employé trouvé. Vérifiez la colonne « Nom »." };
  }

  const versEmploye = (r: LigneEmploye) => ({
    nom: r.nom,
    telephone: normaliserTelephone(r.telephone),
    service: r.service || SERVICE_DEFAUT,
    token: generateToken(),
    is_active: true,
  });

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      ignores: 0,
      employes: lignes.map((r, i) => ({ id: "imported-" + Date.now() + "-" + i, ...versEmploye(r) })),
    };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  try {
    const supabase = await createClient();
    const { data: existants } = await supabase
      .from("employes")
      .select("nom")
      .eq("company_id", companyId)
      .eq("is_active", true);

    const cle = (nom: string) => nom.toLowerCase().replace(/\s+/g, " ").trim();
    const dejaLa = new Set((existants || []).map((e: any) => cle(e.nom)));
    const nouveaux = lignes.filter((r) => {
      const k = cle(r.nom);
      if (dejaLa.has(k)) return false;
      dejaLa.add(k);
      return true;
    });

    if (nouveaux.length === 0) {
      return { success: true, employes: [], ignores: lignes.length };
    }

    const { data, error } = await (supabase.from("employes") as any)
      .insert(nouveaux.map((r) => ({ company_id: companyId, ...versEmploye(r) })))
      .select(CHAMPS_EMPLOYE);

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/rh");
    return { success: true, employes: data, ignores: lignes.length - nouveaux.length };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Changement de service d'un employé (ventilation paie)
 */
export async function modifierServiceEmployeAction(
  employeId: string,
  service: string
): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false };

  const supabase = await createClient();
  const { error } = await (supabase.from("employes") as any)
    .update({ service: service.trim().slice(0, 60) || SERVICE_DEFAUT })
    .eq("id", employeId)
    .eq("company_id", companyId);

  revalidatePath("/rh");
  return { success: !error };
}

/**
 * Désactivation d'un employé (départ, doublon) : son lien magique ne fonctionne plus
 */
export async function desactiverEmployeAction(employeId: string): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false };

  const supabase = await createClient();
  const { error } = await (supabase.from("employes") as any)
    .update({ is_active: false })
    .eq("id", employeId)
    .eq("company_id", companyId);

  revalidatePath("/rh");
  return { success: !error };
}

/**
 * Ajout d'un plat au menu du jour
 */
export async function addMenuPlatAction(
  titre: string,
  prixUnitaire: number,
  description?: string,
  date?: string
): Promise<{ success: boolean; message?: string; plat?: any }> {
  const today = todayDakar();
  const targetDate = isDateValide(date) ? date : today;
  if (targetDate < today) {
    return { success: false, message: "Impossible de modifier le menu d'un jour passé." };
  }

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      plat: {
        id: "plat-mock-" + Date.now(),
        titre,
        description: description || null,
        prix_unitaire: prixUnitaire,
        is_available: true,
        date: targetDate,
      },
    };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.from("menus_du_jour") as any)
      .insert({
        company_id: companyId,
        titre,
        description: description || null,
        prix_unitaire: prixUnitaire,
        is_available: true,
        date: targetDate,
      })
      .select("id, date, titre, description, prix_unitaire, is_available")
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/rh");
    return { success: true, plat: data };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Duplique les menus de la semaine précédente sur la semaine du lundi donné.
 * Les jours qui ont déjà des plats et les jours passés ne sont pas touchés.
 */
export async function dupliquerSemaineAction(lundiCible: string): Promise<{
  success: boolean;
  message?: string;
  plats?: any[];
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Disponible une fois Supabase connecté." };
  }
  if (!isDateValide(lundiCible)) return { success: false, message: "Semaine invalide." };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const lundi = lundiDeLaSemaine(lundiCible);
  const today = todayDakar();
  const joursCibles = joursOuvres(lundi);
  const joursSource = joursOuvres(ajouterJours(lundi, -7));

  const supabase = await createClient();
  const { data: platsExistants } = await supabase
    .from("menus_du_jour")
    .select("date, titre, description, prix_unitaire")
    .eq("company_id", companyId)
    .gte("date", joursSource[0])
    .lte("date", joursCibles[4]);

  const tous = (platsExistants || []) as any[];
  const joursDejaRemplis = new Set(tous.filter((p) => p.date >= lundi).map((p) => p.date));

  const aInserer = tous
    .filter((p) => p.date < lundi)
    .map((p) => ({ ...p, date: ajouterJours(p.date, 7) }))
    .filter((p) => p.date >= today && !joursDejaRemplis.has(p.date))
    .map((p) => ({
      company_id: companyId,
      date: p.date,
      titre: p.titre,
      description: p.description,
      prix_unitaire: p.prix_unitaire,
      is_available: true,
    }));

  if (aInserer.length === 0) {
    return {
      success: false,
      message: tous.some((p) => p.date < lundi)
        ? "Tous les jours de la semaine ont déjà un menu."
        : "La semaine précédente n'a aucun menu à dupliquer.",
    };
  }

  const { data, error } = await (supabase.from("menus_du_jour") as any)
    .insert(aInserer)
    .select("id, date, titre, description, prix_unitaire, is_available");

  if (error) return { success: false, message: error.message };

  revalidatePath("/rh");
  return { success: true, plats: data };
}

/**
 * Suppression d'un plat sans commande (sinon : le désactiver)
 */
export async function supprimerPlatAction(platId: string): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = await createClient();
  const { count } = await supabase
    .from("commandes")
    .select("id", { count: "exact", head: true })
    .eq("plat_id", platId);

  if (count && count > 0) {
    return { success: false, message: "Ce plat a déjà des commandes : désactivez-le plutôt." };
  }

  const { error } = await (supabase.from("menus_du_jour") as any)
    .delete()
    .eq("id", platId)
    .eq("company_id", companyId);

  revalidatePath("/rh");
  return { success: !error, message: error?.message };
}

/**
 * Modification manuelle d'un vote par le RH (employé qui appelle, oubli...).
 * Autorisée même après l'heure limite ; si la clôture est déjà faite, son récapitulatif est recalculé.
 */
export async function modifierCommandeRhAction(
  employeId: string,
  statut: "choisi" | "absent" | "ne_mange_pas" | "en_attente",
  platId: string | null
): Promise<{ success: boolean; message?: string; clotureMiseAJour?: boolean }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = await createClient();
  const today = todayDakar();

  const { data: emp } = await supabase
    .from("employes")
    .select("id")
    .eq("id", employeId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!emp) return { success: false, message: "Collaborateur introuvable." };

  if (statut === "en_attente") {
    const { error } = await (supabase.from("commandes") as any)
      .delete()
      .eq("employe_id", employeId)
      .eq("date", today);
    if (error) return { success: false, message: error.message };
  } else {
    if (statut === "choisi") {
      const { data: plat } = await supabase
        .from("menus_du_jour")
        .select("id")
        .eq("id", platId ?? "")
        .eq("company_id", companyId)
        .eq("date", today)
        .maybeSingle();
      if (!plat) return { success: false, message: "Plat introuvable dans le menu du jour." };
    }

    const { error } = await (supabase.from("commandes") as any).upsert(
      {
        company_id: companyId,
        employe_id: employeId,
        plat_id: statut === "choisi" ? platId : null,
        date: today,
        statut,
        modifie_par_rh: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employe_id,date" }
    );
    if (error) return { success: false, message: error.message };
  }

  const clotureMiseAJour = await rafraichirRecapCloture(supabase, companyId, today);
  revalidatePath("/rh");
  return { success: true, clotureMiseAJour };
}

/**
 * Basculer la disponibilité d'un plat (rupture de stock)
 */
export async function togglePlatDisponibiliteAction(
  platId: string,
  isAvailable: boolean
): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured()) {
    return { success: true };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false };

  try {
    const supabase = await createClient();
    const { error } = await (supabase.from("menus_du_jour") as any)
      .update({ is_available: isAvailable })
      .eq("id", platId)
      .eq("company_id", companyId);

    revalidatePath("/rh");
    return { success: !error };
  } catch {
    return { success: false };
  }
}
