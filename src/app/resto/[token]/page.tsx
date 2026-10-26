import { notFound } from "next/navigation";
import { Utensils, MapPin, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, todayDakar } from "@/lib/config";
import { formatDateLongue, getCommandesDuJour } from "@/lib/cloture";
import { buildRecap, formatHeure } from "@/lib/recap";
import { ConfirmButton } from "./confirm-button";

export const dynamic = "force-dynamic";

interface RestoPageProps {
  params: Promise<{ token: string }>;
}

export default async function TraiteurValidationPage({ params }: RestoPageProps) {
  const { token } = await params;
  const today = todayDakar();
  const dateStr = formatDateLongue(today);

  // Données de démonstration pour le traiteur
  let traiteurNom = "Chez Fatou Traiteur Thiès";
  let companyNom = "Pilote Thiès Innovation";
  let heureLivraison: string | null = "12:30:00";
  let recap = [
    { plat_titre: "Thiéboudienne Rouge Penda Mbaye", quantite: 18, prix_unitaire: 1500 },
    { plat_titre: "Yassa Poulet au Feu de Bois", quantite: 12, prix_unitaire: 1500 },
    { plat_titre: "Soupou Kandia (Sauce Gombo)", quantite: 4, prix_unitaire: 1700 },
  ];
  let isCloture = true;
  let confirmeAt: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: rawResto } = await supabase
      .from("restaurants")
      .select("id, nom, heure_livraison, company_id, companies(nom)")
      .eq("token", token)
      .maybeSingle();

    const resto: any = rawResto;
    if (!resto) {
      notFound();
    }

    traiteurNom = resto.nom;
    companyNom = resto.companies?.nom || "Entreprise";
    heureLivraison = resto.heure_livraison;

    const { data: rawCloture } = await supabase
      .from("clotures")
      .select("recap, confirme_at")
      .eq("restaurant_id", resto.id)
      .eq("date", today)
      .maybeSingle();

    const cloture: any = rawCloture;
    if (cloture) {
      // Récapitulatif figé à la clôture : c'est ce qui a été envoyé au restaurant
      recap = cloture.recap;
      confirmeAt = cloture.confirme_at;
      isCloture = true;
    } else {
      // Avant la clôture : aperçu des votes en cours, limité aux plats de ce restaurant
      const commandes = await getCommandesDuJour(supabase, resto.company_id, today);
      recap = buildRecap(commandes.filter((c) => c.restaurant_id === resto.id));
      isCloture = false;
    }
  }

  const totalPlats = recap.reduce((acc, curr) => acc + curr.quantite, 0);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4 max-w-md mx-auto flex flex-col justify-between">
      <div>
        {/* En-tête Traiteur */}
        <div className="bg-neutral-800 rounded-3xl p-5 border border-neutral-700 shadow-xl mb-4">
          <div className="flex items-center justify-between text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
            <span>Passerelle Traiteur</span>
            <span>{isCloture ? "Commande clôturée" : "Votes en cours"}</span>
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
            token={token}
            totalRepas={totalPlats}
            confirmeAt={confirmeAt}
            isCloture={isCloture}
          />
        </div>
      </div>

      <footer className="py-4 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
        Lien sécurisé Cantine Pro — Réf: {token.slice(0, 8)}
      </footer>
    </div>
  );
}
