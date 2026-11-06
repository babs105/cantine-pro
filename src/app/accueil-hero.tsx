"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Check, Store } from "lucide-react";
import { cn } from "@/lib/utils";

type Public = "entreprise" | "restaurant";

const CONTENU: Record<
  Public,
  {
    titre: React.ReactNode;
    texte: string;
    points: string[];
    cta: { href: string; label: string };
    secondaire: { href: string; label: string };
    mention: string;
  }
> = {
  entreprise: {
    titre: (
      <>
        Le déjeuner de vos équipes, <span className="text-orange-600">commandé avant 11h10.</span>
      </>
    ),
    texte:
      "Vos restaurants publient leurs menus, vos salariés commandent sur leur téléphone, chaque restaurant reçoit les quantités exactes. En fin de mois, vous ne payez que les repas confirmés.",
    points: ["Sans appli à installer pour les salariés", "Récap WhatsApp automatique", "Facture et export paie prêts"],
    cta: { href: "/inscription", label: "Essai gratuit 14 jours" },
    secondaire: { href: "/rh/login", label: "Espace RH" },
    mention: "Sans carte bancaire • Opérationnel en 10 minutes",
  },
  restaurant: {
    titre: (
      <>
        Vos clients entreprises, <span className="text-orange-600">sur un seul écran.</span>
      </>
    ),
    texte:
      "Publiez vos menus de la semaine pour chaque entreprise que vous livrez. À 11h10, vous recevez les quantités fermes, vous confirmez en un clic, et vous suivez ce que vous avez à facturer.",
    points: ["Vos menus apparaissent chez l'entreprise", "Plus de plats préparés pour rien", "100 % gratuit"],
    cta: { href: "/resto/inscription", label: "Créer mon espace restaurant" },
    secondaire: { href: "/resto/login", label: "Espace restaurant" },
    mention: "Gratuit pour les restaurants • Un code partenaire suffit",
  },
};

/** Accroche de l'accueil avec bascule Entreprise / Restaurant */
export function AccueilHero() {
  const [pour, setPour] = useState<Public>("entreprise");
  const c = CONTENU[pour];

  return (
    <div className="space-y-6">
      <div className="inline-flex p-1 rounded-2xl bg-white border border-orange-200 shadow-sm" role="tablist">
        {(
          [
            { id: "entreprise", prefixe: "Je suis une ", label: "entreprise", icone: Building2 },
            { id: "restaurant", prefixe: "Je suis un ", label: "restaurant", icone: Store },
          ] as const
        ).map(({ id, prefixe, label, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pour === id}
            onClick={() => setPour(id)}
            className={cn(
              "px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5",
              pour === id ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            <Icone className="w-4 h-4" />
            <span className="whitespace-nowrap">
              <span className="hidden sm:inline">{prefixe}</span>
              <span className="sm:hidden capitalize">{label}</span>
              <span className="hidden sm:inline">{label}</span>
            </span>
          </button>
        ))}
      </div>

      <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[1.08] text-neutral-900">
        {c.titre}
      </h1>
      <p className="text-base sm:text-lg text-neutral-600 max-w-xl leading-relaxed">{c.texte}</p>

      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {c.points.map((p) => (
          <li key={p} className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
            <Check className="w-4 h-4 text-emerald-600" />
            {p}
          </li>
        ))}
      </ul>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={c.cta.href}
          className="px-6 py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-orange-600/25 transition flex items-center justify-center gap-2"
        >
          {c.cta.label} <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href={c.secondaire.href}
          className="px-6 py-3.5 bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 font-bold text-sm rounded-2xl transition text-center"
        >
          {c.secondaire.label}
        </Link>
      </div>
      <p className="text-xs text-neutral-500">{c.mention}</p>
    </div>
  );
}
