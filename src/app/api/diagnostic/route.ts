import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientRh } from "@/lib/supabase/server";
import { safeEqual } from "@/lib/rh-session";

export const dynamic = "force-dynamic";

/** Valeurs d'exemple de .env.local.example : présentes mais pas encore remplacées */
const VALEURS_EXEMPLE = [
  "https://votre-projet.supabase.co",
  "votre-cle-anon-publique",
  "votre-cle-service-role-privee",
];

function etat(nom: string): "ok" | "absente" | "valeur d'exemple" {
  const valeur = process.env[nom]?.trim();
  if (!valeur) return "absente";
  if (VALEURS_EXEMPLE.includes(valeur)) return "valeur d'exemple";
  return "ok";
}

/** Réponse identique à une route absente : un visiteur ne sait même pas que le diagnostic existe */
function introuvable() {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * Accès au diagnostic. v1.10 (T9) : la route était publique et révélait la configuration (variables
 * présentes, commit, messages d'erreur Supabase). Elle exige désormais l'en-tête x-diagnostic-secret égal
 * à DIAGNOSTIC_SECRET (16 caractères min.). Sans DIAGNOSTIC_SECRET, elle n'est ouverte qu'en développement local.
 */
function accesAutorise(request: Request): boolean {
  const secret = process.env.DIAGNOSTIC_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  // Aucune limite d'essais sur cette route : un secret trop court se devinerait
  if (secret.length < 16) return false;
  return safeEqual(request.headers.get("x-diagnostic-secret") ?? "", secret);
}

/** Échec sans message brut (noms de tables, contraintes, détails Supabase) : le détail reste dans les logs */
function echec(contexte: string, err: unknown): string {
  const code = (err as any)?.code;
  console.error(`[diagnostic] ${contexte} :`, code ?? "erreur");
  return code ? `échec (${code})` : "échec";
}

/**
 * Diagnostic de configuration : indique pour chaque variable si elle est présente,
 * sans jamais afficher sa valeur, et teste la connexion à Supabase.
 */
export async function GET(request: Request) {
  if (!accesAutorise(request)) return introuvable();

  const variables = {
    NEXT_PUBLIC_SUPABASE_URL: etat("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: etat("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: etat("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_JWT_PRIVATE_KEY: etat("SUPABASE_JWT_PRIVATE_KEY"),
    RH_SESSION_SECRET: etat("RH_SESSION_SECRET"),
    NEXT_PUBLIC_APP_URL: etat("NEXT_PUBLIC_APP_URL"),
    SUPERADMIN_CODE: etat("SUPERADMIN_CODE"),
    WAVE_NUMERO_PAIEMENT: etat("WAVE_NUMERO_PAIEMENT"),
    CRON_SECRET: etat("CRON_SECRET"),
    DIAGNOSTIC_SECRET: etat("DIAGNOSTIC_SECRET"),
  };

  let connexionSupabase: string;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("companies").select("id", { count: "exact", head: true });
    connexionSupabase = error ? echec("connexion", error) : "ok";
  } catch (err) {
    connexionSupabase = echec("connexion", err);
  }

  // JWT signé par le serveur et accepté par Supabase (politiques RLS) : une entreprise fictive ne voit aucune ligne
  let jwtRls: string;
  try {
    const supabase = createClientRh("00000000-0000-0000-0000-000000000000");
    const { data, error } = await supabase.from("companies").select("id").limit(1);
    jwtRls = error ? echec("jwt_rls", error) : data && data.length > 0 ? "échec : la RLS laisse voir d'autres entreprises" : "ok";
  } catch (err) {
    jwtRls = echec("jwt_rls", err);
  }

  // Schéma à jour : les dernières tables et colonnes existent (sinon relancer supabase/schema.sql)
  const schema: Record<string, string> = {};
  try {
    const supabase = createAdminClient();
    const controles: Array<[string, string, string]> = [
      ["plats_restaurant", "plats_restaurant", "id"],
      ["comptes_restaurant", "comptes_restaurant", "id"],
      ["restaurants.compte_id", "restaurants", "compte_id"],
      ["menus_du_jour.ajoute_par", "menus_du_jour", "ajoute_par"],
      ["comptes_restaurant.code_change_at", "comptes_restaurant", "code_change_at"],
    ];
    for (const [nom, table, colonne] of controles) {
      const { error } = await (supabase.from(table as any) as any).select(colonne, { count: "exact", head: true });
      schema[nom] = error ? `manquant (${error.code ?? "erreur"})` : "ok";
    }
    // Fonctions de session (v1.10 T8) : sans elles, plus aucune connexion RH ni restaurant ne passe
    const { error: erreurSession } = await (supabase as any).rpc("session_rh_valide", {
      p_company_id: "00000000-0000-0000-0000-000000000000",
      p_emis_at: new Date().toISOString(),
    });
    schema["session_rh_valide()"] = erreurSession ? `manquant (${erreurSession.code ?? "erreur"})` : "ok";
  } catch (err) {
    schema.erreur = echec("schema", err);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return NextResponse.json(
    {
      environnement_vercel: process.env.VERCEL_ENV || "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      variables,
      app_url_pointe_sur_localhost: appUrl.includes("localhost"),
      connexion_supabase: connexionSupabase,
      jwt_rls: jwtRls,
      schema,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
