---
name: regles-dev-commande-salarie
description: >
  Règles d'implémentation du flow de commande salarié de Cantine Pro. Charger
  ce skill dès qu'on modifie /p/[token]/page.tsx ou vote-client.tsx, la table
  commandes, les policies salarie_*, ou les helpers de date/heure de commande.
  Contient les invariants métier (statut → plat_id, UNIQUE employe_id+date,
  heures de commande), le modèle de la Server Action, les tests manuels
  obligatoires et les anti-patterns.
---

# Règles du flow de commande salarié — Cantine Pro

## Contexte du flow

Le salarié reçoit un lien magique `/p/[token]`. Le token est stocké en clair
dans `employes.token` (16 caractères hex générés par `generateToken()` de
`src/lib/config.ts`) : c'est le seul identifiant du salarié, il n'a ni compte
ni cookie.

À chaque requête serveur, le token est échangé par `echangerJetonSalarie(token)`
(`src/lib/supabase/server.ts`, fonction SQL `echanger_jeton_salarie`) contre
`{ supabase, employeId, companyId }`. Le client `supabase` porte un JWT de 5 min
(`role_app='salarie'`, `company_id`, `employe_id`) qui **ne quitte jamais le
serveur**. La RLS filtre ensuite chaque table.

**Fichiers du flow :**
- `src/app/p/[token]/page.tsx` : composant serveur **et** Server Action
  `submitVoteAction` déclarée dans le même fichier (il n'y a pas de
  `actions.ts`).
