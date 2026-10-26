"use client";

import { useState, useTransition } from "react";
import {
  Utensils,
  Users,
  Clock,
  Download,
  Share2,
  Plus,
  Check,
  Copy,
  AlertCircle,
  FileSpreadsheet,
  ToggleLeft,
  ToggleRight,
  Send,
  MessageCircle,
} from "lucide-react";
import { formatFCFA } from "@/lib/utils";
import {
  addEmployeAction,
  importEmployesCSVAction,
  addMenuPlatAction,
  togglePlatDisponibiliteAction,
} from "./actions";

interface Employe {
  id: string;
  nom: string;
  telephone: string | null;
  token: string;
  is_active: boolean;
}

interface Plat {
  id: string;
  titre: string;
  description: string | null;
  prix_unitaire: number;
  is_available: boolean;
}

interface CommandeItem {
  employe_id: string;
  employe_nom: string;
  telephone: string | null;
  statut: "choisi" | "absent" | "ne_mange_pas" | "en_attente";
  plat_titre?: string;
  prix?: number;
}

interface RhDashboardClientProps {
  company: {
    id: string;
    nom: string;
    slug: string;
    traiteur_nom: string | null;
    traiteur_telephone: string | null;
    heure_limite_vote: string;
  };
  initialEmployes: Employe[];
  initialPlats: Plat[];
  initialCommandes: CommandeItem[];
  appBaseUrl: string;
}

