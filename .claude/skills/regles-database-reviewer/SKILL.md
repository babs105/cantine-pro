---
name: regles-database-reviewer
description: >
  Règles de revue PostgreSQL et Supabase pour Cantine Pro. Charger ce skill
  dès qu'on audite une policy RLS, une fonction SECURITY DEFINER, une vue,
  une migration de schéma, un trigger, une Server Action qui appelle
  .from() sur companies / employes / restaurants / comptes_restaurant /
  clotures / paiements, ou une fonction d'échange (echanger_*, rattacher_*).
  Contient les checklists C1-C15, H1-H8, M1-M5 avec exemples de code et
  commandes grep prêtes à l'emploi.
---

# Règles de revue database — Cantine Pro

## Contexte de sécurité (à garder en tête à chaque revue)

Cantine Pro utilise un **pattern hybride "token URL → JWT court"** :
- Pas de Supabase Auth. JWT ES256 signé par le serveur Next.js (`jeton.ts`).
- Claims : `role_app` (`rh` | `salarie` | `restaurant` | `portail` |
  `compte_restaurant`), `company_id`, et selon le rôle `employe_id` /
  `restaurant_id` / `compte_id`.
- Helpers SQL : `jwt_role_app()`, `jwt_company_id()`, `jwt_employe_id()`,
  `jwt_restaurant_id()`, `jwt_compte_id()`.
- Les tokens sont échangés contre des IDs via des fonctions
  **SECURITY DEFINER** appelées avec la clé `anon`.
- La clé `service_role` est **réservée** à `src/lib/supabase/admin.ts`
  (`createAdminClient()`). Elle contourne la RLS. Appelants autorisés :
  `/admin`, `/api/cron/cloture`, `/api/diagnostic`, `/inscription` et
  `/resto/inscription`.
- Le JWT ne quitte jamais le serveur : une policy trop large n'est exploitable
  que si le code serveur sélectionne la donnée. Elle reste un finding (défense
  en profondeur), mais pas une fuite directe vers le navigateur.

**Matrice de scopes :**

| rôle_app | company_id | employe_id | restaurant_id | compte_id |
|---|---|---|---|---|
| rh | ✅ | — | — | — |
| salarie | ✅ | ✅ | — | — |
| restaurant | ✅ | — | ✅ | — |
| portail | ✅ | — | — | — |
| compte_restaurant | — | — | — | ✅ |

**Tables sensibles** (contiennent un secret ou une donnée financière) :
`acces_rh` (code_hash du code RH, depuis la v1.10), `companies` (email_contact,
plan, statut_abonnement ; traiteur_token et code_acces supprimés en v1.10 T4), `employes`
(token), `restaurants` (token), `comptes_restaurant` (code_hash,
code_partenaire), `clotures` (recap, total_repas : base de facturation),
`paiements`.

