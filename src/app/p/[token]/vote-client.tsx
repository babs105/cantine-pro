"use client";

import { useEffect, useState, useTransition } from "react";
import { Utensils, CheckCircle2, Clock, AlertTriangle, UserCheck, XCircle, WifiOff } from "lucide-react";
import { formatFCFA } from "@/lib/utils";
import { InstallBanner } from "./install-banner";

interface Plat {
  id: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_available: boolean;
  restaurant_nom?: string;
}

interface CommandeVote {
  id?: string;
  plat_id: string | null;
  statut: "choisi" | "absent" | "ne_mange_pas";
  plat_titre?: string;
  enregistre_at?: string;
}

/** Choix fait sans réseau, gardé dans le téléphone jusqu'au retour de la connexion */
interface CommandeEnAttente {
  statut: CommandeVote["statut"];
  platId: string | null;
  platTitre?: string;
}

interface VoteClientProps {
  token: string;
  employeNom: string;
  companyNom: string;
  heureLimite: string; // "11:10:00"
  heureOuverture: string; // "08:00:00"
  secondesAvantOuverture: number;
  dateAujourdhuiStr: string; // "26 Octobre 2026"
  isVerrouille: boolean;
  secondesRestantes: number; // calculé côté serveur (heure de Dakar), indépendant de l'horloge du téléphone
  platsDisponibles: Plat[];
  commandeExistante: CommandeVote | null;
  onVoteAction: (
    token: string,
    statut: "choisi" | "absent" | "ne_mange_pas",
    platId: string | null
  ) => Promise<{ success: boolean; message?: string; enregistreAt?: string }>;
}

function formatTempsRestant(secondes: number): string {
  const h = Math.floor(secondes / 3600);
  const m = Math.ceil((secondes % 3600) / 60);
  if (h === 0) return m <= 1 ? "moins d'1 min" : `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m.toString().padStart(2, "0")}`;
}

function formatHeureLocale(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dakar",
  }).format(new Date(iso));
}

