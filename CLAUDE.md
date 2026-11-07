# Cantine Pro

Application de commande de repas d'entreprise pour le Sénégal (pilotes Thiès et Dakar).
Les salariés commandent sur leur téléphone via un lien magique, le RH clôture la journée et
envoie un récap WhatsApp à chaque restaurant, le restaurant confirme, seuls les repas confirmés sont facturés.

Répondre et écrire en **français** : messages, commentaires de code, libellés d'interface, commits.

## Stack

- Next.js 15 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 3, lucide-react
- Supabase (PostgreSQL) via le server client de `@supabase/ssr` (`createServerClient`), RLS avec politiques par claims JWT
- exceljs (import salariés, export paie), pdf-lib (factures PDF)
- Hébergé sur Vercel ; push sur `main` = déploiement en production

## Commandes

- `npm run dev` : serveur de dev (ou preview `cantine-pro`, port 3124). Il n'y a plus de mode démo : l'app exige les clés Supabase de `.env.local` et lit la vraie base.
- `npx tsc --noEmit` : vérification des types (~4 s)
- `npm run build` : à lancer avant tout push, c'est ce que Vercel exécute
- Pas de tests automatisés dans le projet.

## Carte du code

- `src/app/<route>/page.tsx` : composant **serveur** qui lit Supabase et passe les données en props
- `src/app/<route>/*-client.tsx` : composant **client** (`"use client"`) avec l'état et les clics
- `src/app/<route>/actions.ts` : Server Actions (`"use server"`) appelées depuis le client
- `src/app/**/route.ts` : téléchargements et API (`/rh/export`, `/rh/facture`, `/api/cron/cloture`, `/api/diagnostic`)
- `src/lib/` : logique partagée (`dates.ts`, `cloture.ts`, `recap.ts`, `whatsapp.ts`, `abonnement.ts`, `rh-session.ts`, ...)
- `src/types/database.ts` : types des tables Supabase
- `supabase/schema.sql` : schéma complet et **idempotent** (relancé en entier dans l'éditeur SQL Supabase)

Espaces : `/rh` (Espace RH, 7 onglets dans `rh-dashboard-client.tsx`), `/p/[token]` (salarié, PWA),
`/resto` (espace restaurant multi-entreprises : `/resto/login`, `/resto/inscription`), `/admin` (SuperAdmin), `/inscription`.

## Règles du code
Le processus de livraison (plan → tranche → dev → reviews → merge) est
documenté dans `.claude/WORKFLOW.md`. Le lire avant de lancer un agent
dev.
### Accès à Supabase : RLS + JWT hybride (`src/lib/supabase/`)
Aucune requête ne passe par la clé service_role, sauf exceptions ci-dessous. Pattern « token URL → JWT court » :
l'identifiant reçu est échangé par une fonction SQL `SECURITY DEFINER` (`echanger_*`), puis le serveur signe un JWT
de 5 min en ES256 (clé privée `SUPABASE_JWT_PRIVATE_KEY`, importée comme clé de signature dans Supabase) dont les claims `role_app` / `company_id` / `employe_id` / `restaurant_id`
filtrent chaque table via les politiques de `supabase/schema.sql` (section 9). Le JWT ne quitte jamais le serveur.

| Qui | Client |
|---|---|
| RH (cookie de session) | `createClientRh(companyId)` après `getRhCompanyId()` |
| Connexion RH | `echangerAccesRh(identifiant, code)` |
| Salarié `/p/[token]` | `echangerJetonSalarie(token)` → `{ supabase, employeId, companyId }` |
| Compte restaurant `/resto` (cookie, plusieurs entreprises) | `createClientCompteSession()` pour la fiche et la liste des partenariats, puis `accesPartenariatCompte(restaurantId)` (JWT `restaurant` limité à une entreprise) |
| SuperAdmin, cron, inscriptions (entreprise et restaurant), diagnostic | `createAdminClient()` (`admin.ts`, service_role, contourne la RLS) |

Ne jamais utiliser `createAdminClient()` ailleurs. Le client navigateur (`client.ts`) ne lit rien : pas de politique pour `anon`.

Il n'y a **pas de `src/middleware.ts`** : chaque page, Server Action et route vérifie elle-même sa session
(`getRhCompanyId()`, `getRestoCompteId()`, `isAdmin()`) ou ré-échange son token. Une nouvelle page privée doit
donc faire ce contrôle en tête de fichier. Pas de Zod non plus : les entrées sont validées à la main (`trim`, longueur, `normaliserTelephone`).

### Server Actions (sécurité)
Toute action RH suit ce modèle, dans cet ordre :
1. `const companyId = await getRhCompanyId(); if (!companyId) return { success: false, message: SESSION_EXPIREE }`
2. `const supabase = createClientRh(companyId);` puis requêtes **filtrées** par `.eq("company_id", companyId)` en plus de la RLS
3. `revalidatePath("/rh")` après une écriture
4. Retour `{ success: boolean; message?: string }`, message en français lisible par un RH

### Base de données
- Nouvelle colonne ou table : ajouter un bloc `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (ou `CREATE TABLE IF NOT EXISTS`) dans `supabase/schema.sql`, après le dernier bloc de migration et avant la section `ENABLE ROW LEVEL SECURITY` ; jamais modifier les blocs existants (skill `/migration-schema`). Puis mettre à jour `src/types/database.ts`.
- Nouvelle table : activer la RLS et écrire ses politiques (section 9 de `schema.sql`), sinon les clients JWT n'y verront rien.
- Nouvel accès d'un rôle (salarié, restaurant) à une table : ajouter la politique correspondante.
- Le schéma est appliqué à la main par l'utilisateur dans Supabase : lui rappeler de le relancer.

### Dates et heures
Fuseau `Africa/Dakar`. Utiliser `todayDakar()`, `nowDakarTime()`, `isApresHeureLimite()` de `src/lib/dates.ts` / `config.ts`, jamais `new Date()` brut pour une date métier.

### Interface
- Mobile d'abord : la page salarié doit rester légère (réseau 3G/4G).
- Couleur de marque orange (`orange-500`, `#f97316`), icônes lucide-react, `cn()` de `lib/utils.ts`.
- Mise à jour optimiste : modifier l'état local puis appeler l'action dans `startTransition`.
- Les envois WhatsApp sont des liens `wa.me` ouverts par le RH (mode manuel du pilote).

### Restaurants multi-entreprises
`comptes_restaurant` = le restaurant (connexion téléphone + code, code partenaire). Chaque ligne de `restaurants`
= un partenariat avec UNE entreprise (heure de livraison, carte `plats_restaurant`, clôtures), reliée via `compte_id`.
Le RH relie un compte avec `rattacher_compte_restaurant` (code partenaire) ; il ne peut pas écrire `compte_id` lui-même (trigger).
Les actions de `src/app/resto/actions.ts` prennent une `CibleRestaurant` : `{ restaurantId }`.
Depuis la v1.14, tout restaurant a un compte : plus de lien `/resto/[token]`, le RH ajoute un restaurant uniquement avec son code partenaire et ne compose plus ses menus (le restaurant les publie).

### Vocabulaire métier
« commande » (pas « vote », même si des noms de colonnes gardent `vote`), « Espace RH » (pas « cockpit »),
« restaurant » (pas « traiteur » dans l'interface), « collaborateur » ou « salarié ».

## Git

- Messages au format `type: description en français` (`feat:`, `fix:`, `refactor:`, `style:`, `docs:`).
- Ne jamais committer `.env.local`, ni `tsconfig.tsbuildinfo`.
- Ne pas pousser sur `main` sans accord explicite : c'est un déploiement en production.
- Ne jamais lire ni afficher le contenu de `.env.local`. Pour vérifier la config en production : `/api/diagnostic` avec l'en-tête `x-diagnostic-secret` (valeur de `DIAGNOSTIC_SECRET`, que l'utilisateur fournit) ; sans lui la route répond 404. En local sans `DIAGNOSTIC_SECRET`, elle reste ouverte.

## Vérifier un changement

1. `npx tsc --noEmit` (un hook le lance automatiquement en fin de tour si des fichiers .ts/.tsx ont changé)
2. Si l'interface change : ouvrir la preview `cantine-pro` et vérifier l'écran concerné, sans créer ni modifier de données réelles sans l'accord de l'utilisateur
3. Avant un push : `NEXT_DIST_DIR=.next-build npm run build` (dossier séparé : ne jamais écrire dans le `.next` du `npm run dev` de l'utilisateur ; la preview utilise `.next-preview`). Vercel, lui, lance `npm run build` normalement

Les skills du projet (`.claude/skills/`) décrivent les tâches courantes : `/migration-schema`, `/verifier`.
Les skills `regles-*` (architect, database-reviewer, security-reviewer, dev-commande-salarie) sont chargés par les agents de `.claude/agents/`.
