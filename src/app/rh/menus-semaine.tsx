"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CopyPlus, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { formatFCFA } from "@/lib/utils";
import { ajouterJours, formatJourCourt, joursOuvres } from "@/lib/dates";
import {
  addMenuPlatAction,
  dupliquerSemaineAction,
  supprimerPlatAction,
  togglePlatDisponibiliteAction,
} from "./actions";

export interface PlatSemaine {
  id: string;
  date: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_available: boolean;
}

interface MenusSemaineProps {
  platsSemaine: PlatSemaine[];
  semaineLundi: string;
  todayDate: string;
  isDemo: boolean;
  onError: (message: string | null) => void;
}

const SUGGESTIONS = [
  { label: "Thiéb Rouge", titre: "Thiéboudienne Rouge Penda Mbaye", prix: 1500, desc: "Riz rouge au poisson mérou, carottes, manioc et beignets niébé" },
  { label: "Yassa Poulet", titre: "Yassa Poulet au Feu de Bois", prix: 1500, desc: "Poulet mariné au citron et oignons caramélisés avec riz blanc" },
  { label: "Mafé Bœuf", titre: "Mafé Viande de Bœuf", prix: 1500, desc: "Sauce onctueuse à la pâte d'arachide, bœuf tendre et patate douce" },
  { label: "Soupou Kandia", titre: "Soupou Kandia (Sauce Gombo)", prix: 1700, desc: "Sauce gombo à l'huile de palme rouge, poisson séché et fruits de mer" },
  { label: "Salade", titre: "Salade Complète Végétarienne", prix: 1500, desc: "Œuf dur, maïs, crudités" },
];

