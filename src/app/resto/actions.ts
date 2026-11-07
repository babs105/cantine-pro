"use server";

import { revalidatePath } from "next/cache";
import { accesPartenariatCompte, createClientCompteSession, echangerJetonRestaurant } from "@/lib/supabase/server";
import { lireEntrepriseVisible } from "@/lib/entreprise-visible";
import { hashRhCode } from "@/lib/rh-session";
import { createRestoSession } from "@/lib/resto-session";
import { normaliserTelephone } from "@/lib/telephone";
import { todayDakar } from "@/lib/config";
import {
  ajouterJours,
  isApresHeureLimite,
  isDateValide,
  joursOuvres,
  lundiDeLaSemaine,
  normaliserJoursTravail,
} from "@/lib/dates";

/**
 * Actions communes au lien restaurant (/resto/[token], une entreprise) et au dashboard du compte
 * restaurant (/resto, plusieurs entreprises). La cible désigne le partenariat concerné.
 */
export type CibleRestaurant = { token: string } | { restaurantId: string };

async function accesCible(cible: CibleRestaurant) {
  return "token" in cible ? echangerJetonRestaurant(cible.token) : accesPartenariatCompte(cible.restaurantId);
}

function revaliderCible(cible: CibleRestaurant) {
  revalidatePath("token" in cible ? `/resto/${cible.token}` : "/resto");
}

const LIEN_INVALIDE = "Accès restaurant invalide ou session expirée.";

/**
 * Validation 1-clic du traiteur : marque la clôture du jour comme confirmée
 */
export async function confirmerPreparationAction(
  cible: CibleRestaurant
): Promise<{ success: boolean; message?: string; confirmeAt?: string }> {
  const acces = await accesCible(cible);
  if (!acces) {
    return { success: false, message: LIEN_INVALIDE };
  }

  // L'heure enregistrée est fixée par la base (trigger proteger_cloture_restaurant)
  const { data, error } = await (acces.supabase.from("clotures") as any)
    .update({ confirme_at: new Date().toISOString(), confirme_par: "restaurant" })
    .eq("restaurant_id", acces.restaurantId)
    .eq("date", todayDakar())
    .select("id, confirme_at");

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data || data.length === 0) {
    return { success: false, message: "La commande du jour n'est pas encore clôturée par l'entreprise." };
  }

  revaliderCible(cible);
  return { success: true, confirmeAt: data[0].confirme_at };
}

export interface PlatCarte {
  id: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_active: boolean;
}

const CHAMPS_PLAT_CARTE = "id, titre, description, prix_unitaire, is_active";

/**
 * Ajout d'un plat à la carte du restaurant (le RH pourra le choisir pour son menu du jour)
 */
export async function ajouterPlatCarteAction(
  cible: CibleRestaurant,
  titre: string,
  prixUnitaire: number,
  description?: string
): Promise<{ success: boolean; message?: string; plat?: PlatCarte }> {
  const acces = await accesCible(cible);
  if (!acces) return { success: false, message: LIEN_INVALIDE };

  const titreNettoye = titre.trim().slice(0, 120);
  const descNettoyee = description?.trim().slice(0, 300) || null;
  const prix = Math.round(Number(prixUnitaire));
  if (!titreNettoye) return { success: false, message: "Indiquez le nom du plat." };
  if (!Number.isFinite(prix) || prix < 0 || prix > 100000) {
    return { success: false, message: "Prix invalide (entre 0 et 100 000 FCFA)." };
  }

  const { data, error } = await (acces.supabase.from("plats_restaurant") as any)
    .insert({
      company_id: acces.companyId,
      restaurant_id: acces.restaurantId,
      titre: titreNettoye,
      description: descNettoyee,
      prix_unitaire: prix,
    })
    .select(CHAMPS_PLAT_CARTE)
    .single();

  if (error) return { success: false, message: "Impossible d'ajouter le plat à la carte." };
  revaliderCible(cible);
  return { success: true, plat: data };
}

/**
 * Plat disponible ou non : un plat retiré n'est plus proposé au RH
 */