- `src/app/p/[token]/vote-client.tsx` : composant client (choix, compte à
  rebours, file d'attente hors-ligne dans `localStorage`).
- `src/app/p/[token]/install-banner.tsx` : bannière PWA.
- `src/app/p/[token]/manifest.webmanifest/route.ts` : manifeste propre au salarié.
- `src/lib/dates.ts` (ré-exporté par `src/lib/config.ts`) : `todayDakar()`,
  `isApresHeureLimite()`, `secondesAvantHeure()`, `jourIso()`,
  `normaliserJoursTravail()`.

**Tables lues/écrites :**
- `employes` : SELECT de sa ligne (policy `salarie_lit_sa_fiche`)
- `companies` : SELECT de son entreprise pour les heures et jours de travail
  (policy `rh_lit_son_entreprise`, ouverte aux rôles `rh`, `salarie` et `restaurant` de l'entreprise)
- `menus_du_jour` : SELECT des menus de son entreprise
  (policy `salarie_lit_les_menus`, depuis la v1.9)
- `restaurants` : **aucun accès direct** depuis la v1.10 T3. Nom et état actif
  des restaurants de son entreprise via la fonction `restaurants_visibles_salarie()`
  (jamais de jointure `restaurants(...)` avec le JWT salarié : elle renverrait null)
- `commandes` : SELECT / INSERT / UPDATE de sa ligne (policies
  `salarie_lit_sa_commande` / `salarie_passe_sa_commande` /
  `salarie_modifie_sa_commande`)

**Policies à ne pas casser :**
- `salarie_lit_sa_commande` : `employe_id = jwt_employe_id()`
- `salarie_passe_sa_commande` : `WITH CHECK employe_id = jwt_employe_id()
  AND company_id = jwt_company_id()`
- `salarie_modifie_sa_commande` : `USING employe_id = jwt_employe_id()`,
  `WITH CHECK employe_id = jwt_employe_id() AND company_id = jwt_company_id()`

**Aucune policy DELETE** sur `commandes` pour le salarié. C'est volontaire :
on ne supprime pas une commande, on la met à jour (changement d'avis).

## Invariants métier (non négociables)

### I1 — Une seule commande par salarié et par date
`commandes` a `CONSTRAINT unique_vote_employe_jour UNIQUE (employe_id, date)`
(le nom garde « vote », c'est normal). Toute écriture utilise `upsert` avec
`onConflict: "employe_id,date"`. Un `insert` simple échoue (23505) au deuxième
choix ; un `update` seul ne crée pas la ligne au premier choix.

### I2 — `choisi` implique un plat, les autres statuts non
`statut` vaut `choisi`, `absent` ou `ne_mange_pas` (CHECK SQL). Aucune
contrainte SQL ne lie `statut` et `plat_id` : c'est la Server Action qui le
garantit, en écrivant `plat_id: statut === "choisi" ? platId : null`.

### I3 — Le plat appartient au menu du jour de l'entreprise
Pour `choisi`, l'action vérifie que le plat existe dans `menus_du_jour` avec
`company_id` = celui du salarié, `date = todayDakar()` et `is_available = true`.
Sans cette vérification, un salarié pourrait commander un plat d'un autre jour.

### I4 — Jours et heures de commande
La commande n'est possible que :
- un jour de travail de l'entreprise (`normaliserJoursTravail(companies.jours_travail)`
  contient `jourIso(todayDakar())`) ;
- après `companies.heure_ouverture_vote` (défaut `08:00`) ;
- avant `companies.heure_limite_vote` (défaut `11:10`).

Hors de ces bornes, l'action renvoie `{ success: false, message }` avec un
message lisible (jamais une exception). Le RH peut toujours modifier une
commande (`modifie_par_rh = true`), mais ce n'est pas ce flow. Toujours passer
par `isApresHeureLimite()` et `todayDakar()`, jamais `new Date()` brut pour une
date métier.

### I5 — Le token est l'identité : toujours ré-échangé côté serveur
La Server Action reçoit le token (celui de l'URL) et le **ré-échange** à chaque
appel avec `echangerJetonSalarie`. C'est le modèle voulu : il n'y a pas de
session salarié, et le JWT ne doit jamais être envoyé au navigateur.
- ✅ `employe_id` et `company_id` viennent de l'échange, jamais de l'appelant.
- ❌ Accepter un `employeId` ou un `companyId` en paramètre d'action.
- ❌ Créer un cookie ou renvoyer le JWT au client pour « éviter » le token.

### I6 — Format de retour
Comme toutes les actions du projet : `{ success: boolean; message?: string }`
(ici aussi `enregistreAt` pour l'heure d'enregistrement), message en français
lisible par un salarié. Ne jamais renvoyer `error.message` de Supabase brut.

### I7 — Page légère
La page salarié est ouverte en 3G/4G : pas de nouvelle dépendance lourde côté
client, pas de bibliothèque de validation (Zod n'est pas installé). Valider à la
main dans l'action (type, valeur dans la liste des statuts, plat du jour).

## Modèle de la Server Action (code actuel, à conserver)

```ts
async function submitVoteAction(
  token: string,
  statut: "choisi" | "absent" | "ne_mange_pas",
  platId: string | null
): Promise<{ success: boolean; message?: string; enregistreAt?: string }> {
  "use server";
  const acces = await echangerJetonSalarie(token); // I5
  if (!acces) return { success: false, message: "Employé introuvable ou inactif." };

  // charger employes + companies(heure_ouverture_vote, heure_limite_vote, jours_travail)
  // vérifier jour de travail, ouverture, limite (I4)
  // si choisi : vérifier le plat du jour (I3)

  const { error } = await acces.supabase.from("commandes").upsert(
    {
      company_id: acces.companyId,
      employe_id: acces.employeId,
      plat_id: statut === "choisi" ? platId : null, // I2
      date: todayDakar(),
      statut,
      modifie_par_rh: false,
      updated_at: new Date().toISOString(), // horodatage technique, pas une date métier
    },
    { onConflict: "employe_id,date" } // I1
  );
  if (error) return { success: false, message: "Erreur lors de l'enregistrement de la commande." };
  revalidatePath(`/p/${token}`);
  return { success: true, enregistreAt: new Date().toISOString() };
}
```

**Jamais** `createAdminClient()` ni `SUPABASE_SERVICE_ROLE_KEY` dans ce flow.

## Tests manuels obligatoires (à chaque tranche)

Avec un salarié de test (jamais un vrai salarié sans l'accord de l'utilisateur).

### T1 — Commande nominale
- [ ] Ouvrir `/p/<token>` entre l'heure d'ouverture et l'heure limite
- [ ] Choisir un plat → la page confirme avec l'heure d'enregistrement
- [ ] `SELECT statut, plat_id FROM commandes WHERE employe_id = '<id>' AND date = CURRENT_DATE`
      → 1 ligne `choisi`, bon `plat_id`
- [ ] Recharger la page → le choix est conservé

### T2 — Changement d'avis
- [ ] Choisir le plat A puis le plat B
- [ ] `SELECT` → 1 seule ligne, `plat_id = B`, `updated_at` a bougé

### T3 — Double-clic
- [ ] Double-cliquer sur un plat → 1 seule ligne, pas d'erreur

### T4 — Commandes fermées
- [ ] Passer `heure_limite_vote` à `00:01` sur l'entreprise de test
- [ ] La page affiche les commandes clôturées
- [ ] Un appel forcé de l'action renvoie `success: false` avec un message clair
- [ ] Même test avec un jour hors `jours_travail`

### T5 — Absent / ne mange pas
- [ ] « Absent(e) » → `statut='absent'`, `plat_id IS NULL`
- [ ] « Ne mange pas » → `statut='ne_mange_pas'`, `plat_id IS NULL`

### T6 — Plat invalide
- [ ] Appeler l'action avec l'id d'un plat d'un autre jour ou d'une autre
      entreprise → « Ce plat n'est plus disponible »

### T7 — Hors-ligne
- [ ] Couper le réseau, choisir un plat → choix gardé dans le téléphone
- [ ] Rétablir le réseau avant l'heure limite → la commande est envoyée
- [ ] Rétablir après l'heure limite → refus affiché, pas de commande

### T8 — Lien désactivé
- [ ] `UPDATE employes SET is_active = false WHERE id = '<id>'` (salarié de test)
- [ ] `/p/<token>` → page introuvable ; l'action renvoie « Employé introuvable ou inactif »

## Anti-patterns (à rejeter en review)

| Anti-pattern | Correction |
|---|---|
| `insert` simple sur `commandes` | `upsert` avec `onConflict: "employe_id,date"` |
| `update` seul | `upsert` (sinon 0 ligne au premier choix) |
| `DELETE` sur `commandes` | `upsert` avec `statut='absent'` |
| `employeId` / `companyId` reçus en paramètre | issus de `echangerJetonSalarie(token)` |
| JWT ou cookie salarié envoyé au navigateur | ré-échanger le token côté serveur |
| `createAdminClient()` dans `src/app/p/` | client renvoyé par `echangerJetonSalarie` |
| `error.message` renvoyé au client | message français générique |
| `console.log(token)` | supprimer, logger un id si besoin |
| `new Date()` pour la date de commande | `todayDakar()` |
| Commande acceptée sans vérifier jour, heures, plat | I3 et I4 |

## Commandes de diagnostic rapide

```bash
# service_role ou client admin introduit par erreur
grep -rn "service_role\|SERVICE_ROLE\|createAdminClient" src/app/p/

# logs de token
grep -rn "console.log.*token" src/app/p/

# écriture sur commandes sans upsert
grep -rn "from(\"commandes\")" src/app/p/ | grep -v upsert

# date métier calculée avec new Date()
grep -rn "new Date()" src/app/p/
```

## Format de sortie attendu

Le rapport de l'agent contient :
- **Fichiers modifiés** (liste)
- **Code produit** (bloc ou diff)
- **Invariants vérifiés** (checklist I1-I7)
- **Reviews à déclencher** (`database-reviewer` sur X, `security-reviewer`
  sur Y, avec un scope nommé)
- **Tests manuels** (T1-T8 applicables à la tranche)
- **Hors scope identifié** (à re-planifier par `architect`)
