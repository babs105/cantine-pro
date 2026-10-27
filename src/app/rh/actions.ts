"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateToken, isSupabaseConfigured, todayDakar, getAppBaseUrl } from "@/lib/config";
import { ajouterJours, isDateValide, joursOuvres, lundiDeLaSemaine, normaliserJoursTravail } from "@/lib/dates";
import { getRhCompanyId } from "@/lib/rh-session";
import { lignesVersEmployes, parseCsv, parseFichierEmployes, type LigneEmploye } from "@/lib/excel";
import { cloturerEntreprise, rafraichirRecapCloture } from "@/lib/cloture";
import { placesRestantes } from "@/lib/limite-employes";
import { etatAbonnement } from "@/lib/abonnement";
import { isApresHeureLimite } from "@/lib/dates";

const CHAMPS_EMPLOYE = "id, nom, telephone, service, token, is_active";
const CHAMPS_PLAT = "id, date, titre, description, prix_unitaire, is_available, restaurant_id";
const CHAMPS_RESTAURANT = "id, nom, telephone_whatsapp, heure_livraison, token, is_active";
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
    const places = await placesRestantes(supabase, companyId);
    if (places.restantes < 1) return { success: false, message: places.message };

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

    const places = await placesRestantes(supabase, companyId);
    if (nouveaux.length > places.restantes) {
      return { success: false, message: `${nouveaux.length} nouveaux salariés à importer. ${places.message}` };
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
  date?: string,
  restaurantId?: string
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
        restaurant_id: restaurantId || null,
      },
    };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  try {
    const supabase = await createClient();
    const { data: resto } = await supabase
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId ?? "")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .maybeSingle();
    if (!resto) {
      return { success: false, message: "Choisissez le restaurant qui prépare ce plat." };
    }

    const { data, error } = await (supabase.from("menus_du_jour") as any)
      .insert({
        company_id: companyId,
        restaurant_id: restaurantId,
        titre,
        description: description || null,
        prix_unitaire: prixUnitaire,
        is_available: true,
        date: targetDate,
      })
      .select(CHAMPS_PLAT)
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

  const supabase = await createClient();
  const { data: comp } = await supabase.from("companies").select("jours_travail").eq("id", companyId).single();
  // Seuls les jours de travail de l'entreprise sont recopiés
  const joursCibles = new Set(joursOuvres(lundi, normaliserJoursTravail((comp as any)?.jours_travail)));

  const { data: platsExistants } = await supabase
    .from("menus_du_jour")
    .select("date, titre, description, prix_unitaire, restaurant_id")
    .eq("company_id", companyId)
    .gte("date", ajouterJours(lundi, -7))
    .lte("date", ajouterJours(lundi, 6));

  const tous = (platsExistants || []) as any[];
  const joursDejaRemplis = new Set(tous.filter((p) => p.date >= lundi).map((p) => p.date));

  const aInserer = tous
    .filter((p) => p.date < lundi)
    .map((p) => ({ ...p, date: ajouterJours(p.date, 7) }))
    .filter((p) => joursCibles.has(p.date) && p.date >= today && !joursDejaRemplis.has(p.date))
    .map((p) => ({
      company_id: companyId,
      date: p.date,
      titre: p.titre,
      description: p.description,
      prix_unitaire: p.prix_unitaire,
      restaurant_id: p.restaurant_id,
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
    .select(CHAMPS_PLAT);

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
): Promise<{ success: boolean; message?: string; aRenvoyer?: string[] }> {
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

  // Une commande est figée dès que son restaurant a confirmé (lui-même ou par téléphone) :
  // on refuse si l'ancien plat ou le nouveau plat appartient à un restaurant confirmé
  const { data: confirmees } = await (supabase.from("clotures") as any)
    .select("restaurant_id, restaurants(nom)")
    .eq("company_id", companyId)
    .eq("date", today)
    .not("confirme_at", "is", null);
  if (confirmees && confirmees.length > 0) {
    const { data: actuelle } = await supabase
      .from("commandes")
      .select("menus_du_jour(restaurant_id)")
      .eq("employe_id", employeId)
      .eq("date", today)
      .maybeSingle();
    const { data: nouveauPlat } = platId
      ? await supabase.from("menus_du_jour").select("restaurant_id").eq("id", platId).maybeSingle()
      : { data: null };
    const touches = [
      (actuelle as any)?.menus_du_jour?.restaurant_id,
      statut === "choisi" ? (nouveauPlat as any)?.restaurant_id : null,
    ];
    const bloquante = (confirmees as any[]).find((c) => touches.includes(c.restaurant_id));
    if (bloquante) {
      return {
        success: false,
        message: `${bloquante.restaurants?.nom || "Le restaurant"} a déjà confirmé sa commande : modification impossible.`,
      };
    }
  }

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

  // Journée déjà clôturée : les récaps des restaurants non confirmés suivent la modification
  const aRenvoyer = await rafraichirRecapCloture(supabase, companyId, today);
  revalidatePath("/rh");
  return { success: true, aRenvoyer };
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

/**
 * Ajout d'un restaurant partenaire (il reçoit le récapitulatif de ses plats à la clôture)
 */
export async function addRestaurantAction(
  nom: string,
  telephone?: string,
  heureLivraison?: string
): Promise<{ success: boolean; message?: string; restaurant?: any }> {
  const nomPropre = nom.trim().slice(0, 80);
  if (nomPropre.length < 2) return { success: false, message: "Renseignez le nom du restaurant." };
  const heure = /^\d{2}:\d{2}/.test(heureLivraison || "") ? heureLivraison!.slice(0, 5) : "12:30";

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      restaurant: {
        id: "resto-mock-" + Date.now(),
        nom: nomPropre,
        telephone_whatsapp: normaliserTelephone(telephone),
        heure_livraison: `${heure}:00`,
        token: "token-demo-resto",
        is_active: true,
      },
    };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = await createClient();
  const { data, error } = await (supabase.from("restaurants") as any)
    .insert({
      company_id: companyId,
      nom: nomPropre,
      telephone_whatsapp: normaliserTelephone(telephone),
      heure_livraison: heure,
      token: generateToken(12),
    })
    .select(CHAMPS_RESTAURANT)
    .single();

  if (error) return { success: false, message: error.message };

  revalidatePath("/rh");
  return { success: true, restaurant: data };
}

/**
 * Modification d'un restaurant (téléphone WhatsApp, heure de livraison, activation)
 */
export async function modifierRestaurantAction(
  restaurantId: string,
  champs: { nom?: string; telephone?: string; heureLivraison?: string; isActive?: boolean }
): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const update: Record<string, unknown> = {};
  if (champs.nom !== undefined && champs.nom.trim().length >= 2) update.nom = champs.nom.trim().slice(0, 80);
  if (champs.telephone !== undefined) update.telephone_whatsapp = normaliserTelephone(champs.telephone);
  if (champs.heureLivraison && /^\d{2}:\d{2}/.test(champs.heureLivraison)) {
    update.heure_livraison = champs.heureLivraison.slice(0, 5);
  }
  if (champs.isActive !== undefined) update.is_active = champs.isActive;

  const supabase = await createClient();
  const { error } = await (supabase.from("restaurants") as any)
    .update(update)
    .eq("id", restaurantId)
    .eq("company_id", companyId);

  revalidatePath("/rh");
  return { success: !error, message: error?.message };
}

/**
 * Clôture manuelle de la journée par le RH (après l'heure limite) : fige un récapitulatif par restaurant.
 * Rien n'est envoyé automatiquement : le RH envoie ensuite chaque récap via WhatsApp depuis l'Espace RH.
 * Peut être relancée (ex : restaurant ajouté après coup) sans toucher aux récaps déjà envoyés.
 */
export async function cloturerJourneeAction(): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Disponible une fois Supabase connecté." };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("*").eq("id", companyId).single();
  if (!company) return { success: false, message: "Entreprise introuvable." };

  // Impayé à J+3 ou compte suspendu : la commande n'est plus transmise aux restaurants
  const abonnement = etatAbonnement(company as any, todayDakar());
  if (abonnement.envoiBloque) {
    return {
      success: false,
      message: `${abonnement.libelle} : l'envoi aux restaurants est suspendu. Réglez l'abonnement (onglet Paramètres).`,
    };
  }

  const heureLimite = (company as any).heure_limite_vote as string;
  if (!isApresHeureLimite(heureLimite)) {
    return {
      success: false,
      message: `Les commandes sont ouvertes jusqu'à ${heureLimite.slice(0, 5).replace(":", "h")} : clôture possible après.`,
    };
  }

  try {
    const clotures = await cloturerEntreprise(supabase, company as any, todayDakar(), { envoyer: false });
    if (clotures.length === 0) {
      return { success: false, message: "Aucun menu publié aujourd'hui : rien à clôturer." };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }

  revalidatePath("/rh");
  return { success: true };
}

/**
 * Le RH vient d'ouvrir WhatsApp pour envoyer le récap à un restaurant : on note l'heure d'envoi
 */
export async function marquerRecapEnvoyeAction(restaurantId: string): Promise<{ success: boolean }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false };

  const supabase = await createClient();
  const { error } = await (supabase.from("clotures") as any)
    .update({ envoi_statut: "envoye", envoi_erreur: null, envoye_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("restaurant_id", restaurantId)
    .eq("date", todayDakar());

  revalidatePath("/rh");
  return { success: !error };
}

/**
 * Le restaurant a validé la commande par téléphone : le RH confirme à sa place.
 * La confirmation est tracée « par le RH » (distincte d'un clic du restaurant sur son lien).
 */
export async function confirmerParTelephoneAction(
  restaurantId: string
): Promise<{ success: boolean; message?: string }> {
  if (!isSupabaseConfigured()) return { success: true };

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = await createClient();
  const { data, error } = await (supabase.from("clotures") as any)
    .update({ confirme_at: new Date().toISOString(), confirme_par: "rh" })
    .eq("company_id", companyId)
    .eq("restaurant_id", restaurantId)
    .eq("date", todayDakar())
    .is("confirme_at", null)
    .select("id");

  if (error) return { success: false, message: error.message };
  if (!data || data.length === 0) {
    return { success: false, message: "Rien à confirmer : la journée n'est pas clôturée ou c'est déjà confirmé." };
  }

  revalidatePath("/rh");
  return { success: true };
}

/**
 * Relance « Dernier rappel » à 10h30 : ouvre WhatsApp avec un message pré-rempli
 * ciblant les collaborateurs qui n'ont pas encore commandé.
 */
export async function envoyerRelanceDernierRappelAction(): Promise<{ success: boolean; message?: string; url?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, url: "https://wa.me/?text=Demo" };
  }

  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("nom, slug, heure_limite_vote")
    .eq("id", companyId)
    .single();

  if (!company) return { success: false, message: "Entreprise introuvable." };

  const today = todayDakar();

  // Collaborateurs actifs sans commande pour aujourd'hui
  const { data: employesSansCommande } = await supabase
    .from("employes")
    .select("id, nom, telephone")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (!employesSansCommande || employesSansCommande.length === 0) {
    return { success: false, message: "Aucun collaborateur actif." };
  }

  const { data: commandesDuJour } = await supabase
    .from("commandes")
    .select("employe_id")
    .eq("company_id", companyId)
    .eq("date", today);

  const dejaCommande = new Set((commandesDuJour || []).map((c: any) => c.employe_id));
  const aRelancer = (employesSansCommande as any[])
    .filter((e) => !dejaCommande.has(e.id) && e.telephone)
    .map((e) => e.nom);

  if (aRelancer.length === 0) {
    return { success: false, message: "Tout le monde a déjà commandé !" };
  }

  const comp: any = company;
  const lienPortail = `${getAppBaseUrl()}/c/${comp.slug}`;
  const heureLimite = (comp.heure_limite_vote || "11:10:00").slice(0, 5).replace(":", "h");

  const message = `⏰ *DERNIER RAPPEL — ${String(comp.nom).toUpperCase()}*\n` +
    `Les commandes ferment à *${heureLimite}* !\n\n` +
    `👉 Choisissez ici : ${lienPortail}\n\n` +
    `_Sans réponse = « Ne mange pas » pour la facturation._`;

  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  return { success: true, url, message: `${aRelancer.length} collaborateur(s) concerné(s)` };
}
