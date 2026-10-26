"use client";

import { useState, useTransition } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { importEmployesAction } from "./actions";

interface ImportEmployesModalProps {
  onClose: () => void;
  onImported: (employes: any[], message: string) => void;
}

const MODELE_CSV = "Nom;Prénom;Téléphone;Service\r\nNdiaye;Moussa;771112233;Production\r\nSow;Aminata;772223344;Administration\r\n";

export function ImportEmployesModal({ onClose, onImported }: ImportEmployesModalProps) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  const telechargerModele = () => {
    const blob = new Blob(["﻿" + MODELE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modele-import-cantine-pro.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importer = () => {
    const formData = new FormData();
    if (fichier) formData.set("fichier", fichier);
    else formData.set("texte", texte);

    startTransition(async () => {
      const res = await importEmployesAction(formData);
      if (res.success && res.employes) {
        const n = res.employes.length;
        const ignores = res.ignores ? ` • ${res.ignores} doublon(s) ignoré(s)` : "";
        onImported(res.employes, `${n} collaborateur(s) importé(s)${ignores}.`);
      } else {
        setErreur(res.message || "Import impossible.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-500" />
            Import des Collaborateurs
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-sm font-bold">
            ✕
          </button>
        </div>

        <p className="text-xs text-neutral-600">
          Fichier Excel (.xlsx) ou CSV avec les colonnes <code>Nom</code>, <code>Prénom</code>,{" "}
          <code>Téléphone</code>, <code>Service</code>. Un lien personnel est généré pour chaque employé.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFichier(f);
          }}
          className={`flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition ${
            isDragging ? "border-orange-500 bg-orange-50" : "border-neutral-200 hover:border-orange-300"
          }`}
        >
          <Upload className="w-6 h-6 text-orange-500" />
          <span className="text-xs font-semibold text-neutral-700">
            {fichier ? fichier.name : "Glissez votre fichier ici ou cliquez pour choisir"}
          </span>
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => setFichier(e.target.files?.[0] || null)}
          />
        </label>

        {!fichier && (
          <textarea
            rows={4}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={`…ou collez la liste (Nom, Téléphone, Service) :\nMoussa Ndiaye, +221771112233, Production\nAminata Sow, +221772223344, Administration`}
            className="w-full text-xs font-mono p-3 rounded-2xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        )}

        {erreur && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs">{erreur}</div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={telechargerModele}
            className="text-xs text-neutral-500 hover:text-orange-600 flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            Modèle
          </button>
          <div className="flex items-center gap-2">
            {fichier && (
              <button
                type="button"
                onClick={() => setFichier(null)}
                className="px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl"
              >
                Retirer le fichier
              </button>
            )}
            <button
              type="button"
              disabled={isPending || (!fichier && !texte.trim())}
              onClick={importer}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm shadow-orange-600/20 transition"
            >
              {isPending ? "Import..." : "Importer et générer les liens"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
