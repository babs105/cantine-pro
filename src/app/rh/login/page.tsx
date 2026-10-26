"use client";

import { useActionState } from "react";
import { Lock, Utensils } from "lucide-react";
import { loginRhAction } from "./actions";

export default function RhLoginPage() {
  const [state, formAction, isPending] = useActionState(loginRhAction, undefined);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 max-w-sm mx-auto flex flex-col justify-center">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-orange-500/20">
            <Utensils className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-neutral-900">
            Espace RH <span className="text-orange-600">Cantine Pro</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Connectez-vous avec le code remis lors de l&apos;ouverture de votre essai.
          </p>
        </div>

        {state?.error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Identifiant entreprise
            </label>
            <input
              type="text"
              name="slug"
              required
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="ex: pilote-thies"
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Code d&apos;accès RH</label>
            <input
              type="password"
              name="code"
              required
              autoComplete="current-password"
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <Lock className="w-4 h-4" />
            {isPending ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