**Cible (plan v1.10, validé)** : aucune colonne sensible ne doit être lisible
par un rôle qui n'en a pas besoin. Deux moyens, selon le secret :
- **Secret que personne ne lit** (hash d'un code) : table à part **sans
  aucune policy**, accès par fonctions `SECURITY DEFINER`. Fait pour le code
  RH : `acces_rh` (v1.10 T1, en production), `changer_code_rh`, `echanger_acces_rh`.
- **Token que le RH doit lire** (`employes.token`, `restaurants.token`, envoyés
  par WhatsApp) : il reste dans sa table ; on retire aux autres rôles leur
  policy SELECT trop large et on la remplace par une fonction `SECURITY DEFINER`
  à colonnes fixes (v1.10 T2 portail : fait, `portail_lister_salaries` et
  `portail_inscrire_salarie` ; T3 salarié : fait, `restaurants_visibles_salarie`). Pas de tables
  `*_secrets` pour ces tokens : décision du plan v1.10.

---

## 🔴 Critiques (C1-C15) — bloquent le merge

### C1 — RLS activée sur toute table `public`

Toute nouvelle table en `public` doit avoir son
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

```bash
# Compter les CREATE TABLE et les ENABLE RLS : les deux compteurs doivent être égaux
grep -c "CREATE TABLE IF NOT EXISTS public\." supabase/schema.sql
grep -c "ENABLE ROW LEVEL SECURITY" supabase/schema.sql
```

### C2 — Aucune policy `USING(true)` sur table sensible

Toute policy `USING (true)` sur une table de la liste sensible est refusée,
sauf justification écrite dans un commentaire SQL ou le commit.

```bash
grep -n "USING (true)\|USING(true)" supabase/schema.sql
```

### C3 — Aucun token/secret dans une table avec policy SELECT

**Postgres RLS ne filtre pas les colonnes.** Une policy `FOR SELECT` expose
toutes les colonnes de la ligne. Tout champ dont le nom matche `token`,
`hash`, `secret`, `code_`, `key` ou `password` doit être dans une table
à part **sans policy SELECT**, ou n'être lisible que par les rôles qui en ont
besoin (voir « Cible » plus haut : `companies.rh_code_hash` est supprimée depuis
la v1.10 T1 ; `employes.token` n'est plus lisible par le portail depuis la v1.10
T2, ni `restaurants.token` par le salarié depuis la v1.10 T3). Toute **nouvelle** colonne secrète ajoutée à une
table qui a une policy SELECT ouverte à un autre rôle est bloquante.

```bash
# Chercher les colonnes sensibles
grep -nE "CREATE TABLE|ADD COLUMN" supabase/schema.sql | \
  grep -iE "(token|hash|secret|code_|password|key)"
```

**Exemple de faille (corrigée en v1.10 T3, à ne pas réintroduire) :**

```sql
-- ❌ Un salarié pouvait lire restaurants.token et usurper le resto
CREATE POLICY salarie_lit_les_restaurants ON public.restaurants FOR SELECT
    USING (public.jwt_role_app() = 'salarie' AND company_id = public.jwt_company_id());

-- ✅ Correction retenue (v1.10 T3) : plus de policy SELECT pour le salarié, fonction à colonnes fixes
-- restaurants_visibles_salarie() RETURNS TABLE (id, nom, is_active), SECURITY DEFINER

-- ✅ Secret que personne ne lit (hash d'un code) : table à part, aucune policy (v1.10 T1)
CREATE TABLE public.acces_rh (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL
);
ALTER TABLE public.acces_rh ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acces_rh FROM PUBLIC, anon, authenticated;
-- Aucune policy : seules les fonctions SECURITY DEFINER (echanger_acces_rh, changer_code_rh) y accèdent.
-- Pas de table *_secrets pour employes.token / restaurants.token : le RH doit les lire (décision v1.10).
```

### C4 — SECURITY DEFINER : `SET search_path = public` obligatoire

Sans ça, un attaquant peut créer une fonction `auth` dans un autre schéma et
détourner l'exécution.

```bash
grep -n "SECURITY DEFINER" supabase/schema.sql
# Chaque occurrence doit être suivie de "SET search_path = public"
```

### C5 — SECURITY DEFINER : `REVOKE EXECUTE FROM PUBLIC` obligatoire

Sans REVOKE, la fonction est exécutable par quiconque détient la clé `anon`
(publique par design).

```bash
grep -n "CREATE OR REPLACE FUNCTION" supabase/schema.sql
# Chaque fonction SECURITY DEFINER doit avoir son REVOKE dans les 20 lignes qui suivent
```

### C6 — SECURITY DEFINER : vérifier `role_app` + `company_id` à l'intérieur

Toute fonction qui **écrit** ou retourne des données tenant-scoped doit
vérifier le scope en début de corps.

```sql
-- ✅ Modèle à suivre (rattacher_compte_restaurant)
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'rh'
       OR public.jwt_company_id() IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    -- ... suite
END;
```

**Exception** : les `echanger_*` (retournent seulement des IDs, n'écrivent
rien) peuvent être ouvertes à `anon`.

### C7 — Vues : `security_invoker = true` obligatoire

Sans ça, la vue contourne la RLS des tables sous-jacentes. **En plus**, la
vue ne doit pas contenir `SELECT *` sur une table sensible : elle doit
lister explicitement les colonnes non sensibles.

```bash
grep -n "CREATE OR REPLACE VIEW\|CREATE VIEW" supabase/schema.sql
# Chaque vue doit être suivie de "ALTER VIEW ... SET (security_invoker = true);"
grep -n "SELECT \*" supabase/schema.sql  # à vérifier sur les vues
```

### C8 — Aucun `service_role` hors de `admin.ts`

```bash
grep -rn "SUPABASE_SERVICE_ROLE_KEY\|service_role" src/
# Résultat autorisé : src/lib/supabase/admin.ts (et le diagnostic, qui affiche seulement
# si la variable est présente). rh-session.ts l'utilise en secours de RH_SESSION_SECRET :
# à signaler (finding connu), pas à bloquer.

grep -rln "createAdminClient" src/
# Résultat autorisé : src/app/admin/*, src/app/api/cron/*, src/app/api/diagnostic/*,
# src/app/inscription/actions.ts, src/app/resto/inscription/actions.ts
# Tout autre match = critique
```

### C9 — Fonctions d'échange : `is_active` vérifié

```sql
-- ❌ Le token d'un resto désactivé fonctionne encore
WHERE r.token = p_token LIMIT 1

-- ✅
WHERE r.token = p_token AND r.is_active LIMIT 1
```

**Depuis v1.9**, les échanges vérifient aussi `companies.is_active` et
`comptes_restaurant.is_active` (LEFT JOIN pour les partenariats legacy sans
compte). Une nouvelle fonction `echanger_*` qui ne vérifie que la ligne
principale est un finding.

```bash
grep -n "echanger_jeton_salarie\|echanger_jeton_restaurant\|echanger_acces_rh\|echanger_acces_compte_restaurant" supabase/schema.sql
# Vérifier que chaque échange joint companies.is_active (et comptes_restaurant.is_active si applicable)
```

### C10 — FK vers `clotures` / `paiements` : pas de `CASCADE`

Les clôtures sont des données de facturation. Une suppression de restaurant
ne doit pas effacer l'historique.

```bash
grep -n "REFERENCES public.restaurants(id) ON DELETE CASCADE" supabase/schema.sql
# Interdit si la FK est sur clotures ou paiements → RESTRICT ou SET NULL
```

**Depuis v1.9**, un bloc `DO $$` convertit les FK existantes en `RESTRICT`.
Toute nouvelle FK depuis `clotures` ou `paiements` doit être créée en
`RESTRICT` directement.

### C11 — Rate limiting sur les surfaces de login

Toute fonction `echanger_acces_*` qui valide un identifiant (RH, resto,
compte resto, rattachement partenaire) doit implémenter le pattern
`controler_tentatives` / `noter_echec_connexion` / `effacer_tentatives` :

```sql
-- ✅ Modèle à suivre (echanger_acces_rh v1.9)
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));  -- sérialise les tentatives
    PERFORM public.controler_tentatives(v_cle);                  -- lève CP429 si bloqué

    SELECT c.id INTO v_id FROM ... WHERE ...;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_connexion(v_cle);
    ELSE
        PERFORM public.effacer_tentatives(v_cle);
    END IF;
    RETURN v_id;
END;
```

**Vérifier :**
- `pg_advisory_xact_lock` en début de transaction (empêche les attaques par rafale)
- `controler_tentatives` avant le SELECT
- `noter_echec_connexion` si échec, `effacer_tentatives` si succès
- La clé (`rh:`, `resto:`, `partenaire:`) est normalisée (`lower`, `trim`, `left(...,100)`)

```bash
grep -n "echanger_acces_\|rattacher_compte_restaurant" supabase/schema.sql
# Vérifier que chaque fonction contient les 3 appels controler/noter/effacer
```

### C12 — Tables sans policy (tables "système")

Certaines tables n'ont **aucune policy** par design : `tentatives_connexion`
est un état interne, pas une donnée utilisateur. Elles doivent être
verrouillées **explicitement** :

```sql
-- ✅ Modèle à suivre (tentatives_connexion v1.8)
ALTER TABLE public.tentatives_connexion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tentatives_connexion FROM PUBLIC, anon, authenticated;
-- (création + accès via les fonctions SECURITY DEFINER uniquement)
```

**Test d'auto-défense :** même si quelqu'un désactive la RLS par erreur,
`REVOKE ALL` protège encore (contrairement à une policy manquante qui
laisserait la RLS seule).

**Toute table sans policy est suspecte** : c'est soit une table système
(→ `REVOKE ALL`), soit une table où la RLS a été oubliée (→ critique).

### C13 — `FOR UPDATE` dans une sous-requête `IN` : autorisé (ancienne règle retirée)

Cette règle affirmait que PostgreSQL interdit `FOR UPDATE` dans une sous-requête
`IN`. **C'est faux** : `DELETE ... WHERE cle IN (SELECT ... LIMIT 100 FOR UPDATE
SKIP LOCKED)` est un motif de file d'attente accepté. `noter_echec_connexion`
l'utilise et a été exécutée des dizaines de fois sans erreur (tests locaux
PostgreSQL 18 de la v1.10, et en production depuis la v1.8). Ne plus le
signaler. Restent interdits avec `FOR UPDATE` : `UNION`, `GROUP BY`, `DISTINCT`,
`HAVING`, les agrégats et les fonctions de fenêtre.

### C14 — Codes d'erreur custom documentés

Les `RAISE EXCEPTION ... USING ERRCODE = 'CPxxx'` sont autorisés pour les
erreurs métier (ex: `CP429` = rate limit). Chaque code doit être :

1. Documenté dans un commentaire SQL au-dessus de la fonction
2. Traité côté Next.js (`try/catch` avec check sur `error.code`)
3. Testé en dev

```sql
-- ✅
-- Lève une erreur CP429 si l'identifiant est bloqué
CREATE OR REPLACE FUNCTION public.controler_tentatives(p_cle TEXT)
...
RAISE EXCEPTION 'Trop de tentatives...' USING ERRCODE = 'CP429';
```

```ts
// ✅ côté Next.js
try {
  await supabase.rpc('echanger_acces_rh', {...});
} catch (e) {
  if (e.code === 'CP429') return { success: false, message: 'Trop de tentatives, réessayez dans 15 minutes.' };
  throw e;
}
```

```bash
grep -n "ERRCODE = 'CP" supabase/schema.sql
# Chaque code doit avoir un commentaire explicatif et un équivalent côté Next.js
```

### C15 — Défense en profondeur : REVOKE ALL + ALTER DEFAULT PRIVILEGES

Supabase accorde par défaut **tous les droits** sur une nouvelle table à
`anon` et `authenticated`. La RLS les bloque, mais un REVOKE explicite
protège aussi d'une RLS désactivée par erreur.

À la fin de chaque migration qui ajoute une table ou une fonction, ajouter :

```sql
-- ✅ Bloc à ajouter en fin de migration
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- Et pour chaque fonction SECURITY DEFINER :
REVOKE EXECUTE ON FUNCTION public.<f> FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.<f> TO <rôle>;
```

**Piège** : `ALTER DEFAULT PRIVILEGES` s'applique aux **futures tables
créées par le rôle courant**. Si les migrations ne sont pas exécutées par le
même rôle que `schema.sql`, l'ALTER ne sert à rien. Documenter le rôle utilisé.

**Toute nouvelle table** doit avoir son `REVOKE ALL ON ... FROM anon` ou une
policy qui justifie l'accès anon (rare).

---

## 🟠 Hautes (H1-H8) — à corriger avant le prochain sprint

### H1 — `FOR UPDATE` sans `WITH CHECK` = déplacement possible

```sql
-- ⚠️ Un UPDATE peut changer company_id et déplacer la ligne
CREATE POLICY p ON companies FOR UPDATE USING (id = jwt_company_id());

