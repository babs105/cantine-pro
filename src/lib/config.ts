import { randomBytes } from "crypto";

export {
  TIMEZONE,
  todayDakar,
  nowDakarTime,
  isApresHeureLimite,
  secondesAvantHeure,
} from "@/lib/dates";

/**
 * Vrai si les clés Supabase réelles sont renseignées.
 * Sinon l'application tourne en mode démo avec des données locales.
 */
export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(
    supabaseUrl &&
      supabaseUrl !== "https://votre-projet.supabase.co" &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY !== "votre-cle-service-role-privee"
  );
}

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Token aléatoire cryptographiquement sûr pour les liens magiques */
export function generateToken(bytes = 8): string {
  return randomBytes(bytes).toString("hex");
}
