"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  CopyPlus,
  History,
  KeyRound,
  LogOut,
  PartyPopper,
  RefreshCw,
  Send,
  Settings,
  Utensils,
  Wallet,
} from "lucide-react";
import { cn, formatFCFA } from "@/lib/utils";
import { formatJourCourt } from "@/lib/dates";
import { formatHeure, totalRepas } from "@/lib/recap";
import type { RecapLigne } from "@/types/database";
import { ConfirmButton } from "./confirm-button";
import { CarteRestaurant } from "./carte-restaurant";
import {
  changerCodeRestoAction,
  copierCarteAction,
  modifierProfilRestoAction,
  type PlatCarte,
  type PlatMenuResto,
} from "./actions";
import { logoutRestoAction } from "./login/actions";
import { MenusSemaineResto } from "./menus-semaine-resto";

export interface EntrepriseResto {
  restaurantId: string;
  companyNom: string;
  heureOuverture: string;
  heureLimite: string;
  heureLivraison: string | null;
  aujourdhui: {
    recap: RecapLigne[];
    isCloture: boolean;
    confirmeAt: string | null;
    confirmeParRh: boolean;
  };
  carte: PlatCarte[];
  /** Jours de service de l'entreprise (1 = lundi … 7 = dimanche) */
  joursTravail: number[];
  aujourdhuiModifiable: boolean;
  /** Plats de ce restaurant dans les menus de la semaine affichée */
  menusSemaine: PlatMenuResto[];
  historique: Array<{ date: string; totalRepas: number; montant: number; confirme: boolean }>;
}

interface CompteResto {
  id: string;
  nom: string;
  telephone_whatsapp: string;
  ville: string | null;
  code_partenaire: string;
}

interface EspaceRestaurantClientProps {
  compte: CompteResto;
  entreprises: EntrepriseResto[];
  mois: string;
  semaineLundi: string;
  /** Onglet à rouvrir après un changement de semaine (?onglet=menus) */
  ongletInitial?: string;
  todayDate: string;
  bienvenue: boolean;
}

type Onglet = "jour" | "menus" | "carte" | "entreprises" | "historique" | "parametres";
const ONGLETS_VALIDES: Onglet[] = ["jour", "menus", "carte", "entreprises", "historique", "parametres"];

const REFRESH_INTERVAL_MS = 20_000;

const bloc = "bg-white rounded-3xl p-5 border border-neutral-200 shadow-sm";
const champ =
  "w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500";