-- ✅
CREATE POLICY p ON companies FOR UPDATE
    USING (id = jwt_company_id())
    WITH CHECK (id = jwt_company_id());
```

### H2 — Isolation `restaurant_id` manquante

Toute policy au rôle `restaurant` doit inclure
`restaurant_id = jwt_restaurant_id()` ou un filtrage équivalent
(sous-requête, jointure).

```sql
-- ⚠️ Resto A voit les commandes de Resto B
CREATE POLICY restaurant_lit_les_commandes ON commandes FOR SELECT
    USING (jwt_role_app() = 'restaurant' AND company_id = jwt_company_id());

-- ✅
USING (
    jwt_role_app() = 'restaurant'
    AND company_id = jwt_company_id()
    AND plat_id IN (
        SELECT id FROM menus_du_jour WHERE restaurant_id = jwt_restaurant_id()
    )
);
```

### H3 — `UNIQUE` sur les colonnes de login

- `companies.email_contact` sert d'identifiant dans `echanger_acces_rh` →
  **doit** être `UNIQUE` (en v1.9 : `UNIQUE INDEX lower(email_contact) WHERE
  email_contact IS NOT NULL`).
- `comptes_restaurant.telephone_whatsapp` → doit être `UNIQUE` (déjà ✅).

### H4 — `CHECK` sur les invariants métier

Invariants qui doivent être en `CHECK` (pas seulement supposés par le code) :

- `commandes.statut = 'choisi'` → `plat_id IS NOT NULL`
- `clotures.confirme_at NOT NULL` → `confirme_par IS NOT NULL`
- `commandes.statut IN ('choisi', 'absent', 'ne_mange_pas')` (existe déjà)
- `clotures.envoi_statut IN (...)` (existe déjà)
- `companies.plan IN (...)` (existe déjà)

Depuis v1.9, ces `CHECK` sont ajoutés en `NOT VALID` (lignes existantes non
contrôlées, nouvelles écritures contrôlées). Toute nouvelle contrainte
d'invariant doit suivre le même pattern.

### H5 — Fonctions SECURITY DEFINER qui écrivent sans vérifier le scope

```sql
-- ⚠️ p_company non vérifié contre jwt_company_id()
INSERT INTO employes (company_id, nom) VALUES (p_company, p_nom);

