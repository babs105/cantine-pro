"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Utensils } from "lucide-react";
import { PLANS, PLAN_IDS } from "@/lib/abonnement";
import { inscriptionEntrepriseAction } from "./actions";

const champClasse =
  "w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500";

export default function InscriptionPage() {
  const [state, formAction, isPending] = useActionState(inscriptionEntrepriseAction, undefined);
  const v = state?.champs || {};
  // Invitation d'un restaurant : /inscription?partenaire=CODE l'ajoute automatiquement à l'entreprise
  const [partenaire, setPartenaire] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("partenaire") || "";
    if (/^[A-Za-z0-9]{6,16}$/.test(code)) setPartenaire(code.toUpperCase());
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 max-w-md mx-auto flex flex-col justify-center">
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-orange-500/20">
            <Utensils className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-extrabold text-neutral-900">
            Créer votre compte <span className="text-orange-600">Cantine Pro</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            14 jours d&apos;essai gratuit, sans carte bancaire. Opérationnel en 10 minutes.
          </p>
        </div>

        {partenaire && (
          <div className="p-3 bg-orange-50 border border-orange-200 text-orange-800 rounded-2xl text-xs">
            Vous êtes invité par un restaurant partenaire : il sera ajouté automatiquement à votre entreprise.
          </div>
        )}

        {state?.error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">{state.error}</div>
        )}

        <form action={formAction} className="space-y-3">
          <input type="text" name="site_web" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <input type="hidden" name="partenaire" value={partenaire} />

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Nom de l&apos;entreprise</label>
            <input name="nom" required defaultValue={v.nom} placeholder="Ex: Bâti-Plus SARL" className={champClasse} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Nom du responsable</label>
            <input
              name="responsable"
              required
              defaultValue={v.responsable}
              placeholder="Prénom et nom"
              className={champClasse}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">E-mail</label>
              <input type="email" name="email" required defaultValue={v.email} className={champClasse} />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Téléphone</label>
              <input
                type="tel"
                name="telephone"
                required
                defaultValue={v.telephone}
                placeholder="+221 77..."
                className={champClasse}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Offre</label>
            <div className="grid grid-cols-3 gap-2">
              {PLAN_IDS.map((id) => (
                <label
                  key={id}
                  className="cursor-pointer rounded-xl border border-neutral-200 p-2.5 text-center has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50 transition"
                >
                  <input type="radio" name="plan" value={id} defaultChecked={(v.plan || "pro") === id} className="sr-only" />
                  <span className="block text-xs font-extrabold text-neutral-900">{PLANS[id].nom}</span>
                  <span className="block text-[10px] text-neutral-500">≤ {PLANS[id].maxEmployes} salariés</span>
                  <span className="block text-[11px] font-bold text-orange-600 mt-0.5">
                    {PLANS[id].prix.toLocaleString("fr-FR")} F
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-neutral-400 mt-1">Prix mensuel en FCFA, à régler après l&apos;essai.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Code d&apos;accès RH</label>
              <input
                type="password"
                name="code"
                required
                minLength={8}
                autoComplete="new-password"
                className={champClasse}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Confirmer le code</label>
              <input
                type="password"
                name="confirmation"
                required
                minLength={8}
                autoComplete="new-password"
                className={champClasse}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <Building2 className="w-4 h-4" />
            {isPending ? "Création du compte..." : "Démarrer l'essai gratuit"}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-500">
          Déjà inscrit ?{" "}
          <Link href="/rh/login" className="font-bold text-orange-600 hover:underline">
            Se connecter à l&apos;Espace RH
          </Link>
        </p>
        <p className="text-center text-xs text-neutral-500">
          Vous êtes un restaurant ?{" "}
          <Link href="/resto/inscription" className="font-bold text-neutral-800 hover:underline">
            Créer votre espace restaurant
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
