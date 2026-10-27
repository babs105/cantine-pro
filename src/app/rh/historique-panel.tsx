"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, ChevronRight, FileSpreadsheet, FileText, History } from "lucide-react";
import { STATUTS_LIBELLES } from "@/lib/libelles";
import { historiqueJourAction, historiqueMoisAction, type DetailJour, type JourHistorique } from "./rapports-actions";

interface HistoriquePanelProps {
  moisInitial: string;
  isDemo: boolean;
}

const fcfa = (n: number) => `${n.toLocaleString("fr-FR")} F`;

function formatJour(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dakar" }).format(
    new Date(iso)
  );
}

export function HistoriquePanel({ moisInitial, isDemo }: HistoriquePanelProps) {
  const [mois, setMois] = useState(moisInitial);
  const [jours, setJours] = useState<JourHistorique[] | null>(null);
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailJour | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isDemo) return;
    setJourOuvert(null);
    startTransition(async () => {
      const res = await historiqueMoisAction(mois);
      if (res.success) {
        setJours(res.data);
        setErreur(null);
      } else {
        setJours([]);
        setErreur(res.message);
      }
    });
  }, [mois, isDemo]);

  const ouvrirJour = (date: string) => {
    if (jourOuvert === date) {
      setJourOuvert(null);
      return;
    }
    setJourOuvert(date);
    setDetail(null);
    startTransition(async () => {
      const res = await historiqueJourAction(date);
      if (res.success) setDetail(res.data);
      else setErreur(res.message);
    });
  };

  const totaux = (jours || []).reduce(
    (a, j) => ({ repas: a.repas + j.repasFactures, nonConfirmes: a.nonConfirmes + j.nonConfirmes, montant: a.montant + j.montant }),
    { repas: 0, nonConfirmes: 0, montant: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Exports du mois */}
      <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-orange-500" />
            Clôture mensuelle
          </h2>
          <input
            type="month"
            value={mois}
            onChange={(e) => e.target.value && setMois(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-neutral-50 rounded-2xl p-3">
            <p className="text-[11px] text-neutral-500 font-semibold">Repas facturés</p>
            <p className="text-xl font-black text-neutral-900">{totaux.repas}</p>
          </div>
          <div className="bg-neutral-50 rounded-2xl p-3">
            <p className="text-[11px] text-neutral-500 font-semibold">Montant dû</p>
            <p className="text-xl font-black text-orange-600">{fcfa(totaux.montant)}</p>
          </div>
          <div className="bg-neutral-50 rounded-2xl p-3">
            <p className="text-[11px] text-neutral-500 font-semibold">Non confirmés</p>
            <p className="text-xl font-black text-neutral-400">{totaux.nonConfirmes}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`/rh/facture?mois=${mois}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            Facture PDF
          </a>
          <a
            href={`/rh/export?mois=${mois}&format=xlsx`}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel paie par service
          </a>
          <a
            href={`/rh/export?mois=${mois}`}
            className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs rounded-xl transition"
          >
            CSV
          </a>
        </div>
        <p className="text-[11px] text-neutral-500">
          Seuls les repas des restaurants qui ont confirmé (eux-mêmes ou par téléphone) sont facturés.
        </p>
      </div>

      {/* Historique jour par jour */}
      <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
        <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
          <History className="w-4 h-4 text-orange-500" />
          Historique jour par jour
        </h2>

        {isDemo && <p className="text-xs text-neutral-500">Disponible une fois Supabase connecté.</p>}
        {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        {!isDemo && jours === null && <p className="text-xs text-neutral-400">Chargement…</p>}
        {jours && jours.length === 0 && !erreur && (
          <p className="text-xs text-neutral-500">Aucune commande sur ce mois.</p>
        )}

        {jours && jours.length > 0 && (
          <div className="divide-y divide-neutral-100">
            {jours.map((j) => (
              <div key={j.date}>
                <button
                  type="button"
                  onClick={() => ouvrirJour(j.date)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-neutral-50 rounded-xl px-2 transition"
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-neutral-900 capitalize">
                    {jourOuvert === j.date ? (
                      <ChevronDown className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    )}
                    {formatJour(j.date)}
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-700 font-semibold">{j.repasFactures} repas</span>
                    {j.nonConfirmes > 0 && <span className="text-amber-700">{j.nonConfirmes} non confirmé(s)</span>}
                    <span className="font-bold text-orange-600 w-20 text-right">{fcfa(j.montant)}</span>
                  </span>
                </button>

                {jourOuvert === j.date && (
                  <div className="pb-4 px-2 space-y-3">
                    {!detail ? (
                      <p className="text-xs text-neutral-400">{isPending ? "Chargement…" : ""}</p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {detail.restaurants.map((r) => (
                            <span
                              key={r.nom}
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                                r.confirmeAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                              }`}
                            >
                              {r.nom} • {r.quantite} repas •{" "}
                              {r.confirmeAt
                                ? `confirmé${r.confirmePar === "rh" ? " par téléphone" : ""} à ${heure(r.confirmeAt)}`
                                : r.cloture
                                  ? "non confirmé"
                                  : "non clôturé"}
                            </span>
                          ))}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-neutral-400 border-b border-neutral-100">
                                <th className="py-2 font-semibold">Collaborateur</th>
                                <th className="py-2 font-semibold">Service</th>
                                <th className="py-2 font-semibold">Statut</th>
                                <th className="py-2 font-semibold">Plat</th>
                                <th className="py-2 font-semibold text-right">Montant</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50">
                              {detail.lignes.map((l, i) => (
                                <tr key={i}>
                                  <td className="py-2 font-semibold text-neutral-800">{l.nom}</td>
                                  <td className="py-2 text-neutral-500">{l.service}</td>
                                  <td className="py-2 text-neutral-600">{STATUTS_LIBELLES[l.statut] || l.statut}</td>
                                  <td className="py-2 text-neutral-700">
                                    {l.plat || "-"}
                                    {l.restaurant && <span className="text-neutral-400"> — {l.restaurant}</span>}
                                  </td>
                                  <td className="py-2 text-right font-semibold">{l.montant ? fcfa(l.montant) : "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
