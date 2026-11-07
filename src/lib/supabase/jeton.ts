import "server-only";
import { createPrivateKey, sign, type KeyObject } from "crypto";

/** Durée de vie d'un JWT : il est signé à chaque requête serveur, il n'a donc pas besoin de durer */
const DUREE_JETON_SECONDES = 5 * 60;

/** Claims lus par les politiques RLS (fonctions public.jwt_* de supabase/schema.sql) */
export type ClaimsCantine =
  | { role_app: "rh"; company_id: string }
  | { role_app: "salarie"; company_id: string; employe_id: string }
  | { role_app: "restaurant"; company_id: string; restaurant_id: string }
  | { role_app: "compte_restaurant"; compte_id: string }
  // v1.10 (T13) : appel des fonctions de connexion par le serveur. Ce rôle n'ouvre aucune table ; il
  // atteste seulement que l'appel (et donc l'IP transmise) vient de Next.js et pas d'un appel direct.
  | { role_app: "connexion" };

function base64url(valeur: string | Buffer): string {
  return Buffer.from(valeur).toString("base64url");
}

let cleEnCache: { kid: string; cle: KeyObject } | null = null;

/**
 * Clé privée ES256 importée dans Supabase (Project Settings > JWT Keys), au format JWK :
 * générée par `npx supabase gen signing-key --algorithm ES256`. Supabase vérifie nos JWT
 * avec la partie publique ; la partie privée ne vit que dans cette variable d'environnement.
 */
function getCleSignature(): { kid: string; cle: KeyObject } {
  if (cleEnCache) return cleEnCache;

  const brut = process.env.SUPABASE_JWT_PRIVATE_KEY;
  if (!brut) {
    throw new Error("SUPABASE_JWT_PRIVATE_KEY manquante dans l'environnement (clé de signature ES256 au format JWK).");
  }

  let jwk: { kid?: string; kty?: string; crv?: string; d?: string };
  try {
    // Le JWK peut être collé tel quel, ou dans un tableau [ {...} ] comme le produit la CLI Supabase
    const valeur = JSON.parse(brut);
    jwk = Array.isArray(valeur) ? valeur[0] : valeur;
  } catch {
    throw new Error("SUPABASE_JWT_PRIVATE_KEY n'est pas un JSON valide (JWK attendu).");
  }
  if (jwk?.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.kid) {
    throw new Error("SUPABASE_JWT_PRIVATE_KEY doit être une clé privée EC P-256 (ES256) avec un champ kid.");
  }

  cleEnCache = { kid: jwk.kid, cle: createPrivateKey({ key: jwk as any, format: "jwk" }) };
  return cleEnCache;
}

/**
 * Signe un JWT ES256 accepté par Supabase : role « authenticated » pour la Data API,
 * plus les claims métier qui servent de filtre aux politiques RLS.
 */
export function signerJetonSupabase(claims: ClaimsCantine): string {
  const { kid, cle } = getCleSignature();
  const maintenant = Math.floor(Date.now() / 1000);
  const sujet =
    claims.role_app === "salarie"
      ? claims.employe_id
      : claims.role_app === "restaurant"
        ? claims.restaurant_id
        : claims.role_app === "compte_restaurant"
          ? claims.compte_id
          : claims.role_app === "connexion"
            ? "connexion"
            : claims.company_id;

  const entete = base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }));
  const contenu = base64url(
    JSON.stringify({
      ...claims,
      sub: sujet,
      role: "authenticated",
      aud: "authenticated",
      iat: maintenant,
      exp: maintenant + DUREE_JETON_SECONDES,
    })
  );
  // Format JWS : signature brute r||s (64 octets), pas l'encodage DER par défaut de Node
  const signature = sign("sha256", Buffer.from(`${entete}.${contenu}`), { key: cle, dsaEncoding: "ieee-p1363" });
  return `${entete}.${contenu}.${base64url(signature)}`;
}
