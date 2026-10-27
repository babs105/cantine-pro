"use client";

import { useEffect, useState, useTransition } from "react";
import { BarChart3, TrendingUp, Users, Utensils } from "lucide-react";
import { statistiquesAction, type Statistiques } from "./rapports-actions";

interface StatistiquesPanelProps {
  moisInitial: string;
  isDemo: boolean;
}

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;

function libelleMois(mois: string, court = false): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: court ? "short" : "long",
    year: court ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mois}-15T12:00:00Z`));
}

/** Vue DG / DAF : dépenses du mois, évolution sur 6 mois, participation par service */
export function StatistiquesPanel({ moisInitial, isDemo }: StatistiquesPanelProps) {
  const [mois, setMois] = useState(moisInitial);
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isDemo) return;
    startTransition(async () => {
      const res = await statistiquesAction(mois);
      if (res.success) {
        setStats(res.data);
        setErreur(null);
      } else {
        setErreur(res.message);
      }
    });
  }, [mois, isDemo]);

  if (isDemo) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-neutral-200 text-xs text-neutral-500">
        Statistiques disponibles une fois Supabase connecté.
      </div>
    );
  }

  const maxMontant = Math.max(1, ...(stats?.evolution || []).map((e) => e.montant));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-orange-500" />
          Tableau de bord — <span className="capitalize">{libelleMois(mois)}</span>
          {isPending && <span className="text-[11px] font-normal text-neutral-400">actualisation…</span>}
        </h2>
        <input
          type="month"
          value={mois}
          onChange={(e) => e.target.value && setMois(e.target.value)}
          className="text-xs px-3 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {erreur && <p className="text-xs text-red-600">{erreur}</p>}

      {stats && (
        <>
          {/* Chiffres clés */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { titre: "Dépense du mois", valeur: fcfa(stats.totaux.montant), icone: TrendingUp, accent: true },
              { titre: "Repas facturés", valeur: String(stats.totaux.repas), icone: Utensils },
              { titre: "Coût moyen d'un repas", valeur: fcfa(stats.totaux.coutMoyen), icone: Utensils },
              { titre: "Jours avec menu", valeur: String(stats.joursAvecMenu), icone: Users },
            ].map((k) => (
              <div key={k.titre} className="bg-white rounded-3xl p-4 border border-neutral-200 shadow-sm">
                <p className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1.5">
                  <k.icone className="w-3.5 h-3.5" />
                  {k.titre}
                </p>
                <p className={`text-xl font-black mt-1 ${k.accent ? "text-orange-600" : "text-neutral-900"}`}>
                  {k.valeur}
                </p>
              </div>
            ))}
          </div>
          {stats.totaux.nonConfirmes > 0 && (
            <p className="text-[11px] text-amber-700 font-semibold">
              {stats.totaux.nonConfirmes} repas non confirmé(s) par leur restaurant ne sont pas comptés.
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Évolution des dépenses : une seule série, barres fines ancrées sur la ligne de base */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-neutral-900">Dépenses repas — 6 derniers mois</h3>
              <div className="relative h-48 flex items-end gap-3 border-b border-neutral-200 pt-6">
                {stats.evolution.map((e) => {
                  const courant = e.mois === stats.mois;
                  const hauteur = Math.max(e.montant > 0 ? 2 : 0, (e.montant / maxMontant) * 100);
                  return (
                    <div
                      key={e.mois}
                      className="relative flex-1 h-full flex flex-col justify-end items-center cursor-default"
                      onMouseEnter={() => setSurvol(e.mois)}
                      onMouseLeave={() => setSurvol(null)}
                      onClick={() => setSurvol(survol === e.mois ? null : e.mois)}
                    >
                      {(survol === e.mois || (courant && !survol)) && (
                        <div className="absolute -top-1 whitespace-nowrap text-[11px] font-semibold text-neutral-800 bg-white border border-neutral-200 shadow-sm rounded-lg px-2 py-1 z-10">
                          {fcfa(e.montant)} • {e.repas} repas
                        </div>
                      )}
                      <div
                        className={`w-full max-w-10 rounded-t ${courant ? "bg-orange-500" : "bg-orange-200"} ${
                          survol === e.mois ? "ring-2 ring-orange-300" : ""
                        }`}
                        style={{ height: `${hauteur}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3">
                {stats.evolution.map((e) => (
                  <span key={e.mois} className="flex-1 text-center text-[11px] text-neutral-500 capitalize">
                    {libelleMois(e.mois, true)}
                  </span>
                ))}
              </div>
            </div>

            {/* Plats les plus commandés */}
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-neutral-900">Plats les plus commandés</h3>
              {stats.topPlats.length === 0 ? (
                <p className="text-xs text-neutral-400">Aucun repas facturé ce mois-ci.</p>
              ) : (
                <ol className="space-y-2">
                  {stats.topPlats.map((p, i) => (
                    <li key={p.plat} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-neutral-800 truncate">
                        <span className="text-neutral-400 font-bold mr-1.5">{i + 1}.</span>
                        {p.plat}
                      </span>
                      <span className="font-bold text-neutral-900 shrink-0">{p.quantite}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Participation par service */}
          <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Participation par service</h3>
              <p className="text-[11px] text-neutral-500">
                Taux = repas facturés ÷ (effectif × {stats.joursAvecMenu} jour(s) avec menu).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-400 border-b border-neutral-100">
                    <th className="py-2 font-semibold">Service</th>
                    <th className="py-2 font-semibold text-right">Effectif</th>
                    <th className="py-2 font-semibold text-right">Repas</th>
                    <th className="py-2 font-semibold text-right">Absences</th>
                    <th className="py-2 font-semibold text-right">Dépense</th>
                    <th className="py-2 font-semibold pl-4 w-48">Taux de participation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {stats.services.map((s) => (
                    <tr key={s.service}>
                      <td className="py-2.5 font-semibold text-neutral-800">{s.service}</td>
                      <td className="py-2.5 text-right text-neutral-600">{s.effectif}</td>
                      <td className="py-2.5 text-right text-neutral-800 font-semibold">{s.repas}</td>
                      <td className="py-2.5 text-right text-neutral-600">{s.absents}</td>
                      <td className="py-2.5 text-right text-neutral-800">{fcfa(s.montant)}</td>
                      <td className="py-2.5 pl-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(100, s.taux)}%` }} />
                          </div>
                          <span className="w-9 text-right font-bold text-neutral-800">{s.taux}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
