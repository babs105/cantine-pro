"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, LogOut, ShieldCheck } from "lucide-react";
import { PLANS, PLAN_IDS, type EtatAbonnement } from "@/lib/abonnement";
import type { PlanId, StatutAbonnement } from "@/types/database";
import { enregistrerPaiementAction, logoutAdminAction, modifierAbonnementAction } from "./actions";

export interface EntrepriseAdmin {
  id: string;
  nom: string;
  slug: string;
  responsable: string | null;
  email: string | null;
  telephone: string | null;
  plan: PlanId;
  statut: StatutAbonnement;
  trialEndsAt: string | null;
  abonnementFin: string | null;
  creeLe: string;
  employes: number;
  repasMois: number;
  aDejaPaye: boolean;
  etat: EtatAbonnement;
}

interface AdminClientProps {
  entreprises: EntrepriseAdmin[];
  kpis: {
    inscrites: number;
    enEssai: number;
    payantes: number;
    bloquees: number;
    mrr: number;
    encaisseMois: number;
    conversion: number;
  };
}

const STATUTS: Array<{ id: StatutAbonnement; libelle: string }> = [
  { id: "trial", libelle: "Essai" },
  { id: "active", libelle: "Actif" },
  { id: "suspended", libelle: "Suspendu" },
  { id: "cancelled", libelle: "Résilié" },
];

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;

