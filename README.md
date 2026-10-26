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
   * Verrouillage automatique dès **11h00 précises**.

2. **Cockpit RH Express (`/rh`) :**
   * **Suivi Live 11h :** Compteurs temps réel (Total repas, En attente, Absents, Taux de participation).
   * **Agrégation automatique 11h05 :** Totaux exacts par plat préparé pour le traiteur.
   * **Générateur WhatsApp Traiteur :** Message récapitulatif prêt à envoyer en 1 clic à votre traiteur.
   * **Gestionnaire de Menus :** Ajout de plats avec raccourcis sénégalais (Thiéboudienne, Yassa, Mafé, Soupou Kandia).
   * **Gestion des Collaborateurs :** Import en masse CSV (`Nom, Téléphone`), bouton direct de partage WhatsApp.
   * **Export Comptable :** Téléchargement CSV pour la facturation et le suivi de consommation.

3. **Passerelle Traiteur (`/resto/[token]`) :**
   * Écran ultra-épuré pour que le traiteur confirme d'un clic la commande reçue à 11h05.

---

## 🛠️ Stack Technique

* **Framework :** Next.js 15 (App Router, Server Actions, React 19)
* **Styling :** Tailwind CSS
* **Icônes :** Lucide React
* **Base de données & Auth :** Supabase (PostgreSQL + RLS + Vues en temps réel)
* **Déploiement :** Vercel

---

## 🚀 Démarrage Local

```bash
# 1. Cloner ou ouvrir le projet
cd "cantine Pro"

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur de développement
npm run dev

# 4. Ouvrir dans le navigateur
# http://localhost:3000
```

---

## 🗄️ Initialisation Supabase

1. Créez un projet sur [Supabase](https://supabase.com).
2. Ouvrez l'éditeur SQL et collez le contenu de [`supabase/schema.sql`](./supabase/schema.sql).
3. Cliquez sur **Run** pour créer les tables (`companies`, `employes`, `menus_du_jour`, `commandes`) et la vue d'agrégation.
4. Renseignez vos clés dans votre fichier `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-cle-anon
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🔐 Accès RH & Ouverture d'une Entreprise Pilote

Le cockpit `/rh` est protégé par un code d'accès par entreprise (cookie signé, 30 jours).
Pour ouvrir une entreprise, dans l'éditeur SQL Supabase :

```sql
INSERT INTO public.companies (nom, slug, traiteur_nom, traiteur_telephone, rh_code_hash)
VALUES ('Nom Entreprise', 'nom-entreprise', 'Traiteur X', '+221770000000',
        encode(digest('CODE-SECRET-RH', 'sha256'), 'hex'))
RETURNING slug, traiteur_token;
```

Le RH se connecte sur `/rh/login` avec le slug + le code. Le traiteur reçoit le lien `/resto/<traiteur_token>`.
Base de démo : slug `pilote-thies`, code `pilote-thies-2026` (à changer avant le go-live).

## ⏰ Clôture 11h05

Le cron Vercel (`vercel.json`, 11h05 GMT = heure de Dakar, lundi–vendredi) appelle `/api/cron/cloture` :
il fige le récapitulatif du jour dans `clotures`, l'envoie au traiteur (WhatsApp Cloud API, webhook, ou
bouton manuel dans le cockpit) et le traiteur confirme d'un clic sur `/resto/<token>`.
Variables d'environnement : voir [`.env.local.example`](./.env.local.example).

## 📋 Fonctions V2 Pilote

* **Import Excel (.xlsx) ou CSV** : colonnes `Nom`, `Prénom`, `Téléphone`, `Service` (détection automatique des en-têtes, doublons ignorés, numéros à 9 chiffres complétés en +221).
* **Menus de la semaine** (lundi → vendredi) avec **« Dupliquer la semaine précédente »**.
* **Modification manuelle par le RH** d'un vote (y compris après 11h) : si la clôture est déjà faite, le récap traiteur est recalculé et le traiteur doit reconfirmer.
* **Alerte 11h30** sur le cockpit si le traiteur n'a pas confirmé, avec bouton d'appel.
* **Compte à rebours** sur la PWA employé, verrouillage automatique à l'heure limite, heure d'enregistrement du choix.
* **Export Excel paie** (`/rh/export?mois=AAAA-MM&format=xlsx`) : onglets *Paie par service*, *Récap services*, *Facture traiteur*, *Détail jour par jour*.

> Après mise à jour, relancez `supabase/schema.sql` (ajoute `employes.service` et `commandes.modifie_par_rh`).
