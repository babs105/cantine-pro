# 🍽️ Cantine Pro — Pilotes Thiès & Dakar

> **Solution ultra-légère de repas d'entreprise en 2 clics pour le Sénégal.**  
> Développé selon le sprint fast-track 10 jours pour les 2 entreprises pilotes en essai gratuit.

---

## 📱 Fonctionnalités Clés

1. **PWA Mobile Employé (`/p/[token]`) :**
   * Accessible sans mot de passe via lien magique sécurisé unique.
   * Moins de 106 Ko de First Load JS pour une fluidité absolue même sur réseau mobile 3G/4G Orange ou Free Sénégal.
   * Choix d'un plat en 1 clic ou options *"Absent(e)"* / *"Ne mange pas"*.
   * Persistance automatique dans le smartphone (`localStorage`).
   * Commandes ouvertes de **08h00 à 11h10** (heures réglables par entreprise), verrouillage automatique.

2. **Espace RH (`/rh`) :**
   * **Suivi Live 11h :** Compteurs temps réel (Total repas, En attente, Absents, Taux de participation).
   * **Clôture après 11h10 :** Totaux exacts par plat, un récapitulatif par restaurant envoyé par le RH.
   * **Récap WhatsApp par restaurant :** message récapitulatif prêt à envoyer en 1 clic à chaque restaurant.
   * **Gestionnaire de Menus :** Ajout de plats avec raccourcis sénégalais (Thiéboudienne, Yassa, Mafé, Soupou Kandia).
   * **Gestion des Collaborateurs :** Import en masse CSV (`Nom, Téléphone`), bouton direct de partage WhatsApp.
   * **Export comptable :** Excel paie, CSV et facture PDF du mois.

3. **Espace restaurant :**
   * **Lien restaurant (`/resto/[token]`)** : écran ultra-épuré pour qu'un restaurant confirme d'un clic la commande reçue d'une entreprise.
   * **Compte restaurant (`/resto`)** : un restaurant s'inscrit sur `/resto/inscription`, se connecte sur `/resto/login`
     (numéro WhatsApp + code) et sert plusieurs entreprises : carte de plats, menus de la semaine, confirmations, facturation.
   * Le RH relie un compte restaurant à son entreprise avec le **code partenaire** que le restaurant lui communique.

---

## 🛠️ Stack Technique

* **Framework :** Next.js 15 (App Router, Server Actions, React 19)
* **Styling :** Tailwind CSS
* **Icônes :** Lucide React
* **Base de données :** Supabase (PostgreSQL + RLS). Pas de Supabase Auth : le serveur signe des JWT courts (ES256)
  dont les claims filtrent chaque table ; ils ne quittent jamais le serveur.
* **Documents :** exceljs (import salariés, export paie), pdf-lib (factures PDF)
* **Déploiement :** Vercel

---

## 🚀 Démarrage Local

```bash
# 1. Cloner ou ouvrir le projet
cd "cantine Pro"

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement (voir « Initialisation Supabase » ci-dessous)
cp .env.local.example .env.local

# 4. Lancer le serveur de développement
npm run dev

# 5. Ouvrir dans le navigateur
# http://localhost:3000
```

---

## 🗄️ Initialisation Supabase

