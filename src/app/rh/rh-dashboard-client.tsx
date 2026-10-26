"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Utensils,
  Users,
  Clock,
  Download,
  Plus,
  Check,
  Copy,
  AlertCircle,
  FileSpreadsheet,
  Send,
  MessageCircle,
  LogOut,
  RefreshCw,
  UserX,
  Pencil,
  PhoneCall,
  Store,
  ExternalLink,
  Link2,
  Megaphone,
  Lock,
} from "lucide-react";
import { buildMessageMenuDuJour, buildRecap } from "@/lib/recap";
import {
  addEmployeAction,
  cloturerJourneeAction,
  desactiverEmployeAction,
  modifierCommandeRhAction,
  modifierServiceEmployeAction,
} from "./actions";
import { logoutRhAction } from "./login/actions";
import { MenusSemaine, type PlatSemaine } from "./menus-semaine";
import { ImportEmployesModal } from "./import-employes-modal";
import { RecapRestaurant, type ClotureInfo, type RestaurantInfo } from "./recap-restaurant";
import { RestaurantsPanel } from "./restaurants-panel";

interface Employe {
  id: string;
  nom: string;
  telephone: string | null;
  service: string;
  token: string;
  is_active: boolean;
}

interface Plat {
  id: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_available: boolean;
  restaurant_id?: string | null;
}

interface CommandeItem {
  employe_id: string;
  employe_nom: string;
  telephone: string | null;
  statut: "choisi" | "absent" | "ne_mange_pas" | "en_attente";
  plat_id?: string | null;
  plat_titre?: string;
  prix?: number;
  restaurant_id?: string | null;
  modifie_par_rh?: boolean;
}

type StatutVote = CommandeItem["statut"];

interface RhDashboardClientProps {
  company: {
    id: string;
    nom: string;
    slug: string;
    heure_ouverture_vote: string;
    heure_limite_vote: string;
    trial_ends_at: string | null;
  };
  initialEmployes: Employe[];
  initialPlats: Plat[];
  platsSemaine: PlatSemaine[];
  semaineLundi: string;
  todayDate: string;
  initialCommandes: CommandeItem[];
  restaurants: RestaurantInfo[];
  clotures: ClotureInfo[];
  restaurantsEnRetard: string[];
  /** Heure limite de vote atteinte (calculé côté serveur, heure de Dakar) */
  votesClos: boolean;
  appBaseUrl: string;
  isDemo: boolean;
}

const REFRESH_INTERVAL_MS = 20_000;