export async function basculerPlatCarteAction(
  cible: CibleRestaurant,
  platId: string,
  isActive: boolean
): Promise<{ success: boolean; message?: string }> {
  const acces = await accesCible(cible);
  if (!acces) return { success: false, message: LIEN_INVALIDE };

  const { error } = await (acces.supabase.from("plats_restaurant") as any)
    .update({ is_active: isActive })
    .eq("id", platId)
    .eq("restaurant_id", acces.restaurantId);

  if (error) return { success: false, message: "Modification impossible." };
  revaliderCible(cible);
  return { success: true };
}

/**
 * Suppression d'un plat de la carte (les menus déjà publiés par le RH ne sont pas touchés)
 */
export async function supprimerPlatCarteAction(
  cible: CibleRestaurant,
  platId: string
): Promise<{ success: boolean; message?: string }> {
  const acces = await accesCible(cible);
  if (!acces) return { success: false, message: LIEN_INVALIDE };

  const { error } = await (acces.supabase.from("plats_restaurant") as any)
    .delete()
    .eq("id", platId)
    .eq("restaurant_id", acces.restaurantId);

  if (error) return { success: false, message: "Suppression impossible." };
  revaliderCible(cible);
  return { success: true };
}

const SESSION_RESTO_EXPIREE = "Session expirée, reconnectez-vous.";

/**
 * Profil du compte restaurant : nom, WhatsApp (identifiant de connexion) et ville.
 * Le nom et le numéro sont recopiés sur chaque entreprise reliée (récapitulatifs WhatsApp).
 */
export async function modifierProfilRestoAction(champs: {
  nom: string;
  telephone: string;
  ville?: string;
}): Promise<{ success: boolean; message?: string }> {
  const session = await createClientCompteSession();
  if (!session) return { success: false, message: SESSION_RESTO_EXPIREE };

  const nom = champs.nom.trim().slice(0, 120);
  const telephone = normaliserTelephone(champs.telephone);
  if (nom.length < 2) return { success: false, message: "Indiquez le nom du restaurant." };
  if (!telephone || telephone.replace(/\D/g, "").length < 9) return { success: false, message: "Numéro WhatsApp invalide." };

  const { error } = await (session.supabase.from("comptes_restaurant") as any)
    .update({ nom, telephone_whatsapp: telephone, ville: champs.ville?.trim().slice(0, 60) || null })
    .eq("id", session.compteId);
  if (error) {
    return {
      success: false,
      message: /duplicate|unique/i.test(error.message) ? "Ce numéro est déjà utilisé par un autre restaurant." : "Enregistrement impossible.",
    };
  }

  await (session.supabase as any).rpc("synchroniser_compte_restaurant");
  revalidatePath("/resto");
  return { success: true };
}

/**
 * Changement du code d'accès. v1.10 (T7) : le compte ne lit plus son hash ; la fonction SQL
 * changer_code_compte_restaurant compare l'ancien code et limite les essais (5 en 15 min, erreur CP429).
 */
export async function changerCodeRestoAction(
  ancienCode: string,
  nouveauCode: string
): Promise<{ success: boolean; message?: string }> {
  const session = await createClientCompteSession();
  if (!session) return { success: false, message: SESSION_RESTO_EXPIREE };
  // Une Server Action peut être appelée avec n'importe quoi : types et longueurs vérifiés ici
  if (typeof ancienCode !== "string" || typeof nouveauCode !== "string") return { success: false, message: "Requête invalide." };
  if (!ancienCode.trim()) return { success: false, message: "Saisissez votre code actuel." };
  if (ancienCode.length > 200) return { success: false, message: "Code actuel incorrect." };
  if (nouveauCode.trim().length < 6) return { success: false, message: "Le nouveau code doit contenir au moins 6 caractères." };
  if (nouveauCode.length > 200) return { success: false, message: "Le nouveau code est trop long (200 caractères maximum)." };

  const { data: change, error } = await (session.supabase as any).rpc("changer_code_compte_restaurant", {
    p_ancien_hash: hashRhCode(ancienCode),
    p_nouveau_hash: hashRhCode(nouveauCode),
  });
  if (error?.code === "CP429") {
    return { success: false, message: "Trop de codes actuels incorrects. Réessayez dans 15 minutes." };
  }
  if (error) return { success: false, message: "Changement de code impossible pour le moment." };
  if (!change) return { success: false, message: "Code actuel incorrect." };
  // v1.10 (T8) : le changement révoque les sessions ouvertes avant ; ce navigateur reçoit un cookie neuf
  await createRestoSession(session.compteId);
  return { success: true };
}

