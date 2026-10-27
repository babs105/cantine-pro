import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Check,
  ClipboardCheck,
  FileSpreadsheet,
  Smartphone,
  Store,
  Timer,
  Utensils,
} from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";
import { PLANS, PLAN_IDS } from "@/lib/abonnement";
import { RetourApplication } from "./retour-application";

const ETAPES = [
  {
    icone: BellRing,
    heure: "08h00",
    titre: "Le RH publie le menu",
    texte: "Les plats des restaurants partenaires, partagés en un message sur le groupe WhatsApp.",
  },
  {
    icone: Smartphone,
    heure: "08h – 11h10",
    titre: "Chacun commande en 2 clics",
    texte: "Sur son téléphone, sans compte ni mot de passe. Modifiable jusqu'à l'heure limite.",
  },
  {
    icone: Store,
    heure: "11h10",
    titre: "Un récap par restaurant",
    texte: "Les quantités exactes par plat, envoyées sur WhatsApp, confirmées en un clic.",
  },
  {
    icone: FileSpreadsheet,
    heure: "Fin du mois",
    titre: "Facture irréfutable",
    texte: "Seuls les repas confirmés sont facturés. Export PDF et Excel paie par service.",
  },
];

const AVANTAGES = [
  "Fini le cahier et les appels de 10h30",
  "Zéro erreur de quantité chez le restaurant",
  "Plus de litige sur la facture du mois",
  "Déduction sur salaire prête pour la paie",
];

