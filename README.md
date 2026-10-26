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
   * Votes ouverts de **08h00 à 11h10**, verrouillage automatique.

2. **Espace RH (`/rh`) :**
   * **Suivi Live 11h :** Compteurs temps réel (Total repas, En attente, Absents, Taux de participation).
   * **Clôture après 11h10 :** Totaux exacts par plat, un récapitulatif par restaurant envoyé par le RH.
   * **Générateur WhatsApp Traiteur :** Message récapitulatif prêt à envoyer en 1 clic à votre traiteur.
   * **Gestionnaire de Menus :** Ajout de plats avec raccourcis sénégalais (Thiéboudienne, Yassa, Mafé, Soupou Kandia).
   * **Gestion des Collaborateurs :** Import en masse CSV (`Nom, Téléphone`), bouton direct de partage WhatsApp.
   * **Export Comptable :** Téléchargement CSV pour la facturation et le suivi de consommation.

3. **Passerelle Traiteur (`/resto/[token]`) :**
   * Écran ultra-épuré pour que chaque restaurant confirme d'un clic la commande reçue à 11h10.

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

L'Espace RH `/rh` est protégé par un code d'accès par entreprise (cookie signé, 30 jours).
Pour ouvrir une entreprise, dans l'éditeur SQL Supabase :

```sql
INSERT INTO public.companies (nom, slug, heure_ouverture_vote, heure_limite_vote, rh_code_hash)
VALUES ('Nom Entreprise', 'nom-entreprise', '08:00', '11:10',
        encode(digest('CODE-SECRET-RH', 'sha256'), 'hex'))
RETURNING id;
```

Le RH se connecte sur `/rh/login` avec le slug + le code, puis ajoute ses restaurants partenaires
dans l'onglet **Restaurants** (nom, WhatsApp, heure de livraison). Chaque restaurant a son propre lien
de confirmation `/resto/<token>`.
Base de démo : slug `pilote-thies`, code `pilote-thies-2026` (à changer avant le go-live).

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

Variables d'environnement : voir [`.env.local.example`](./.env.local.example).

## 📋 Fonctions V2 Pilote

* **Import Excel (.xlsx) ou CSV** : colonnes `Nom`, `Prénom`, `Téléphone`, `Service` (détection automatique des en-têtes, doublons ignorés, numéros à 9 chiffres complétés en +221).
* **Menus de la semaine** (lundi → vendredi) avec **« Dupliquer la semaine précédente »**.
* **Modification manuelle par le RH** d'une commande (y compris après 11h10) tant que la journée n'est pas clôturée : après « Clôturer la journée », les commandes sont verrouillées.
* **Alerte 11h30** dans l'Espace RH si le restaurant n'a pas confirmé, avec bouton d'appel.
* **Compte à rebours** sur la PWA employé, verrouillage automatique à l'heure limite, heure d'enregistrement du choix.
* **Export Excel paie** (`/rh/export?mois=AAAA-MM&format=xlsx`) : onglets *Paie par service*, *Récap services*, *Facture traiteur*, *Détail jour par jour*.

> Après mise à jour, relancez `supabase/schema.sql` (ajoute `employes.service`, `commandes.modifie_par_rh`, la table `restaurants` et l'heure d'ouverture des commandes ; l'ancien traiteur unique devient automatiquement le premier restaurant).
