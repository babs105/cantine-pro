import type { PlanId, StatutAbonnement } from "@/types/database";

/** Offres Cantine Pro (FCFA / mois) */
export const PLANS: Record<PlanId, { nom: string; prix: number; maxEmployes: number }> = {
  starter: { nom: "Starter", prix: 49000, maxEmployes: 30 },
  pro: { nom: "Pro", prix: 99000, maxEmployes: 100 },
  business: { nom: "Business", prix: 199000, maxEmployes: 300 },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const DUREE_ESSAI_JOURS = 14;

/** Délai de grâce après l'échéance avant suspension de l'envoi aux restaurants */
export const JOURS_DE_GRACE = 3;

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as string[]).includes(value);
}

export interface EtatAbonnement {
  etat: "essai" | "actif" | "en_retard" | "suspendu" | "resilie";
  libelle: string;
  /** Date de fin (essai ou période payée), YYYY-MM-DD, null si sans échéance */
  echeance: string | null;
  /** Jours avant l'échéance (négatif = dépassée) */
  joursRestants: number | null;
  /** Vrai à J+3 après l'échéance ou si suspendu : la clôture (envoi aux restaurants) est bloquée */
  envoiBloque: boolean;
}

function joursEntre(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

/** État d'abonnement d'une entreprise à la date `today` (YYYY-MM-DD, heure de Dakar) */
export function etatAbonnement(
  company: {
    statut_abonnement?: StatutAbonnement | null;
    trial_ends_at?: string | null;
    abonnement_fin?: string | null;
  },
  today: string
): EtatAbonnement {
  const statut = company.statut_abonnement || "active";

  if (statut === "cancelled") {
    return { etat: "resilie", libelle: "Abonnement résilié", echeance: null, joursRestants: null, envoiBloque: true };
  }
  if (statut === "suspended") {
    return { etat: "suspendu", libelle: "Compte suspendu", echeance: null, joursRestants: null, envoiBloque: true };
  }

  const echeance =
    statut === "trial" ? (company.trial_ends_at || "").slice(0, 10) || null : company.abonnement_fin || null;
  if (!echeance) {
    return { etat: "actif", libelle: "Abonnement actif", echeance: null, joursRestants: null, envoiBloque: false };
  }

  const joursRestants = joursEntre(today, echeance);
  if (joursRestants >= 0) {
    return statut === "trial"
      ? { etat: "essai", libelle: "Essai gratuit", echeance, joursRestants, envoiBloque: false }
      : { etat: "actif", libelle: "Abonnement actif", echeance, joursRestants, envoiBloque: false };
  }

  return {
    etat: "en_retard",
    libelle: statut === "trial" ? "Essai terminé" : "Paiement en retard",
    echeance,
    joursRestants,
    envoiBloque: -joursRestants > JOURS_DE_GRACE,
  };
}
