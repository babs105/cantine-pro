import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionEncoreValide } from "@/lib/supabase/client-serveur";

const COOKIE_NAME = "cantine_pro_rh";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function getSecret(): string {
  const secret = process.env.RH_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("RH_SESSION_SECRET manquant dans l'environnement.");
  }
  return secret;
}

export function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Empreinte sha256 hex du code d'accès RH, envoyée à la base qui la stocke en bcrypt (v1.10 T19).
 * Jamais comparée en Node : la comparaison se fait en SQL (code_correspond).
 */
export function hashRhCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

/**
 * Cookie de session RH : `companyId.emisAt.expiresAt.signature`. v1.10 (T8) : l'heure d'émission permet
 * de refuser une session ouverte avant un changement de code. Les anciens cookies (3 segments) sont refusés :
 * reconnexion unique au déploiement.
 */
export async function createRhSession(companyId: string): Promise<void> {
  const emisAt = Math.floor(Date.now() / 1000);
  const expiresAt = emisAt + SESSION_DURATION_SECONDS;
  const payload = `${companyId}.${emisAt}.${expiresAt}`;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroyRhSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Retourne l'id de l'entreprise du RH connecté, ou null. v1.10 (T8) : en plus de la signature et de
 * l'expiration, vérifie en base que l'entreprise est active et que le code RH n'a pas changé depuis
 * l'émission du cookie. Mis en cache pour la durée d'un rendu (un seul appel par requête de page).
 */
export const getRhCompanyId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [companyId, emisAt, expiresAt, signature] = value.split(".");
  if (!companyId || !emisAt || !expiresAt || !signature) return null;
  if (!/^\d{1,12}$/.test(emisAt) || !/^\d{1,12}$/.test(expiresAt)) return null;
  if (!safeEqual(sign(`${companyId}.${emisAt}.${expiresAt}`), signature)) return null;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;

  const valide = await sessionEncoreValide("session_rh_valide", {
    p_company_id: companyId,
    p_emis_at: new Date(Number(emisAt) * 1000).toISOString(),
  });
  return valide ? companyId : null;
});