/** Le compte connecté reprend un lien /resto/[token] reçu d'une entreprise avant son inscription */
export async function relierLienAction(token: string): Promise<{ success: boolean; message?: string }> {
  const session = await createClientCompteSession();
  if (!session) return { success: false, message: SESSION_RESTO_EXPIREE };

  const { data, error } = await (session.supabase as any).rpc("relier_lien_restaurant", { p_token: token });
  if (error) return { success: false, message: error.message.includes("déjà reliée") ? error.message : "Liaison impossible." };
  if (!data) return { success: false, message: "Ce lien est déjà relié à un autre compte restaurant." };

  revalidatePath("/resto");
  revalidatePath(`/resto/${token}`);
  return { success: true };
}

/**
 * Recopie la carte d'une entreprise vers une autre entreprise du même compte
 * (les plats déjà présents, même nom, ne sont pas dupliqués)
 */
export async function copierCarteAction(
  sourceRestaurantId: string,
  cibleRestaurantId: string
): Promise<{ success: boolean; message?: string; plats?: PlatCarte[] }> {
  if (sourceRestaurantId === cibleRestaurantId) return { success: false, message: "Choisissez une autre entreprise." };
  const [source, cible] = await Promise.all([
    accesPartenariatCompte(sourceRestaurantId),
    accesPartenariatCompte(cibleRestaurantId),
  ]);
  if (!source || !cible || source.compteId !== cible.compteId) return { success: false, message: SESSION_RESTO_EXPIREE };

  const [{ data: platsSource }, { data: platsCible }] = await Promise.all([
    source.supabase
      .from("plats_restaurant")
      .select("titre, description, prix_unitaire, is_active")
      .eq("restaurant_id", source.restaurantId)
      .order("created_at"),
    cible.supabase.from("plats_restaurant").select("titre").eq("restaurant_id", cible.restaurantId),
  ]);
  const existants = new Set(((platsCible as any[]) || []).map((p) => String(p.titre).toLowerCase()));
  const aCopier = ((platsSource as any[]) || []).filter((p) => !existants.has(String(p.titre).toLowerCase()));
  if (aCopier.length === 0) return { success: true, message: "Tous ces plats sont déjà sur la carte.", plats: [] };

  const { data, error } = await (cible.supabase.from("plats_restaurant") as any)
    .insert(aCopier.map((p) => ({ ...p, company_id: cible.companyId, restaurant_id: cible.restaurantId })))
    .select(CHAMPS_PLAT_CARTE);
  if (error) return { success: false, message: "Copie de la carte impossible." };

  revalidatePath("/resto");
  return { success: true, message: `${aCopier.length} plat(s) copié(s).`, plats: data || [] };
}


// ============================================================================
// MENUS DE LA SEMAINE PUBLIÉS PAR LE RESTAURANT
// Les plats sont écrits directement dans menus_du_jour de l'entreprise (ajoute_par = 'restaurant') :
// ils apparaissent aussitôt dans l'Espace RH et sur la page de commande des salariés.
// ============================================================================

export interface PlatMenuResto {
  id: string;
  date: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_available: boolean;
  ajoute_par: "rh" | "restaurant";
}

const CHAMPS_PLAT_MENU = "id, date, titre, description, prix_unitaire, is_available, ajoute_par";

type AccesPartenariat = NonNullable<Awaited<ReturnType<typeof accesPartenariatCompte>>>;

/**
 * Un jour se modifie s'il n'est pas passé ; aujourd'hui, seulement avant l'heure limite
 * des commandes de l'entreprise et tant que la journée n'est pas clôturée pour ce restaurant.
 */
