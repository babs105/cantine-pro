import "server-only";
import { serverClient, type SupabaseServeur } from "./client-serveur";
import { getRhCompanyId, hashRhCode } from "@/lib/rh-session";
import { getRestoCompteId } from "@/lib/resto-session";
import { signerJetonSupabase, type ClaimsCantine } from "./jeton";

export type { SupabaseServeur };

/**
 * Clients Supabase côté serveur avec la clé anon : la RLS s'applique à chaque requête.
 *
 * Pattern hybride : l'identifiant reçu (cookie RH, token salarié ou restaurant dans l'URL)
 * est d'abord échangé contre des identifiants par une fonction SQL SECURITY DEFINER, puis le serveur
 * signe un JWT court dont les claims (role_app, company_id, employe_id, restaurant_id) filtrent les tables.
 * Le JWT ne quitte jamais le serveur. La clé service_role est réservée à ./admin.ts.
 */

/** Client portant les claims donnés (sans vérification : réservé aux identifiants déjà échangés) */
export function createClientAvecClaims(claims: ClaimsCantine): SupabaseServeur {
  return serverClient(signerJetonSupabase(claims));
}

/** Client RH de l'entreprise connectée (cookie de session RH déjà vérifié par getRhCompanyId) */
export function createClientRh(companyId: string): SupabaseServeur {
  return createClientAvecClaims({ role_app: "rh", company_id: companyId });
}

/** Client RH à partir du cookie de session, ou null si le RH n'est pas connecté */
export async function createClientRhSession(): Promise<{ companyId: string; supabase: SupabaseServeur } | null> {
  const companyId = await getRhCompanyId();
  if (!companyId) return null;
  return { companyId, supabase: createClientRh(companyId) };
}

/** Code SQLSTATE levé par controler_tentatives : identifiant bloqué après 5 échecs en 15 minutes */
const CODE_TROP_DE_TENTATIVES = "CP429";

/** Connexion refusée parce que l'identifiant est temporairement bloqué ; le message est lisible par l'utilisateur */
export class TropDeTentativesError extends Error {}

/** Appelle une fonction d'échange SECURITY DEFINER avec la clé anon (le type Database ne décrit pas les fonctions) */
async function appelerEchange<T>(fonction: string, args: Record<string, string>): Promise<T | null> {
  const { data, error } = await (serverClient() as any).rpc(fonction, args);
  if (error?.code === CODE_TROP_DE_TENTATIVES) throw new TropDeTentativesError(error.message);
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

/** Échange identifiant + code RH contre l'id de l'entreprise, ou null si incorrect */
export async function echangerAccesRh(identifiant: string, code: string): Promise<string | null> {
  return appelerEchange<string>("echanger_acces_rh", { p_identifiant: identifiant, p_code_hash: hashRhCode(code) });
}

/** Échange le token du lien magique salarié contre un client limité à ce salarié */
export async function echangerJetonSalarie(
  token: string
): Promise<{ employeId: string; companyId: string; supabase: SupabaseServeur } | null> {
  const lignes = await appelerEchange<Array<{ employe_id: string; company_id: string }>>("echanger_jeton_salarie", {
    p_token: token,
  });
  const ligne = lignes?.[0];
  if (!ligne) return null;
  return {
    employeId: ligne.employe_id,
    companyId: ligne.company_id,
    supabase: createClientAvecClaims({ role_app: "salarie", company_id: ligne.company_id, employe_id: ligne.employe_id }),
  };
}

/** Échange le token du lien restaurant contre un client limité à ce restaurant */
export async function echangerJetonRestaurant(
  token: string
): Promise<{ restaurantId: string; companyId: string; supabase: SupabaseServeur } | null> {
  const lignes = await appelerEchange<Array<{ restaurant_id: string; company_id: string }>>(
    "echanger_jeton_restaurant",
    { p_token: token }
  );
  const ligne = lignes?.[0];
  if (!ligne) return null;
  return {
    restaurantId: ligne.restaurant_id,
    companyId: ligne.company_id,
    supabase: createClientAvecClaims({
      role_app: "restaurant",
      company_id: ligne.company_id,
      restaurant_id: ligne.restaurant_id,
    }),
  };
}

/** Échange téléphone + code d'un compte restaurant contre l'id du compte, ou null si incorrect */
export async function echangerAccesCompteRestaurant(telephone: string, code: string): Promise<string | null> {
  return appelerEchange<string>("echanger_acces_compte_restaurant", {
    p_telephone: telephone,
    p_code_hash: hashRhCode(code),
  });
}

/** Client du compte restaurant connecté (cookie déjà vérifié par getRestoCompteId) : fiche et partenariats */
export function createClientCompteRestaurant(compteId: string): SupabaseServeur {
  return createClientAvecClaims({ role_app: "compte_restaurant", compte_id: compteId });
}

/** Client du compte restaurant à partir du cookie de session, ou null si non connecté */
export async function createClientCompteSession(): Promise<{ compteId: string; supabase: SupabaseServeur } | null> {
  const compteId = await getRestoCompteId();
  if (!compteId) return null;
  return { compteId, supabase: createClientCompteRestaurant(compteId) };
}

/**
 * Accès à un partenariat (une entreprise) du compte connecté : vérifie que la ligne restaurants
 * appartient bien au compte, puis renvoie un client « restaurant » limité à ce partenariat.
 */
export async function accesPartenariatCompte(
  restaurantId: string
): Promise<{ compteId: string; restaurantId: string; companyId: string; supabase: SupabaseServeur } | null> {
  const session = await createClientCompteSession();
  if (!session) return null;
  // v1.10 (T8) : partenariat, entreprise et compte actifs, comme echanger_jeton_restaurant
  const { data, error } = await (session.supabase as any).rpc("acces_partenariat_compte", {
    p_restaurant_id: restaurantId,
  });
  if (error) console.error("[resto] acces_partenariat_compte :", error.code);
  const brut = Array.isArray(data) ? data[0] : null;
  const ligne = brut ? { id: brut.restaurant_id as string, company_id: brut.company_id as string } : null;
  if (!ligne) return null;
  return {
    compteId: session.compteId,
    restaurantId: ligne.id,
    companyId: ligne.company_id,
    supabase: createClientAvecClaims({ role_app: "restaurant", company_id: ligne.company_id, restaurant_id: ligne.id }),
  };
}