-- ✅ Forcer le scope
INSERT INTO employes (company_id, nom)
SELECT public.jwt_company_id(), p_nom
WHERE p_company = public.jwt_company_id();
```

### H6 — `ON CONFLICT` sur les UNIQUE composites

`unique_vote_employe_jour (employe_id, date)` (le nom garde « vote ») doit
être utilisé dans les Server Actions de commande pour absorber les doubles-clics :

```ts
.upsert({...}, { onConflict: 'employe_id,date' })
```

Sinon → erreur 500 en prod sur un utilisateur qui double-clique.

### H7 — Index sur les colonnes de `WHERE` / `JOIN` / `ORDER BY`

Toute nouvelle colonne utilisée dans une vue chaude ou un `WHERE` fréquent
doit avoir un index. Vérifier systématiquement :

- `commandes(date, plat_id)` pour la vue récap
- `clotures(restaurant_id, date)` pour les clôtures par resto
- `employes(company_id)` pour le portail

### H8 — Trigger `proteger_*` : toutes les colonnes sensibles couvertes

Si un trigger protège des colonnes (empêche un rôle de les modifier), il doit
lister **explicitement** toutes les colonnes sensibles de la table. Un trigger
partiel donne une fausse impression de sécurité.

```sql
-- ✅ proteger_colonnes_companies (v1.9, mise à jour v1.10 T4) — chaque colonne sensible est listée
IF NEW.id IS DISTINCT FROM OLD.id
   OR NEW.slug IS DISTINCT FROM OLD.slug
   OR NEW.plan IS DISTINCT FROM OLD.plan
   OR NEW.statut_abonnement IS DISTINCT FROM OLD.statut_abonnement
   OR NEW.abonnement_fin IS DISTINCT FROM OLD.abonnement_fin
   OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
   OR NEW.is_active IS DISTINCT FROM OLD.is_active
   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Colonne réservée à la console SuperAdmin.';
