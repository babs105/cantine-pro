"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Store, UserPlus } from "lucide-react";
import { inscriptionRestaurantAction } from "./actions";

const champ =
  "w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500";

export function InscriptionRestoForm({ lien }: { lien: string }) {
  const [state, formAction, isPending] = useActionState(inscriptionRestaurantAction, undefined);
  const v = state?.champs || {};

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 max-w-sm mx-auto flex flex-col justify-center">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-orange-500/20">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-neutral-900">Créer mon espace restaurant</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Gratuit. Vous recevrez un code partenaire à donner à chaque entreprise que vous livrez.
          </p>
        </div>

        {lien && (
          <div className="p-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-2xl text-xs">
            L&apos;entreprise qui vous a envoyé ce lien sera automatiquement ajoutée à votre espace.
          </div>
        )}

        {state?.error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">{state.error}</div>
        )}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="lien" value={lien} />
          <input type="text" name="site_web" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Nom du restaurant</label>
            <input type="text" name="nom" required defaultValue={v.nom} placeholder="Chez Fatou Traiteur" className={champ} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Numéro WhatsApp (identifiant)</label>
            <input type="tel" name="telephone" required defaultValue={v.telephone} placeholder="77 123 45 67" className={champ} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Ville</label>
            <input type="text" name="ville" defaultValue={v.ville} placeholder="Thiès" className={champ} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Code d&apos;accès (6 caractères min.)</label>
            <input type="password" name="code" required minLength={6} autoComplete="new-password" className={champ} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Confirmer le code</label>
            <input type="password" name="confirmation" required minLength={6} autoComplete="new-password" className={champ} />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            {isPending ? "Création..." : "Créer mon espace"}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-500">
          Déjà inscrit ?{" "}
          <Link href="/resto/login" className="font-bold text-orange-600 hover:underline">
            Se connecter
          </Link>
        </p>
        <p className="text-center">
          <Link href="/" className="text-[11px] text-neutral-400 hover:text-neutral-700">
            ← Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
