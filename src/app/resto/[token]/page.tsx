import { notFound } from "next/navigation";
import Link from "next/link";
import { Utensils, MapPin, ShieldCheck, Store } from "lucide-react";
import { getRestoCompteId } from "@/lib/resto-session";
import { echangerJetonRestaurant } from "@/lib/supabase/server";
import { lireEntrepriseVisible } from "@/lib/entreprise-visible";
import { todayDakar } from "@/lib/config";
import { formatDateLongue, getCommandesDuJour } from "@/lib/cloture";
import { buildRecap, formatHeure } from "@/lib/recap";
import { ConfirmButton } from "../confirm-button";
import { CarteRestaurant } from "../carte-restaurant";
import type { PlatCarte } from "../actions";
import { RelierLienButton } from "../relier-lien";

export const dynamic = "force-dynamic";

interface RestoPageProps {
  params: Promise<{ token: string }>;
}

export default async function TraiteurValidationPage({ params }: RestoPageProps) {
  const { token } = await params;
  const today = todayDakar();
  const dateStr = formatDateLongue(today);

  // Le token du lien est échangé contre un JWT court limité à ce restaurant (politiques RLS)
  const acces = await echangerJetonRestaurant(token);
  if (!acces) {
    notFound();
  }
  const { supabase } = acces;

  const { data: rawResto } = await supabase
    .from("restaurants")
    .select("id, nom, heure_livraison, company_id, compte_id")
    .eq("id", acces.restaurantId)
    .maybeSingle();

  const resto: any = rawResto;
  if (!resto) {
    notFound();
  }

  const traiteurNom: string = resto.nom;
  // v1.10 (T14) : nom et heure limite de l'entreprise par entreprise_visible, plus par la table companies
  const entreprise = await lireEntrepriseVisible(supabase);
  const companyNom: string = entreprise?.nom || "Entreprise";
  const heureLivraison: string | null = resto.heure_livraison;
  let recap: Array<{ plat_titre: string; quantite: number; prix_unitaire: number }>;
  let isCloture: boolean;
  let confirmeAt: string | null = null;
  let confirmeParRh = false;

  const { data: rawCloture } = await supabase
    .from("clotures")
    .select("recap, confirme_at, confirme_par")
    .eq("restaurant_id", resto.id)
    .eq("date", today)
    .maybeSingle();

  const cloture: any = rawCloture;
  if (cloture) {
    // Récapitulatif figé à la clôture : c'est ce qui a été envoyé au restaurant
    recap = cloture.recap;
    confirmeAt = cloture.confirme_at;
    confirmeParRh = cloture.confirme_par === "rh";
    isCloture = true;
  } else {
    // Avant la clôture : aperçu des commandes en cours, limité aux plats de ce restaurant
    const commandes = await getCommandesDuJour(supabase, resto.company_id, today);
    recap = buildRecap(commandes.filter((c) => c.restaurant_id === resto.id));
    isCloture = false;
  }

  // Carte du restaurant : plats proposés au RH pour composer le menu du jour
  const { data: rawCarte } = await supabase
    .from("plats_restaurant")
    .select("id, titre, description, prix_unitaire, is_active")
    .eq("restaurant_id", resto.id)
    .order("created_at");
  const carte = ((rawCarte as PlatCarte[] | null) || []);

  const compteConnecte = !!(await getRestoCompteId());
  const relieAUnCompte = !!resto.compte_id;

  const totalPlats = recap.reduce((acc, curr) => acc + curr.quantite, 0);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4 max-w-md mx-auto flex flex-col justify-between">
      <div>
        {/* En-tête Traiteur */}
        <div className="bg-neutral-800 rounded-3xl p-5 border border-neutral-700 shadow-xl mb-4">
          <div className="flex items-center justify-between text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
            <span>Passerelle Traiteur</span>
            <span>{isCloture ? "Commande clôturée" : "En attente de clôture"}</span>
          </div>

          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Utensils className="w-5 h-5 text-orange-500" />
            {traiteurNom}
          </h1>

          <div className="mt-2 text-xs text-neutral-400 space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-neutral-400" />
              <span>Livraison : {companyNom}</span>
            </div>
          </div>
        </div>

        {/* Détail de la commande du jour */}
        <div className="bg-neutral-800/90 rounded-3xl p-5 border border-neutral-700 mb-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-700 mb-3">
            <span className="text-xs font-bold text-neutral-300">
              Commande du {dateStr}
            </span>
            <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {totalPlats} repas{isCloture ? "" : " (provisoire)"}
            </span>
          </div>

          <div className="space-y-3">
            {recap.length === 0 && (
              <div className="text-center py-4 text-xs text-neutral-500">
                Aucun repas commandé pour le moment.
              </div>
            )}
            {recap.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-2xl bg-neutral-900/60 border border-neutral-700/50"
              >
                <span className="text-sm font-medium text-neutral-200">
                  {item.plat_titre}
                </span>
                <span className="text-base font-black text-orange-400 px-3 py-1 rounded-xl bg-orange-950/60 border border-orange-800/40">
                  {item.quantite}x
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-700 flex justify-between items-center text-xs text-neutral-400">
            <span>Heure de livraison convenue :</span>
            <span className="text-sm font-bold text-white">{formatHeure(heureLivraison)}</span>
          </div>
        </div>

        {/* Bouton de confirmation Traiteur 1-Clic */}
        <div className="bg-neutral-800 rounded-3xl p-5 border border-neutral-700 text-center space-y-3">
          <div className="text-xs text-neutral-300">
            Confirmez la bonne réception de la commande en un clic pour rassurer l&apos;entreprise :
          </div>
          <ConfirmButton
            cible={{ token }}
            heureLimite={entreprise?.heure_limite_vote}
            totalRepas={totalPlats}
            confirmeAt={confirmeAt}
            confirmeParRh={confirmeParRh}
            isCloture={isCloture}
          />
        </div>

        {/* Passerelle vers le compte restaurant multi-entreprises */}
        <div className="mt-4 bg-neutral-800 rounded-3xl p-5 border border-neutral-700 space-y-3">
          <div className="flex items-start gap-3">
            <Store className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-300">
              {relieAUnCompte
                ? "Cette entreprise fait partie de votre espace restaurant : retrouvez-y toutes vos entreprises, vos cartes et votre historique."
                : "Vous livrez plusieurs entreprises ? Gérez-les toutes depuis un seul espace restaurant."}
            </p>
          </div>
          {relieAUnCompte ? (
            <Link href="/resto" className="block w-full py-2.5 text-center bg-neutral-700 hover:bg-neutral-600 text-white font-bold text-sm rounded-2xl transition">
              Ouvrir mon espace restaurant
            </Link>
          ) : compteConnecte ? (
            <RelierLienButton token={token} companyNom={companyNom} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/resto/inscription?lien=${token}`}
                className="py-2.5 text-center bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-2xl transition"
              >
                Créer mon espace
              </Link>
              <Link href="/resto/login" className="py-2.5 text-center bg-neutral-700 hover:bg-neutral-600 text-white font-bold text-xs rounded-2xl transition">
                Se connecter
              </Link>
            </div>
          )}
        </div>

        <div className="mt-4">
          <CarteRestaurant cible={{ token }} companyNom={companyNom} initialPlats={carte} />
        </div>
      </div>

      <footer className="py-4 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
        Lien sécurisé Cantine Pro — Réf: {token.slice(0, 8)}
      </footer>
    </div>
  );
}
