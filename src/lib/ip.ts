import "server-only";
import { headers } from "next/headers";

/**
 * IP du visiteur, pour les compteurs d'échecs de connexion (v1.10 T13). Sur Vercel, x-vercel-forwarded-for
 * et x-forwarded-for sont posés par la plateforme (une valeur envoyée par le client est remplacée).
 * Renvoie null si aucune IP lisible : la fonction SQL range alors l'appel dans le compteur « inconnue ».
 * À revoir si un autre proxy (Cloudflare…) est placé devant Vercel, ou hors de Vercel : le premier élément
 * de x-forwarded-for serait alors celui du proxy, ou celui envoyé par le client.
 */
export async function ipVisiteur(): Promise<string | null> {
  const h = await headers();
  const brute =
    h.get("x-vercel-forwarded-for")?.split(",")[0] ||
    h.get("x-forwarded-for")?.split(",")[0] ||
    h.get("x-real-ip") ||
    "";
  const ip = brute.trim();
  return /^[0-9A-Fa-f:.]{2,45}$/.test(ip) ? ip.toLowerCase() : null;
}
