import { randomBytes } from "crypto";

export {
  TIMEZONE,
  todayDakar,
  nowDakarTime,
  isApresHeureLimite,
  secondesAvantHeure,
} from "@/lib/dates";

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Token aléatoire cryptographiquement sûr pour les liens magiques. v1.10 (T20) : 16 octets (128 bits) par
 * défaut pour les nouveaux salariés ; les liens déjà envoyés (8 octets) restent valides.
 */
export function generateToken(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
