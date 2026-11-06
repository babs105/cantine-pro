import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  Handshake,
  LogIn,
  Smartphone,
  Store,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import { PLANS, PLAN_IDS } from "@/lib/abonnement";
import { RetourApplication } from "./retour-application";
import { AccueilHero } from "./accueil-hero";

/**
 * Accueil : Cantine Pro relie deux publics.
 * - les entreprises (RH + salariés), qui paient l'abonnement ;
 * - les restaurants, gratuits, qui publient leurs menus pour plusieurs entreprises depuis un seul espace.
 */

const ACTEURS = {
  Restaurant: "bg-orange-100 text-orange-800",
  RH: "bg-neutral-900 text-white",
  Salariés: "bg-emerald-100 text-emerald-800",
} as const;

const JOURNEE: Array<{ heure: string; qui: keyof typeof ACTEURS; titre: string; texte: string; icone: typeof Store }> = [
  {
    heure: "La semaine d'avant",
    qui: "Restaurant",
    titre: "Il publie ses menus",
    texte: "Depuis sa carte, jour par jour. Les plats apparaissent aussitôt dans le menu de l'entreprise.",
    icone: CalendarDays,
  },
  {
    heure: "08h00",
    qui: "RH",
    titre: "Il partage le lien",
    texte: "Un message prêt à poster dans le groupe WhatsApp, avec le menu du jour et l'heure limite.",
    icone: Users,
  },
  {
    heure: "08h – 11h10",
    qui: "Salariés",
    titre: "Ils commandent en 2 clics",
    texte: "Sur leur téléphone, sans compte ni mot de passe. Modifiable jusqu'à l'heure limite.",
    icone: Smartphone,
  },
  {
    heure: "11h10",
    qui: "Restaurant",
    titre: "Il confirme les quantités",
    texte: "Récap clair par plat, confirmation en un clic. Il ne prépare que ce qui est commandé.",
    icone: ClipboardCheck,
  },
  {
    heure: "Fin du mois",
    qui: "RH",
    titre: "Il facture sans litige",
    texte: "Seuls les repas confirmés comptent. Facture PDF et export paie par service.",
    icone: FileSpreadsheet,
  },
];

const AVANT_APRES: Array<[string, string]> = [
  ["Un cahier qui circule dans les bureaux", "Chacun commande sur son téléphone"],
  ["Les appels au restaurant à 10h30", "Un récap WhatsApp automatique à 11h10"],
  ["Des plats en trop, ou qui manquent", "Des quantités exactes, confirmées par le restaurant"],
  ["Des litiges sur la facture du mois", "Seuls les repas confirmés sont facturés"],
  ["Un tableau Excel à refaire pour la paie", "Export paie par service en un clic"],
];

const POUR_ENTREPRISES = [
  { icone: Smartphone, titre: "Commande mobile", texte: "Un lien magique par salarié, installable comme une appli." },
  { icone: Store, titre: "Plusieurs restaurants", texte: "Ajoutez vos restaurants avec leur code : leurs menus arrivent seuls." },
  { icone: ClipboardCheck, titre: "Suivi en direct", texte: "Qui a commandé, qui manque, relance en un clic à 10h30." },
  { icone: FileSpreadsheet, titre: "Facture et paie", texte: "PDF par restaurant, export Excel par service, statistiques DG." },
];

const POUR_RESTAURANTS = [
  { icone: CalendarDays, titre: "Menus de la semaine", texte: "Publiés une fois, visibles tout de suite par l'entreprise et ses salariés." },
  { icone: BookOpen, titre: "Une carte par entreprise", texte: "Vos plats et vos prix, client par client. Copiez une carte en un clic." },
  { icone: Handshake, titre: "Toutes vos entreprises", texte: "Un code partenaire ou un lien d'invitation, et l'entreprise vous rejoint." },
  { icone: Wallet, titre: "Vos montants à facturer", texte: "Repas confirmés jour par jour et total du mois, par entreprise." },
];

