"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, CopyPlus, Lock, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { cn, formatFCFA } from "@/lib/utils";
import { ajouterJours, formatJourCourt, joursOuvres } from "@/lib/dates";
import {
  ajouterPlatMenuRestoAction,
  basculerPlatMenuRestoAction,
  copierSemainePrecedenteRestoAction,
  retirerPlatMenuRestoAction,
  type PlatCarte,
  type PlatMenuResto,
} from "./actions";

export interface EntrepriseMenus {
  restaurantId: string;
  companyNom: string;
  heureLimite: string;
  joursTravail: number[];
  aujourdhuiModifiable: boolean;
  carte: PlatCarte[];
  menusSemaine: PlatMenuResto[];
}

interface MenusSemaineRestoProps {
  entreprises: EntrepriseMenus[];
  semaineLundi: string;
  todayDate: string;
  onAllerALaCarte: () => void;
}

/**
 * Menus de la semaine publiés par le restaurant, entreprise par entreprise.
 * Chaque plat ajouté ici apparaît aussitôt dans les menus de l'entreprise (Espace RH et page des salariés).
 */
export function MenusSemaineResto({ entreprises, semaineLundi, todayDate, onAllerALaCarte }: MenusSemaineRestoProps) {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState(entreprises[0].restaurantId);
  const entreprise = entreprises.find((e) => e.restaurantId === restaurantId) || entreprises[0];

  const [plats, setPlats] = useState<PlatMenuResto[]>(entreprise.menusSemaine);
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setPlats(entreprise.menusSemaine), [entreprise.menusSemaine]);

  const jours = joursOuvres(semaineLundi, entreprise.joursTravail);
  const carteActive = entreprise.carte.filter((p) => p.is_active);
  const estModifiable = (jour: string) =>
    jour > todayDate || (jour === todayDate && entreprise.aujourdhuiModifiable);
  const auMoinsUnJourModifiable = jours.some(estModifiable);

  const changerSemaine = (decalage: number) => {
    setMessage(null);
    startTransition(() =>
      router.replace(`/resto?onglet=menus&semaine=${ajouterJours(semaineLundi, decalage * 7)}`, { scroll: false })
    );
  };

  const resultat = (res: { success: boolean; message?: string }, succes?: string) =>
    setMessage(res.success ? (succes ? { ok: true, texte: succes } : null) : { ok: false, texte: res.message || "Erreur, réessayez." });

  const ajouter = (jour: string) => {
    const platCarteId = choix[jour] || carteActive.find((p) => !plats.some((m) => m.date === jour && m.titre === p.titre))?.id;
    if (!platCarteId) return;
    startTransition(async () => {
      const res = await ajouterPlatMenuRestoAction(entreprise.restaurantId, jour, platCarteId);
      if (res.success && res.plat) {
        setPlats((prev) => [...prev, res.plat!]);
        setChoix((prev) => ({ ...prev, [jour]: "" }));
      }
      resultat(res);
    });
  };

  const basculer = (plat: PlatMenuResto) => {
    setPlats((prev) => prev.map((p) => (p.id === plat.id ? { ...p, is_available: !p.is_available } : p)));
    startTransition(async () => {
      const res = await basculerPlatMenuRestoAction(entreprise.restaurantId, plat.id, !plat.is_available);
      if (!res.success) {
        setPlats((prev) => prev.map((p) => (p.id === plat.id ? { ...p, is_available: plat.is_available } : p)));
      }
      resultat(res);
    });
  };

  const retirer = (plat: PlatMenuResto) => {
    startTransition(async () => {
      const res = await retirerPlatMenuRestoAction(entreprise.restaurantId, plat.id);
      if (res.success) setPlats((prev) => prev.filter((p) => p.id !== plat.id));
      resultat(res);
    });
  };

  const copierSemaine = () => {
    startTransition(async () => {
      const res = await copierSemainePrecedenteRestoAction(entreprise.restaurantId, semaineLundi);
      if (res.success && res.plats) setPlats((prev) => [...prev, ...res.plats!]);
      resultat(res, res.message);
    });
  };

  return (
    <div className="space-y-5">
      {/* Choix de l'entreprise */}
      {entreprises.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {entreprises.map((e) => (
            <button
              key={e.restaurantId}
              type="button"
              onClick={() => {
                setRestaurantId(e.restaurantId);
                setChoix({});
                setMessage(null);
              }}
              className={cn(
                "shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5",
                e.restaurantId === entreprise.restaurantId
                  ? "bg-orange-600 border-orange-600 text-white"
                  : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              {e.companyNom}
            </button>
          ))}
        </div>
      )}

      {/* Navigation semaine + copie */}
      <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3", isPending && "opacity-70")}>
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
            Semaine du {formatJourCourt(jours[0])} au {formatJourCourt(jours[jours.length - 1])}
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
        {auMoinsUnJourModifiable && (
          <button
            type="button"
            disabled={isPending}
            onClick={copierSemaine}
            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <CopyPlus className="w-4 h-4" />
            Reprendre ma semaine précédente
          </button>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Les plats que vous ajoutez ici apparaissent automatiquement dans le menu de{" "}
        <strong>{entreprise.companyNom}</strong> : le RH les voit et les salariés peuvent les commander. Le menu
        d&apos;aujourd&apos;hui se ferme à {entreprise.heureLimite.slice(0, 5).replace(":", "h")}.
      </p>

      {message && (
        <div
          className={cn(
            "p-3 rounded-2xl text-xs border",
            message.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
          )}
        >
          {message.texte}
        </div>
      )}

      {carteActive.length === 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>Votre carte pour {entreprise.companyNom} est vide : ajoutez d&apos;abord vos plats et vos prix.</span>
          <button
            type="button"
            onClick={onAllerALaCarte}
            className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition"
          >
            Remplir ma carte
          </button>
        </div>
      )}

      {/* Grille des jours de service de l'entreprise */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {jours.map((jour) => {
          const platsDuJour = plats.filter((p) => p.date === jour);
          const modifiable = estModifiable(jour);
          const estAujourdhui = jour === todayDate;
          const proposables = carteActive.filter((p) => !platsDuJour.some((m) => m.titre === p.titre));
          return (
            <div
              key={jour}
              className={cn(
                "bg-white rounded-3xl p-5 border shadow-sm space-y-3",
                estAujourdhui ? "border-orange-300" : "border-neutral-200",
                jour < todayDate && "opacity-60"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-neutral-900 capitalize">{formatJourCourt(jour)}</h3>
                <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                  {estAujourdhui && <span className="text-orange-600 font-bold">Aujourd&apos;hui •</span>}
                  {!modifiable && <Lock className="w-3 h-3" />}
                  {platsDuJour.length} plat(s)
                </span>
              </div>

              {platsDuJour.length === 0 ? (
                <p className="text-xs text-neutral-400">{modifiable ? "Aucun plat proposé ce jour-là." : "Aucun plat."}</p>
              ) : (
                <div className="space-y-2">
                  {platsDuJour.map((plat) => (
                    <div
                      key={plat.id}
                      className={cn(
                        "p-2.5 rounded-2xl border flex items-center justify-between gap-2",
                        plat.is_available ? "border-neutral-200" : "border-neutral-200 bg-neutral-50 opacity-60"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-neutral-900 text-xs">{plat.titre}</span>
                          <span className="font-extrabold text-orange-600 text-xs">{formatFCFA(plat.prix_unitaire)}</span>
                          {!plat.is_available && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">Rupture</span>
                          )}
                          {plat.ajoute_par === "rh" && (
                            <span
                              title="Plat ajouté par le RH de l'entreprise"
                              className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full font-semibold"
                            >
                              Ajouté par l&apos;entreprise
                            </span>
                          )}
                        </div>
                      </div>
                      {modifiable && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => basculer(plat)}
                            title={plat.is_available ? "Marquer en rupture" : "Remettre en vente"}
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
                            onClick={() => retirer(plat)}
                            title="Retirer du menu"
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

              {modifiable && proposables.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <select
                    value={choix[jour] || ""}
                    onChange={(e) => setChoix((prev) => ({ ...prev, [jour]: e.target.value }))}
                    className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">{proposables[0].titre} ({formatFCFA(proposables[0].prix_unitaire)})</option>
                    {proposables.slice(1).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.titre} ({formatFCFA(p.prix_unitaire)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => ajouter(jour)}
                    className="shrink-0 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