export function VoteClient({
  token,
  employeNom,
  companyNom,
  heureLimite,
  heureOuverture,
  secondesAvantOuverture,
  dateAujourdhuiStr,
  isVerrouille: verrouilleInitial,
  secondesRestantes,
  platsDisponibles,
  commandeExistante,
  onVoteAction,
}: VoteClientProps) {
  const [commande, setCommande] = useState<CommandeVote | null>(commandeExistante);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isModifying, setIsModifying] = useState<boolean>(false);

  // Comptes à rebours (ouverture puis clôture) ; l'interface s'ouvre et se verrouille d'elle-même
  const [restant, setRestant] = useState<number>(secondesRestantes);
  const [avantOuverture, setAvantOuverture] = useState<number>(secondesAvantOuverture);
  useEffect(() => {
    if (verrouilleInitial) return;
    const debut = Date.now();
    const tick = () => {
      const ecoule = (Date.now() - debut) / 1000;
      setRestant(Math.max(0, Math.round(secondesRestantes - ecoule)));
      setAvantOuverture(Math.max(0, Math.round(secondesAvantOuverture - ecoule)));
    };
    const interval = setInterval(tick, 15_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [verrouilleInitial, secondesRestantes, secondesAvantOuverture]);
  const isVerrouille = verrouilleInitial || restant <= 0;
  const pasEncoreOuvert = !isVerrouille && avantOuverture > 0;
  const voteImpossible = isVerrouille || pasEncoreOuvert;
  const formattedHeureOuverture = heureOuverture.slice(0, 5).replace(":", "h");

  // Plats regroupés par restaurant, dans l'ordre du menu
  const parRestaurant = platsDisponibles.reduce<Array<{ restaurant: string; plats: Plat[] }>>((groupes, plat) => {
    const nom = plat.restaurant_nom || "Menu du jour";
    const groupe = groupes.find((g) => g.restaurant === nom);
    if (groupe) groupe.plats.push(plat);
    else groupes.push({ restaurant: nom, plats: [plat] });
    return groupes;
  }, []);

  // Sauvegarde automatique du token dans le smartphone (PWA - Jour 3)
  useEffect(() => {
    if (typeof window !== "undefined" && token) {
      localStorage.setItem("cantine_pro_saved_token", token);
      localStorage.setItem("cantine_pro_saved_nom", employeNom);
    }
  }, [token, employeNom]);

  // Coupure réseau : le choix est gardé dans le téléphone et envoyé dès le retour de la connexion
  const cleAttente = `cantine_pro_commande_en_attente_${token}`;
  const [enAttente, setEnAttente] = useState<CommandeEnAttente | null>(null);

  const garderEnAttente = (c: CommandeEnAttente | null) => {
    setEnAttente(c);
    try {
      if (c) localStorage.setItem(cleAttente, JSON.stringify(c));
      else localStorage.removeItem(cleAttente);
    } catch {
      // stockage indisponible (navigation privée) : le choix reste en mémoire tant que la page est ouverte
    }
  };

  const envoyer = async (c: CommandeEnAttente): Promise<"ok" | "hors_ligne" | "refuse"> => {
    try {
      const res = await onVoteAction(token, c.statut, c.platId);
      if (res.success) {
        setCommande({ plat_id: c.platId, statut: c.statut, plat_titre: c.platTitre, enregistre_at: res.enregistreAt });
        setIsModifying(false);
        return "ok";
      }
      setErrorMessage(res.message || "Une erreur est survenue.");
      return "refuse";
    } catch {
      // L'appel n'a pas atteint le serveur (réseau coupé)
      return "hors_ligne";
    }
  };

  const handleVote = (
    statut: "choisi" | "absent" | "ne_mange_pas",
    platId: string | null,
    platTitre?: string
  ) => {
    setErrorMessage(null);
    const choix = { statut, platId, platTitre };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      garderEnAttente(choix);
      setIsModifying(false);
      return;
    }
    startTransition(async () => {
      const resultat = await envoyer(choix);
      if (resultat === "hors_ligne") {
        garderEnAttente(choix);
        setIsModifying(false);
      } else {
        garderEnAttente(null);
      }
    });
  };

  // Au chargement et à chaque retour du réseau : envoi du choix en attente
  useEffect(() => {
    let attente: CommandeEnAttente | null = null;
    try {
      attente = JSON.parse(localStorage.getItem(cleAttente) || "null");
    } catch {
      attente = null;
    }
    if (attente) setEnAttente(attente);

    const synchroniser = () => {
      let c: CommandeEnAttente | null = null;
      try {
        c = JSON.parse(localStorage.getItem(cleAttente) || "null");
      } catch {
        c = null;
      }
      if (!c || !navigator.onLine) return;
      startTransition(async () => {
        const resultat = await envoyer(c!);
        if (resultat !== "hors_ligne") garderEnAttente(null);
      });
    };
    synchroniser();
    window.addEventListener("online", synchroniser);
    return () => window.removeEventListener("online", synchroniser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleAttente]);

  const formattedHeureLimite = heureLimite.slice(0, 5); // "11:10"

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

          {pasEncoreOuvert && (
            <div className="mt-3 text-center text-xs font-bold py-2 rounded-xl bg-blue-50 text-blue-800">
              🕗 Les commandes ouvrent à {formattedHeureOuverture} (dans {formatTempsRestant(avantOuverture)})
            </div>
          )}

          {!voteImpossible && (
            <div
              className={`mt-3 text-center text-xs font-bold py-2 rounded-xl ${
                restant <= 15 * 60 ? "bg-red-50 text-red-700 animate-pulse" : "bg-orange-50 text-orange-800"
              }`}
            >
              ⏱️ Il vous reste {formatTempsRestant(restant)} pour choisir
            </div>
          )}
        </div>

        {enAttente && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-start gap-2">
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Pas de réseau : votre choix «{" "}
              {enAttente.statut === "choisi"
                ? enAttente.platTitre || "Plat du jour"
                : enAttente.statut === "absent"
                  ? "Absent(e)"
                  : "Ne mange pas"}{" "}
              » sera envoyé automatiquement dès le retour de la connexion, avant {heureLimite.slice(0, 5)}. Gardez
              cette page ouverte.
            </span>
          </div>
        )}

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
              Les commandes sont clôturées pour aujourd&apos;hui ({formattedHeureLimite}). La commande est en cours de préparation au restaurant.
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
                Choix enregistré{commande.enregistre_at ? ` à ${formatHeureLocale(commande.enregistre_at)}` : ""}
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

            {/* Modification possible uniquement avant l'heure limite (11h10) */}
            {!voteImpossible && (
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
              <div className="space-y-5">
                {parRestaurant.map((groupe) => (
                  <div key={groupe.restaurant} className="space-y-3">
                    {parRestaurant.length > 1 && (
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-1">
                        🍲 {groupe.restaurant}
                      </h3>
                    )}
                    {groupe.plats.map((plat) => (
                      <div
                        key={plat.id}
                        className={`bg-white rounded-2xl p-4 shadow-sm border transition-all flex flex-col justify-between ${
                          commande?.plat_id === plat.id
                            ? "border-emerald-400 ring-2 ring-emerald-100"
                            : "border-neutral-100 hover:border-orange-300"
                        }`}
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
                          disabled={voteImpossible || isPending}
                          onClick={() => handleVote("choisi", plat.id, plat.titre)}
                          className="mt-3.5 w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition flex items-center justify-center gap-2"
                        >
                          {isPending ? "Validation..." : commande?.plat_id === plat.id ? "✓ Votre choix actuel" : "Commander ce plat"}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* OPTIONS "ABSENT / NE MANGE PAS" */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={voteImpossible || isPending}
                onClick={() => handleVote("absent", null)}
                className="py-2.5 px-3 bg-white border border-neutral-200 hover:bg-neutral-50 active:scale-98 disabled:opacity-50 text-neutral-700 font-medium text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <UserCheck className="w-3.5 h-3.5 text-neutral-500" />
                Absent(e)
              </button>

              <button
                type="button"
                disabled={voteImpossible || isPending}
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

      <InstallBanner />

      {/* FOOTER DISCRET PWA */}
      <footer className="mt-8 text-center text-[11px] text-neutral-400">
        ⚡ Cantine Pro — Commande ultra-rapide mobile
      </footer>
    </div>
  );
}