export function RhDashboardClient({
  company,
  initialEmployes,
  initialPlats,
  platsSemaine,
  semaineLundi,
  todayDate,
  initialCommandes,
  restaurants,
  clotures,
  restaurantsEnRetard,
  votesClos,
  appBaseUrl,
  isDemo,
}: RhDashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"live" | "menus" | "restaurants" | "employes">("live");
  const [employes, setEmployes] = useState<Employe[]>(initialEmployes);
  const plats = initialPlats; // plats d'aujourd'hui, pour la saisie manuelle des votes
  const [commandes, setCommandes] = useState<CommandeItem[]>(initialCommandes);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // États formulaires
  const [newNom, setNewNom] = useState("");
  const [newTel, setNewTel] = useState("");
  const [newService, setNewService] = useState("");
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [editingVote, setEditingVote] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutVote | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  // Les données serveur (rafraîchies) font foi
  useEffect(() => setEmployes(initialEmployes), [initialEmployes]);
  useEffect(() => setCommandes(initialCommandes), [initialCommandes]);

  // Suivi live : rafraîchissement automatique des votes (Jour 6)
  useEffect(() => {
    if (isDemo || activeTab !== "live") return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isDemo, activeTab, router]);

  const joursEssaiRestants = company.trial_ends_at
    ? Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86_400_000)
    : null;

  // Statistiques calculées en temps réel
  const totalEmployes = employes.length;
  const countChoisi = commandes.filter((c) => c.statut === "choisi").length;
  const countAbsent = commandes.filter((c) => c.statut === "absent").length;
  const countNeMangePas = commandes.filter((c) => c.statut === "ne_mange_pas").length;
  const countEnAttente = Math.max(0, totalEmployes - (countChoisi + countAbsent + countNeMangePas));

  // Après la clôture, seuls les repas des restaurants qui ont confirmé (eux-mêmes ou par téléphone) comptent
  const journeeCloturee = clotures.length > 0;
  const restaurantsConfirmes = new Set(clotures.filter((c) => c.confirme_at).map((c) => c.restaurant_id));
  const repasConfirmes = commandes.filter(
    (c) => c.statut === "choisi" && c.restaurant_id && restaurantsConfirmes.has(c.restaurant_id)
  ).length;
  const repasNonConfirmes = countChoisi - repasConfirmes;

  // Restaurants qui proposent au moins un plat aujourd'hui (ou ont déjà reçu une commande)
  const restaurantsDuJour = restaurants.filter(
    (r) =>
      plats.some((p) => p.restaurant_id === r.id) ||
      commandes.some((c) => c.restaurant_id === r.id) ||
      clotures.some((c) => c.restaurant_id === r.id)
  );
  const nomRestaurant = (id?: string | null) => restaurants.find((r) => r.id === id)?.nom;

  // Lien global de l'entreprise : chaque salarié choisit son nom (à poster dans le groupe WhatsApp)
  const lienPortail = `${appBaseUrl}/c/${company.slug}`;
  const messagePortail =
    `🍽️ Cantine ${company.nom} : choisissez votre repas du jour ici, avant ` +
    `${company.heure_limite_vote.slice(0, 5).replace(":", "h")} 👉 ${lienPortail}`;
  const copierLienPortail = () => {
    navigator.clipboard.writeText(lienPortail);
    setCopiedToken("__portail__");
    setTimeout(() => setCopiedToken(null), 2500);
  };

  // Étape 1 (matin) : message du menu du jour à poster dans le groupe WhatsApp des salariés
  const menusDuJour = restaurantsDuJour
    .map((r) => ({ restaurant: r.nom, plats: plats.filter((p) => p.restaurant_id === r.id && p.is_available) }))
    .filter((m) => m.plats.length > 0);
  const messageMenuDuJour = buildMessageMenuDuJour({
    companyNom: company.nom,
    dateStr: new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Africa/Dakar",
    }).format(new Date()),
    heureLimite: company.heure_limite_vote,
    menus: menusDuJour,
    lienPortail,
  });
  const copierMenuDuJour = () => {
    navigator.clipboard.writeText(messageMenuDuJour);
    setCopiedToken("__menu__");
    setTimeout(() => setCopiedToken(null), 2500);
  };

  // Étape 3 (après 11h10) : clôture manuelle de la journée, puis envoi de chaque récap
  const restaurantsNonClotures = restaurantsDuJour.filter((r) => !clotures.some((c) => c.restaurant_id === r.id));
  const cloturerJournee = () => {
    startTransition(async () => {
      const res = await cloturerJourneeAction();
      if (res.success) {
        setActionError(null);
        setActionInfo("Journée clôturée : envoyez maintenant chaque récap à son restaurant via WhatsApp.");
      } else {
        setActionError(res.message || "Clôture impossible.");
      }
    });
  };

  // Copier le lien d'un collaborateur
  const copyLienEmploye = (token: string) => {
    const url = `${appBaseUrl}/p/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  // Ajout individuel d'un collaborateur
  const handleAddEmploye = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNom.trim()) return;

    startTransition(async () => {
      const res = await addEmployeAction(newNom.trim(), newTel.trim(), newService.trim());
      if (res.success && res.employe) {
        setEmployes((prev) => [res.employe, ...prev]);
        setNewNom("");
        setNewTel("");
        setNewService("");
        setActionError(null);
      } else {
        setActionError(res.message || "Impossible d'ajouter le collaborateur.");
      }
    });
  };

  // Modification manuelle d'un vote par le RH (employé qui appelle, oubli...)
  const modifierVote = (emp: Employe, valeur: string) => {
    const [statut, platId] = valeur.split(":") as [StatutVote, string | undefined];
    const plat = plats.find((p) => p.id === platId);
    setEditingVote(null);
    setCommandes((prev) => {
      const autres = prev.filter((c) => c.employe_id !== emp.id);
      if (statut === "en_attente") return autres;
      return [
        ...autres,
        {
          employe_id: emp.id,
          employe_nom: emp.nom,
          telephone: emp.telephone,
          statut,
          plat_id: plat?.id ?? null,
          plat_titre: plat?.titre,
          prix: plat?.prix_unitaire,
          restaurant_id: plat?.restaurant_id ?? null,
          modifie_par_rh: true,
        },
      ];
    });
    startTransition(async () => {
      const res = await modifierCommandeRhAction(emp.id, statut, platId ?? null);
      if (!res.success) {
        setActionError(res.message || "Modification impossible.");
        router.refresh();
      } else if (res.clotureMiseAJour) {
        setActionInfo(
          "Récapitulatif traiteur mis à jour : prévenez le traiteur, il doit reconfirmer les nouvelles quantités."
        );
      }
    });
  };

  const changerService = (emp: Employe, service: string) => {
    if (service.trim() === emp.service) return;
    setEmployes((prev) => prev.map((e) => (e.id === emp.id ? { ...e, service: service.trim() || "Général" } : e)));
    startTransition(async () => {
      await modifierServiceEmployeAction(emp.id, service);
    });
  };

  const services = Array.from(new Set(employes.map((e) => e.service || "Général"))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );

  // Désactiver un collaborateur (son lien ne fonctionne plus)
  const desactiverEmploye = (emp: Employe) => {
    if (!window.confirm(`Désactiver ${emp.nom} ? Son lien de vote ne fonctionnera plus.`)) return;
    setEmployes((prev) => prev.filter((e) => e.id !== emp.id));
    startTransition(async () => {
      await desactiverEmployeAction(emp.id);
    });
  };

  // Génération du message WhatsApp pour le traiteur
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const moisCourant = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dakar",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

  const [moisExport, setMoisExport] = useState(moisCourant);

  // Export CSV Comptable Express (Jour 7)
  const exportComptableCSV = () => {
    const headers = ["Date", "Entreprise", "Employé", "Téléphone", "Statut Vote", "Plat Choisi", "Montant (FCFA)"];
    const rows = employes.map((emp) => {
      const cmd = commandes.find((c) => c.employe_id === emp.id);
      const statut = cmd ? cmd.statut : "en_attente";
      const plat = cmd?.plat_titre || "-";
      const montant = statut === "choisi" ? cmd?.prix ?? 0 : 0;
      return [
        dateStr,
        `"${company.nom}"`,
        `"${emp.nom}"`,
        `"${emp.telephone || ""}"`,
        statut,
        `"${plat}"`,
        montant,
      ].join(";");
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `cantine-pro-${company.slug}-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const onglets: Array<{
    id: typeof activeTab;
    label: string;
    icone: typeof Clock;
    compteur?: number;
  }> = [
    { id: "live", label: "Suivi Live", icone: Clock },
    { id: "menus", label: "Menus Semaine", icone: Utensils },
    { id: "restaurants", label: "Restaurants", icone: Store, compteur: restaurants.filter((r) => r.is_active).length },
    { id: "employes", label: "Collaborateurs", icone: Users, compteur: totalEmployes },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      {/* EN-TÊTE ESPACE RH */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="pt-4 pb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 shrink-0 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-600/30">
                  CP
                </span>
                <h1 className="text-lg sm:text-xl font-extrabold text-neutral-900 truncate">
                  Espace RH — <span className="text-orange-600">{company.nom}</span>
                </h1>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Votes de {company.heure_ouverture_vote.slice(0, 5)} à {company.heure_limite_vote.slice(0, 5)}
                {joursEssaiRestants !== null && (
                  <>
                    {" "}•{" "}
                    <span className={joursEssaiRestants <= 3 ? "text-red-600 font-semibold" : ""}>
                      {joursEssaiRestants > 0
                        ? `Essai gratuit : ${joursEssaiRestants} jour(s) restant(s)`
                        : "Essai gratuit terminé"}
                    </span>
                  </>
                )}
              </p>
            </div>

            {!isDemo && (
              <form action={logoutRhAction} className="shrink-0">
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Déconnexion</span>
                </button>
              </form>
            )}
          </div>

          {/* Onglets Navigation : une seule ligne, défilable sur téléphone */}
          <nav className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {onglets.map((onglet) => {
              const Icone = onglet.icone;
              const actif = activeTab === onglet.id;
              return (
                <button
                  key={onglet.id}
                  type="button"
                  onClick={(e) => {
                    setActiveTab(onglet.id);
                    // Sur téléphone, ramène l'onglet choisi entièrement dans la zone visible
                    e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
                  }}
                  aria-current={actif ? "page" : undefined}
                  className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 border-b-2 text-sm font-bold transition flex items-center gap-1.5 ${
                    actif
                      ? "border-orange-600 text-orange-600"
                      : "border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300"
                  }`}
                >
                  <Icone className="w-4 h-4" />
                  {onglet.label}
                  {onglet.compteur !== undefined && (
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        actif ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {onglet.compteur}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isDemo && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs">
            Mode démo : Supabase n&apos;est pas connecté, les modifications ne sont pas enregistrées.
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {actionError}
            </span>
            <button onClick={() => setActionError(null)} className="font-bold">
              ✕
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* ONGLET 1 : SUIVI LIVE & AGRÉGATION 11H05                      */}
        {/* ============================================================ */}
        {actionInfo && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl text-xs flex items-center justify-between gap-2">
            <span>{actionInfo}</span>
            <button onClick={() => setActionInfo(null)} className="font-bold">
              ✕
            </button>
          </div>
        )}

        {activeTab === "live" && (
          <div className="space-y-6">
            {/* ALERTE 11H30 : RESTAURANT SANS CONFIRMATION */}
            {restaurantsEnRetard.length > 0 && (
              <div className="p-4 rounded-2xl border border-orange-300 bg-orange-100 text-orange-900 text-xs space-y-3">
                <p className="font-bold">
                  ⏰ Il est plus de 11h30 et {restaurantsEnRetard.length > 1 ? "ces restaurants n'ont" : "ce restaurant n'a"}{" "}
                  pas encore confirmé la commande. Appelez pour vérifier qu&apos;elle a bien été reçue.
                </p>
                <div className="flex flex-wrap gap-2">
                  {restaurants
                    .filter((r) => restaurantsEnRetard.includes(r.id))
                    .map((r) =>
                      r.telephone_whatsapp ? (
                        <a
                          key={r.id}
                          href={`tel:${r.telephone_whatsapp}`}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl flex items-center gap-1.5"
                        >
                          <PhoneCall className="w-4 h-4" />
                          {r.nom}
                        </a>
                      ) : (
                        <span key={r.id} className="px-3 py-2 bg-white rounded-xl font-bold">
                          {r.nom} (pas de numéro)
                        </span>
                      )
                    )}
                </div>
              </div>
            )}

            {/* ÉTAPE 1 (MATIN) : ENVOYER LE MENU DU JOUR AUX SALARIÉS */}
            {!votesClos && (
              <div className="bg-white rounded-3xl p-5 border border-orange-200 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-orange-600" />
                      1. Envoyer le menu du jour aux salariés
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Postez ce message dans le groupe WhatsApp de l&apos;entreprise : menu, lien du portail et heure
                      limite ({company.heure_limite_vote.slice(0, 5).replace(":", "h")}).
                    </p>
                  </div>
                  {menusDuJour.length > 0 && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(messageMenuDuJour)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                      >
                        <Send className="w-4 h-4" />
                        Envoyer sur WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={copierMenuDuJour}
                        className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                      >
                        {copiedToken === "__menu__" ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        {copiedToken === "__menu__" ? "Copié !" : "Copier"}
                      </button>
                    </div>
                  )}
                </div>
                {menusDuJour.length === 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3">
                    Aucun plat publié pour aujourd&apos;hui : ajoutez d&apos;abord les plats dans « Menus Semaine ».
                  </p>
                ) : (
                  <pre className="text-[11px] text-neutral-600 bg-neutral-50 rounded-xl p-3 whitespace-pre-wrap font-sans">
                    {messageMenuDuJour.replace(/\*/g, "")}
                  </pre>
                )}
                {!isDemo && (
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin [animation-duration:3s]" />
                    2. Votes ouverts de {company.heure_ouverture_vote.slice(0, 5)} à{" "}
                    {company.heure_limite_vote.slice(0, 5)} — actualisation toutes les 20 secondes
                  </div>
                )}
              </div>
            )}

            {/* ÉTAPE 3 (APRÈS L'HEURE LIMITE) : CLÔTURER PUIS ENVOYER LES RÉCAPS AUX RESTAURANTS */}
            {votesClos && restaurantsDuJour.length > 0 && (
              <div
                className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  restaurantsNonClotures.length > 0
                    ? "bg-amber-50 border-amber-300 text-amber-900"
                    : "bg-emerald-50 border-emerald-200 text-emerald-900"
                }`}
              >
                <span className="font-semibold">
                  {restaurantsNonClotures.length > 0
                    ? `🔒 Votes clôturés à ${company.heure_limite_vote.slice(0, 5)}. Clôturez la journée pour figer les récaps, puis envoyez-les aux restaurants.`
                    : "✅ Journée clôturée : envoyez chaque récap à son restaurant avec le bouton « Envoyer le récap »."}
                </span>
                {restaurantsNonClotures.length > 0 && !isDemo && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={cloturerJournee}
                    className="shrink-0 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <Lock className="w-4 h-4" />
                    {isPending ? "Clôture..." : "Clôturer la journée"}
                  </button>
                )}
              </div>
            )}

            {/* KPI CARDS TEMPS RÉEL */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  {journeeCloturee ? "Repas confirmés" : "Total Repas"}
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-orange-600">
                    {journeeCloturee ? repasConfirmes : countChoisi}
                  </span>
                  <span className="text-xs text-neutral-400">{journeeCloturee ? "facturés" : "provisoire"}</span>
                </div>
                {journeeCloturee && repasNonConfirmes > 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">
                    + {repasNonConfirmes} non confirmé(s), non comptés
                  </p>
                )}
              </div>

              <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  En Attente
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-amber-500">{countEnAttente}</span>
                  <span className="text-xs text-neutral-400">non votés</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Absents / Autre
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-neutral-600">{countAbsent + countNeMangePas}</span>
                  <span className="text-xs text-neutral-400">déclarés</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Taux Réponse
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-600">
                    {totalEmployes > 0 ? Math.round(((totalEmployes - countEnAttente) / totalEmployes) * 100) : 0}%
                  </span>
                  <span className="text-xs text-neutral-400">participation</span>
                </div>
              </div>
            </div>

            {/* RÉCAPITULATIFS PAR RESTAURANT (ENVOYÉS À 11H10) */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-extrabold text-neutral-900 flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-orange-500" />
                  Commandes par restaurant
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {isDemo ? (
                    <button
                      onClick={exportComptableCSV}
                      className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 active:scale-98 text-neutral-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  ) : (
                    <>
                      <a
                        href="/rh/export"
                        className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 active:scale-98 text-neutral-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        Facture du jour
                      </a>
                      <div className="flex items-center bg-neutral-100 rounded-xl">
                        <input
                          type="month"
                          value={moisExport}
                          max={moisCourant}
                          onChange={(e) => setMoisExport(e.target.value || moisCourant)}
                          className="bg-transparent text-xs pl-2.5 py-2 w-[7.5rem] focus:outline-none"
                          title="Mois à exporter"
                        />
                        <a
                          href={`/rh/export?mois=${moisExport}&format=xlsx`}
                          className="px-3 py-2 hover:bg-neutral-200 active:scale-98 text-neutral-700 font-semibold text-xs rounded-r-xl transition flex items-center gap-1.5"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          Paie Excel
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {restaurantsDuJour.length === 0 ? (
                <div className="bg-white rounded-3xl p-6 border border-neutral-200 text-center text-xs text-neutral-500">
                  Aucun menu publié aujourd&apos;hui. Ajoutez les plats des restaurants dans l&apos;onglet « Menus
                  Semaine ».
                </div>
              ) : (
                restaurantsDuJour.map((r) => (
                  <RecapRestaurant
                    key={r.id}
                    restaurant={r}
                    recap={buildRecap(commandes.filter((c) => c.restaurant_id === r.id))}
                    cloture={clotures.find((c) => c.restaurant_id === r.id) || null}
                    companyNom={company.nom}
                    dateStr={dateStr}
                    peutEnvoyer={isDemo || clotures.some((c) => c.restaurant_id === r.id)}
                  />
                ))
              )}
            </div>

            {/* TABLEAU DÉTAILLÉ DES COLLABORATEURS DU JOUR */}
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-neutral-900">
                  Détail par Collaborateur ({employes.length})
                </h3>
                {countEnAttente > 0 && (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                    ⚠️ {countEnAttente} collaborateur(s) n&apos;ont pas encore voté
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un nom ou un service..."
                  className="flex-1 text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <select
                  value={filtreStatut}
                  onChange={(e) => setFiltreStatut(e.target.value as StatutVote | "tous")}
                  className="text-xs px-3 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="choisi">A voté</option>
                  <option value="en_attente">En attente</option>
                  <option value="absent">Absent(e)</option>
                  <option value="ne_mange_pas">Ne mange pas</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400 font-semibold uppercase tracking-wider">
                      <th className="pb-3">Collaborateur</th>
                      <th className="pb-3">Service</th>
                      <th className="pb-3">Statut Vote</th>
                      <th className="pb-3">Choix / Plat</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {employes
                      .filter((emp) => {
                        const statut = commandes.find((c) => c.employe_id === emp.id)?.statut || "en_attente";
                        const q = recherche.trim().toLowerCase();
                        return (
                          (filtreStatut === "tous" || statut === filtreStatut) &&
                          (!q || emp.nom.toLowerCase().includes(q) || (emp.service || "").toLowerCase().includes(q))
                        );
                      })
                      .map((emp) => {
                      const cmd = commandes.find((c) => c.employe_id === emp.id);
                      const statut = cmd ? cmd.statut : "en_attente";
                      const valeurActuelle = statut === "choisi" ? `choisi:${cmd?.plat_id ?? ""}` : statut;
                      return (
                        <tr key={emp.id} className="hover:bg-neutral-50/50 transition">
                          <td className="py-3 font-semibold text-neutral-900">{emp.nom}</td>
                          <td className="py-3 text-neutral-500">{emp.service || "Général"}</td>
                          <td className="py-3">
                            {statut === "choisi" && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                                <Check className="w-3 h-3" /> A voté
                              </span>
                            )}
                            {statut === "absent" && (
                              <span className="inline-flex items-center text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full font-semibold">
                                Absent(e)
                              </span>
                            )}
                            {statut === "ne_mange_pas" && (
                              <span className="inline-flex items-center text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full font-semibold">
                                Ne mange pas
                              </span>
                            )}
                            {statut === "en_attente" && (
                              <span className="inline-flex items-center text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold">
                                En attente
                              </span>
                            )}
                          </td>
                          <td className="py-3 font-medium text-neutral-800">
                            {editingVote === emp.id ? (
                              <select
                                autoFocus
                                defaultValue={valeurActuelle}
                                onChange={(e) => modifierVote(emp, e.target.value)}
                                onBlur={() => setEditingVote(null)}
                                className="text-xs px-2 py-1 rounded-lg border border-orange-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                              >
                                {plats
                                  .filter((p) => p.is_available || p.id === cmd?.plat_id)
                                  .map((p) => (
                                    <option key={p.id} value={`choisi:${p.id}`}>
                                      {p.titre}
                                      {nomRestaurant(p.restaurant_id) ? ` — ${nomRestaurant(p.restaurant_id)}` : ""}
                                    </option>
                                  ))}
                                <option value="absent">Absent(e)</option>
                                <option value="ne_mange_pas">Ne mange pas</option>
                                <option value="en_attente">En attente (effacer)</option>
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingVote(emp.id)}
                                title="Modifier manuellement le choix"
                                className="inline-flex items-center gap-1.5 hover:text-orange-600 transition group"
                              >
                                <span>{cmd?.plat_titre || "-"}</span>
                                {cmd?.modifie_par_rh && (
                                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                                    RH
                                  </span>
                                )}
                                <Pencil className="w-3 h-3 text-neutral-300 group-hover:text-orange-500" />
                              </button>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {emp.telephone ? (
                              <a
                                href={`https://wa.me/${emp.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  `Bonjour ${emp.nom}, voici ton lien pour choisir ton repas Cantine Pro avant 11h10 : ${appBaseUrl}/p/${emp.token}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                              >
                                <MessageCircle className="w-3.5 h-3.5" /> Relancer
                              </a>
                            ) : (
                              <button
                                onClick={() => copyLienEmploye(emp.token)}
                                className="text-orange-600 hover:underline"
                              >
                                Copier lien
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ONGLET 2 : MENUS DE LA SEMAINE (LUNDI → VENDREDI)              */}
        {/* ============================================================ */}
        {activeTab === "menus" && (
          <MenusSemaine
            platsSemaine={platsSemaine}
            semaineLundi={semaineLundi}
            todayDate={todayDate}
            restaurants={restaurants.filter((r) => r.is_active)}
            isDemo={isDemo}
            onError={setActionError}
          />
        )}

        {activeTab === "restaurants" && (
          <RestaurantsPanel restaurants={restaurants} appBaseUrl={appBaseUrl} onError={setActionError} />
        )}

        {/* ============================================================ */}
        {/* ONGLET 3 : GESTION DES COLLABORATEURS & LIENS (JOUR 4)        */}
        {/* ============================================================ */}
        {activeTab === "employes" && (
          <div className="space-y-6">
            {/* LIEN PORTAIL ENTREPRISE (À POSTER DANS LE GROUPE WHATSAPP) */}
            <div className="bg-orange-50 border border-orange-200 rounded-3xl p-5 space-y-3">
              <div>
                <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-orange-600" />
                  Lien du portail entreprise
                </h2>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Un seul lien pour tout le monde : postez-le dans le groupe WhatsApp de l&apos;entreprise. Chaque
                  salarié choisit son nom (ou s&apos;inscrit) puis vote.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <code className="flex-1 text-xs bg-white border border-orange-200 rounded-xl px-3 py-2 break-all">
                  {lienPortail}
                </code>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/c/${company.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 bg-white hover:bg-orange-100 border border-orange-200 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ouvrir
                  </a>
                  <button
                    type="button"
                    onClick={copierLienPortail}
                    className="px-3 py-2 bg-white hover:bg-orange-100 border border-orange-200 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    {copiedToken === "__portail__" ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copiedToken === "__portail__" ? "Copié !" : "Copier"}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(messagePortail)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    Partager sur WhatsApp
                  </a>
                </div>
              </div>
            </div>

            {/* Actions Rapides Collaborateurs */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-neutral-900">
                  Collaborateurs & Liens Magiques ({employes.length})
                </h2>
                <p className="text-xs text-neutral-500">
                  Chaque employé possède un lien personnel unique sans mot de passe.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCsvModal(true)}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Importer Excel / CSV
                </button>
              </div>
            </div>

            {/* Formulaire Ajout Rapide Collaborateur */}
            <form
              onSubmit={handleAddEmploye}
              className="bg-white rounded-3xl p-5 border border-neutral-200 shadow-sm flex flex-col sm:flex-row items-center gap-3"
            >
              <div className="w-full sm:flex-1">
                <input
                  type="text"
                  required
                  placeholder="Nom complet (ex: Aminata Sow)"
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="w-full sm:w-48">
                <input
                  type="text"
                  placeholder="Téléphone (+221 77...)"
                  value={newTel}
                  onChange={(e) => setNewTel(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="w-full sm:w-40">
                <input
                  type="text"
                  list="services-existants"
                  placeholder="Service"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <datalist id="services-existants">
                  {services.map((svc) => (
                    <option key={svc} value={svc} />
                  ))}
                </datalist>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full sm:w-auto px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </form>

            {/* Tableau des Liens Magiques */}
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400 font-semibold uppercase tracking-wider">
                      <th className="pb-3">Nom Collaborateur</th>
                      <th className="pb-3">Service</th>
                      <th className="pb-3">Téléphone</th>
                      <th className="pb-3">Lien Magique Personnel</th>
                      <th className="pb-3 text-right">Partager sur WhatsApp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {employes.map((emp) => {
                      const isCopied = copiedToken === emp.token;
                      const lien = `${appBaseUrl}/p/${emp.token}`;
                      return (
                        <tr key={emp.id} className="hover:bg-neutral-50/50 transition">
                          <td className="py-3 font-semibold text-neutral-900">{emp.nom}</td>
                          <td className="py-3">
                            <input
                              type="text"
                              list="services-existants"
                              defaultValue={emp.service || "Général"}
                              onBlur={(e) => changerService(emp, e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                              className="w-28 text-xs px-2 py-1 rounded-lg border border-transparent hover:border-neutral-200 focus:border-orange-300 focus:outline-none bg-transparent"
                            />
                          </td>
                          <td className="py-3 text-neutral-500">{emp.telephone || "-"}</td>
                          <td className="py-3">
                            <button
                              type="button"
                              onClick={() => copyLienEmploye(emp.token)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-mono text-[11px] transition"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-neutral-400" />
                              )}
                              <span>{emp.token}</span>
                              <span className="text-[10px] text-neutral-400">
                                {isCopied ? "Copié !" : "Copier"}
                              </span>
                            </button>
                          </td>
                          <td className="py-3 text-right">
                            {emp.telephone ? (
                              <a
                                href={`https://wa.me/${emp.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  `Bonjour ${emp.nom}, voici ton lien Cantine Pro pour commander ton déjeuner d'entreprise : ${lien}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold transition"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Envoyer WhatsApp
                              </a>
                            ) : (
                              <button
                                onClick={() => copyLienEmploye(emp.token)}
                                className="text-orange-600 hover:underline font-semibold"
                              >
                                Copier le lien
                              </button>
                            )}
                            <button
                              type="button"
                              title="Désactiver ce collaborateur"
                              onClick={() => desactiverEmploye(emp)}
                              className="ml-2 inline-flex items-center p-1.5 text-neutral-400 hover:text-red-600 rounded-lg transition align-middle"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL IMPORT EXCEL / CSV (JOUR 4) */}
      {showCsvModal && (
        <ImportEmployesModal
          onClose={() => setShowCsvModal(false)}
          onImported={(nouveaux, message) => {
            setEmployes((prev) => [...nouveaux, ...prev]);
            setShowCsvModal(false);
            setActionError(null);
            setActionInfo(message);
          }}
        />
      )}
    </div>
  );
}
