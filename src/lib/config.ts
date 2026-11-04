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

/** Token aléatoire cryptographiquement sûr pour les liens magiques */
export function generateToken(bytes = 8): string {
  return randomBytes(bytes).toString("hex");
}