END IF;
```

**Test :** ajouter une nouvelle colonne sensible à une table protégée →
modifier le trigger en même temps. Si un `ALTER TABLE ADD COLUMN` ajoute une
colonne sensible sans mettre à jour le trigger, c'est un finding.

```bash
# Vérifier que chaque trigger protege_* est synchronisé avec les colonnes sensibles
grep -n "CREATE OR REPLACE FUNCTION public.proteger_" supabase/schema.sql
```

**Colonne supprimée (« colonne morte »)** :
- Retirer la colonne de toute fonction de trigger **avant** le `DROP` dans
  l'ordre du fichier. plpgsql ne vérifie pas les colonnes à la création de la
  fonction : le vrai risque est un trigger qui échoue à l'exécution
  (`column does not exist`) sur chaque `UPDATE` de la table.
- Retirer aussi l'`ADD COLUMN IF NOT EXISTS` (ou la ligne du `CREATE TABLE`) et
  les `UPDATE` / `COALESCE` qui la lisent dans les blocs historiques, sinon
  chaque relance la recrée puis la supprime.
- Vérifier politiques, vues, fonctions et `select("*")` du code.
- Si du code déployé lit ou écrit la colonne : expand → code → contract.
  Sinon une seule étape suffit (cas de `traiteur_token` et `code_acces`, v1.10 T4).

---

## 🟡 Moyennes (M1-M5) — à corriger dans le mois

- **M1** — `updated_at TIMESTAMPTZ` + un trigger de mise à jour (à créer,
  par ex. `fn_set_updated_at()` : il n'existe pas encore) sur `companies`,
  `employes`, `menus_du_jour`, `restaurants`, `plats_restaurant`. Aujourd'hui
  seule `commandes` a `updated_at`, renseigné par le code.
- **M2** — Idempotence des migrations :
  - `ADD COLUMN IF NOT EXISTS`
  - `ADD CONSTRAINT` dans un bloc `DO $$ ... pg_constraint ... $$`
  - `CREATE INDEX IF NOT EXISTS`
  - `DROP POLICY IF EXISTS`
- **M3** — `REVOKE EXECUTE FROM PUBLIC` sur toute fonction, `GRANT`
  sélectif (`anon` uniquement pour les `echanger_*`).
- **M4** — Toute nouvelle colonne critique sur `restaurants` doit être
  protégée par le trigger `proteger_compte_restaurant` (ex: si `compte_id`
  bouge, ajouter au trigger).
- **M5** — Aucune donnée de démonstration (entreprise, code RH, tokens)
  dans `schema.sql` : le script est relancé en production. Le jeu de démo a été
  retiré en v1.7 ; tout nouveau seed est bloquant.

---

## 🛠️ Commandes de diagnostic rapide

```bash
# Toutes les policies par table
grep -nE "CREATE POLICY [a-z_]+ ON public\.[a-z_]+ FOR" supabase/schema.sql | \
  sed -E 's/.*ON public\.([a-z_]+).*/\1/' | sort | uniq -c | sort -rn

