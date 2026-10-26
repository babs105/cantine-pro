import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

/**
 * Client Supabase côté serveur avec la clé service_role.
 * La RLS est activée sans politique : la clé anon publique ne lit rien,
 * toutes les requêtes passent par le serveur et sont filtrées par token / entreprise.
 */
export async function createClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante dans l'environnement.");
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
