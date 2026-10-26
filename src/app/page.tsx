import Link from "next/link";
import { Utensils, ShieldCheck, Clock, Users, ArrowRight } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";

export default function HomePage() {
  // Avec une vraie base, chaque restaurant a son propre lien secret : on renvoie vers l'Espace RH
  const lienRestaurant = isSupabaseConfigured() ? "/rh" : "/resto/token-demo-traiteur";

  return (
    <div className="flex min-h-screen flex-col justify-between p-6 max-w-md mx-auto sm:max-w-xl">
      <header className="pt-8 pb-4 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/30 mb-4">
          <Utensils className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">
          Cantine <span className="text-orange-600">Pro</span>
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Le repas au bureau à Thiès & Dakar, sans stress ni appels.
        </p>
      </header>

      <main className="space-y-6 my-auto">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-neutral-100 space-y-4">
          <h2 className="text-lg font-bold text-neutral-800">
            Sprint Pilote 14 Jours
          </h2>
          <div className="space-y-3 text-sm text-neutral-600">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <span>
                <strong>Vote avant 11h10 :</strong> Chaque collaborateur choisit
                son plat du jour en 5 secondes sur son téléphone.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <span>
                <strong>Espace RH automatique :</strong> Fini les listes
                papier et les messages WhatsApp désordonnés.
              </span>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <span>
                <strong>Zéro mot de passe :</strong> Accès direct via lien
                magique sécurisé unique pour chaque employé.
              </span>
            </div>
          </div>
        </div>

        {/* Accès rapides démo pour test */}
        <div className="bg-orange-50 border border-orange-200 rounded-3xl p-5 space-y-3">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-800">
              Espace Pilote Thiès & Dakar
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              Accédez directement aux interfaces du sprint :
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <Link
              href="/rh"
              className="inline-flex items-center justify-between w-full px-4 py-3 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 active:scale-98 transition rounded-2xl shadow-sm"
            >
              <span>💼 Espace RH (Menus, Suivi Live & Clôture 11h10)</span>
              <ArrowRight className="w-4 h-4 text-orange-400" />
            </Link>

            <Link
              href="/c/pilote-thies"
              className="inline-flex items-center justify-between w-full px-4 py-3 text-xs font-bold text-neutral-800 bg-white hover:bg-neutral-100 active:scale-98 transition rounded-2xl border border-neutral-200 shadow-xs"
            >
              <span>🏢 Portail Entreprise (Lien Global WhatsApp)</span>
              <ArrowRight className="w-4 h-4 text-orange-500" />
            </Link>

            <Link
              href="/p/token-demo-moussa"
              className="inline-flex items-center justify-between w-full px-4 py-3 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 active:scale-98 transition rounded-2xl shadow-sm shadow-orange-600/20"
            >
              <span>📱 Interface Employé (Vote PWA 2 Clics)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href={lienRestaurant}
              className="inline-flex items-center justify-between w-full px-4 py-3 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 active:scale-98 transition rounded-2xl border border-neutral-200"
            >
              <span>
                🍽️ Passerelle Restaurant (Validation 1-Clic)
                {lienRestaurant === "/rh" && (
                  <span className="block font-medium text-neutral-500">
                    Liens dans l'Espace RH → onglet Restaurants
                  </span>
                )}
              </span>
              <ArrowRight className="w-4 h-4 text-neutral-400" />
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-neutral-400">
        &copy; {new Date().getFullYear()} Cantine Pro — Spécial Pilotes Thiès & Dakar.
      </footer>
    </div>
  );
}