async function verifierJourModifiable(acces: AccesPartenariat, date: string): Promise<string | null> {
  const today = todayDakar();
  if (!isDateValide(date) || date < today) return "Ce jour est passé : son menu n'est plus modifiable.";
  if (date > today) return null;

  const [comp, { data: cloture }] = await Promise.all([
    // v1.10 (T14) : entreprise_visible, plus la table companies
    lireEntrepriseVisible(acces.supabase),
    acces.supabase.from("clotures").select("id").eq("restaurant_id", acces.restaurantId).eq("date", today).maybeSingle(),
  ]);
  // Heure limite inconnue : on refuse plutôt que de supposer 11h10 (l'entreprise peut fermer plus tôt)
  if (!comp) return "Impossible de vérifier l'heure limite des commandes. Réessayez dans un instant.";
  if (cloture) return "La journée est clôturée : le menu d'aujourd'hui n'est plus modifiable.";
  if (isApresHeureLimite(comp.heure_limite_vote)) {
    return "L'heure limite des commandes est passée : le menu d'aujourd'hui n'est plus modifiable.";
  }
  return null;
}

/** Ajoute un plat de la carte (de cette entreprise) au menu d'un jour */
export async function ajouterPlatMenuRestoAction(
  restaurantId: string,
  date: string,
  platCarteId: string
): Promise<{ success: boolean; message?: string; plat?: PlatMenuResto }> {
  const acces = await accesPartenariatCompte(restaurantId);
  if (!acces) return { success: false, message: SESSION_RESTO_EXPIREE };

  const blocage = await verifierJourModifiable(acces, date);
  if (blocage) return { success: false, message: blocage };

  const { data: platCarte } = await acces.supabase
    .from("plats_restaurant")
    .select("titre, description, prix_unitaire")
    .eq("id", platCarteId)
    .eq("restaurant_id", acces.restaurantId)
    .eq("is_active", true)
    .maybeSingle();
  const pc = platCarte as { titre: string; description: string | null; prix_unitaire: number } | null;
  if (!pc) return { success: false, message: "Ce plat n'est plus disponible sur votre carte." };

  const { data: doublon } = await acces.supabase
    .from("menus_du_jour")
    .select("id")
    .eq("company_id", acces.companyId)
    .eq("restaurant_id", acces.restaurantId)
    .eq("date", date)
    .eq("titre", pc.titre)
    .limit(1);
  if (doublon && doublon.length > 0) return { success: false, message: "Ce plat est déjà au menu ce jour-là." };

  const { data, error } = await (acces.supabase.from("menus_du_jour") as any)
    .insert({
      company_id: acces.companyId,
      restaurant_id: acces.restaurantId,
      date,
      titre: pc.titre,
      description: pc.description,
      prix_unitaire: pc.prix_unitaire,
      is_available: true,
      ajoute_par: "restaurant",
    })
    .select(CHAMPS_PLAT_MENU)
    .single();
  if (error) return { success: false, message: "Impossible d'ajouter le plat au menu." };

  revalidatePath("/resto");
  revalidatePath("/rh");
  return { success: true, plat: data };
}

/** Rupture de stock / remise en vente d'un plat du menu */
export async function basculerPlatMenuRestoAction(
  restaurantId: string,
  menuId: string,
  disponible: boolean
): Promise<{ success: boolean; message?: string }> {
  const acces = await accesPartenariatCompte(restaurantId);
  if (!acces) return { success: false, message: SESSION_RESTO_EXPIREE };

  const { data: plat } = await acces.supabase
    .from("menus_du_jour")
    .select("date")
    .eq("id", menuId)
    .eq("restaurant_id", acces.restaurantId)
    .maybeSingle();
  if (!plat) return { success: false, message: "Plat introuvable." };
  const blocage = await verifierJourModifiable(acces, (plat as any).date);
  if (blocage) return { success: false, message: blocage };

  const { error } = await (acces.supabase.from("menus_du_jour") as any)
    .update({ is_available: disponible })
    .eq("id", menuId)
    .eq("restaurant_id", acces.restaurantId);
  if (error) return { success: false, message: "Modification impossible." };

  revalidatePath("/resto");
  revalidatePath("/rh");
  return { success: true };
}