1. Créez un projet sur [Supabase](https://supabase.com).
2. Ouvrez l'éditeur SQL et collez le contenu de [`supabase/schema.sql`](./supabase/schema.sql).
3. Cliquez sur **Run** : le script est idempotent et crée ou met à jour les tables (`companies`, `employes`, `menus_du_jour`,
   `commandes`, `restaurants`, `plats_restaurant`, `comptes_restaurant`, `clotures`, `paiements`), la vue d'agrégation,
   les fonctions d'échange et toutes les politiques RLS. Relancez-le en entier après chaque mise à jour du code.
   Il ne contient **aucune** donnée de démonstration.
4. Générez la clé de signature des JWT et importez-la dans Supabase (**Project Settings > JWT Keys**) :
   `npx supabase gen signing-key --algorithm ES256`.
5. Renseignez `.env.local` (modèle complet et commentaires dans [`.env.local.example`](./.env.local.example)) :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | oui | Connexion à Supabase (la clé anon seule ne lit aucune table) |
| `SUPABASE_JWT_PRIVATE_KEY` | oui | Clé privée ES256 (JWK) qui signe les JWT courts |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | Réservée à `/admin`, au cron, aux inscriptions et au diagnostic |
| `RH_SESSION_SECRET` | oui | Signature des cookies de session RH et restaurant (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | oui | URL publique utilisée dans les liens envoyés |
| `SUPERADMIN_CODE` | pour `/admin` | Code de la console SuperAdmin (12 caractères min.) |
| `CRON_SECRET` | en production | Protège `/api/cron/cloture` |
| `WAVE_NUMERO_PAIEMENT`, `WHATSAPP_*` | non | Paiement Wave affiché, envoi WhatsApp automatique |

En production, `/api/diagnostic` indique pour chaque variable si elle est présente (sans afficher sa valeur).

---

## 🔐 Accès RH & Ouverture d'une Entreprise Pilote

L'Espace RH `/rh` est protégé par un code d'accès par entreprise (cookie signé, 30 jours).
Une entreprise s'inscrit seule sur **`/inscription`** (14 jours d'essai, offre Starter / Pro / Business) et se
connecte ensuite avec son identifiant ou son e-mail. Pour ouvrir une entreprise à la main, dans l'éditeur SQL Supabase :

```sql
-- Le code d'accès RH est stocké à part (table acces_rh, illisible par les rôles applicatifs)
WITH c AS (
    INSERT INTO public.companies (nom, slug, heure_ouverture_vote, heure_limite_vote)
    VALUES ('Nom Entreprise', 'nom-entreprise', '08:00', '11:10')
    RETURNING id
)
INSERT INTO public.acces_rh (company_id, code_hash)
SELECT id, encode(digest('CODE-SECRET-RH', 'sha256'), 'hex') FROM c
RETURNING company_id;
```

Le RH se connecte sur `/rh/login` avec le slug + le code, puis ajoute ses restaurants partenaires
dans l'onglet **Restaurants** (nom, WhatsApp, heure de livraison). Chaque restaurant a son propre lien
de confirmation `/resto/<token>`.

## ⏰ Principe de fonctionnement (mode manuel du pilote)

Pour le pilote, **rien n'est envoyé automatiquement** : le RH déclenche chaque envoi depuis l'Espace RH.

1. **Le matin** — le RH publie le menu du jour (chaque plat est rattaché au restaurant qui le prépare),
   puis clique sur **« Envoyer sur WhatsApp »** (Suivi Live, étape 1) : le message avec le menu, le lien
   du portail et l'heure limite est prêt à poster dans le groupe WhatsApp des salariés.
2. **De 08h00 à 11h10** — les salariés commandent sur la PWA. À 11h10 la commande se bloque toute seule.
3. **Après 11h10** — le RH clique sur **« Clôturer la journée »** : un récapitulatif est figé par restaurant.
   Il envoie ensuite chaque récap avec **« Envoyer le récap »** sur la carte du restaurant (WhatsApp) ;
   l'heure d'envoi est notée.
4. **Confirmation** — chaque restaurant confirme d'un clic sur son lien `/resto/<token>` ; à 11h30, le
   l'Espace RH signale les restaurants qui ont reçu leur récap sans le confirmer.

> Envoi automatique (plus tard) : la route `/api/cron/cloture` clôture et envoie les récaps via
> l'API WhatsApp Cloud ou un webhook. Pour l'activer, ajoutez dans `vercel.json`
> `"crons": [{ "path": "/api/cron/cloture", "schedule": "10 11 * * 1-5" }]` (ou appelez-la depuis
> QStash / cron-job.org avec `Authorization: Bearer CRON_SECRET`).


## 📋 Fonctions V2 Pilote

* **Import Excel (.xlsx) ou CSV** : colonnes `Nom`, `Prénom`, `Téléphone`, `Service` (détection automatique des en-têtes, doublons ignorés, numéros à 9 chiffres complétés en +221).
* **Menus de la semaine** (lundi → vendredi) avec **« Dupliquer la semaine précédente »**.
* **Modification manuelle par le RH** d'une commande (y compris après 11h10 et après la clôture) tant que le restaurant concerné n'a pas confirmé. Si le récap avait déjà été envoyé, il est recalculé et repasse « à renvoyer ». Une fois le restaurant confirmé, ses commandes sont verrouillées.
* **Alerte 11h30** dans l'Espace RH si le restaurant n'a pas confirmé, avec bouton d'appel.
* **Compte à rebours** sur la PWA employé, verrouillage automatique à l'heure limite, heure d'enregistrement du choix.
* **Export Excel paie** (`/rh/export?mois=AAAA-MM&format=xlsx`) : onglets *Paie par service*, *Récap services*, *Facture restaurants*, *Détail jour par jour*.

* **Onglet Paramètres** : heures d'ouverture et de fin des commandes, **jours de travail** (lundi → dimanche, par défaut lundi → vendredi : la grille des menus, la duplication de semaine et les commandes des salariés les suivent), coordonnées, changement du code RH, état de l'abonnement.
* **Onglet Historique & Factures** : historique jour par jour (détail par collaborateur), **facture PDF du mois** (`/rh/facture?mois=AAAA-MM` : synthèse, une facture par restaurant avec zone signature et cachet, ventilation par service), exports Excel et CSV.
* **Onglet Statistiques (DG / DAF)** : dépense du mois, évolution sur 6 mois, coût moyen, plats les plus commandés, taux de participation par service.
* **PWA installable** : bannière « Ajouter à l'écran d'accueil » (bouton sur Android, mode d'emploi sur iPhone) ; l'icône rouvre directement la page du salarié. **Hors-ligne** : un choix fait sans réseau est gardé dans le téléphone et envoyé au retour de la connexion (refusé par le serveur si l'heure limite est passée entre-temps).

## 💳 Abonnements & Console SuperAdmin

* Offres : **Starter** 49 000 FCFA (≤ 30 salariés), **Pro** 99 000 FCFA (≤ 100), **Business** 199 000 FCFA (≤ 300). La limite de salariés est appliquée à l'ajout, à l'import et à l'auto-inscription.
* Essai de 14 jours à l'inscription. À **J+3** après la fin de l'essai ou de la période payée (ou si le compte est suspendu), la clôture et l'envoi aux restaurants sont bloqués ; le RH voit un bandeau « Régler ».
* Console **`/admin`** (code `SUPERADMIN_CODE`, 12 caractères min.) : liste des entreprises, MRR, encaissé du mois, taux de conversion, changement d'offre et de statut, prolongation d'essai, **enregistrement d'un paiement Wave** (prolonge l'abonnement de N mois).
* `WAVE_NUMERO_PAIEMENT` (optionnel) : numéro Wave affiché aux RH dans l'onglet Paramètres.
* Les entreprises déjà présentes avant la v1.3 restent « actives » sans échéance (pilotes gratuits).

> Après chaque mise à jour du code, relancez `supabase/schema.sql` en entier dans l'éditeur SQL Supabase avant de déployer :
> le code lirait sinon des colonnes qui n'existent pas encore.