function decalerMois(mois: string, n: number): string {
  const [a, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function libelleMois(mois: string): string {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${mois}-15T12:00:00Z`)
  );
}

/** Message d'invitation : lien d'inscription (l'entreprise est reliée automatiquement) + code partenaire */
function messageInvitation(compte: CompteResto, origine: string): string {
  return (
    `Bonjour, commandez vos repas d'entreprise chez ${compte.nom} avec Cantine Pro.\n` +
    `• Pas encore inscrit : ${origine}/inscription?partenaire=${compte.code_partenaire} (essai gratuit 14 jours, nous serons ajoutés automatiquement)\n` +
    `• Déjà client : saisissez notre code partenaire ${compte.code_partenaire} dans Espace RH > Restaurants.`
  );
}

export function EspaceRestaurantClient({
  compte,
  entreprises,
  mois,
  semaineLundi,
  ongletInitial,
  todayDate,
  bienvenue,
}: EspaceRestaurantClientProps) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<Onglet>(
    entreprises.length === 0
      ? "entreprises"
      : ONGLETS_VALIDES.includes(ongletInitial as Onglet)
        ? (ongletInitial as Onglet)
        : "jour"
  );
  const [origine, setOrigine] = useState("");
  useEffect(() => setOrigine(window.location.origin), []);

  const repasDuJour = entreprises.reduce((acc, e) => acc + totalRepas(e.aujourdhui.recap), 0);
  const aConfirmer = entreprises.filter((e) => e.aujourdhui.isCloture && !e.aujourdhui.confirmeAt).length;
  const enCours = entreprises.filter((e) => !e.aujourdhui.isCloture).length;
  const montantMois = entreprises.reduce(
    (acc, e) => acc + e.historique.filter((h) => h.confirme).reduce((s, h) => s + h.montant, 0),
    0
  );

  // Sur téléphone, l'onglet actif doit rester visible dans la barre défilante (ex. « Entreprises » à l'ouverture)
  useEffect(() => {
    document
      .querySelector<HTMLElement>('nav [aria-current="page"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [onglet]);

  // Commandes en direct : actualisation tant qu'une entreprise n'a pas clôturé ou reste à confirmer
  useEffect(() => {
    if (onglet !== "jour" || (enCours === 0 && aConfirmer === 0)) return;
    const id = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [onglet, enCours, aConfirmer, router]);

  const onglets: Array<{ id: Onglet; label: string; icone: typeof Clock; compteur?: number }> = [
    { id: "jour", label: "Commandes du jour", icone: Clock, compteur: repasDuJour },
    { id: "menus", label: "Menus semaine", icone: CalendarDays },
    { id: "carte", label: "Mes cartes", icone: Utensils },
    { id: "entreprises", label: "Entreprises", icone: Building2, compteur: entreprises.length },
    { id: "historique", label: "Historique & Factures", icone: History },
    { id: "parametres", label: "Paramètres", icone: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      {/* EN-TÊTE ESPACE RESTAURANT (même structure que l'Espace RH) */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="pt-4 pb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 shrink-0 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-600/30">
                  CP
                </span>
                <h1 className="text-lg sm:text-xl font-extrabold text-neutral-900 truncate">
                  Espace restaurant — <span className="text-orange-600">{compte.nom}</span>
                </h1>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {entreprises.length} entreprise{entreprises.length > 1 ? "s" : ""} cliente
                {entreprises.length > 1 ? "s" : ""} • Code partenaire{" "}
                <button
                  type="button"
                  onClick={() => setOnglet("entreprises")}
                  className="font-mono font-bold text-orange-600 hover:underline"
                >
                  {compte.code_partenaire}
                </button>
              </p>
            </div>
            <form action={logoutRestoAction} className="shrink-0">
              <button
                type="submit"
                className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </form>
          </div>

          <nav className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {onglets.map((o) => {
              const Icone = o.icone;
              const actif = onglet === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={(e) => {
                    setOnglet(o.id);
                    e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
                  }}
                  aria-current={actif ? "page" : undefined}
                  className={cn(
                    "shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 border-b-2 text-sm font-bold transition flex items-center gap-1.5",
                    actif
                      ? "border-orange-600 text-orange-600"
                      : "border-transparent text-neutral-500 hover:text-neutral-900 hover:border-neutral-300"
                  )}
                >
                  <Icone className="w-4 h-4" />
                  {o.label}
                  {o.compteur !== undefined && (
                    <span
                      className={cn(
                        "text-[11px] px-1.5 py-0.5 rounded-full",
                        actif ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-500"
                      )}
                    >
                      {o.compteur}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {bienvenue && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <PartyPopper className="w-4 h-4" />
              Bienvenue sur Cantine Pro ! Votre espace restaurant est prêt (gratuit).
            </p>
            <p>
              Identifiant de connexion : <strong>{compte.telephone_whatsapp}</strong>. Pour démarrer, invitez vos
              entreprises clientes depuis l&apos;onglet « Entreprises » avec votre code{" "}
              <strong className="font-mono">{compte.code_partenaire}</strong>, puis remplissez leur carte.
            </p>
          </div>
        )}

        {onglet === "jour" && (
          <>
            {/* Indicateurs du jour */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Indicateur icone={ClipboardList} libelle="Repas aujourd'hui" valeur={String(repasDuJour)} />
              <Indicateur icone={Building2} libelle="Entreprises clientes" valeur={String(entreprises.length)} />
              <Indicateur
                icone={CheckCircle2}
                libelle="À confirmer"
                valeur={String(aConfirmer)}
                alerte={aConfirmer > 0}
              />
              <Indicateur icone={Wallet} libelle={`Confirmé en ${libelleMois(todayDate.slice(0, 7))}`} valeur={formatFCFA(montantMois)} />
            </div>

            {entreprises.length === 0 ? (
              <AucuneEntreprise onInviter={() => setOnglet("entreprises")} />
            ) : (
              <>
                <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="capitalize">{formatJourCourt(todayDate)}</span> — les quantités sont provisoires
                  jusqu&apos;à la clôture de chaque entreprise, actualisation toutes les 20 secondes.
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {entreprises.map((e) => (
                    <CommandeEntreprise key={e.restaurantId} entreprise={e} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {onglet === "menus" &&
          (entreprises.length === 0 ? (
            <AucuneEntreprise onInviter={() => setOnglet("entreprises")} />
          ) : (
            <MenusSemaineResto
              entreprises={entreprises}
              semaineLundi={semaineLundi}
              todayDate={todayDate}
              onAllerALaCarte={() => setOnglet("carte")}
            />
          ))}

        {onglet === "carte" &&
          (entreprises.length === 0 ? (
            <AucuneEntreprise onInviter={() => setOnglet("entreprises")} />
          ) : (
            <OngletCartes entreprises={entreprises} />
          ))}

        {onglet === "entreprises" && <OngletEntreprises compte={compte} entreprises={entreprises} origine={origine} />}

        {onglet === "historique" &&
          (entreprises.length === 0 ? (
            <AucuneEntreprise onInviter={() => setOnglet("entreprises")} />
          ) : (
            <OngletHistorique entreprises={entreprises} mois={mois} todayDate={todayDate} />
          ))}

        {onglet === "parametres" && <OngletParametres compte={compte} />}
      </main>
    </div>
  );
}

function Indicateur({
  icone: Icone,
  libelle,
  valeur,
  alerte = false,
}: {
  icone: typeof Clock;
  libelle: string;
  valeur: string;
  alerte?: boolean;
}) {
  return (
    <div className={cn(bloc, "p-4", alerte && "border-amber-300 bg-amber-50")}>
      <div className="flex items-center gap-2 text-[11px] font-bold text-neutral-500">
        <Icone className={cn("w-4 h-4", alerte ? "text-amber-600" : "text-orange-500")} />
        <span className="truncate">{libelle}</span>
      </div>
      <div className={cn("mt-1 text-2xl font-black", alerte ? "text-amber-700" : "text-neutral-900")}>{valeur}</div>
    </div>
  );
}

function AucuneEntreprise({ onInviter }: { onInviter: () => void }) {
  return (
    <div className={cn(bloc, "p-8 text-center space-y-3")}>
      <Building2 className="w-8 h-8 text-neutral-300 mx-auto" />
      <p className="text-sm font-extrabold text-neutral-900">Aucune entreprise reliée pour le moment</p>
      <p className="text-xs text-neutral-500 max-w-md mx-auto">
        Invitez vos entreprises clientes : dès que leur RH saisit votre code partenaire, leurs commandes arrivent ici.
      </p>
      <button
        type="button"
        onClick={onInviter}
        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition"
      >
        Inviter une entreprise
      </button>
    </div>
  );
}

function CommandeEntreprise({ entreprise: e }: { entreprise: EntrepriseResto }) {
  const total = totalRepas(e.aujourdhui.recap);
  const montant = e.aujourdhui.recap.reduce((acc, l) => acc + l.quantite * l.prix_unitaire, 0);
  const statut = e.aujourdhui.confirmeAt
    ? { texte: "Confirmée", classe: "bg-emerald-100 text-emerald-700" }
    : e.aujourdhui.isCloture
      ? { texte: "À confirmer", classe: "bg-amber-100 text-amber-800" }
      : { texte: `Commandes jusqu'à ${formatHeure(e.heureLimite)}`, classe: "bg-neutral-100 text-neutral-600" };

  return (
    <div className={cn(bloc, "space-y-4", e.aujourdhui.isCloture && !e.aujourdhui.confirmeAt && "border-amber-300")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="truncate">{e.companyNom}</span>
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">Livraison à {formatHeure(e.heureLivraison)}</p>
        </div>
        <span className={cn("shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full", statut.classe)}>{statut.texte}</span>
      </div>

      {e.aujourdhui.recap.length === 0 ? (
        <p className="text-xs text-neutral-400 text-center py-3">Aucun repas commandé pour le moment.</p>
      ) : (
        <div className="divide-y divide-neutral-100 border border-neutral-100 rounded-2xl">
          {e.aujourdhui.recap.map((l) => (
            <div key={l.plat_titre} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-xs font-semibold text-neutral-800">{l.plat_titre}</span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-[11px] text-neutral-400">{formatFCFA(l.prix_unitaire)}</span>
                <span className="text-sm font-black text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-lg">{l.quantite}x</span>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2.5 bg-neutral-50 rounded-b-2xl text-xs font-bold">
            <span>
              Total {total} repas{e.aujourdhui.isCloture ? "" : " (provisoire)"}
            </span>
            <span className="text-neutral-900">{formatFCFA(montant)}</span>
          </div>
        </div>
      )}

      <ConfirmButton
        clair
        cible={{ restaurantId: e.restaurantId }}
        heureLimite={e.heureLimite}
        totalRepas={total}
        confirmeAt={e.aujourdhui.confirmeAt}
        confirmeParRh={e.aujourdhui.confirmeParRh}
        isCloture={e.aujourdhui.isCloture}
      />
    </div>
  );
}

function OngletCartes({ entreprises }: { entreprises: EntrepriseResto[] }) {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState(entreprises[0].restaurantId);
  const [source, setSource] = useState("");
  const [info, setInfo] = useState<{ ok: boolean; texte: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const entreprise = entreprises.find((e) => e.restaurantId === restaurantId) || entreprises[0];
  const autres = entreprises.filter((e) => e.restaurantId !== entreprise.restaurantId && e.carte.length > 0);

  const copier = () => {
    if (!source) return;
    startTransition(async () => {
      const res = await copierCarteAction(source, entreprise.restaurantId);
      setInfo({ ok: res.success, texte: res.message || (res.success ? "Carte copiée." : "Erreur.") });
      if (res.success) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {entreprises.map((e) => (
            <button
              key={e.restaurantId}
              type="button"
              onClick={() => {
                setRestaurantId(e.restaurantId);
                setInfo(null);
                setSource("");
              }}
              className={cn(
                "shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5",
                e.restaurantId === entreprise.restaurantId
                  ? "bg-orange-600 border-orange-600 text-white"
                  : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              {e.companyNom}
              <span className="opacity-70">({e.carte.length})</span>
            </button>
          ))}
        </div>

        {autres.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="text-xs px-3 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Copier la carte de…</option>
              {autres.map((e) => (
                <option key={e.restaurantId} value={e.restaurantId}>
                  {e.companyNom} ({e.carte.length} plats)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!source || isPending}
              onClick={copier}
              className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <CopyPlus className="w-4 h-4" />
              Copier
            </button>
          </div>
        )}
      </div>

      {info && (
        <div
          className={cn(
            "p-3 rounded-2xl text-xs border",
            info.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
          )}
        >
          {info.texte}
        </div>
      )}

      <CarteRestaurant
        key={entreprise.restaurantId}
        clair
        cible={{ restaurantId: entreprise.restaurantId }}
        companyNom={entreprise.companyNom}
        initialPlats={entreprise.carte}
      />
    </div>
  );
}

function OngletEntreprises({
  compte,
  entreprises,
  origine,
}: {
  compte: CompteResto;
  entreprises: EntrepriseResto[];
  origine: string;
}) {
  const [copie, setCopie] = useState<string | null>(null);
  const message = messageInvitation(compte, origine);

  const copier = (valeur: string, cle: string) => {
    navigator.clipboard.writeText(valeur);
    setCopie(cle);
    setTimeout(() => setCopie(null), 2500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className={cn(bloc, "p-6 lg:col-span-1 space-y-4 h-fit")}>
        <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
          <Send className="w-4 h-4 text-orange-500" />
          Inviter une entreprise
        </h2>
        <p className="text-xs text-neutral-500">
          Donnez votre code partenaire au RH : il le saisit dans « Espace RH &gt; Restaurants ». Une entreprise pas
          encore inscrite peut aussi s&apos;inscrire par votre lien : vous serez ajouté automatiquement.
        </p>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-center font-mono text-xl font-black tracking-widest text-orange-600 bg-orange-50 rounded-2xl py-2.5 border border-orange-200">
            {compte.code_partenaire}
          </span>
          <button
            type="button"
            onClick={() => copier(compte.code_partenaire, "code")}
            title="Copier le code"
            className="p-3 rounded-2xl bg-neutral-100 hover:bg-neutral-200 transition"
          >
            {copie === "code" ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
        >
          <Send className="w-4 h-4" />
          Envoyer l&apos;invitation sur WhatsApp
        </a>
        <button
          type="button"
          onClick={() => copier(message, "message")}
          className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
        >
          {copie === "message" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          {copie === "message" ? "Copié !" : "Copier le message"}
        </button>
      </div>

      <div className="lg:col-span-2 space-y-3">
        {entreprises.length === 0 ? (
          <div className={cn(bloc, "text-center text-xs text-neutral-500")}>
            Aucune entreprise reliée : envoyez votre invitation pour démarrer.
          </div>
        ) : (
          entreprises.map((e) => {
            const confirmes = e.historique.filter((h) => h.confirme);
            return (
              <div key={e.restaurantId} className={cn(bloc, "flex flex-col sm:flex-row sm:items-center justify-between gap-3")}>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-orange-500 shrink-0" />
                    <span className="truncate">{e.companyNom}</span>
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Commandes {e.heureOuverture.slice(0, 5)} – {e.heureLimite.slice(0, 5)} • Livraison{" "}
                    {formatHeure(e.heureLivraison)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-50">
                    <div className="text-sm font-black text-neutral-900">{e.carte.filter((p) => p.is_active).length}</div>
                    <div className="text-[10px] text-neutral-500">plats</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-50">
                    <div className="text-sm font-black text-neutral-900">{confirmes.reduce((s, h) => s + h.totalRepas, 0)}</div>
                    <div className="text-[10px] text-neutral-500">repas / mois</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-neutral-50">
                    <div className="text-sm font-black text-orange-600">
                      {formatFCFA(confirmes.reduce((s, h) => s + h.montant, 0))}
                    </div>
                    <div className="text-[10px] text-neutral-500">ce mois</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <p className="text-[11px] text-neutral-400 px-1">
          L&apos;heure de livraison est fixée par chaque entreprise dans son Espace RH.
        </p>
      </div>
    </div>
  );
}

function OngletHistorique({
  entreprises,
  mois,
  todayDate,
}: {
  entreprises: EntrepriseResto[];
  mois: string;
  todayDate: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filtre, setFiltre] = useState<string>("toutes");
  const changerMois = (n: number) =>
    startTransition(() => router.replace(`/resto?mois=${decalerMois(mois, n)}`, { scroll: false }));

  // Seuls les repas confirmés (par le restaurant ou par le RH au téléphone) sont facturables
  const totaux = entreprises.map((e) => {
    const confirmes = e.historique.filter((h) => h.confirme);
    return {
      e,
      repas: confirmes.reduce((acc, h) => acc + h.totalRepas, 0),
      montant: confirmes.reduce((acc, h) => acc + h.montant, 0),
      nonConfirmes: e.historique.filter((h) => !h.confirme && h.totalRepas > 0).length,
    };
  });
  const lignes = entreprises
    .filter((e) => filtre === "toutes" || e.restaurantId === filtre)
    .flatMap((e) => e.historique.map((h) => ({ ...h, entreprise: e.companyNom, cle: `${e.restaurantId}-${h.date}` })))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const montantTotal = totaux.reduce((acc, t) => acc + t.montant, 0);
  const repasTotal = totaux.reduce((acc, t) => acc + t.repas, 0);
  const joursNonConfirmes = totaux.reduce((acc, t) => acc + t.nonConfirmes, 0);

  return (
    <div className={cn("space-y-6", isPending && "opacity-60")}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => changerMois(-1)}
          className="p-2 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-100 transition"
          title="Mois précédent"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-extrabold text-neutral-900 capitalize flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-orange-500" />
          {libelleMois(mois)}
        </h2>
        <button
          type="button"
          onClick={() => changerMois(1)}
          disabled={mois >= todayDate.slice(0, 7)}
          className="p-2 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-100 transition disabled:opacity-30"
          title="Mois suivant"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Indicateur icone={ClipboardList} libelle="Repas confirmés" valeur={String(repasTotal)} />
        <Indicateur icone={Wallet} libelle="À facturer" valeur={formatFCFA(montantTotal)} />
        <Indicateur icone={CheckCircle2} libelle="Jours non confirmés" valeur={String(joursNonConfirmes)} alerte={joursNonConfirmes > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Montants par entreprise : base de la facture de chaque client */}
        <div className={cn(bloc, "p-6 lg:col-span-1 space-y-3 h-fit")}>
          <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-orange-500" />
            Par entreprise
          </h3>
          {totaux.map(({ e, repas, montant, nonConfirmes }) => (
            <div key={e.restaurantId} className="flex items-center justify-between gap-2 py-2 border-b border-neutral-100 last:border-0">
              <div className="min-w-0">
                <div className="text-xs font-bold text-neutral-900 truncate">{e.companyNom}</div>
                <div className="text-[11px] text-neutral-500">
                  {repas} repas
                  {nonConfirmes > 0 && <span className="text-amber-600"> • {nonConfirmes} j. non confirmé(s)</span>}
                </div>
              </div>
              <div className="text-sm font-extrabold text-orange-600 shrink-0">{formatFCFA(montant)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-xs font-extrabold">
            <span>Total</span>
            <span>{formatFCFA(montantTotal)}</span>
          </div>
        </div>

        {/* Détail jour par jour */}
        <div className={cn(bloc, "p-6 lg:col-span-2 space-y-3")}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-500" />
              Détail des livraisons
            </h3>
            {entreprises.length > 1 && (
              <select
                value={filtre}
                onChange={(e) => setFiltre(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="toutes">Toutes les entreprises</option>
                {entreprises.map((e) => (
                  <option key={e.restaurantId} value={e.restaurantId}>
                    {e.companyNom}
                  </option>
                ))}
              </select>
            )}
          </div>
          {lignes.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-6">Aucune commande clôturée ce mois-ci.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] text-neutral-500 border-b border-neutral-100">
                    <th className="py-2 pr-3 font-bold">Jour</th>
                    {entreprises.length > 1 && <th className="py-2 pr-3 font-bold">Entreprise</th>}
                    <th className="py-2 pr-3 font-bold text-right">Repas</th>
                    <th className="py-2 pr-3 font-bold text-right">Montant</th>
                    <th className="py-2 font-bold text-right">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.cle} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2 pr-3 capitalize whitespace-nowrap">{formatJourCourt(l.date)}</td>
                      {entreprises.length > 1 && <td className="py-2 pr-3 truncate max-w-[10rem]">{l.entreprise}</td>}
                      <td className="py-2 pr-3 text-right">{l.totalRepas}</td>
                      <td className={cn("py-2 pr-3 text-right font-bold whitespace-nowrap", !l.confirme && "text-neutral-400 line-through")}>
                        {formatFCFA(l.montant)}
                      </td>
                      <td className="py-2 text-right">
                        {l.confirme ? (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            Confirmé
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                            Non facturable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OngletParametres({ compte }: { compte: CompteResto }) {
  const [nom, setNom] = useState(compte.nom);
  const [telephone, setTelephone] = useState(compte.telephone_whatsapp);
  const [ville, setVille] = useState(compte.ville || "");
  const [ancienCode, setAncienCode] = useState("");
  const [nouveauCode, setNouveauCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const enregistrer = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await modifierProfilRestoAction({ nom, telephone, ville });
      setMessage(res.success ? { ok: true, texte: "Profil enregistré." } : { ok: false, texte: res.message || "Erreur." });
    });
  };

  const changerCode = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await changerCodeRestoAction(ancienCode, nouveauCode);
      if (res.success) {
        setAncienCode("");
        setNouveauCode("");
      }
      setMessage(res.success ? { ok: true, texte: "Code d'accès modifié." } : { ok: false, texte: res.message || "Erreur." });
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {message && (
        <div
          className={cn(
            "p-3 rounded-2xl text-xs border",
            message.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"
          )}
        >
          {message.texte}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <form onSubmit={enregistrer} className={cn(bloc, "p-6 space-y-3")}>
          <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-500" />
            Mon restaurant
          </h2>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Nom</label>
            <input type="text" required value={nom} onChange={(e) => setNom(e.target.value)} className={champ} />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Numéro WhatsApp (identifiant de connexion)</label>
            <input type="tel" required value={telephone} onChange={(e) => setTelephone(e.target.value)} className={champ} />
            <p className="text-[11px] text-neutral-400 mt-1">Il reçoit les récapitulatifs de toutes vos entreprises.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Ville</label>
            <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} className={champ} />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
          >
            Enregistrer
          </button>
        </form>

        <form onSubmit={changerCode} className={cn(bloc, "p-6 space-y-3 h-fit")}>
          <h2 className="text-sm font-extrabold text-neutral-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-orange-500" />
            Code d&apos;accès
          </h2>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Code actuel</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={ancienCode}
              onChange={(e) => setAncienCode(e.target.value)}
              className={champ}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">Nouveau code (8 caractères min.)</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={nouveauCode}
              onChange={(e) => setNouveauCode(e.target.value)}
              className={champ}
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
          >
            Changer le code
          </button>
        </form>
      </div>
    </div>
  );
}
