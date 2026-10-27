"use client";

import { useState, useTransition } from "react";
import { Check, Clock, CreditCard, KeyRound, Settings } from "lucide-react";
import { PLANS, type EtatAbonnement } from "@/lib/abonnement";
import { NOMS_JOURS, normaliserJoursTravail } from "@/lib/dates";
import type { PlanId } from "@/types/database";
import { changerCodeRhAction, modifierParametresAction } from "./rapports-actions";

interface ParametresPanelProps {
  company: {
    nom: string;
    slug: string;
    heure_ouverture_vote: string;
    heure_limite_vote: string;
    responsable_nom?: string | null;
    email_contact?: string | null;
    telephone_contact?: string | null;
    plan?: PlanId | null;
    jours_travail?: number[] | null;
  };
  abonnement: EtatAbonnement;
  /** Numéro Wave de Cantine Pro pour le règlement (variable WAVE_NUMERO_PAIEMENT) */
  numeroWave: string | null;
  isDemo: boolean;
}

const champClasse =
  "w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500";

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

export function ParametresPanel({ company, abonnement, numeroWave, isDemo }: ParametresPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [messageCode, setMessageCode] = useState<{ ok: boolean; texte: string } | null>(null);
  const plan = PLANS[company.plan || "pro"];
  const [joursTravail, setJoursTravail] = useState<number[]>(normaliserJoursTravail(company.jours_travail));
  const basculerJour = (j: number) =>
    setJoursTravail((prev) => (prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j].sort((a, b) => a - b)));

  const enregistrer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await modifierParametresAction({
        nom: String(f.get("nom") || ""),
        heureOuverture: String(f.get("heureOuverture") || ""),
        heureLimite: String(f.get("heureLimite") || ""),
        responsable: String(f.get("responsable") || ""),
        email: String(f.get("email") || ""),
        telephone: String(f.get("telephone") || ""),
        joursTravail,
      });
      setMessage(res.success ? { ok: true, texte: "Paramètres enregistrés." } : { ok: false, texte: res.message || "Erreur." });
    });
  };

  const changerCode = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const nouveau = String(f.get("nouveau") || "");
    if (nouveau !== String(f.get("confirmation") || "")) {
      setMessageCode({ ok: false, texte: "Les deux nouveaux codes ne correspondent pas." });
      return;
    }
    startTransition(async () => {
      const res = await changerCodeRhAction(String(f.get("ancien") || ""), nouveau);
      if (res.success) form.reset();
      setMessageCode(res.success ? { ok: true, texte: "Code d'accès modifié." } : { ok: false, texte: res.message || "Erreur." });
    });
  };

  const Retour = ({ m }: { m: { ok: boolean; texte: string } | null }) =>
    m ? (
      <p className={`text-xs font-semibold ${m.ok ? "text-emerald-700" : "text-red-600"} flex items-center gap-1`}>
        {m.ok && <Check className="w-3.5 h-3.5" />}
        {m.texte}
      </p>
    ) : null;

  const couleurEtat =
    abonnement.envoiBloque
      ? "bg-red-50 border-red-200 text-red-800"
      : abonnement.etat === "en_retard"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : "bg-emerald-50 border-emerald-200 text-emerald-800";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form
        onSubmit={enregistrer}
        className="lg:col-span-2 bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4"
      >
        <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
          <Settings className="w-4 h-4 text-orange-500" />
          Entreprise et horaires
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 sm:col-span-2">
            <span className="block text-xs font-bold text-neutral-700">Nom de l&apos;entreprise</span>
            <input name="nom" required defaultValue={company.nom} className={champClasse} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold text-neutral-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Ouverture des commandes
            </span>
            <input
              type="time"
              name="heureOuverture"
              required
              defaultValue={company.heure_ouverture_vote.slice(0, 5)}
              className={champClasse}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold text-neutral-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Fin des commandes
            </span>
            <input
              type="time"
              name="heureLimite"
              required
              defaultValue={company.heure_limite_vote.slice(0, 5)}
              className={champClasse}
            />
          </label>
          <div className="space-y-1 sm:col-span-2">
            <span className="block text-xs font-bold text-neutral-700">Jours de travail (service cantine)</span>
            <div className="flex flex-wrap gap-1.5">
              {NOMS_JOURS.map((nom, i) => {
                const jour = i + 1;
                const actif = joursTravail.includes(jour);
                return (
                  <button
                    key={jour}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => basculerJour(jour)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      actif
                        ? "bg-orange-600 border-orange-600 text-white"
                        : "bg-white border-neutral-200 text-neutral-500 hover:border-orange-300"
                    }`}
                  >
                    {nom.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-neutral-500">
              Les menus, la duplication de semaine et les commandes des salariés suivent ces jours.
            </p>
          </div>
          <label className="space-y-1">
            <span className="block text-xs font-bold text-neutral-700">Responsable</span>
            <input name="responsable" defaultValue={company.responsable_nom || ""} className={champClasse} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold text-neutral-700">Téléphone</span>
            <input type="tel" name="telephone" defaultValue={company.telephone_contact || ""} className={champClasse} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="block text-xs font-bold text-neutral-700">E-mail (sert aussi d&apos;identifiant de connexion)</span>
            <input type="email" name="email" defaultValue={company.email_contact || ""} className={champClasse} />
          </label>
        </div>

        <p className="text-[11px] text-neutral-500">
          Identifiant de connexion : <strong className="text-neutral-800">{company.slug}</strong>. Les nouvelles heures
          s&apos;appliquent immédiatement aux salariés.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending || isDemo || joursTravail.length === 0}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
          >
            Enregistrer
          </button>
          <Retour m={message} />
        </div>
      </form>

      <div className="space-y-6">
        <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
          <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-orange-500" />
            Abonnement
          </h2>
          <div className={`p-3 rounded-2xl border text-xs space-y-1 ${couleurEtat}`}>
            <p className="font-bold">
              {abonnement.libelle} — offre {plan.nom}
            </p>
            {abonnement.echeance && (
              <p>
                {abonnement.joursRestants !== null && abonnement.joursRestants >= 0
                  ? `Jusqu'au ${formatDate(abonnement.echeance)} (${abonnement.joursRestants} jour(s))`
                  : `Échéance dépassée depuis le ${formatDate(abonnement.echeance)}`}
              </p>
            )}
            {abonnement.envoiBloque && (
              <p className="font-semibold">L&apos;envoi des commandes aux restaurants est suspendu.</p>
            )}
          </div>
          <p className="text-xs text-neutral-600">
            {plan.prix.toLocaleString("fr-FR")} FCFA / mois, jusqu&apos;à {plan.maxEmployes} salariés.
          </p>
          <p className="text-xs text-neutral-600">
            Règlement par <strong>Wave</strong>
            {numeroWave ? (
              <>
                {" "}au <strong className="text-neutral-900">{numeroWave}</strong>
              </>
            ) : null}{" "}
            en indiquant « {company.nom} » : l&apos;abonnement est prolongé dès réception.
          </p>
        </div>

        <form onSubmit={changerCode} className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3">
          <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-orange-500" />
            Code d&apos;accès RH
          </h2>
          <input
            type="password"
            name="ancien"
            required
            placeholder="Code actuel"
            autoComplete="current-password"
            className={champClasse}
          />
          <input
            type="password"
            name="nouveau"
            required
            minLength={8}
            placeholder="Nouveau code (8 caractères min.)"
            autoComplete="new-password"
            className={champClasse}
          />
          <input
            type="password"
            name="confirmation"
            required
            minLength={8}
            placeholder="Confirmer le nouveau code"
            autoComplete="new-password"
            className={champClasse}
          />
          <button
            type="submit"
            disabled={isPending || isDemo}
            className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
          >
            Changer le code
          </button>
          <Retour m={messageCode} />
        </form>
      </div>
    </div>
  );
}
