"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Utensils, Search, User, ArrowRight, UserPlus, Clock } from "lucide-react";
import { addEmployeAction } from "@/app/rh/actions";

interface EmployeBasic {
  id: string;
  nom: string;
  token: string;
}

interface PortalClientProps {
  company: {
    id: string;
    nom: string;
    slug: string;
    heure_limite_vote: string;
  };
  employes: EmployeBasic[];
}

export function EnterprisePortalClient({
  company,
  employes: initialEmployes,
}: PortalClientProps) {
  const [employes, setEmployes] = useState<EmployeBasic[]>(initialEmployes);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [newTel, setNewTel] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredEmployes = employes.filter((emp) =>
    emp.nom.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelfRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNom.trim()) return;

    startTransition(async () => {
      const res = await addEmployeAction(company.id, newNom.trim(), newTel.trim() || undefined);
      if (res.success && res.employe) {
        setEmployes((prev) => [
          {
            id: res.employe.id,
            nom: res.employe.nom,
            token: res.employe.token,
          },
          ...prev,
        ]);
        window.location.href = `/p/${res.employe.token}`;
      }
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8 max-w-md mx-auto flex flex-col justify-between">
      <div>
        {/* EN-TÊTE PORTAIL */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 mb-6 text-center">
          <div className="w-14 h-14 bg-orange-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-orange-500/20">
            <Utensils className="w-7 h-7" />
          </div>
          <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
            Cantine d&apos;Entreprise
          </p>
          <h1 className="text-xl font-extrabold text-neutral-900">
            {company.nom}
          </h1>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-800 rounded-full text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            <span>Clôture quotidienne des votes à {company.heure_limite_vote.slice(0, 5)}</span>
          </div>
        </div>

        {/* CHAMP DE RECHERCHE RAPIDE */}
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tapez votre prénom ou nom..."
              className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-neutral-200 text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
            />
          </div>

          {/* LISTE DES EMPLOYÉS */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider px-1">
              Sélectionnez votre profil :
            </span>

            {filteredEmployes.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-neutral-100">
                <p className="text-xs text-neutral-500 mb-3">
                  Aucun collaborateur trouvé pour &quot;{search}&quot;.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  M&apos;ajouter à la liste
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {filteredEmployes.map((emp) => (
                  <Link
                    key={emp.id}
                    href={`/p/${emp.token}`}
                    className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-neutral-100 hover:border-orange-300 hover:shadow-xs active:scale-98 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-neutral-800 text-xs group-hover:text-orange-600 transition">
                        {emp.nom}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-semibold text-neutral-400 group-hover:text-orange-600 transition">
                      <span>Voter</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LIEN AUTO-INSCRIPTION */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="text-xs text-neutral-500 hover:text-orange-600 underline font-medium"
          >
            Nouveau stagiaire ou employé ? Cliquez ici
          </button>
        </div>
      </div>

      <footer className="mt-8 text-center text-[11px] text-neutral-400">
        ⚡ Cantine Pro — Spécial Pilotes Sénégal
      </footer>

      {/* MODAL AUTO-INSCRIPTION */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-neutral-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-neutral-900">
                Rejoindre la cantine
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              Renseignez votre prénom et nom pour accéder immédiatement au vote d&apos;aujourd&apos;hui.
            </p>

            <form onSubmit={handleSelfRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Prénom & Nom
                </label>
                <input
                  type="text"
                  required
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                  placeholder="Ex: Ibrahima Diallo"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Numéro WhatsApp (optionnel)
                </label>
                <input
                  type="tel"
                  value={newTel}
                  onChange={(e) => setNewTel(e.target.value)}
                  placeholder="+221 77..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending || !newNom.trim()}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-xs"
                >
                  {isPending ? "Création..." : "Valider et voter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