export function MenusSemaine({ platsSemaine, semaineLundi, todayDate, isDemo, onError }: MenusSemaineProps) {
  const router = useRouter();
  const [plats, setPlats] = useState<PlatSemaine[]>(platsSemaine);
  const [isPending, startTransition] = useTransition();

  const jours = joursOuvres(semaineLundi);
  const joursModifiables = jours.filter((j) => j >= todayDate);

  const [jourCible, setJourCible] = useState<string>(joursModifiables[0] || jours[0]);
  const [titre, setTitre] = useState("");
  const [prix, setPrix] = useState("1500");
  const [desc, setDesc] = useState("");

  useEffect(() => setPlats(platsSemaine), [platsSemaine]);
  useEffect(() => {
    const modifiables = joursOuvres(semaineLundi).filter((j) => j >= todayDate);
    setJourCible(modifiables[0] || semaineLundi);
  }, [semaineLundi, todayDate]);

  const changerSemaine = (decalage: number) => {
    router.replace(`/rh?semaine=${ajouterJours(semaineLundi, decalage * 7)}`, { scroll: false });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) return;
    startTransition(async () => {
      const res = await addMenuPlatAction(titre.trim(), parseInt(prix, 10) || 1500, desc.trim() || undefined, jourCible);
      if (res.success && res.plat) {
        setPlats((prev) => [...prev, { ...res.plat, date: res.plat.date || jourCible }]);
        setTitre("");
        setDesc("");
        onError(null);
      } else {
        onError(res.message || "Impossible d'ajouter le plat.");
      }
    });
  };

  const toggle = (plat: PlatSemaine) => {
    setPlats((prev) => prev.map((p) => (p.id === plat.id ? { ...p, is_available: !p.is_available } : p)));
    startTransition(async () => {
      await togglePlatDisponibiliteAction(plat.id, !plat.is_available);
    });
  };

  const supprimer = (plat: PlatSemaine) => {
    startTransition(async () => {
      const res = await supprimerPlatAction(plat.id);
      if (res.success) {
        setPlats((prev) => prev.filter((p) => p.id !== plat.id));
        onError(null);
      } else {
        onError(res.message || "Suppression impossible.");
      }
    });
  };

  const dupliquer = () => {
    startTransition(async () => {
      const res = await dupliquerSemaineAction(semaineLundi);
      if (res.success && res.plats) {
        setPlats((prev) => [...prev, ...res.plats!]);
        onError(null);
      } else {
        onError(res.message || "Duplication impossible.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Navigation semaine */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changerSemaine(-1)}
            className="p-2 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-100 transition"
            title="Semaine précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-extrabold text-neutral-900">
            Semaine du {formatJourCourt(jours[0])} au {formatJourCourt(jours[4])}
          </h2>
          <button
            type="button"
            onClick={() => changerSemaine(1)}
            className="p-2 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-100 transition"
            title="Semaine suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {!isDemo && joursModifiables.length > 0 && (
          <button
            type="button"
            disabled={isPending}
            onClick={dupliquer}
            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CopyPlus className="w-4 h-4" />
            Dupliquer la semaine précédente
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire Saisie Plat */}
        <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4 h-fit">
          <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-orange-500" />
            Ajouter un plat
          </h3>

          {joursModifiables.length === 0 ? (
            <p className="text-xs text-neutral-500">Cette semaine est passée : elle n&apos;est plus modifiable.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => {
                      setTitre(s.titre);
                      setPrix(String(s.prix));
                      setDesc(s.desc);
                    }}
                    className="text-[11px] bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 px-2 py-1 rounded-lg font-medium transition"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Jour</label>
                  <select
                    value={jourCible}
                    onChange={(e) => setJourCible(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {joursModifiables.map((j) => (
                      <option key={j} value={j}>
                        {formatJourCourt(j)}
                        {j === todayDate ? " (aujourd'hui)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Nom du plat</label>
                  <input
                    type="text"
                    required
                    value={titre}
                    onChange={(e) => setTitre(e.target.value)}
                    placeholder="Ex: Thiéboudienne"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Prix (FCFA)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={prix}
                    onChange={(e) => setPrix(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Description courte</label>
                  <textarea
                    rows={2}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Ingrédients clés, garniture..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter au menu
                </button>
              </form>
            </>
          )}
        </div>

        {/* Grille Lundi → Vendredi */}
        <div className="lg:col-span-2 space-y-3">
          {jours.map((jour) => {
            const platsDuJour = plats.filter((p) => p.date === jour);
            const estPasse = jour < todayDate;
            const estAujourdhui = jour === todayDate;
            return (
              <div
                key={jour}
                className={`bg-white rounded-3xl p-5 border shadow-sm space-y-3 ${
                  estAujourdhui ? "border-orange-300" : "border-neutral-200"
                } ${estPasse ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-neutral-900 capitalize">{formatJourCourt(jour)}</h3>
                  <span className="text-[11px] text-neutral-500">
                    {estAujourdhui && <span className="text-orange-600 font-bold">Aujourd&apos;hui • </span>}
                    {platsDuJour.length} plat(s)
                  </span>
                </div>

                {platsDuJour.length === 0 ? (
                  <p className="text-xs text-neutral-400">
                    {estPasse ? "Aucun menu." : "Aucun plat : les employés verront « menu pas encore publié »."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {platsDuJour.map((plat) => (
                      <div
                        key={plat.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                          plat.is_available ? "border-neutral-200" : "border-neutral-200 bg-neutral-50 opacity-60"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-neutral-900 text-xs">{plat.titre}</span>
                            <span className="font-extrabold text-orange-600 text-xs">{formatFCFA(plat.prix_unitaire)}</span>
                            {!plat.is_available && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                Rupture
                              </span>
                            )}
                          </div>
                          {plat.description && <p className="text-[11px] text-neutral-500 truncate">{plat.description}</p>}
                        </div>

                        {!estPasse && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggle(plat)}
                              title={plat.is_available ? "Marquer en rupture" : "Remettre en stock"}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 transition"
                            >
                              {plat.is_available ? (
                                <ToggleRight className="w-5 h-5 text-emerald-600" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-neutral-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => supprimer(plat)}
                              title="Supprimer"
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
