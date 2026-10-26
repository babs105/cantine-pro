"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmerPreparationAction } from "./actions";

interface ConfirmButtonProps {
  token: string;
  totalRepas: number;
  confirmeAt: string | null;
  isCloture: boolean;
}

export function ConfirmButton({ token, totalRepas, confirmeAt, isCloture }: ConfirmButtonProps) {
  const [confirme, setConfirme] = useState<string | null>(confirmeAt);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (confirme) {
    const heure = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Dakar",
    }).format(new Date(confirme));
    return (
      <div className="w-full py-3.5 px-4 bg-emerald-950/60 border border-emerald-700 text-emerald-300 font-bold text-sm rounded-2xl flex items-center justify-center gap-2">
        <CheckCircle2 className="w-5 h-5" />
        Préparation confirmée à {heure}
      </div>
    );
  }

  if (!isCloture) {
    return (
      <div className="w-full py-3.5 px-4 bg-neutral-900/60 border border-neutral-700 text-neutral-400 text-xs rounded-2xl">
        Commande pas encore clôturée : l'entreprise vous enverra le total définitif après la fin des votes (11h10).
      </div>
    );
  }

  return (
    <>
      {erreur && <div className="text-xs text-red-400">{erreur}</div>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await confirmerPreparationAction(token);
            if (res.success && res.confirmeAt) {
              setConfirme(res.confirmeAt);
              setErreur(null);
            } else {
              setErreur(res.message || "Erreur, réessayez.");
            }
          })
        }
        className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-60 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="w-5 h-5" />
        {isPending ? "Confirmation..." : `Confirmer la préparation (${totalRepas} repas)`}
      </button>
    </>
  );
}
