import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "cantine_pro_rh";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function getSecret(): string {
  const secret = process.env.RH_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("RH_SESSION_SECRET manquant dans l'environnement.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Empreinte sha256 hex du code d'accès RH (identique à encode(digest(code,'sha256'),'hex') en SQL) */
export function hashRhCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function verifyRhCode(code: string, expectedHash: string | null): boolean {
  if (!expectedHash) return false;
  return safeEqual(hashRhCode(code), expectedHash.toLowerCase());
}

export async function createRhSession(companyId: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${companyId}.${expiresAt}`;
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

/** Retourne l'id de l'entreprise du RH connecté, ou null */
export async function getRhCompanyId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [companyId, expiresAt, signature] = value.split(".");
  if (!companyId || !expiresAt || !signature) return null;
  if (!safeEqual(sign(`${companyId}.${expiresAt}`), signature)) return null;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;

  return companyId;
}
