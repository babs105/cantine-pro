"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirmerPreparationAction, type CibleRestaurant } from "./actions";

interface ConfirmButtonProps {
  cible: CibleRestaurant;
  /** Heure de fin des commandes de l'entreprise (ex. 11:10) */
  heureLimite?: string;
  totalRepas: number;
  confirmeAt: string | null;
  /** Vrai si l'entreprise a confirmé à la place du restaurant, après accord par téléphone */
  confirmeParRh?: boolean;
  isCloture: boolean;
  /** Variante claire (dashboard du compte restaurant) ; sombre par défaut (lien restaurant) */
  clair?: boolean;
}

export function ConfirmButton({ cible, heureLimite = "11:10", totalRepas, confirmeAt, confirmeParRh, isCloture, clair = false }: ConfirmButtonProps) {
  const [confirme, setConfirme] = useState<string | null>(confirmeAt);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Actualisation du dashboard : la confirmation peut venir du RH (accord par téléphone)
  useEffect(() => setConfirme(confirmeAt), [confirmeAt]);

  if (confirme) {
    const heure = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Dakar",
    }).format(new Date(confirme));
    return (
      <div className={cn(
          "w-full py-3 px-4 border font-bold text-sm rounded-2xl flex items-center justify-center gap-2",
          clair ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-emerald-950/60 border-emerald-700 text-emerald-300"
        )}>
        <CheckCircle2 className="w-5 h-5" />
        {confirmeParRh ? `Confirmée par téléphone avec l'entreprise à ${heure}` : `Préparation confirmée à ${heure}`}
      </div>
    );
  }

  if (!isCloture) {
    return (
      <div className={cn(
          "w-full py-3 px-4 border text-xs rounded-2xl",
          clair ? "bg-neutral-50 border-neutral-200 text-neutral-500" : "bg-neutral-900/60 border-neutral-700 text-neutral-400"
        )}>
        Commande pas encore clôturée : l&apos;entreprise vous enverra le total définitif après la fin des commandes ({heureLimite.slice(0, 5).replace(":", "h")}).
      </div>
    );
  }

  return (
    <>
      {erreur && <div className={cn("text-xs", clair ? "text-red-600" : "text-red-400")}>{erreur}</div>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await confirmerPreparationAction(cible);
            if (res.success && res.confirmeAt) {
              setConfirme(res.confirmeAt);
              setErreur(null);
            } else {
              setErreur(res.message || "Erreur, réessayez.");
            }
          })
        }
        className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-60 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-900/20 transition flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-5 h-5" />
        {isPending ? "Confirmation..." : `Confirmer la préparation (${totalRepas} repas)`}
      </button>
    </>
  );
}
