/** Fuseau du Sénégal (GMT toute l'année, sans heure d'été) */
export const TIMEZONE = "Africa/Dakar";

/** Date du jour à Dakar au format YYYY-MM-DD */
export function todayDakar(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Heure courante à Dakar au format HH:MM:SS */
export function nowDakarTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

function normaliserHeure(heure: string): string {
  return heure.length === 5 ? `${heure}:00` : heure.slice(0, 8);
}

/**
 * Vrai si l'heure donnée (ex: "11:10:00") est atteinte ou dépassée à Dakar.
 * Comparaison inclusive : le cron de 11h10 clôture même s'il se déclenche à 11:10:00 pile.
 */
export function isApresHeureLimite(heureLimite: string, now: Date = new Date()): boolean {
  return nowDakarTime(now) >= normaliserHeure(heureLimite);
}

/** Secondes restantes avant l'heure limite à Dakar (0 si dépassée) */
export function secondesAvantHeure(heure: string, now: Date = new Date()): number {
  const toSec = (h: string) => {
    const [hh, mm, ss] = normaliserHeure(h).split(":").map(Number);
    return hh * 3600 + mm * 60 + (ss || 0);
  };
  return Math.max(0, toSec(heure) - toSec(nowDakarTime(now)));
}

/** Ajoute n jours à une date YYYY-MM-DD */
export function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant la date YYYY-MM-DD */
export function lundiDeLaSemaine(date: string): string {
  const jour = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return ajouterJours(date, jour === 0 ? -6 : 1 - jour);
}

/** Jours de service par défaut : lundi → vendredi (1 = lundi … 7 = dimanche, norme ISO) */
export const JOURS_TRAVAIL_DEFAUT = [1, 2, 3, 4, 5];

export const NOMS_JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Jours de travail valides, triés et sans doublon ; lundi → vendredi si la valeur est vide ou invalide */
export function normaliserJoursTravail(valeur: unknown): number[] {
  const jours = Array.isArray(valeur)
    ? Array.from(new Set(valeur.map(Number).filter((j) => Number.isInteger(j) && j >= 1 && j <= 7))).sort((a, b) => a - b)
    : [];
  return jours.length > 0 ? jours : JOURS_TRAVAIL_DEFAUT;
}

/** Jour ISO d'une date YYYY-MM-DD : 1 = lundi … 7 = dimanche */
export function jourIso(date: string): number {
  const jour = new Date(`${date}T12:00:00Z`).getUTCDay();
  return jour === 0 ? 7 : jour;
}

/** Les jours de travail d'une semaine (par défaut lundi → vendredi) */
export function joursOuvres(lundi: string, joursTravail: number[] = JOURS_TRAVAIL_DEFAUT): string[] {
  return normaliserJoursTravail(joursTravail).map((j) => ajouterJours(lundi, j - 1));
}

export function isDateValide(date: string | null | undefined): date is string {
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)));
}

/** Ex: "lundi 26 oct." */
export function formatJourCourt(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
