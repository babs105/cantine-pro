"use client";

import { useEffect, useState, useTransition } from "react";
import { Utensils, CheckCircle2, Clock, AlertTriangle, UserCheck, XCircle } from "lucide-react";
import { formatFCFA } from "@/lib/utils";

interface Plat {
  id: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_available: boolean;
}

interface CommandeVote {
  id?: string;
  plat_id: string | null;
  statut: "choisi" | "absent" | "ne_mange_pas";
  plat_titre?: string;
}

interface VoteClientProps {
  token: string;
  employeNom: string;
  companyNom: string;
  heureLimite: string; // "11:00:00"
  dateAujourdhuiStr: string; // "26 Octobre 2026"
  isVerrouille: boolean;
  platsDisponibles: Plat[];
  commandeExistante: CommandeVote | null;
  onVoteAction: (
    token: string,
    statut: "choisi" | "absent" | "ne_mange_pas",
    platId: string | null
  ) => Promise<{ success: boolean; message?: string }>;
}

export function VoteClient({
  token,
  employeNom,
  companyNom,
  heureLimite,
  dateAujourdhuiStr,
  isVerrouille,
  platsDisponibles,
  commandeExistante,
  onVoteAction,
}: VoteClientProps) {
  const [commande, setCommande] = useState<CommandeVote | null>(commandeExistante);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModifying, setIsModifying] = useState<boolean>(false);

  // Sauvegarde automatique du token dans le smartphone (PWA - Jour 3)
  useEffect(() => {
    if (typeof window !== "undefined" && token) {
      localStorage.setItem("cantine_pro_saved_token", token);
      localStorage.setItem("cantine_pro_saved_nom", employeNom);
    }
  }, [token, employeNom]);

  const handleVote = (
    statut: "choisi" | "absent" | "ne_mange_pas",
    platId: string | null,
    platTitre?: string
  ) => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await onVoteAction(token, statut, platId);
        if (res.success) {
          setCommande({
            plat_id: platId,
            statut,
            plat_titre: platTitre,
          });
          setIsModifying(false);
        } else {
          setErrorMessage(res.message || "Une erreur est survenue.");
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Erreur de connexion.");
      }
    });
  };

  const formattedHeureLimite = heureLimite.slice(0, 5); // "11:00"

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6 max-w-md mx-auto flex flex-col justify-between">
      <div>
        {/* Header Entreprise & Collaborateur */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-neutral-100 mb-4">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            <span>{companyNom}</span>
            <span className="text-orange-600 font-bold">{dateAujourdhuiStr}</span>
          </div>

          <h1 className="text-xl font-extrabold text-neutral-900 flex items-center gap-2">
            Bonjour {employeNom.split(" ")[0]} 👋
          </h1>

          <div className="mt-3 flex items-center justify-between pt-3 border-t border-neutral-100 text-xs">
            <div className="flex items-center gap-1.5 text-neutral-600 font-medium">
              <Clock className="w-4 h-4 text-orange-500" />
              <span>Clôture des choix :</span>
            </div>
            <span
              className={`font-bold px-2 py-0.5 rounded-full ${
                isVerrouille
                  ? "bg-red-100 text-red-700"
                  : "bg-orange-100 text-orange-800"
              }`}
            >
              {isVerrouille ? "Verrouillé à " + formattedHeureLimite : formattedHeureLimite + " précises"}
            </span>
          </div>
        </div>

        {/* Message d'erreur éventuel */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* AVERTISSEMENT SI CLÔTURÉ */}
        {isVerrouille && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              L&apos;heure limite ({formattedHeureLimite}) est passée. La commande est en cours de préparation chez le traiteur.
            </span>
          </div>
        )}

        {/* ÉTAT : DÉJÀ VOTÉ (ET PAS EN MODE MODIFICATION) */}
        {commande && !isModifying ? (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-emerald-600 mb-1">
                Choix Enregistré
              </p>
              <h2 className="text-lg font-extrabold text-neutral-900">
                {commande.statut === "choisi"
                  ? commande.plat_titre || "Plat du jour"
                  : commande.statut === "absent"
                  ? "Déclaré(e) Absent(e)"
                  : "Ne mange pas à la cantine"}
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                {commande.statut === "choisi"
                  ? "Votre repas sera prêt pour la pause de 12h30."
                  : "C'est bien noté pour aujourd'hui."}
              </p>
            </div>

            {/* Modification possible uniquement avant 11h00 */}
            {!isVerrouille && (
              <button
                type="button"
                onClick={() => setIsModifying(true)}
                className="w-full py-2.5 px-4 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 active:scale-98 transition rounded-xl"
              >
                Changer d&apos;avis avant {formattedHeureLimite}
              </button>
            )}
          </div>
        ) : (
          /* SÉLECTION DES PLATS (VOTE ACTIF) */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-800 flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-orange-500" />
                Menu proposé aujourd&apos;hui
              </h2>
              {isModifying && (
                <button
                  type="button"
                  onClick={() => setIsModifying(false)}
                  className="text-xs text-neutral-500 underline"
                >
                  Annuler la modif
                </button>
              )}
            </div>

            {platsDisponibles.length === 0 ? (
              <div className="bg-white p-8 rounded-3xl text-center border border-neutral-100">
                <Utensils className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-xs text-neutral-500">
                  Le menu du jour n&apos;est pas encore publié par le responsable.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {platsDisponibles.map((plat) => (
                  <div
                    key={plat.id}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 hover:border-orange-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-neutral-900 text-sm">
                          {plat.titre}
                        </h3>
                        <span className="font-extrabold text-orange-600 text-sm whitespace-nowrap">
                          {formatFCFA(plat.prix_unitaire)}
                        </span>
                      </div>
                      {plat.description && (
                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                          {plat.description}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isVerrouille || isPending}
                      onClick={() => handleVote("choisi", plat.id, plat.titre)}
                      className="mt-3.5 w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition flex items-center justify-center gap-2"
                    >
                      {isPending ? "Validation..." : "Commander ce plat"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* OPTIONS "ABSENT / NE MANGE PAS" */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isVerrouille || isPending}
                onClick={() => handleVote("absent", null)}
                className="py-2.5 px-3 bg-white border border-neutral-200 hover:bg-neutral-50 active:scale-98 disabled:opacity-50 text-neutral-700 font-medium text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5 text-neutral-500" />
                Absent(e)
              </button>

              <button
                type="button"
                disabled={isVerrouille || isPending}
                onClick={() => handleVote("ne_mange_pas", null)}
                className="py-2.5 px-3 bg-white border border-neutral-200 hover:bg-neutral-50 active:scale-98 disabled:opacity-50 text-neutral-700 font-medium text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5 text-neutral-500" />
                Ne mange pas
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER DISCRET PWA */}
      <footer className="mt-8 text-center text-[11px] text-neutral-400">
        ⚡ Cantine Pro — Vote ultra-rapide mobile
      </footer>
    </div>
  );
}
