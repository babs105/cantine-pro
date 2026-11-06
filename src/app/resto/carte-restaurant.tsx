"use client";

import { useEffect, useState, useTransition } from "react";
import { BookOpen, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { cn, formatFCFA } from "@/lib/utils";
import {
  ajouterPlatCarteAction,
  basculerPlatCarteAction,
  supprimerPlatCarteAction,
  type CibleRestaurant,
  type PlatCarte,
} from "./actions";

interface CarteRestaurantProps {
  cible: CibleRestaurant;
  companyNom: string;
  initialPlats: PlatCarte[];
  /** Variante claire en deux colonnes (dashboard du compte restaurant) ; sombre par défaut (lien restaurant) */
  clair?: boolean;
}

const STYLES = {
  sombre: {
    bloc: "bg-neutral-800 rounded-3xl p-5 border border-neutral-700",
    titre: "text-sm font-black text-white",
    sousTitre: "text-[11px] text-neutral-400",
    ligne: "p-3 rounded-2xl bg-neutral-900/60 border border-neutral-700/50",
    nomPlat: "text-sm font-semibold text-neutral-100",
    prix: "text-xs font-bold text-orange-400",
    desc: "text-[11px] text-neutral-400",
    badge: "bg-neutral-700 text-neutral-300",
    bouton: "hover:bg-neutral-700",
    poubelle: "text-neutral-500 hover:text-red-400 hover:bg-red-950/40",
    champ:
      "w-full text-sm px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500",
    label: "text-neutral-300",
    erreur: "text-red-400",
    vide: "text-neutral-500",
  },
  clair: {
    bloc: "bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm",
    titre: "text-sm font-extrabold text-neutral-900",
    sousTitre: "text-xs text-neutral-500",
    ligne: "p-3 rounded-2xl border border-neutral-200",
    nomPlat: "text-xs font-bold text-neutral-900",
    prix: "text-xs font-extrabold text-orange-600",
    desc: "text-[11px] text-neutral-500",
    badge: "bg-neutral-100 text-neutral-600",
    bouton: "hover:bg-neutral-100",
    poubelle: "text-neutral-400 hover:text-red-600 hover:bg-red-50",
    champ:
      "w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500",
    label: "text-neutral-700",
    erreur: "text-red-600",
    vide: "text-neutral-400",
  },
};

/** Carte du restaurant pour une entreprise : les plats saisis ici sont proposés au RH pour composer le menu du jour */
export function CarteRestaurant({ cible, companyNom, initialPlats, clair = false }: CarteRestaurantProps) {
  const st = STYLES[clair ? "clair" : "sombre"];
  const [plats, setPlats] = useState<PlatCarte[]>(initialPlats);
  const [titre, setTitre] = useState("");
  const [prix, setPrix] = useState("1500");
  const [desc, setDesc] = useState("");
  const [ouvert, setOuvert] = useState(clair || initialPlats.length === 0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setPlats(initialPlats), [initialPlats]);

  const ajouter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) return;
    startTransition(async () => {
      const res = await ajouterPlatCarteAction(cible, titre, parseInt(prix, 10) || 0, desc);
      if (res.success && res.plat) {
        setPlats((prev) => [...prev, res.plat!]);
        setTitre("");
        setDesc("");
        setErreur(null);
      } else {
        setErreur(res.message || "Erreur, réessayez.");
      }
    });
  };

  const basculer = (plat: PlatCarte) => {
    setPlats((prev) => prev.map((p) => (p.id === plat.id ? { ...p, is_active: !p.is_active } : p)));
    startTransition(async () => {
      const res = await basculerPlatCarteAction(cible, plat.id, !plat.is_active);
      if (!res.success) {
        setPlats((prev) => prev.map((p) => (p.id === plat.id ? { ...p, is_active: plat.is_active } : p)));
        setErreur(res.message || "Erreur, réessayez.");
      }
    });
  };

  const supprimer = (plat: PlatCarte) => {
    if (!confirm(`Retirer « ${plat.titre} » de votre carte ?`)) return;
    setPlats((prev) => prev.filter((p) => p.id !== plat.id));
    startTransition(async () => {
      const res = await supprimerPlatCarteAction(cible, plat.id);
      if (!res.success) {
        setPlats((prev) => [...prev, plat]);
        setErreur(res.message || "Erreur, réessayez.");
      }
    });
  };

  const formulaire = ouvert ? (
    <form onSubmit={ajouter} className="space-y-3">
      {clair && (
        <h3 className={cn(st.titre, "flex items-center gap-2")}>
          <Plus className="w-4 h-4 text-orange-500" />
          Ajouter un plat
        </h3>
      )}
      <div>
        {clair && <label className={cn("block text-xs font-bold mb-1", st.label)}>Nom du plat</label>}
        <input
          type="text"
          required
          maxLength={120}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Ex : Thiéboudienne"
          className={st.champ}
        />
      </div>
      <div>
        {clair && <label className={cn("block text-xs font-bold mb-1", st.label)}>Prix (FCFA)</label>}
        <input
          type="number"
          required
          min={0}
          max={100000}
          inputMode="numeric"
          value={prix}
          onChange={(e) => setPrix(e.target.value)}
          className={st.champ}
        />
      </div>
      <div>
        {clair && <label className={cn("block text-xs font-bold mb-1", st.label)}>Description courte</label>}
        <textarea
          rows={2}
          maxLength={300}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Garniture, accompagnement..."
          className={st.champ}
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" />
        {isPending ? "Enregistrement..." : "Ajouter à la carte"}
      </button>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => setOuvert(true)}
      className="w-full py-3 border border-dashed border-neutral-600 hover:border-orange-500 text-neutral-300 hover:text-orange-400 font-bold text-sm rounded-2xl transition flex items-center justify-center gap-2"
    >
      <Plus className="w-4 h-4" />
      Ajouter un plat
    </button>
  );

  const liste = (
    <div className="space-y-2">
      {plats.length === 0 && <p className={cn("text-xs text-center py-4", st.vide)}>Aucun plat sur cette carte.</p>}
      {plats.map((plat) => (
        <div
          key={plat.id}
          className={cn(st.ligne, "flex items-center justify-between gap-3", !plat.is_active && "opacity-50")}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={st.nomPlat}>{plat.titre}</span>
              <span className={st.prix}>{formatFCFA(plat.prix_unitaire)}</span>
              {!plat.is_active && (
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", st.badge)}>Indisponible</span>
              )}
            </div>
            {plat.description && <p className={cn("truncate", st.desc)}>{plat.description}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => basculer(plat)}
              title={plat.is_active ? "Marquer indisponible" : "Remettre disponible"}
              className={cn("p-1.5 rounded-lg transition", st.bouton)}
            >
              {plat.is_active ? (
                <ToggleRight className="w-5 h-5 text-emerald-500" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-neutral-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => supprimer(plat)}
              title="Supprimer"
              className={cn("p-1.5 rounded-lg transition", st.poubelle)}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const entete = (
    <div>
      <h2 className={cn(st.titre, "flex items-center gap-2")}>
        <BookOpen className="w-4 h-4 text-orange-500" />
        {clair ? `Carte pour ${companyNom}` : "Ma carte"} ({plats.length} plat{plats.length > 1 ? "s" : ""})
      </h2>
      <p className={cn(st.sousTitre, "mt-1")}>
        {companyNom} choisit parmi ces plats pour composer le menu du jour de ses collaborateurs.
      </p>
    </div>
  );

  if (clair) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={cn(st.bloc, "lg:col-span-1 h-fit")}>{formulaire}</div>
        <div className={cn(st.bloc, "lg:col-span-2 space-y-4")}>
          {entete}
          {erreur && <div className={cn("text-xs", st.erreur)}>{erreur}</div>}
          {liste}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(st.bloc, "mb-4 space-y-4")}>
      {entete}
      {erreur && <div className={cn("text-xs", st.erreur)}>{erreur}</div>}
      {plats.length > 0 && liste}
      {formulaire}
    </div>
  );
}
