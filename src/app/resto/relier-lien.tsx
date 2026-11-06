"use client";

import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";
import { relierLienAction } from "./actions";

/** Bouton affiché sur un lien /resto/[token] quand le compte restaurant est connecté mais pas encore relié */
export function RelierLienButton({ token, companyNom }: { token: string; companyNom: string }) {
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (etat?.ok) {
    return (
      <a href="/resto" className="block text-center text-xs font-bold text-emerald-300">
        {etat.texte} Ouvrir mon espace →
      </a>
    );
  }

  return (
    <>
      {etat && <p className="text-xs text-red-400">{etat.texte}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await relierLienAction(token);
            setEtat(res.success ? { ok: true, texte: `${companyNom} est ajoutée à votre espace.` } : { ok: false, texte: res.message || "Erreur." });
          })
        }
        className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-bold text-sm rounded-2xl transition flex items-center justify-center gap-2"
      >
        <Link2 className="w-4 h-4" />
        {isPending ? "Ajout..." : `Ajouter ${companyNom} à mon espace`}
      </button>
    </>
  );
}
