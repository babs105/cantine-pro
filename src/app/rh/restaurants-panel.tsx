"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Plus, Store, ToggleLeft, ToggleRight } from "lucide-react";
import { addRestaurantAction, modifierRestaurantAction } from "./actions";
import type { RestaurantInfo } from "./recap-restaurant";

interface RestaurantsPanelProps {
  restaurants: RestaurantInfo[];
  appBaseUrl: string;
  onError: (message: string | null) => void;
}

export function RestaurantsPanel({ restaurants: initial, appBaseUrl, onError }: RestaurantsPanelProps) {
  const [restaurants, setRestaurants] = useState<RestaurantInfo[]>(initial);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [heure, setHeure] = useState("12:30");
  const [copie, setCopie] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setRestaurants(initial), [initial]);

  const ajouter = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addRestaurantAction(nom, telephone, heure);
      if (res.success && res.restaurant) {
        setRestaurants((prev) => [...prev, { ...res.restaurant, lien: `${appBaseUrl}/resto/${res.restaurant.token}` }]);
        setNom("");
        setTelephone("");
        onError(null);
      } else {
        onError(res.message || "Impossible d'ajouter le restaurant.");
      }
    });
  };

  const modifier = (r: RestaurantInfo, champs: Parameters<typeof modifierRestaurantAction>[1]) => {
    setRestaurants((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              ...(champs.telephone !== undefined ? { telephone_whatsapp: champs.telephone || null } : {}),
              ...(champs.heureLivraison ? { heure_livraison: champs.heureLivraison } : {}),
              ...(champs.isActive !== undefined ? { is_active: champs.isActive } : {}),
            }
          : x
      )
    );
    startTransition(async () => {
      const res = await modifierRestaurantAction(r.id, champs);
      if (!res.success) onError(res.message || "Modification impossible.");
    });
  };

  const copierLien = (r: RestaurantInfo) => {
    navigator.clipboard.writeText(r.lien);
    setCopie(r.id);
    setTimeout(() => setCopie(null), 2500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form
        onSubmit={ajouter}
        className="lg:col-span-1 bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3 h-fit"
      >
        <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-orange-500" />
          Ajouter un restaurant
        </h2>
        <p className="text-xs text-neutral-500">
          À 11h10, chaque restaurant reçoit sur WhatsApp le récapitulatif de ses plats commandés.
        </p>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">Nom</label>
          <input
            type="text"
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex: Chez Fatou Traiteur"
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">Numéro WhatsApp</label>
          <input
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="+221 77..."
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">Heure de livraison</label>
          <input
            type="time"
            value={heure}
            onChange={(e) => setHeure(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || nom.trim().length < 2}
          className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Ajouter le restaurant
        </button>
      </form>

      <div className="lg:col-span-2 space-y-3">
        {restaurants.length === 0 ? (
          <div className="bg-white rounded-3xl p-6 border border-neutral-200 text-center text-xs text-neutral-500">
            Aucun restaurant : ajoutez vos restaurants partenaires pour pouvoir publier leurs menus.
          </div>
        ) : (
          restaurants.map((r) => (
            <div
              key={r.id}
              className={`bg-white rounded-3xl p-5 border border-neutral-200 shadow-sm space-y-3 ${
                r.is_active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
                  <Store className="w-4 h-4 text-orange-500" />
                  {r.nom}
                </h3>
                <button
                  type="button"
                  onClick={() => modifier(r, { isActive: !r.is_active })}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border bg-white hover:bg-neutral-100 transition"
                >
                  {r.is_active ? (
                    <>
                      <ToggleRight className="w-5 h-5 text-emerald-600" />
                      <span className="text-emerald-700">Actif</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-5 h-5 text-neutral-400" />
                      <span className="text-neutral-500">Inactif</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="block font-bold text-neutral-500">WhatsApp</span>
                  <input
                    type="tel"
                    defaultValue={r.telephone_whatsapp || ""}
                    placeholder="+221 77..."
                    onBlur={(e) =>
                      e.target.value !== (r.telephone_whatsapp || "") && modifier(r, { telephone: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block font-bold text-neutral-500">Livraison</span>
                  <input
                    type="time"
                    defaultValue={(r.heure_livraison || "12:30").slice(0, 5)}
                    onBlur={(e) =>
                      e.target.value &&
                      e.target.value !== (r.heure_livraison || "").slice(0, 5) &&
                      modifier(r, { heureLivraison: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </label>
                <div className="space-y-1">
                  <span className="block font-bold text-neutral-500">Lien de confirmation</span>
                  <div className="flex gap-1.5">
                    <a
                      href={`/resto/${r.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ouvrir
                    </a>
                    <button
                      type="button"
                      onClick={() => copierLien(r)}
                      className="flex-1 px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      {copie === r.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      {copie === r.id ? "Copié !" : "Copier"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
