"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Lock, Store } from "lucide-react";
import { loginRestoAction } from "./actions";

const champ =
  "w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500";

export default function RestoLoginPage() {
  const [state, formAction, isPending] = useActionState(loginRestoAction, undefined);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 max-w-sm mx-auto flex flex-col justify-center">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-orange-500/20">
            <Store className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-neutral-900">
            Espace restaurant <span className="text-orange-600">Cantine Pro</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-1">Toutes vos entreprises clientes au même endroit.</p>
        </div>

        {state?.error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">{state.error}</div>
        )}

        <form action={formAction} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Numéro WhatsApp</label>
            <input type="tel" name="telephone" required autoComplete="tel" placeholder="77 123 45 67" className={champ} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Code d&apos;accès</label>
            <input type="password" name="code" required autoComplete="current-password" className={champ} />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {isPending ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-500">
          Pas encore de compte ?{" "}
          <Link href="/resto/inscription" className="font-bold text-orange-600 hover:underline">
            Créer mon espace restaurant
          </Link>
        </p>
        <p className="text-center text-xs text-neutral-500">
          Vous êtes une entreprise ?{" "}
          <Link href="/rh/login" className="font-bold text-neutral-800 hover:underline">
            Espace RH
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
