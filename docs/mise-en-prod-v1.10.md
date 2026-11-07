# Mise en production de la v1.10 (durcissement)

Branche : `feat/v1-10-durcissement`. Build de production vérifiée le 2026-11-07.
PR #16 à #28, tranches T9 à T21.

**Ordre impératif : schéma d'abord, code ensuite.** Le nouveau schéma est compatible avec le code actuel de `main`.
L'inverse ne l'est pas : sans le schéma, les commandes des salariés (T10), les connexions (T13) et les
inscriptions (T16) échouent.

---

## 1. Avant de toucher au schéma (éditeur SQL Supabase)

- [ ] **Sauvegarde** : vérifier qu'une sauvegarde Supabase récente existe (T15 et T19 sont irréversibles).
- [ ] **Trace des colonnes supprimées par T15** :
  ```sql
  SELECT id, nom, traiteur_nom, traiteur_telephone, heure_livraison_souhaitee FROM public.companies;
  SELECT * FROM public.schema_migrations WHERE nom = 'v1.2-traiteur-vers-restaurant';  -- doit renvoyer 1 ligne
  ```
  L'export contient des téléphones : le supprimer une fois la relance vérifiée.
- [ ] **Pré-vérification T19** (doit renvoyer 0 et 0, sinon la relance échoue et tout est annulé) :
  ```sql
  SELECT 'acces_rh', count(*) FROM public.acces_rh
  WHERE code_hash !~ '^[0-9a-fA-F]{64}$' AND code_hash !~ '^\$2[aby]\$'
  UNION ALL
  SELECT 'comptes_restaurant', count(*) FROM public.comptes_restaurant
  WHERE code_hash !~ '^[0-9a-fA-F]{64}$' AND code_hash !~ '^\$2[aby]\$';
  ```
- [ ] **Droits de pgcrypto pour les inscriptions** (deux `true` attendus) :
  ```sql
  SELECT has_function_privilege('service_role', 'extensions.crypt(text,text)', 'EXECUTE'),
         has_function_privilege('service_role', 'extensions.gen_salt(text,integer)', 'EXECUTE');
  ```

## 2. Variables Vercel (production et preview)

- [ ] `DIAGNOSTIC_SECRET` : 16 caractères minimum (T9). Sans lui, `/api/diagnostic` répond 404.
- [ ] `SUPABASE_JWT_PRIVATE_KEY` présente (T13 : sans elle, plus aucune connexion).
- [ ] `CRON_SECRET` présent.

## 3. Relance du schéma

- [ ] Coller `supabase/schema.sql` **de la branche `feat/v1-10-durcissement`** en entier, en une seule exécution.
- [ ] Contrôles après relance :
  ```sql
  SELECT nom FROM public.schema_migrations WHERE nom = 'v1.10-codes-bcrypt';        -- 1 ligne
  SELECT left(code_hash, 4) FROM public.acces_rh LIMIT 3;                           -- « $2a$ »
  SELECT table_name, privilege_type FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
    AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');                      -- 0 ligne
  ```
- [ ] La production actuelle (`main`) marche toujours : connexion RH, une commande salarié.

## 4. Tests sur une preview Vercel de la branche

Avec des comptes de test, pas les données des clients.

**Connexions (T13, T19)**
- [ ] RH (slug et e-mail), restaurant et SuperAdmin : bon code accepté, mauvais code refusé.
- [ ] Une session ouverte avant la relance reste valide.
- [ ] 5 mauvais codes depuis une IP : message de blocage ; le bon code passe depuis une autre IP (réseau mobile).
- [ ] Changement de code RH et restaurant, puis reconnexion avec le nouveau code.

**Commande salarié (T10)**
- [ ] Commander, changer d'avis, passer absent, puis « ne mange pas ».
- [ ] Avant l'ouverture, après l'heure limite, jour non travaillé : message clair.
- [ ] Plat retiré ou restaurant désactivé : refus. Commande saisie par le RH : refus, l'ancien choix reste affiché.
- [ ] Hors ligne : couper le réseau, choisir, rétablir, le choix part.

**Page salarié et restaurant (T14)**
- [ ] `/p/[token]`, `/resto/[token]`, `/resto` : nom de l'entreprise, heures et jours corrects.
- [ ] Restaurant : modifier le menu avant l'heure limite, refus après ; copier la semaine précédente.

**Clôture et facturation (T11)**
- [ ] Journée non confirmée : le RH modifie une commande du jour.
- [ ] Après confirmation : modification de la clôture, d'une commande et du prix d'un plat refusée (« journée confirmée »).
- [ ] La rupture de stock reste possible après confirmation.
- [ ] Facture PDF et export paie d'un mois confirmé identiques avant et après.

**Espace RH (T17, T18)**
- [ ] Ajouter un salarié, un plat, un restaurant ; modifier une commande ; supprimer un plat.
- [ ] Import d'un fichier .pdf : « Format non supporté ». Export paie CSV et facture PDF.
- [ ] Onglet Rapports et historique de la page salarié.

**Inscriptions (T16, T19, T20)**
- [ ] Une inscription entreprise et une restaurant aboutissent ; le code est stocké en `$2a$...`.
- [ ] Restaurant : un code de 7 caractères est refusé à l'inscription et au changement de code (T21).
- [ ] La 6e tentative en 15 min depuis la même connexion est refusée avec un message clair.
- [ ] Nouveau salarié : lien de 32 caractères qui ouvre la page de commande ; un ancien lien marche toujours.

**Diagnostic (T9)**
- [ ] Preview sans en-tête : 404. Avec `x-diagnostic-secret` : JSON sans message brut, contrôles « ok ».

## 5. Passage sur `main` (déploiement en production)

- [ ] Prévenir les RH et les restaurants (fenêtre courte, hors heures de commande).
- [ ] Fusionner `feat/v1-10-durcissement` dans `main`.
- [ ] Vérifier en production : `/api/diagnostic` avec le secret, une connexion RH, une commande, une page restaurant.
- [ ] Ne plus revenir à un build antérieur à la v1.10 après l'étape B.

## 6. Étape B (après vérification de la production)

Un bloc final à ajouter à `supabase/schema.sql`, puis une relance :
- [ ] **T10 B** : supprimer les politiques `salarie_passe_sa_commande` et `salarie_modifie_sa_commande`.
- [ ] **T13 B / T19 B** : `echanger_acces_rh` et `echanger_acces_compte_restaurant` en `GRANT ... TO authenticated, service_role`
  (retrait d'`anon`, garder `authenticated`). Laisser `session_rh_valide` et `session_compte_valide` en anon.
- [ ] **T14 B** : redéfinir `rh_lit_son_entreprise` pour le seul rôle `rh`.

## Décisions prises (2026-11-07)

- **Rotation des codes après T19 : non forcée.** Les sauvegardes antérieures à T19 contiennent les sha256 non salés.
  Noter ici la date d'expiration de la dernière d'entre elles : ______. En cas d'accès suspect connu, forcer le
  changement des codes RH et restaurant (SuperAdmin).
- **Codes restaurant : 8 caractères minimum** (T21), comme le RH. Concerne les nouvelles inscriptions et les
  changements de code ; les codes existants restent valides.
- **Plafond global par IP de T19 : 50 échecs / 15 min** pendant le pilote, à réévaluer d'après
  `tentatives_connexion` (clés `rhipglob:` et `restoipglob:`).