export function RhDashboardClient({
  company,
  initialEmployes,
  initialPlats,
  initialCommandes,
  appBaseUrl,
}: RhDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<"live" | "menus" | "employes">("live");
  const [employes, setEmployes] = useState<Employe[]>(initialEmployes);
  const [plats, setPlats] = useState<Plat[]>(initialPlats);
  const [commandes, setCommandes] = useState<CommandeItem[]>(initialCommandes);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // États formulaires
  const [newNom, setNewNom] = useState("");
  const [newTel, setNewTel] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showCsvModal, setShowCsvModal] = useState(false);

  const [newPlatTitre, setNewPlatTitre] = useState("");
  const [newPlatPrix, setNewPlatPrix] = useState("1500");
  const [newPlatDesc, setNewPlatDesc] = useState("");

  const [copyTraiteurSuccess, setCopyTraiteurSuccess] = useState(false);

  // Statistiques calculées en temps réel
  const totalEmployes = employes.length;
  const countChoisi = commandes.filter((c) => c.statut === "choisi").length;
  const countAbsent = commandes.filter((c) => c.statut === "absent").length;
  const countNeMangePas = commandes.filter((c) => c.statut === "ne_mange_pas").length;
  const countEnAttente = Math.max(0, totalEmployes - (countChoisi + countAbsent + countNeMangePas));

  // Décompte par plat
  const breakdownPlats: Record<string, number> = {};
  commandes
    .filter((c) => c.statut === "choisi" && c.plat_titre)
    .forEach((c) => {
      breakdownPlats[c.plat_titre!] = (breakdownPlats[c.plat_titre!] || 0) + 1;
    });

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
      const res = await addEmployeAction(company.id, newNom.trim(), newTel.trim());
      if (res.success && res.employe) {
        setEmployes((prev) => [res.employe, ...prev]);
        setNewNom("");
        setNewTel("");
      }
    });
  };

  // Import CSV en masse
  const handleImportCSV = () => {
    if (!csvText.trim()) return;

    const lines = csvText.split("\n");
    const parsedRows: Array<{ nom: string; telephone?: string }> = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Séparateurs acceptés : virgule, point-virgule ou tabulation
      const parts = trimmed.split(/[,;\t]/);
      if (parts.length >= 1 && parts[0].trim()) {
        parsedRows.push({
          nom: parts[0].trim(),
          telephone: parts[1]?.trim() || undefined,
        });
      }
    });

    if (parsedRows.length === 0) return;

    startTransition(async () => {
      const res = await importEmployesCSVAction(company.id, parsedRows);
      if (res.success) {
        // En mode démo local, générer les entrées
        const newItems: Employe[] = parsedRows.map((r, i) => ({
          id: "imported-" + Date.now() + "-" + i,
          nom: r.nom,
          telephone: r.telephone || null,
          token: "token-" + Math.random().toString(36).substring(2, 10),
          is_active: true,
        }));
        setEmployes((prev) => [...newItems, ...prev]);
        setCsvText("");
        setShowCsvModal(false);
      }
    });
  };

  // Ajout d'un plat au menu
  const handleAddPlat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlatTitre.trim()) return;

    const prix = parseInt(newPlatPrix, 10) || 1500;

    startTransition(async () => {
      const res = await addMenuPlatAction(
        company.id,
        newPlatTitre.trim(),
        prix,
        newPlatDesc.trim() || undefined
      );
      if (res.success && res.plat) {
        setPlats((prev) => [...prev, res.plat]);
        setNewPlatTitre("");
        setNewPlatDesc("");
      }
    });
  };

  // Basculer disponibilité d'un plat
  const togglePlat = (platId: string, currentStatus: boolean) => {
    setPlats((prev) =>
      prev.map((p) => (p.id === platId ? { ...p, is_available: !currentStatus } : p))
    );
    startTransition(async () => {
      await togglePlatDisponibiliteAction(platId, !currentStatus);
    });
  };

  // Pré-remplissage plat rapide
  const quickAddPlat = (titre: string, prix: number, desc: string) => {
    setNewPlatTitre(titre);
    setNewPlatPrix(prix.toString());
    setNewPlatDesc(desc);
  };

  // Génération du message WhatsApp pour le traiteur
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const getWhatsAppTraiteurText = () => {
    let msg = `🍽️ *COMMANDE CANTINE PRO — ${company.nom.toUpperCase()}*\n`;
    msg += `📅 Date : ${dateStr} (Clôture 11h05)\n`;
    msg += `--------------------------------------\n`;
    if (Object.keys(breakdownPlats).length === 0) {
      msg += `(Aucun plat sélectionné aujourd'hui)\n`;
    } else {
      for (const [titre, qte] of Object.entries(breakdownPlats)) {
        msg += `• *${qte}x* ${titre}\n`;
      }
    }
    msg += `--------------------------------------\n`;
    msg += `👉 Total repas : *${countChoisi}*\n`;
    msg += `⏰ Livraison demandée : 12h30\n`;
    msg += `🔗 Confirmer la réception : ${appBaseUrl}/resto/token-demo-traiteur`;
    return msg;
  };

  const copyWhatsAppTraiteur = () => {
    const text = getWhatsAppTraiteurText();
    navigator.clipboard.writeText(text);
    setCopyTraiteurSuccess(true);
    setTimeout(() => setCopyTraiteurSuccess(false), 2500);
  };

  // Export CSV Comptable Express (Jour 7)
  const exportComptableCSV = () => {
    const headers = ["Date", "Entreprise", "Employé", "Téléphone", "Statut Vote", "Plat Choisi", "Montant (FCFA)"];
    const rows = employes.map((emp) => {
      const cmd = commandes.find((c) => c.employe_id === emp.id);
      const statut = cmd ? cmd.statut : "en_attente";
      const plat = cmd?.plat_titre || "-";
      const montant = statut === "choisi" ? 1500 : 0;
      return [
        dateStr,
        `"${company.nom}"`,
        `"${emp.nom}"`,
        `"${emp.telephone || ""}"`,
        statut,
        `"${plat}"`,
        montant,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `cantine-pro-${company.slug}-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      {/* HEADER COCKPIT RH */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-600/30">
                CP
              </span>
              <h1 className="text-xl font-extrabold text-neutral-900">
                Cockpit RH — <span className="text-orange-600">{company.nom}</span>
              </h1>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Pilote Thiès & Dakar • Clôture quotidienne à {company.heure_limite_vote.slice(0, 5)}
            </p>
          </div>

          {/* Onglets Navigation */}
          <nav className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab("live")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "live"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Suivi Live 11h
            </button>
            <button
              onClick={() => setActiveTab("menus")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "menus"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              Menus du Jour
            </button>
            <button
              onClick={() => setActiveTab("employes")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "employes"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Collaborateurs ({totalEmployes})
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* ============================================================ */}
        {/* ONGLET 1 : SUIVI LIVE & AGRÉGATION 11H05                      */}
        {/* ============================================================ */}
        {activeTab === "live" && (
          <div className="space-y-6">
            {/* KPI CARDS TEMPS RÉEL */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-sm">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  Total Repas
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-orange-600">{countChoisi}</span>
                  <span className="text-xs text-neutral-400">à préparer</span>
                </div>
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

            {/* DÉCOMPTE EXACT POUR LE TRAITEUR (AGRÉGATION 11H05) */}
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-neutral-100">
                <div>
                  <h2 className="text-lg font-extrabold text-neutral-900 flex items-center gap-2">
                    <Utensils className="w-5 h-5 text-orange-500" />
                    Récapitulatif pour le Traiteur (Clôture 11h05)
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Traiteur : {company.traiteur_nom || "Traiteur Partenaire"} • Livraison pour 12h30
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {company.traiteur_telephone ? (
                    <a
                      href={`https://wa.me/${company.traiteur_telephone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        getWhatsAppTraiteurText()
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Envoyer au Traiteur (WhatsApp)
                    </a>
                  ) : null}

                  <button
                    onClick={copyWhatsAppTraiteur}
                    className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 active:scale-98 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    {copyTraiteurSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-neutral-500" />}
                    {copyTraiteurSuccess ? "Copié !" : "Copier le texte"}
                  </button>

                  <button
                    onClick={exportComptableCSV}
                    className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 active:scale-98 text-neutral-700 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Liste des plats agrégés */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.keys(breakdownPlats).length === 0 ? (
                  <div className="col-span-3 text-center py-6 text-neutral-400 text-xs">
                    Aucun repas commandé pour l&apos;instant aujourd&apos;hui.
                  </div>
                ) : (
                  Object.entries(breakdownPlats).map(([platTitre, qte]) => (
                    <div
                      key={platTitre}
                      className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4 flex items-center justify-between"
                    >
                      <span className="text-sm font-bold text-neutral-800">{platTitre}</span>
                      <span className="text-xl font-black text-orange-600 bg-white px-3 py-1 rounded-xl shadow-xs border border-orange-200">
                        {qte}x
                      </span>
                    </div>
                  ))
                )}
              </div>
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

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100 text-neutral-400 font-semibold uppercase tracking-wider">
                      <th className="pb-3">Collaborateur</th>
                      <th className="pb-3">Téléphone</th>
                      <th className="pb-3">Statut Vote</th>
                      <th className="pb-3">Choix / Plat</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {employes.map((emp) => {
                      const cmd = commandes.find((c) => c.employe_id === emp.id);
                      const statut = cmd ? cmd.statut : "en_attente";
                      return (
                        <tr key={emp.id} className="hover:bg-neutral-50/50 transition">
                          <td className="py-3 font-semibold text-neutral-900">{emp.nom}</td>
                          <td className="py-3 text-neutral-500">{emp.telephone || "-"}</td>
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
                            {cmd?.plat_titre || "-"}
                          </td>
                          <td className="py-3 text-right">
                            {emp.telephone ? (
                              <a
                                href={`https://wa.me/${emp.telephone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  `Bonjour ${emp.nom}, voici ton lien pour choisir ton repas Cantine Pro avant 11h : ${appBaseUrl}/p/${emp.token}`
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
        {/* ONGLET 2 : GESTION DES MENUS DU JOUR (JOUR 5)                */}
        {/* ============================================================ */}
        {activeTab === "menus" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Formulaire Saisie Plat */}
            <div className="md:col-span-1 bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <h2 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-orange-500" />
                Ajouter un Plat au Menu
              </h2>

              {/* Raccourcis Sénégal */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Suggestions rapides Thiès/Dakar :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      quickAddPlat(
                        "Thiéboudienne Rouge Penda Mbaye",
                        1500,
                        "Riz rouge au poisson mérou, carottes, manioc et beignets niébé"
                      )
                    }
                    className="text-[11px] bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 px-2 py-1 rounded-lg font-medium transition"
                  >
                    + Thiéb Rouge
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      quickAddPlat(
                        "Yassa Poulet au Feu de Bois",
                        1500,
                        "Poulet mariné au citron et oignons caramélisés avec riz blanc"
                      )
                    }
                    className="text-[11px] bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 px-2 py-1 rounded-lg font-medium transition"
                  >
                    + Yassa Poulet
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      quickAddPlat(
                        "Mafé Viande de Bœuf",
                        1500,
                        "Sauce onctueuse à la pâte d'arachide, bœuf tendre et patate douce"
                      )
                    }
                    className="text-[11px] bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 px-2 py-1 rounded-lg font-medium transition"
                  >
                    + Mafé Bœuf
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      quickAddPlat(
                        "Soupou Kandia (Sauce Gombo)",
                        1700,
                        "Sauce gombo à l'huile de palme rouge, poisson séché et fruits de mer"
                      )
                    }
                    className="text-[11px] bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 px-2 py-1 rounded-lg font-medium transition"
                  >
                    + Soupou Kandia
                  </button>
                </div>
              </div>

              <form onSubmit={handleAddPlat} className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Nom du plat
                  </label>
                  <input
                    type="text"
                    required
                    value={newPlatTitre}
                    onChange={(e) => setNewPlatTitre(e.target.value)}
                    placeholder="Ex: C'est bon / Thiéboudienne"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Prix (FCFA)
                  </label>
                  <input
                    type="number"
                    required
                    value={newPlatPrix}
                    onChange={(e) => setNewPlatPrix(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Description courte
                  </label>
                  <textarea
                    rows={2}
                    value={newPlatDesc}
                    onChange={(e) => setNewPlatDesc(e.target.value)}
                    placeholder="Ingrédients clés, garniture..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter au Menu d&apos;aujourd&apos;hui
                </button>
              </form>
            </div>

            {/* Liste des Plats Proposés Aujourd'hui */}
            <div className="md:col-span-2 space-y-4">
              <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <h2 className="text-base font-extrabold text-neutral-900">
                    Plats Proposés Aujourd&apos;hui ({plats.length})
                  </h2>
                  <span className="text-xs text-neutral-500">
                    Modifiable jusqu&apos;à 11h00
                  </span>
                </div>

                {plats.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-6">
                    Aucun plat n&apos;est enregistré pour aujourd&apos;hui.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {plats.map((plat) => (
                      <div
                        key={plat.id}
                        className={`p-4 rounded-2xl border transition flex items-center justify-between gap-4 ${
                          plat.is_available
                            ? "bg-white border-neutral-200"
                            : "bg-neutral-50 border-neutral-200 opacity-60"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-neutral-900 text-sm">
                              {plat.titre}
                            </h3>
                            <span className="font-extrabold text-orange-600 text-xs">
                              {formatFCFA(plat.prix_unitaire)}
                            </span>
                            {!plat.is_available && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                Épuisé / Rupture
                              </span>
                            )}
                          </div>
                          {plat.description && (
                            <p className="text-xs text-neutral-500">
                              {plat.description}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => togglePlat(plat.id, plat.is_available)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition shrink-0 bg-white hover:bg-neutral-100"
                        >
                          {plat.is_available ? (
                            <>
                              <ToggleRight className="w-5 h-5 text-emerald-600" />
                              <span className="text-emerald-700">En stock</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="w-5 h-5 text-neutral-400" />
                              <span className="text-neutral-500">Désactivé</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ONGLET 3 : GESTION DES COLLABORATEURS & LIENS (JOUR 4)        */}
        {/* ============================================================ */}
        {activeTab === "employes" && (
          <div className="space-y-6">
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
                  Importer CSV en masse
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

              <div className="w-full sm:w-60">
                <input
                  type="text"
                  placeholder="Téléphone (+221 77...)"
                  value={newTel}
                  onChange={(e) => setNewTel(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
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

      {/* MODAL IMPORT CSV (JOUR 4) */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-neutral-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                Import CSV des Collaborateurs
              </h3>
              <button
                onClick={() => setShowCsvModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              Collez ci-dessous la liste de vos employés au format <code>Nom, Téléphone</code> (un par ligne) :
            </p>

            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`Moussa Ndiaye, +221771112233\nAminata Sow, +221772223344\nCheikh Diop, +221773334455`}
              className="w-full text-xs font-mono p-3 rounded-2xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isPending || !csvText.trim()}
                onClick={handleImportCSV}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition"
              >
                Importer et générer les liens
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
