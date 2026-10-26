import { CheckCircle2, Utensils, MapPin, Phone, ShieldCheck } from "lucide-react";

interface RestoPageProps {
  params: Promise<{ token: string }>;
}

export default async function TraiteurValidationPage({ params }: RestoPageProps) {
  const { token } = await params;

  // Données de démonstration pour le traiteur
  const dateStr = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const recap = [
    { plat: "Thiéboudienne Rouge Penda Mbaye", quantite: 18 },
    { plat: "Yassa Poulet au Feu de Bois", quantite: 12 },
    { plat: "Soupou Kandia (Sauce Gombo)", quantite: 4 },
  ];

  const totalPlats = recap.reduce((acc, curr) => acc + curr.quantite, 0);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4 max-w-md mx-auto flex flex-col justify-between">
      <div>
        {/* En-tête Traiteur */}
        <div className="bg-neutral-800 rounded-3xl p-5 border border-neutral-700 shadow-xl mb-4">
          <div className="flex items-center justify-between text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
            <span>Passerelle Traiteur</span>
            <span>Clôture 11h05</span>
          </div>

          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Utensils className="w-5 h-5 text-orange-500" />
            Chez Fatou Traiteur Thiès
          </h1>

          <div className="mt-2 text-xs text-neutral-400 space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-neutral-400" />
              <span>Livraison : Pilote Thiès Innovation (Quartier Dixième)</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-neutral-400" />
              <span>Contact RH : +221 77 123 45 67</span>
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
              {totalPlats} repas
            </span>
          </div>

          <div className="space-y-3">
            {recap.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-2xl bg-neutral-900/60 border border-neutral-700/50"
              >
                <span className="text-sm font-medium text-neutral-200">
                  {item.plat}
                </span>
                <span className="text-base font-black text-orange-400 px-3 py-1 rounded-xl bg-orange-950/60 border border-orange-800/40">
                  {item.quantite}x
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-700 flex justify-between items-center text-xs text-neutral-400">
            <span>Heure de livraison convenue :</span>
            <span className="text-sm font-bold text-white">12h30</span>
          </div>
        </div>

        {/* Bouton de confirmation Traiteur 1-Clic */}
        <div className="bg-neutral-800 rounded-3xl p-5 border border-neutral-700 text-center space-y-3">
          <div className="text-xs text-neutral-300">
            Confirmez la bonne réception de la commande en un clic pour rassurer l&apos;entreprise :
          </div>
          <button
            type="button"
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            Confirmer la préparation (34 repas)
          </button>
        </div>
      </div>

      <footer className="py-4 text-center text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
        Lien sécurisé Cantine Pro — Réf: {token.slice(0, 8)}
      </footer>
    </div>
  );
}