export default function HomePage() {
  const isDemo = !isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <RetourApplication />

      {/* Barre de navigation */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-extrabold">
            <span className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center">
              <Utensils className="w-4 h-4" />
            </span>
            Cantine <span className="text-orange-600 -ml-1">Pro</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 text-xs font-bold">
            <a href="#tarifs" className="hidden sm:block px-3 py-2 text-neutral-600 hover:text-neutral-900">
              Tarifs
            </a>
            <Link href="/rh/login" className="px-3 py-2 text-neutral-700 hover:text-neutral-900">
              Espace RH
            </Link>
            <Link
              href="/inscription"
              className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition"
            >
              Essai gratuit
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Accroche */}
        <section className="max-w-6xl mx-auto px-4 pt-12 pb-16 sm:pt-20 grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 px-3 py-1 rounded-full">
              <Timer className="w-3.5 h-3.5" /> Thiès • Dakar • zone UEMOA
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Les repas de vos équipes, <span className="text-orange-600">commandés en 2 clics.</span>
            </h1>
            <p className="text-base text-neutral-600 max-w-lg">
              Cantine Pro remplace le cahier, les groupes WhatsApp désordonnés et les appels aux restaurants. Vos
              salariés choisissent leur plat, le restaurant reçoit un récap clair, et vous obtenez une facture juste en
              fin de mois.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/inscription"
                className="px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2"
              >
                Démarrer l&apos;essai gratuit de 14 jours <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#comment"
                className="px-5 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-sm rounded-2xl transition text-center"
              >
                Comment ça marche
              </a>
            </div>
            <p className="text-xs text-neutral-500">Sans carte bancaire • Opérationnel en 10 minutes</p>
          </div>

          {/* Aperçu de l'écran salarié */}
          <div className="mx-auto w-full max-w-xs bg-neutral-900 rounded-[2.5rem] p-3 shadow-2xl">
            <div className="bg-neutral-50 rounded-[2rem] p-4 space-y-3">
              <div className="bg-white rounded-2xl p-3 border border-neutral-100">
                <p className="text-[10px] font-bold uppercase text-neutral-400">Bâti-Plus • Lundi</p>
                <p className="text-sm font-extrabold">Bonjour Awa 👋</p>
                <p className="mt-2 text-[11px] font-bold text-orange-800 bg-orange-50 rounded-lg py-1 text-center">
                  ⏱️ Il vous reste 45 min pour choisir
                </p>
              </div>
              {[
                { plat: "Thiéboudienne Penda Mbaye", prix: "1 500 F", choisi: false },
                { plat: "Poulet Yassa", prix: "1 500 F", choisi: true },
                { plat: "Salade composée", prix: "1 200 F", choisi: false },
              ].map((p) => (
                <div
                  key={p.plat}
                  className={`bg-white rounded-2xl p-3 border text-xs ${
                    p.choisi ? "border-emerald-400 ring-2 ring-emerald-100" : "border-neutral-100"
                  }`}
                >
                  <div className="flex justify-between gap-2 font-bold">
                    <span>{p.plat}</span>
                    <span className="text-orange-600">{p.prix}</span>
                  </div>
                  <p
                    className={`mt-2 text-center font-semibold rounded-lg py-1.5 ${
                      p.choisi ? "bg-emerald-600 text-white" : "bg-orange-600 text-white"
                    }`}
                  >
                    {p.choisi ? "✓ Choix enregistré à 09:14" : "Commander ce plat"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Déroulé d'une journée */}
        <section id="comment" className="bg-neutral-50 border-y border-neutral-100">
          <div className="max-w-6xl mx-auto px-4 py-16 space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold">Une journée avec Cantine Pro</h2>
              <p className="text-sm text-neutral-600">Du menu du matin à la facture du mois, tout est tracé.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ETAPES.map((e) => (
                <div key={e.titre} className="bg-white rounded-3xl p-5 border border-neutral-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                      <e.icone className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-black text-orange-600">{e.heure}</span>
                  </div>
                  <h3 className="font-extrabold">{e.titre}</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">{e.texte}</p>
                </div>
              ))}
            </div>
            <ul className="grid sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {AVANTAGES.map((a) => (
                <li key={a} className="flex items-center gap-2 text-sm text-neutral-700">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="max-w-6xl mx-auto px-4 py-16 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold">Des tarifs simples, en FCFA</h2>
            <p className="text-sm text-neutral-600">
              14 jours d&apos;essai gratuit sur toutes les offres. Règlement par Wave, sans engagement.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              const vedette = id === "pro";
              return (
                <div
                  key={id}
                  className={`rounded-3xl p-6 border space-y-5 flex flex-col ${
                    vedette ? "border-orange-500 ring-4 ring-orange-100 bg-white" : "border-neutral-200 bg-white"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-extrabold">{plan.nom}</h3>
                      {vedette && (
                        <span className="text-[10px] font-bold uppercase bg-orange-600 text-white px-2 py-0.5 rounded-full">
                          Le plus choisi
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">Jusqu&apos;à {plan.maxEmployes} salariés</p>
                  </div>
                  <p>
                    <span className="text-3xl font-black">{plan.prix.toLocaleString("fr-FR")}</span>
                    <span className="text-sm text-neutral-500"> FCFA / mois</span>
                  </p>
                  <ul className="space-y-2 text-xs text-neutral-700 flex-1">
                    {[
                      "Commande mobile sans compte pour chaque salarié",
                      "Restaurants partenaires illimités",
                      "Récap WhatsApp et confirmation en 1 clic",
                      "Facture PDF et export Excel paie par service",
                      "Statistiques DG / DAF",
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/inscription"
                    className={`w-full py-3 rounded-2xl font-bold text-sm text-center transition ${
                      vedette
                        ? "bg-orange-600 hover:bg-orange-700 text-white"
                        : "bg-neutral-900 hover:bg-neutral-800 text-white"
                    }`}
                  >
                    Essayer gratuitement
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {/* Appel à l'action final */}
        <section className="max-w-6xl mx-auto px-4 pb-16">
          <div className="bg-neutral-900 text-white rounded-3xl p-8 sm:p-12 text-center space-y-4">
            <h2 className="text-2xl sm:text-3xl font-extrabold">Prêt pour demain midi ?</h2>
            <p className="text-sm text-neutral-300 max-w-xl mx-auto">
              Créez votre compte, importez votre liste Excel de salariés, ajoutez vos restaurants : votre premier
              service peut démarrer dès demain matin.
            </p>
            <Link
              href="/inscription"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 font-bold text-sm rounded-2xl transition"
            >
              Créer mon compte <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {isDemo && (
          <section className="max-w-6xl mx-auto px-4 pb-12">
            <div className="bg-orange-50 border border-orange-200 rounded-3xl p-5 text-xs space-y-2">
              <p className="font-bold text-orange-800">Mode démo — accès directs aux interfaces :</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/rh" className="px-3 py-2 bg-white rounded-xl border font-semibold">
                  Espace RH
                </Link>
                <Link href="/c/pilote-thies" className="px-3 py-2 bg-white rounded-xl border font-semibold">
                  Portail entreprise
                </Link>
                <Link href="/p/token-demo-moussa" className="px-3 py-2 bg-white rounded-xl border font-semibold">
                  Page salarié
                </Link>
                <Link href="/resto/token-demo-traiteur" className="px-3 py-2 bg-white rounded-xl border font-semibold">
                  Page restaurant
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-400">
          <span>&copy; {new Date().getFullYear()} Cantine Pro — Thiès &amp; Dakar</span>
          <span className="flex gap-4">
            <Link href="/rh/login" className="hover:text-neutral-700">
              Espace RH
            </Link>
            <Link href="/inscription" className="hover:text-neutral-700">
              Inscription
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