# Toutes les SECURITY DEFINER
grep -n "SECURITY DEFINER" supabase/schema.sql

# Toutes les vues
grep -n "CREATE.*VIEW" supabase/schema.sql

# service_role dans le code Next.js
grep -rn "SERVICE_ROLE\|service_role" src/

# Colonnes sensibles
grep -nE "(token|hash|secret|code_|password|key)" supabase/schema.sql | \
  grep -iE "CREATE TABLE|ADD COLUMN"

# Rate limiting (C11)
grep -n "controler_tentatives\|noter_echec_connexion\|effacer_tentatives" supabase/schema.sql

# FOR UPDATE (C13) : autorisé dans IN ; signaler seulement avec UNION, GROUP BY, DISTINCT, agrégat
grep -nB2 "FOR UPDATE" supabase/schema.sql

# Codes d'erreur custom (C14)
grep -n "ERRCODE = 'CP" supabase/schema.sql

# Triggers de protection (H8)
grep -n "CREATE OR REPLACE FUNCTION public.proteger_" supabase/schema.sql

# REVOKE ALL sur les tables système (C12)
grep -n "REVOKE ALL ON public\." supabase/schema.sql
```

---

## 🎯 Cas de test d'auto-évaluation

Le skill est correctement calibré si, en le chargeant sur le `schema.sql` v1.10
actuel, l'agent trouve **au minimum** :

1. ✅ `salarie_lit_les_restaurants` → **supprimée en v1.10 T3** (DROP en section 9, salarié via `restaurants_visibles_salarie` sans token) : vérifier l'absence de `CREATE POLICY salarie_lit_les_restaurants`
2. ✅ `portail_lit_les_salaries` / `portail_inscrit_un_salarie` → **supprimées en v1.10 T2** (DROP en section 9, portail via `portail_lister_salaries` sans token) : vérifier l'absence de `CREATE POLICY portail_` sur `employes`
3. ✅ `rh_lit_son_entreprise` → `rh_code_hash` → **corrigé en v1.10 T1** (colonne supprimée, `acces_rh` sans policy) : ne plus le signaler
4. ✅ `noter_echec_connexion` → `FOR UPDATE` dans sous-requête `IN` → **pas un bug** (voir C13) : ne pas le signaler
5. ✅ `acces_rh` présente sans policy, `REVOKE ALL` pour anon et authenticated (C3, v1.10 T1) — **à valider**
6. ✅ Rate limiting `rattacher_compte_restaurant` → bien implémenté (C11) — **à valider, pas à corriger**
7. ✅ `tentatives_connexion` sans policy → `REVOKE ALL` présent (C12) — **à valider**

Aucun point à corriger : CRIT-5 est fermé (v1.10 T1 à T4).
Points 1 à 7 → corrects, à mentionner dans « ✅ Ce qui est bon ».

S'il rate l'un de ces 7, renforcer la section correspondante.

---

## 📤 Format de sortie attendu

Le skill produit un rapport structuré avec :

- **Verdict** : `BLOQUANT` | `À CORRIGER` | `APPROUVÉ`
- **🔴 Critique** : un bloc par finding avec `fichier:ligne`, risque, code corrigé
- **🟠 Haute** : idem, plus condensé
- **🟡 Moyenne** : liste à puces
- **✅ Ce qui est bon** : liste obligatoire, pour ne pas décourager
- **Escalade** : si décision business/légale, question + 2 options + recommandation

Chaque finding critique doit inclure un **exemple de code corrigé prêt à
copier-coller**.