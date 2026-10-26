import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";

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
    RH_SESSION_SECRET: etat("RH_SESSION_SECRET"),
    NEXT_PUBLIC_APP_URL: etat("NEXT_PUBLIC_APP_URL"),
  };

  let connexionSupabase: string;
  if (!isSupabaseConfigured()) {
    connexionSupabase = "non testée (mode démo : URL ou clé service_role manquante)";
  } else {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("companies").select("id", { count: "exact", head: true });
      connexionSupabase = error ? `échec : ${error.message}` : "ok";
    } catch (err: any) {
      connexionSupabase = `échec : ${err.message}`;
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return NextResponse.json(
    {
      mode: isSupabaseConfigured() ? "production (Supabase connecté)" : "démo",
      environnement_vercel: process.env.VERCEL_ENV || "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
      variables,
      app_url_pointe_sur_localhost: appUrl.includes("localhost"),
      connexion_supabase: connexionSupabase,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
