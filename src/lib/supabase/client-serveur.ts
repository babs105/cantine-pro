import "server-only";
import { createServerClient } from "@supabase/ssr";
import { Database } from "@/types/database";

/**
 * Client Supabase serveur avec la clé anon (la RLS s'applique). Séparé de ./server.ts pour que les
 * sessions (rh-session.ts, resto-session.ts) puissent appeler des fonctions SQL sans import circulaire :
 * server.ts importe déjà ces sessions.
 */

function configSupabase(): { url: string; cleAnon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cleAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || url === "https://votre-projet.supabase.co") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante ou non remplacée dans l'environnement.");
  }
  if (!cleAnon || cleAnon === "votre-cle-anon-publique") {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY manquante ou non remplacée dans l'environnement.");
  }
  return { url, cleAnon };
}

export function serverClient(jeton?: string) {
  const { url, cleAnon } = configSupabase();
  return createServerClient<Database>(url, cleAnon, {
    // Pas de session Supabase Auth : l'identité vient du JWT signé par le serveur
    cookies: { getAll: () => [], setAll: () => {} },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: jeton ? { headers: { Authorization: `Bearer ${jeton}` } } : undefined,
  });
}

export type SupabaseServeur = ReturnType<typeof serverClient>;

/**
 * Contrôle de session v1.10 (T8) : appelle session_rh_valide ou session_compte_valide avec la clé anon.
 * Refus si la fonction échoue (réseau, schéma pas encore relancé) : on ne laisse jamais passer une
 * session qu'on n'a pas pu vérifier.
 */
export async function sessionEncoreValide(
  fonction: "session_rh_valide" | "session_compte_valide",
  args: Record<string, string>
): Promise<boolean> {
  try {
    const { data, error } = await (serverClient() as any).rpc(fonction, args);
    if (error) {
      console.error(`[session] ${fonction} :`, error.code);
      return false;
    }
    return data === true;
  } catch {
    console.error(`[session] ${fonction} : appel impossible`);
    return false;
  }
}
