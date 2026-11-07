import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionEncoreValide } from "@/lib/supabase/client-serveur";
import { safeEqual, sign } from "@/lib/rh-session";

/** Session du compte restaurant (dashboard /resto), même principe que la session RH : cookie signé HMAC */
const COOKIE_NAME = "cantine_pro_resto";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 jours
const PREFIXE = "resto"; // empêche de réutiliser une signature de cookie RH

/** Cookie `compteId.emisAt.expiresAt.signature` (v1.10 T8 : heure d'émission, anciens cookies refusés) */
export async function createRestoSession(compteId: string): Promise<void> {
  const emisAt = Math.floor(Date.now() / 1000);
  const expiresAt = emisAt + SESSION_DURATION_SECONDS;
  const payload = `${compteId}.${emisAt}.${expiresAt}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${payload}.${sign(`${PREFIXE}.${payload}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroyRestoSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Retourne l'id du compte restaurant connecté, ou null. v1.10 (T8) : vérifie aussi en base que le compte
 * est actif et que son code n'a pas changé depuis l'émission du cookie. Mis en cache pour la durée d'un rendu.
 */
export const getRestoCompteId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [compteId, emisAt, expiresAt, signature] = value.split(".");
  if (!compteId || !emisAt || !expiresAt || !signature) return null;
  if (!/^\d{1,12}$/.test(emisAt) || !/^\d{1,12}$/.test(expiresAt)) return null;
  if (!safeEqual(sign(`${PREFIXE}.${compteId}.${emisAt}.${expiresAt}`), signature)) return null;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;

  const valide = await sessionEncoreValide("session_compte_valide", {
    p_compte_id: compteId,
    p_emis_at: new Date(Number(emisAt) * 1000).toISOString(),
  });
  return valide ? compteId : null;
});
