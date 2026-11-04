import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientRh } from "@/lib/supabase/server";

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

/**
 * Diagnostic de configuration : indique pour chaque variable si elle est présente,
 * sans jamais afficher sa valeur, et teste la connexion à Supabase.
 */
export async function GET() {
  const variables = {
    NEXT_PUBLIC_SUPABASE_URL: etat("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: etat("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: etat("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_JWT_PRIVATE_KEY: etat("SUPABASE_JWT_PRIVATE_KEY"),
    RH_SESSION_SECRET: etat("RH_SESSION_SECRET"),
    NEXT_PUBLIC_APP_URL: etat("NEXT_PUBLIC_APP_URL"),
    SUPERADMIN_CODE: etat("SUPERADMIN_CODE"),
    WAVE_NUMERO_PAIEMENT: etat("WAVE_NUMERO_PAIEMENT"),
  };

  let connexionSupabase: string;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("companies").select("id", { count: "exact", head: true });
    connexionSupabase = error ? `échec : ${error.message}` : "ok";
  } catch (err: any) {
    connexionSupabase = `échec : ${err.message}`;
  }

  // JWT signé par le serveur et accepté par Supabase (politiques RLS) : une entreprise fictive ne voit aucune ligne
  let jwtRls: string;
  try {
    const supabase = createClientRh("00000000-0000-0000-0000-000000000000");
    const { data, error } = await supabase.from("companies").select("id").limit(1);
    jwtRls = error ? `échec : ${error.message}` : data && data.length > 0 ? "échec : la RLS laisse voir d'autres entreprises" : "ok";
  } catch (err: any) {
    jwtRls = `échec : ${err.message}`;
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
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
