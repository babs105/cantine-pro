import "server-only";
import { cookies } from "next/headers";
import { safeEqual, sign } from "@/lib/rh-session";

/** Session du compte restaurant (dashboard /resto), même principe que la session RH : cookie signé HMAC */
const COOKIE_NAME = "cantine_pro_resto";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 jours
const PREFIXE = "resto"; // empêche de réutiliser une signature de cookie RH

export async function createRestoSession(compteId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${compteId}.${expiresAt}`;
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

/** Retourne l'id du compte restaurant connecté, ou null */
export async function getRestoCompteId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [compteId, expiresAt, signature] = value.split(".");
  if (!compteId || !expiresAt || !signature) return null;
  if (!safeEqual(sign(`${PREFIXE}.${compteId}.${expiresAt}`), signature)) return null;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;

  return compteId;
}