export function AdminClient({ entreprises, kpis }: AdminClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [paiementPour, setPaiementPour] = useState<EntrepriseAdmin | null>(null);
  const [filtre, setFiltre] = useState("");

  const executer = (action: () => Promise<{ success: boolean; message?: string }>, ok = "Enregistré.") => {
    startTransition(async () => {
      const res = await action();
      setMessage({ ok: res.success, texte: res.message || (res.success ? ok : "Erreur.") });
      router.refresh();
    });
  };

  const visibles = entreprises.filter((e) => {
    const q = filtre.trim().toLowerCase();
    return !q || [e.nom, e.slug, e.email, e.responsable].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      <header className="bg-neutral-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-orange-400" />
            Cantine Pro — SuperAdmin
          </h1>
          <form action={logoutAdminAction}>
            <button className="text-xs font-semibold text-neutral-300 hover:text-white flex items-center gap-1.5">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { t: "MRR", v: fcfa(kpis.mrr), accent: true },
            { t: "Encaissé ce mois", v: fcfa(kpis.encaisseMois) },
            { t: "Entreprises", v: kpis.inscrites },
            { t: "En essai", v: kpis.enEssai },
            { t: "Payantes", v: kpis.payantes },
            { t: "Envoi bloqué", v: kpis.bloquees },
            { t: "Conversion essai", v: `${kpis.conversion}%` },
          ].map((k) => (
            <div key={k.t} className="bg-white rounded-2xl p-4 border border-neutral-200">
              <p className="text-[11px] font-semibold text-neutral-500">{k.t}</p>
              <p className={`text-lg font-black ${k.accent ? "text-orange-600" : "text-neutral-900"}`}>{k.v}</p>
            </div>
          ))}
        </div>

        {message && (
          <p
            className={`p-3 rounded-2xl text-xs border ${
              message.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {message.texte}
          </p>
        )}

        <div className="bg-white rounded-3xl p-5 border border-neutral-200 space-y-3">
          <input
            type="search"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Rechercher une entreprise, un e-mail..."
            className="w-full sm:w-80 text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-400 border-b border-neutral-100">
                  <th className="py-2 font-semibold">Entreprise</th>
                  <th className="py-2 font-semibold">Contact</th>
                  <th className="py-2 font-semibold text-right">Salariés</th>
                  <th className="py-2 font-semibold text-right">Repas (mois)</th>
                  <th className="py-2 font-semibold">Offre</th>
                  <th className="py-2 font-semibold">Statut</th>
                  <th className="py-2 font-semibold">Échéance</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {visibles.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="py-3">
                      <p className="font-bold text-neutral-900">{e.nom}</p>
                      <p className="text-neutral-400">
                        {e.slug} • inscrite le {e.creeLe}
                      </p>
                    </td>
                    <td className="py-3 text-neutral-600">
                      <p>{e.responsable || "-"}</p>
                      <p className="text-neutral-400">{[e.email, e.telephone].filter(Boolean).join(" • ")}</p>
                    </td>
                    <td className={`py-3 text-right ${e.employes > PLANS[e.plan].maxEmployes ? "text-red-600 font-bold" : ""}`}>
                      {e.employes}/{PLANS[e.plan].maxEmployes}
                    </td>
                    <td className="py-3 text-right">{e.repasMois}</td>
                    <td className="py-3">
                      <select
                        value={e.plan}
                        disabled={isPending}
                        onChange={(ev) => executer(() => modifierAbonnementAction(e.id, { plan: ev.target.value }))}
                        className="px-2 py-1 rounded-lg border border-neutral-200 bg-white"
                      >
                        {PLAN_IDS.map((p) => (
                          <option key={p} value={p}>
                            {PLANS[p].nom} ({fcfa(PLANS[p].prix)})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3">
                      <select
                        value={e.statut}
                        disabled={isPending}
                        onChange={(ev) =>
                          executer(() =>
                            modifierAbonnementAction(e.id, { statut: ev.target.value as StatutAbonnement })
                          )
                        }
                        className="px-2 py-1 rounded-lg border border-neutral-200 bg-white"
                      >
                        {STATUTS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.libelle}
                          </option>
                        ))}
                      </select>
                      <p
                        className={`mt-1 font-semibold ${
                          e.etat.envoiBloque ? "text-red-600" : e.etat.etat === "en_retard" ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {e.etat.libelle}
                        {e.etat.envoiBloque ? " • envoi bloqué" : ""}
                      </p>
                    </td>
                    <td className="py-3">
                      {e.statut === "trial" ? (
                        <input
                          type="date"
                          defaultValue={e.trialEndsAt || ""}
                          disabled={isPending}
                          title="Fin de l'essai"
                          onBlur={(ev) =>
                            ev.target.value &&
                            ev.target.value !== e.trialEndsAt &&
                            executer(() => modifierAbonnementAction(e.id, { trialEndsAt: ev.target.value }))
                          }
                          className="px-2 py-1 rounded-lg border border-neutral-200"
                        />
                      ) : (
                        <span className="text-neutral-600">{e.abonnementFin || "sans échéance"}</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPaiementPour(e)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Paiement
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {paiementPour && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const f = new FormData(ev.currentTarget);
              const id = paiementPour.id;
              setPaiementPour(null);
              executer(() =>
                enregistrerPaiementAction(id, {
                  montant: Number(f.get("montant")),
                  mois: Number(f.get("mois")),
                  reference: String(f.get("reference") || ""),
                })
              );
            }}
            className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-3"
          >
            <h2 className="text-sm font-extrabold text-neutral-900">Paiement Wave — {paiementPour.nom}</h2>
            <label className="block space-y-1 text-xs">
              <span className="font-bold text-neutral-700">Nombre de mois payés</span>
              <input
                name="mois"
                type="number"
                min={1}
                max={12}
                defaultValue={1}
                required
                className="w-full px-3 py-2 rounded-xl border border-neutral-200"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-bold text-neutral-700">Montant reçu (FCFA)</span>
              <input
                name="montant"
                type="number"
                min={1}
                defaultValue={PLANS[paiementPour.plan].prix}
                required
                className="w-full px-3 py-2 rounded-xl border border-neutral-200"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-bold text-neutral-700">Référence de transaction Wave</span>
              <input name="reference" className="w-full px-3 py-2 rounded-xl border border-neutral-200" />
            </label>
            <p className="text-[11px] text-neutral-500">
              L&apos;abonnement passe « Actif » et est prolongé à partir de{" "}
              {paiementPour.abonnementFin || "aujourd'hui"}.
            </p>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl">
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setPaiementPour(null)}
                className="flex-1 py-2.5 bg-neutral-100 text-neutral-800 font-semibold text-xs rounded-xl"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
