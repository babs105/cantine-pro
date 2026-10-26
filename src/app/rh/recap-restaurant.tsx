"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, PhoneCall, Send, Utensils } from "lucide-react";
import { buildMessageTraiteur, formatHeure, totalRepas } from "@/lib/recap";
import type { RecapLigne } from "@/types/database";
import { confirmerParTelephoneAction, marquerRecapEnvoyeAction } from "./actions";

export interface RestaurantInfo {
  id: string;
  nom: string;
  telephone_whatsapp: string | null;
  heure_livraison: string | null;
  token: string;
  is_active: boolean;
  lien: string;
}

export interface ClotureInfo {
  restaurant_id: string | null;
  envoi_statut: "en_attente" | "envoye" | "echec" | "manuel";
  envoi_erreur: string | null;
  envoye_at: string | null;
  confirme_at: string | null;
  confirme_par?: "restaurant" | "rh" | null;
  total_repas: number;
}

interface RecapRestaurantProps {
  restaurant: RestaurantInfo;
  recap: RecapLigne[];
  cloture: ClotureInfo | null;
  companyNom: string;
  dateStr: string;
  /** Vrai une fois la journée clôturée (ou en démo) : l'envoi du récap au restaurant est alors possible */
  peutEnvoyer: boolean;
}

function heure(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dakar",
  }).format(new Date(iso));
}

/** Carte d'un restaurant : quantités à préparer, état de l'envoi 11h10 et de la confirmation */
export function RecapRestaurant({
  restaurant,
  recap,
  cloture,
  companyNom,
  dateStr,
  peutEnvoyer,
}: RecapRestaurantProps) {
  const [copie, setCopie] = useState(false);
  const [isPending, startTransition] = useTransition();
  const total = totalRepas(recap);

  const message = buildMessageTraiteur({
    companyNom,
    dateStr,
    recap,
    heureLivraison: restaurant.heure_livraison,
    lienConfirmation: restaurant.lien,
  });

  const copier = () => {
    navigator.clipboard.writeText(message);
    setCopie(true);
    setTimeout(() => setCopie(false), 2500);
  };

  const statut = !cloture
    ? {
        texte: "Votes en cours (provisoire)",
        classe: "bg-neutral-100 text-neutral-600",
      }
    : cloture.confirme_at
      ? {
          texte:
            cloture.confirme_par === "rh"
              ? `✅ Confirmé par téléphone (RH) à ${heure(cloture.confirme_at)}`
              : `✅ Confirmé par le restaurant à ${heure(cloture.confirme_at)}`,
          classe: "bg-emerald-50 text-emerald-700",
        }
      : cloture.envoi_statut === "envoye"
        ? {
            texte: `📤 Envoyé${cloture.envoye_at ? ` à ${heure(cloture.envoye_at)}` : ""}, en attente de confirmation`,
            classe: "bg-orange-50 text-orange-800",
          }
        : cloture.envoi_statut === "echec"
          ? {
              texte: "⚠️ Envoi automatique échoué : envoyez via WhatsApp",
              classe: "bg-red-50 text-red-700",
            }
          : {
              texte: "📋 Récap prêt : envoyez-le au restaurant via WhatsApp",
              classe: "bg-amber-100 text-amber-900",
            };

  // Le restaurant a validé au téléphone : le RH confirme à sa place (sinon on ne confirme pas)
  const confirmerParTelephone = () => {
    const ok = window.confirm(
      `${restaurant.nom} vous a-t-il confirmé par téléphone la commande de ${total} repas ?\n\n` +
        "Ne confirmez que si le restaurant a validé de vive voix."
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await confirmerParTelephoneAction(restaurant.id);
      if (!res.success) window.alert(res.message || "Confirmation impossible.");
    });
  };

  // Le RH ouvre WhatsApp : on note l'heure d'envoi (le message lui-même part depuis son téléphone)
  const noterEnvoi = () => {
    if (cloture && cloture.envoi_statut !== "envoye") {
      startTransition(async () => {
        await marquerRecapEnvoyeAction(restaurant.id);
      });
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-neutral-200 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-neutral-100">
        <div className="space-y-1">
          <h3 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
            <Utensils className="w-4 h-4 text-orange-500" />
            {restaurant.nom}
            <span className="text-orange-600">• {total} repas</span>
          </h3>
          <p className="text-xs text-neutral-500">
            Livraison pour {formatHeure(restaurant.heure_livraison)}
            {restaurant.telephone_whatsapp
              ? ` • ${restaurant.telephone_whatsapp}`
              : " • aucun numéro WhatsApp"}
          </p>
          <span
            className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${statut.classe}`}
          >
            {statut.texte}
          </span>
          {cloture && !cloture.confirme_at && total > 0 && (
            <p className="text-[11px] font-semibold text-amber-700">
              Non comptabilisé (facture, paie) tant que la commande n&apos;est pas confirmée.
            </p>
          )}
          {cloture?.envoi_erreur && (
            <p className="text-[11px] text-red-600 truncate max-w-md" title={cloture.envoi_erreur}>
              {cloture.envoi_erreur}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!peutEnvoyer && (
            <span className="text-[11px] text-neutral-500">
              Envoi possible après la clôture de la journée
            </span>
          )}
          {peutEnvoyer && restaurant.telephone_whatsapp && (
            <a
              href={`https://wa.me/${restaurant.telephone_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              onClick={noterEnvoi}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              {cloture?.envoi_statut === "envoye" ? "Renvoyer" : "Envoyer le récap"}
            </a>
          )}
          {cloture && !cloture.confirme_at && (
            <button
              type="button"
              disabled={isPending}
              onClick={confirmerParTelephone}
              title="À utiliser seulement si le restaurant a validé la commande au téléphone"
              className="px-3 py-2 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <PhoneCall className="w-4 h-4" />
              Confirmé par téléphone
            </button>
          )}
          <a
            href={`/resto/${restaurant.token}`}
            target="_blank"
            rel="noreferrer"
            title="Page de confirmation du restaurant"
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 active:scale-98 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4 text-neutral-500" />
            Page restaurant
          </a>
          {peutEnvoyer && (
            <button
              onClick={() => {
                copier();
                noterEnvoi();
              }}
              className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 active:scale-98 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
            >
              {copie ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4 text-neutral-500" />
              )}
              {copie ? "Copié !" : "Copier"}
            </button>
          )}
        </div>
      </div>

      {recap.length === 0 ? (
        <p className="text-center py-3 text-neutral-400 text-xs">Aucun repas commandé pour ce restaurant.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {recap.map((ligne) => (
            <div
              key={ligne.plat_titre}
              className="bg-orange-50/50 border border-orange-100 rounded-2xl p-3 flex items-center justify-between gap-2"
            >
              <span className="text-sm font-bold text-neutral-800">{ligne.plat_titre}</span>
              <span className="text-lg font-black text-orange-600 bg-white px-2.5 py-0.5 rounded-xl border border-orange-200">
                {ligne.quantite}x
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
