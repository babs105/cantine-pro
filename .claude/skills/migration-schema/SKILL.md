---
name: migration-schema
description: Faire évoluer la base Supabase de Cantine Pro (nouvelle colonne, table, contrainte ou index) sans casser l'existant. À utiliser dès qu'un changement nécessite de modifier supabase/schema.sql.
---

# Faire évoluer le schéma Supabase

Il n'y a pas d'outil de migration : `supabase/schema.sql` est un script **idempotent** que l'utilisateur
relance en entier dans l'éditeur SQL de Supabase. Il doit donc pouvoir tourner plusieurs fois sans erreur.

## 1. Ajouter le SQL après le dernier bloc de migration

Ne jamais modifier ni supprimer les blocs existants : ils ont déjà été appliqués en production.
Ajouter un bloc commenté juste avant la section `ENABLE ROW LEVEL SECURITY` (qui précède elle-même
le bloc de données de démonstration en fin de fichier) :

```sql
-- vX.Y : <ce que ça apporte>
ALTER TABLE public.employes
    ADD COLUMN IF NOT EXISTS matricule TEXT;
```

Règles :
- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Contraintes : les entourer d'un `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...') ... $$;` comme les blocs existants.
- Colonne obligatoire : toujours avec un `DEFAULT`, sinon la commande échoue sur les lignes existantes.
- Nouvelle table : ajouter `company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE`, un index sur `company_id`, une ligne `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` et ses politiques dans la section 9 (au minimum `FOR ALL` pour `public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id()`, avec `DROP POLICY IF EXISTS` avant chaque `CREATE POLICY`).
- Montants en FCFA : `INTEGER`. Heures : `TIME`. Dates métier : `DATE`.

## 2. Mettre à jour les types

Dans `src/types/database.ts`, ajouter la colonne dans `Row`, `Insert` et `Update` de la table.

## 3. Lire et écrire la colonne

- Ajouter la colonne aux constantes de sélection (`CHAMPS_EMPLOYE`, `CHAMPS_PLAT`, ...) dans `src/app/rh/actions.ts`
  et aux `.select(...)` des pages concernées (`src/app/rh/page.tsx`).

## 4. Prévenir l'utilisateur

Terminer en rappelant clairement : « Relancez `supabase/schema.sql` dans l'éditeur SQL Supabase avant de déployer »,
car le code déployé sur Vercel lirait sinon une colonne qui n'existe pas encore (« column does not exist »).

Puis lancer `/verifier`.
