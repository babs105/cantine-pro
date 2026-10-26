import type { RecapLigne } from "@/types/database";

interface CommandeChoisie {
  statut: string;
  plat_titre?: string | null;
  prix?: number | null;
}

/** Agrège les commandes "choisi" par plat (ex: 18 Yassa, 12 Thiéb), du plus commandé au moins commandé */
export function buildRecap(commandes: CommandeChoisie[]): RecapLigne[] {
  const parPlat = new Map<string, RecapLigne>();
  for (const cmd of commandes) {
    if (cmd.statut !== "choisi" || !cmd.plat_titre) continue;
    const ligne = parPlat.get(cmd.plat_titre) || {
      plat_titre: cmd.plat_titre,
      quantite: 0,
      prix_unitaire: cmd.prix ?? 0,
    };
    ligne.quantite += 1;
    parPlat.set(cmd.plat_titre, ligne);
  }
  return Array.from(parPlat.values()).sort((a, b) => b.quantite - a.quantite);
}

export function totalRepas(recap: RecapLigne[]): number {
  return recap.reduce((acc, l) => acc + l.quantite, 0);
}

/** Résumé sur une ligne, compatible avec les paramètres de template WhatsApp (pas de retour à la ligne) */
export function recapUneLigne(recap: RecapLigne[]): string {
  if (recap.length === 0) return "Aucun repas commandé";
  return recap.map((l) => `${l.quantite} ${l.plat_titre}`).join(", ");
}

export function formatHeure(heure: string | null | undefined, defaut = "12:30"): string {
  return (heure || defaut).slice(0, 5).replace(":", "h");
}

/** Message WhatsApp complet envoyé au traiteur à la clôture */
export function buildMessageTraiteur(params: {
  companyNom: string;
  dateStr: string;
  recap: RecapLigne[];
  heureLivraison?: string | null;
  lienConfirmation: string;
}): string {
  const { companyNom, dateStr, recap, heureLivraison, lienConfirmation } = params;
  let msg = `🍽️ *COMMANDE CANTINE PRO — ${companyNom.toUpperCase()}*\n`;
  msg += `📅 Date : ${dateStr} (Clôture 11h05)\n`;
  msg += `--------------------------------------\n`;
  if (recap.length === 0) {
    msg += `(Aucun plat sélectionné aujourd'hui)\n`;
  } else {
    for (const ligne of recap) {
      msg += `• *${ligne.quantite}x* ${ligne.plat_titre}\n`;
    }
  }
  msg += `--------------------------------------\n`;
  msg += `👉 Total repas : *${totalRepas(recap)}*\n`;
  msg += `⏰ Livraison demandée : ${formatHeure(heureLivraison)}\n`;
  msg += `🔗 Confirmer la réception : ${lienConfirmation}`;
  return msg;
}