/** Retire un plat du menu, seulement si aucun salarié ne l'a encore commandé (sinon : rupture) */
export async function retirerPlatMenuRestoAction(
  restaurantId: string,
  menuId: string
): Promise<{ success: boolean; message?: string }> {
  const acces = await accesPartenariatCompte(restaurantId);
  if (!acces) return { success: false, message: SESSION_RESTO_EXPIREE };

  const { data: plat } = await acces.supabase
    .from("menus_du_jour")
    .select("date")
    .eq("id", menuId)
    .eq("restaurant_id", acces.restaurantId)
    .maybeSingle();
  if (!plat) return { success: false, message: "Plat introuvable." };
  const blocage = await verifierJourModifiable(acces, (plat as any).date);
  if (blocage) return { success: false, message: blocage };

  const { count } = await acces.supabase
    .from("commandes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", acces.companyId)
    .eq("plat_id", menuId);
  if ((count ?? 0) > 0) {
    return { success: false, message: "Des salariés ont déjà commandé ce plat : marquez-le plutôt en rupture." };
  }

  const { error } = await (acces.supabase.from("menus_du_jour") as any)
    .delete()
    .eq("id", menuId)
    .eq("restaurant_id", acces.restaurantId);
  if (error) return { success: false, message: "Suppression impossible." };

  revalidatePath("/resto");
  revalidatePath("/rh");
  return { success: true };
}

/** Recopie les plats du restaurant de la semaine précédente sur les jours encore modifiables de la semaine */
export async function copierSemainePrecedenteRestoAction(
  restaurantId: string,
  lundiCible: string
): Promise<{ success: boolean; message?: string; plats?: PlatMenuResto[] }> {
  if (!isDateValide(lundiCible)) return { success: false, message: "Semaine invalide." };
  const acces = await accesPartenariatCompte(restaurantId);
  if (!acces) return { success: false, message: SESSION_RESTO_EXPIREE };

  const lundi = lundiDeLaSemaine(lundiCible);
  const today = todayDakar();
  const comp = await lireEntrepriseVisible(acces.supabase);
  // Jours de travail inconnus : on ne copie pas sur des jours supposés
  if (!comp) return { success: false, message: "Entreprise momentanément indisponible, réessayez." };
  const joursCibles = new Set(joursOuvres(lundi, normaliserJoursTravail(comp.jours_travail)));

  const { data: existants } = await acces.supabase
    .from("menus_du_jour")
    .select("date, titre, description, prix_unitaire")
    .eq("company_id", acces.companyId)
    .eq("restaurant_id", acces.restaurantId)
    .gte("date", ajouterJours(lundi, -7))
    .lte("date", ajouterJours(lundi, 6));
  const tous = ((existants as any[]) || []);
  const dejaPresents = new Set(tous.filter((p) => p.date >= lundi).map((p) => `${p.date}|${p.titre}`));

  // Aujourd'hui n'est recopié que s'il est encore modifiable (avant l'heure limite, pas clôturé)
  const aujourdhuiModifiable = joursCibles.has(today) ? !(await verifierJourModifiable(acces, today)) : false;

  const aInserer = tous
    .filter((p) => p.date < lundi)
    .map((p) => ({ ...p, date: ajouterJours(p.date, 7) }))
    .filter(
      (p) =>
        joursCibles.has(p.date) &&
        (p.date > today || (p.date === today && aujourdhuiModifiable)) &&
        !dejaPresents.has(`${p.date}|${p.titre}`)
    )
    .map((p) => ({
      company_id: acces.companyId,
      restaurant_id: acces.restaurantId,
      date: p.date,
      titre: p.titre,
      description: p.description,
      prix_unitaire: p.prix_unitaire,
      is_available: true,
      ajoute_par: "restaurant",
    }));

  if (aInserer.length === 0) {
    return {
      success: false,
      message: tous.some((p) => p.date < lundi)
        ? "Rien à recopier : ces plats sont déjà au menu ou les jours sont passés."
        : "Vous n'aviez aucun plat au menu la semaine précédente.",
    };
  }

  const { data, error } = await (acces.supabase.from("menus_du_jour") as any)
    .insert(aInserer)
    .select(CHAMPS_PLAT_MENU);
  if (error) return { success: false, message: "Copie de la semaine impossible." };

  revalidatePath("/resto");
  revalidatePath("/rh");
  return { success: true, message: `${aInserer.length} plat(s) ajouté(s) au menu.`, plats: data || [] };
}
