---
name: migration-schema
description: Faire évoluer la base Supabase de Cantine Pro (nouvelle colonne, table, contrainte ou index) sans casser l'existant. À utiliser dès qu'un changement nécessite de modifier supabase/schema.sql.
---

# Faire évoluer le schéma Supabase

Il n'y a pas d'outil de migration : `supabase/schema.sql` est un script **idempotent** que l'utilisateur
relance en entier dans l'éditeur SQL de Supabase. Il doit donc pouvoir tourner plusieurs fois sans erreur.

Toute écriture dans un fichier `.sql` déclenche une demande d'accord (hook `block-sql-writes.sh`) :
présenter le bloc à l'utilisateur avant de l'écrire, il valide la modification dans Claude Code.

## 1. Ajouter le SQL après le dernier bloc de migration

Ne jamais modifier ni supprimer les blocs existants : ils ont déjà été appliqués en production.
Ajouter un bloc commenté juste avant la section `ENABLE ROW LEVEL SECURITY`. Ne jamais ajouter
de données de démonstration (entreprise, code RH, tokens) : le script tourne aussi en production.

```sql
-- vX.Y : <ce que ça apporte>
ALTER TABLE public.employes
    ADD COLUMN IF NOT EXISTS matricule TEXT;
```

Règles :
- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Contraintes : les entourer d'un `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...') ... $$;` comme les blocs existants.
- Colonne obligatoire : toujours avec un `DEFAULT`, sinon la commande échoue sur les lignes existantes.
- Nouvelle table d'une entreprise (cas général) : ajouter `company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE`, un index sur `company_id`, une ligne `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` et ses politiques dans la section 9 (au minimum `FOR ALL` pour `public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id()`, avec `DROP POLICY IF EXISTS` avant chaque `CREATE POLICY`).
- Exception : une table qui n'appartient pas à une entreprise (comme `comptes_restaurant`, partagé entre plusieurs entreprises) n'a pas de `company_id` ; ses politiques s'appuient sur son propre claim (`jwt_compte_id()`). La justifier dans le commentaire du bloc.
- Un secret (token, hash, code) ne va pas dans une table qui a une politique SELECT ouverte à un autre rôle (RLS ne filtre pas les colonnes).
- Montants en FCFA : `INTEGER`. Heures : `TIME`. Dates métier : `DATE`.

### Migration de données (UPDATE / INSERT / DELETE sur des lignes existantes)

Jamais nue : le script étant relancé en entier, elle se rejouerait à chaque relance (c'est ce qui créait
des restaurants fantômes avant la v1.9). L'envelopper dans la table `schema_migrations`, avec un nom
unique qui ne change plus jamais :

```sql
-- vX.Y : <ce que fait la migration de données>
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'vX.Y-description-courte') THEN
        UPDATE public.ma_table SET ... WHERE ...;
        INSERT INTO public.schema_migrations (nom) VALUES ('vX.Y-description-courte');
    END IF;
END $$;
```

Seule exception admise : un `UPDATE ... WHERE colonne IS NULL` qui remplit une nouvelle colonne et
reste sans effet à la relance.

### Remplacer une fonction, une politique ou un trigger de la section 9

Un `CREATE OR REPLACE FUNCTION` ou un `CREATE POLICY` placé avant la section 8 est écrasé, à chaque
relance, par la définition de la section 9. Les remplacements vont donc dans le **bloc final** en fin
de fichier (commencé en v1.9), qui doit toujours rester le dernier. La partie structure (colonnes,
contraintes, index) reste avant la section 8.

## 2. Mettre à jour les types

Dans `src/types/database.ts`, ajouter la colonne dans `Row`, `Insert` et `Update` de la table.

## 3. Lire et écrire la colonne

- Ajouter la colonne aux constantes de sélection (`CHAMPS_EMPLOYE`, `CHAMPS_PLAT`, ...) dans `src/app/rh/actions.ts`
  et aux `.select(...)` des pages concernées (`src/app/rh/page.tsx`).

## 4. Prévenir l'utilisateur

Terminer en rappelant clairement : « Relancez `supabase/schema.sql` dans l'éditeur SQL Supabase avant de déployer »,
car le code déployé sur Vercel lirait sinon une colonne qui n'existe pas encore (« column does not exist »).

Puis lancer `/verifier`.