const FAQ: Array<[string, string]> = [
  [
    "Les salariés doivent-ils installer une application ?",
    "Non. Chacun reçoit un lien personnel qui s'ouvre dans le navigateur du téléphone, sans compte ni mot de passe. Il peut l'ajouter à son écran d'accueil comme une appli.",
  ],
  [
    "Comment le restaurant reçoit-il la commande ?",
    "À l'heure limite (11h10 par défaut), chaque restaurant reçoit sur WhatsApp le récapitulatif de ses plats et le retrouve dans son espace. Il confirme en un clic.",
  ],
  [
    "Que se passe-t-il si le restaurant ne confirme pas ?",
    "L'Espace RH vous alerte à 11h30. Vous pouvez l'appeler et confirmer à sa place. Un repas non confirmé n'est jamais facturé.",
  ],
  [
    "Qui paie les repas ?",
    "Comme aujourd'hui : l'entreprise, le salarié par retenue sur salaire, ou les deux. Cantine Pro ne touche pas à l'argent des repas : le restaurant facture l'entreprise, nous facturons seulement le service.",
  ],
  [
    "Combien coûte Cantine Pro pour un restaurant ?",
    "Rien. L'espace restaurant est gratuit : menus, carte, confirmations et historique compris.",
  ],
  [
    "Comment régler l'abonnement ?",
    "Par Wave, chaque mois, sans engagement. Les 14 premiers jours sont gratuits et sans carte bancaire.",
  ],
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <RetourApplication />

      {/* Barre de navigation */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-extrabold shrink-0">
            <span className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center">
              <Utensils className="w-4 h-4" />
            </span>
            Cantine <span className="text-orange-600 -ml-1">Pro</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 text-xs font-bold">
            <a href="#journee" className="hidden md:block px-3 py-2 text-neutral-600 hover:text-neutral-900">
              Comment ça marche
            </a>
            <a href="#restaurants" className="hidden md:block px-3 py-2 text-neutral-600 hover:text-neutral-900">
              Restaurants
            </a>
            <a href="#tarifs" className="hidden md:block px-3 py-2 text-neutral-600 hover:text-neutral-900">
              Tarifs
            </a>
            <details className="relative group">
              <summary className="list-none cursor-pointer px-3 py-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                <LogIn className="w-4 h-4" />
                Connexion
                <ChevronDown className="w-3.5 h-3.5 transition group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-neutral-200 shadow-xl p-2 space-y-1">
                <Link href="/rh/login" className="flex items-start gap-3 p-3 rounded-xl hover:bg-neutral-50">
                  <Building2 className="w-5 h-5 text-orange-600 shrink-0" />
                  <span>
                    <span className="block text-sm font-extrabold">Espace RH</span>
                    <span className="block text-[11px] font-medium text-neutral-500">Entreprise : commandes, factures, paie</span>
                  </span>
                </Link>
                <Link href="/resto/login" className="flex items-start gap-3 p-3 rounded-xl hover:bg-neutral-50">
                  <Store className="w-5 h-5 text-orange-600 shrink-0" />
                  <span>
                    <span className="block text-sm font-extrabold">Espace restaurant</span>
                    <span className="block text-[11px] font-medium text-neutral-500">Menus, carte, confirmations</span>
                  </span>
                </Link>
              </div>
            </details>
          </nav>
        </div>
      </header>

      <main>
        {/* ACCROCHE */}
        <section className="relative overflow-clip bg-gradient-to-b from-orange-50 via-orange-50/40 to-white">
          <div
            aria-hidden
            className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-orange-200/40 blur-3xl"
          />
          <div className="relative max-w-6xl mx-auto px-4 pt-10 pb-16 sm:pt-16 lg:pb-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center [&>*]:min-w-0">
            <AccueilHero />
            <ApercuChaine />
          </div>
        </section>

        {/* CHIFFRES CLÉS */}
        <section className="border-y border-neutral-100 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {[
              ["2 clics", "pour commander son déjeuner"],
              ["11h10", "récap envoyé à chaque restaurant"],
              ["0 litige", "seuls les repas confirmés sont facturés"],
              ["0 F", "pour les restaurants partenaires"],
            ].map(([chiffre, texte]) => (
              <div key={chiffre}>
                <div className="text-2xl sm:text-3xl font-black text-orange-600">{chiffre}</div>
                <div className="text-xs text-neutral-500 mt-1">{texte}</div>
              </div>
            ))}
          </div>
        </section>

        {/* AVANT / APRÈS */}
        <section className="max-w-6xl mx-auto px-4 py-16 sm:py-20 space-y-10">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold">Le repas du midi, sans le casse-tête</h2>
            <p className="text-sm text-neutral-600">
              Ce que vivent les RH et les restaurants chaque matin, et ce qui change avec Cantine Pro.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 space-y-3">
              <h3 className="text-sm font-extrabold text-neutral-500 uppercase tracking-wider">Aujourd&apos;hui</h3>
              {AVANT_APRES.map(([avant]) => (
                <p key={avant} className="flex items-start gap-2 text-sm text-neutral-600">
                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  {avant}
                </p>
              ))}
            </div>
            <div className="rounded-3xl border border-orange-200 bg-white p-6 space-y-3 shadow-sm shadow-orange-100">
              <h3 className="text-sm font-extrabold text-orange-600 uppercase tracking-wider">Avec Cantine Pro</h3>
              {AVANT_APRES.map(([, apres]) => (
                <p key={apres} className="flex items-start gap-2 text-sm font-semibold text-neutral-800">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  {apres}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* UNE JOURNÉE */}
        <section id="journee" className="bg-neutral-50 border-y border-neutral-100 scroll-mt-14">
          <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold">Une journée avec Cantine Pro</h2>
              <p className="text-sm text-neutral-600">Trois acteurs, chacun son écran, une seule commande juste.</p>
            </div>
            <ol className="relative grid gap-4 lg:grid-cols-5">
              <div aria-hidden className="hidden lg:block absolute top-6 left-[10%] right-[10%] h-0.5 bg-orange-200" />
              {JOURNEE.map((e, i) => (
                <li key={e.titre} className="relative bg-white rounded-3xl p-5 border border-neutral-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="relative w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/30">
                      <e.icone className="w-5 h-5" />
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-orange-200 text-orange-700 text-[10px] font-black flex items-center justify-center">
                        {i + 1}
                      </span>
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ACTEURS[e.qui]}`}>
                      {e.qui}
                    </span>
                  </div>
                  <div className="text-xs font-black text-orange-600">{e.heure}</div>
                  <h3 className="font-extrabold leading-snug">{e.titre}</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">{e.texte}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* POUR LES ENTREPRISES */}
        <section id="entreprises" className="max-w-6xl mx-auto px-4 py-16 sm:py-20 grid lg:grid-cols-2 gap-12 items-center scroll-mt-14">
          <div className="space-y-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Pour les entreprises</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold">Tout le déjeuner de l&apos;entreprise, dans l&apos;Espace RH</h2>
            <p className="text-sm text-neutral-600">
              Importez vos salariés depuis Excel, ajoutez vos restaurants avec leur code partenaire : leurs menus
              arrivent automatiquement. Vous gardez la main sur tout, et la paie est prête en fin de mois.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {POUR_ENTREPRISES.map((p) => (
                <div key={p.titre} className="rounded-2xl border border-neutral-200 p-4 space-y-1.5">
                  <p.icone className="w-5 h-5 text-orange-600" />
                  <h3 className="text-sm font-extrabold">{p.titre}</h3>
                  <p className="text-xs text-neutral-600 leading-relaxed">{p.texte}</p>
                </div>
              ))}
            </div>
            <Link
              href="/inscription"
              className="inline-flex items-center gap-2 px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-2xl transition"
            >
              Démarrer l&apos;essai gratuit <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <ApercuEspaceRh />
        </section>

        {/* POUR LES RESTAURANTS */}
        <section id="restaurants" className="bg-neutral-900 text-white scroll-mt-14">
          <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
            <ApercuEspaceRestaurant />
            <div className="space-y-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-400">Pour les restaurants</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold">Livrez plus d&apos;entreprises, sans plus de téléphone</h2>
              <p className="text-sm text-neutral-300">
                Publiez vos menus de la semaine pour chaque entreprise cliente : ils s&apos;affichent directement chez
                elle. À 11h10, vous avez des quantités fermes, et en fin de mois, le total à facturer.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {POUR_RESTAURANTS.map((p) => (
                  <div key={p.titre} className="rounded-2xl bg-neutral-800 border border-neutral-700 p-4 space-y-1.5">
                    <p.icone className="w-5 h-5 text-orange-400" />
                    <h3 className="text-sm font-extrabold">{p.titre}</h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">{p.texte}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/resto/inscription"
                  className="px-5 py-3 bg-orange-500 hover:bg-orange-600 font-bold text-sm rounded-2xl transition flex items-center justify-center gap-2"
                >
                  Créer mon espace gratuit <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/resto/login"
                  className="px-5 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-bold text-sm rounded-2xl transition text-center"
                >
                  Se connecter
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* TARIFS */}
        <section id="tarifs" className="max-w-6xl mx-auto px-4 py-16 sm:py-20 space-y-10 scroll-mt-14">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold">Des tarifs simples, en FCFA</h2>
            <p className="text-sm text-neutral-600">
              L&apos;entreprise paie un abonnement selon sa taille. Les restaurants ne paient rien.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {PLAN_IDS.map((id) => {
              const plan = PLANS[id];
              const vedette = id === "pro";
              return (
                <div
                  key={id}
                  className={`rounded-3xl p-6 border space-y-5 flex flex-col bg-white ${
                    vedette ? "border-orange-500 ring-4 ring-orange-100" : "border-neutral-200"
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
                      "Commande mobile pour chaque salarié",
                      "Restaurants partenaires illimités",
                      "Menus publiés par vos restaurants",
                      "Récap WhatsApp et confirmation en 1 clic",
                      "Facture PDF et export paie par service",
                    ].map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/inscription"
                    className={`w-full py-3 rounded-2xl font-bold text-sm text-center transition text-white ${
                      vedette ? "bg-orange-600 hover:bg-orange-700" : "bg-neutral-900 hover:bg-neutral-800"
                    }`}
                  >
                    Essayer 14 jours gratuits
                  </Link>
                </div>
              );
            })}
          </div>
          <div className="rounded-3xl border border-dashed border-orange-300 bg-orange-50/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-white border border-orange-200 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-orange-600" />
              </span>
              <div>
                <p className="text-sm font-extrabold">Vous êtes un restaurant ? C&apos;est gratuit.</p>
                <p className="text-xs text-neutral-600">Menus, carte par entreprise, confirmations et historique, sans abonnement.</p>
              </div>
            </div>
            <Link
              href="/resto/inscription"
              className="shrink-0 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-xl transition text-center"
            >
              Créer mon espace restaurant
            </Link>
          </div>
          <p className="text-center text-xs text-neutral-500">Règlement mensuel par Wave • Sans engagement • Sans carte bancaire pour l&apos;essai</p>
        </section>

        {/* QUESTIONS FRÉQUENTES */}
        <section className="bg-neutral-50 border-t border-neutral-100">
          <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 space-y-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-center">Questions fréquentes</h2>
            <div className="space-y-2">
              {FAQ.map(([q, r]) => (
                <details key={q} className="group bg-white rounded-2xl border border-neutral-200 open:shadow-sm">
                  <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0 transition group-open:rotate-180" />
                  </summary>
                  <p className="px-4 pb-4 text-sm text-neutral-600 leading-relaxed">{r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* APPEL À L'ACTION FINAL */}
        <section className="max-w-6xl mx-auto px-4 py-16">
          <div className="relative overflow-clip bg-orange-600 text-white rounded-3xl p-8 sm:p-12 text-center space-y-5">
            <div aria-hidden className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-orange-500/60 blur-2xl" />
            <h2 className="relative text-2xl sm:text-4xl font-extrabold">Prêt pour demain midi ?</h2>
            <p className="relative text-sm text-orange-100 max-w-xl mx-auto">
              Entreprise : importez vos salariés et ajoutez vos restaurants. Restaurant : publiez vos menus et
              invitez vos clients. Le premier service peut démarrer dès demain matin.
            </p>
            <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/inscription"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-700 hover:bg-orange-50 font-bold text-sm rounded-2xl transition"
              >
                <Building2 className="w-4 h-4" /> Inscrire mon entreprise
              </Link>
              <Link
                href="/resto/inscription"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 font-bold text-sm rounded-2xl transition"
              >
                <Store className="w-4 h-4" /> Inscrire mon restaurant
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 py-8 grid gap-6 sm:grid-cols-3 text-xs">
          <div className="space-y-2">
            <span className="flex items-center gap-2 font-extrabold text-sm">
              <span className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center">
                <Utensils className="w-3.5 h-3.5" />
              </span>
              Cantine Pro
            </span>
            <p className="text-neutral-500">Les repas d&apos;entreprise, de la commande à la facture. Thiès &amp; Dakar.</p>
          </div>
          <div className="space-y-1.5">
            <p className="font-bold text-neutral-800">Entreprises</p>
            <Link href="/inscription" className="block text-neutral-500 hover:text-neutral-900">Essai gratuit</Link>
            <Link href="/rh/login" className="block text-neutral-500 hover:text-neutral-900">Espace RH</Link>
          </div>
          <div className="space-y-1.5">
            <p className="font-bold text-neutral-800">Restaurants</p>
            <Link href="/resto/inscription" className="block text-neutral-500 hover:text-neutral-900">Créer mon espace</Link>
            <Link href="/resto/login" className="block text-neutral-500 hover:text-neutral-900">Espace restaurant</Link>
          </div>
        </div>
        <div className="border-t border-neutral-100 py-4 text-center text-[11px] text-neutral-400">
          &copy; {new Date().getFullYear()} Cantine Pro
        </div>
      </footer>
    </div>
  );
}

/** Aperçu de la chaîne : le restaurant publie, le salarié commande, le récap part à 11h10 */
function ApercuChaine() {
  return (
    <div className="relative mx-auto w-full max-w-lg h-[35rem]">
      {/* Restaurant : menu publié */}
      <div className="absolute left-0 top-0 w-48 bg-neutral-900 text-white rounded-2xl p-3.5 shadow-xl -rotate-3 z-10">
        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Espace restaurant</p>
        <p className="text-sm font-extrabold mt-1">Menu de lundi publié</p>
        <div className="mt-2 space-y-1.5 text-[11px]">
          {["Thiéboudienne", "Poulet Yassa", "Salade composée"].map((p) => (
            <div key={p} className="flex items-center justify-between bg-neutral-800 rounded-lg px-2 py-1">
              {p}
              <Check className="w-3 h-3 text-emerald-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Téléphone du salarié */}
      <div className="absolute left-1/2 -translate-x-1/2 top-28 w-60 bg-neutral-900 rounded-[2.2rem] p-2.5 shadow-2xl">
        <div className="bg-neutral-50 rounded-[1.8rem] p-3 space-y-2.5">
          <div className="bg-white rounded-2xl p-2.5 border border-neutral-100">
            <p className="text-[9px] font-bold uppercase text-neutral-400">Bâti-Plus • Lundi</p>
            <p className="text-xs font-extrabold">Bonjour Awa 👋</p>
            <p className="mt-1.5 text-[10px] font-bold text-orange-800 bg-orange-50 rounded-lg py-1 text-center">
              ⏱️ Il reste 45 min pour choisir
            </p>
          </div>
          {[
            { plat: "Thiéboudienne", prix: "1 500 F", choisi: false },
            { plat: "Poulet Yassa", prix: "1 500 F", choisi: true },
            { plat: "Salade composée", prix: "1 200 F", choisi: false },
          ].map((p) => (
            <div
              key={p.plat}
              className={`bg-white rounded-2xl p-2.5 border text-[11px] ${
                p.choisi ? "border-emerald-400 ring-2 ring-emerald-100" : "border-neutral-100"
              }`}
            >
              <div className="flex justify-between gap-2 font-bold">
                <span>{p.plat}</span>
                <span className="text-orange-600">{p.prix}</span>
              </div>
              <p
                className={`mt-1.5 text-center font-semibold rounded-lg py-1 text-[10px] text-white ${
                  p.choisi ? "bg-emerald-600" : "bg-orange-600"
                }`}
              >
                {p.choisi ? "✓ Choix enregistré à 09:14" : "Commander ce plat"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Récap WhatsApp de 11h10 */}
      <div className="absolute right-0 bottom-0 w-48 bg-white rounded-2xl p-3.5 shadow-xl border border-neutral-100 rotate-2 z-10">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">WhatsApp • 11h10</p>
        <p className="text-xs font-extrabold mt-1">Commande Bâti-Plus</p>
        <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
          • 18x Poulet Yassa
          <br />• 9x Thiéboudienne
          <br />• 4x Salade composée
        </p>
        <p className="mt-2 text-[10px] font-bold text-white bg-emerald-600 rounded-lg py-1 text-center">✓ Confirmé à 11:14</p>
      </div>
    </div>
  );
}

function ApercuEspaceRh() {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200 shadow-xl shadow-neutral-200/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-orange-600 text-white text-[10px] font-black flex items-center justify-center">CP</span>
        <span className="text-xs font-extrabold">
          Espace RH — <span className="text-orange-600">Bâti-Plus</span>
        </span>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["42", "commandes"],
            ["8", "en attente"],
            ["2", "restaurants"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-neutral-50 py-2">
              <div className="text-lg font-black">{v}</div>
              <div className="text-[10px] text-neutral-500">{l}</div>
            </div>
          ))}
        </div>
        {[
          { resto: "Chez Fatou", plats: "18 Yassa • 9 Thiéb", etat: "Confirmé 11:14", ok: true },
          { resto: "Le Teranga", plats: "11 Mafé • 4 Salade", etat: "En attente", ok: false },
        ].map((r) => (
          <div key={r.resto} className="p-3 rounded-2xl border border-neutral-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{r.resto}</p>
              <p className="text-[11px] text-neutral-500">{r.plats}</p>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                r.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {r.etat}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-[11px] text-neutral-500 pt-1">
          <FileSpreadsheet className="w-4 h-4" /> Facture et export paie prêts en fin de mois
        </div>
      </div>
    </div>
  );
}

function ApercuEspaceRestaurant() {
  return (
    <div className="bg-white text-neutral-900 rounded-3xl shadow-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-orange-600 text-white text-[10px] font-black flex items-center justify-center">CP</span>
        <span className="text-xs font-extrabold">
          Espace restaurant — <span className="text-orange-600">Chez Fatou</span>
        </span>
      </div>
      <div className="px-5 pt-3 flex gap-3 text-[11px] font-bold text-neutral-400 border-b border-neutral-100">
        <span className="pb-2">Commandes</span>
        <span className="pb-2 text-orange-600 border-b-2 border-orange-600">Menus semaine</span>
        <span className="pb-2">Cartes</span>
      </div>
      <div className="p-5 grid grid-cols-2 gap-3">
        {[
          { jour: "Lundi", plats: ["Poulet Yassa", "Thiéboudienne"] },
          { jour: "Mardi", plats: ["Mafé bœuf", "Salade composée"] },
          { jour: "Mercredi", plats: ["Soupou Kandia"] },
          { jour: "Jeudi", plats: ["Thiébou Yapp", "Poulet Yassa"] },
        ].map((j) => (
          <div key={j.jour} className="rounded-2xl border border-neutral-200 p-3 space-y-1.5">
            <p className="text-xs font-extrabold">{j.jour}</p>
            {j.plats.map((p) => (
              <p key={p} className="text-[11px] bg-neutral-50 rounded-lg px-2 py-1 font-semibold">
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 text-[11px] text-emerald-700 font-semibold flex items-center gap-1.5">
        <Check className="w-3.5 h-3.5" /> Visible tout de suite chez Bâti-Plus et Thiès Logistique
      </div>
    </div>
  );
}
