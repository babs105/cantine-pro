---
name: regles-architect
description: >
  Règles de planification feature-specific pour Cantine Pro. Charger ce
  skill dès qu'on planifie une fonctionnalité, qu'on découpe une demande
  en tranches verticales, ou qu'on définit le scope d'une review. Contient
  la cartographie du projet, la matrice scope → reviewer, les règles de
  découpage vertical et des exemples de plans feature-specific réels.
---

# Règles de planification feature-specific — Cantine Pro

## Principe

Un plan **feature-specific** découpe une fonctionnalité en **tranches
verticales livrables**, chacune avec un **scope explicite** donné aux
reviewers. Ce n'est PAS un plan "par couche" (schéma → serveur → client).

**Différence clé :**

| Plan role-based (refusé) | Plan feature-specific (attendu) |
|---|---|
| T1 schéma · T2 policy · T3 serveur · T4 client | T1 "créer une relance côté RH" (schéma + policy + action + UI minimale) |
| Reviews : "database-reviewer sur le schéma" | Reviews : "database-reviewer sur la table `relances` UNIQUEMENT" |
| Critère : "la policy est écrite" | Critère : "le flow RH crée une relance visible côté salarié, en prod" |

## Cartographie (inchangée — pour référence)

### Routes et rôles

| Route | Rôle | Auth |
|---|---|---|
| `/admin/**` | SuperAdmin | Supabase Auth |
| `/rh/**` | RH | Cookie JWT `role_app='rh'` |
| `/resto/**` | Restaurant | Cookie JWT `role_app='restaurant'` ou `compte_restaurant` |
| `/p/[token]` | Salarié | JWT court `role_app='salarie'` |
| `/c/[slug]` | Portail | JWT court `role_app='portail'` |
| `/api/cron/**` | Système | `service_role` |

### Fichiers critiques

| Fichier | Review obligatoire (avec scope) |
|---|---|
| `supabase/schema.sql` | `database-reviewer` sur les objets modifiés UNIQUEMENT |
| `src/types/database.ts` | Mis à jour à la main par l'humain avec chaque migration (pas de génération CLI) |
| `src/lib/supabase/server.ts` | `database-reviewer` |
| `src/lib/supabase/admin.ts` | `security-reviewer` |
| `src/lib/supabase/jeton.ts` | `security-reviewer` |
| `src/lib/rh-session.ts`, `resto-session.ts`, `admin-session.ts` | `security-reviewer` |
| Pages et actions de login / inscription (`/rh/login`, `/resto/login`, `/admin/login`, `/inscription`, `/resto/inscription`) | `security-reviewer` |
| `src/app/api/**` | `security-reviewer` |
| `src/lib/facturation.ts`, `facture-pdf.ts`, `cloture.ts`, `limite-employes.ts` | Vérification manuelle par l'humain (pas de tests automatisés dans le projet) |

## Matrice scope → reviewer (le cœur du feature-specific)

Quand une tranche touche à... | Reviewer | Scope à donner EXPLICITEMENT
---|---|---
Une table / colonne / contrainte | `database-reviewer` | "sur la table `<nom>` et ses policies"
Une policy RLS | `database-reviewer` | "sur la policy `<nom>`"
Une fonction SECURITY DEFINER | `database-reviewer` | "sur la fonction `<nom>`"
Une vue / un trigger | `database-reviewer` | "sur la vue/trigger `<nom>`"
Une Server Action qui appelle `.rpc()` | `database-reviewer` | "sur l'appel RPC `<nom>` de l'action `<nom>`"
Une Server Action qui valide des inputs | `security-reviewer` | "sur l'action `<nom>`"
Un cookie / une session | `security-reviewer` | "sur le cookie `<nom>` dans `<fichier>`"
La protection d'une route (pas de middleware : contrôle de session dans chaque fichier) | `security-reviewer` | "sur le contrôle de session de `<fichier>`"
Une route API | `security-reviewer` | "sur la route `<path>`"
Un composant qui affiche des données tenant-scoped | `security-reviewer` | "sur le composant `<nom>`"
Un secret (clé, token, hash) | `security-reviewer` + humain | "sur l'usage du secret `<nom>` dans `<fichier>`"

**Règle d'or** : le scope d'une review est toujours un **objet nommé**
(table, policy, fonction, action, composant, route), jamais une catégorie
("le schéma", "le front", "la sécurité").

## Règles de découpage vertical

### Qu'est-ce qu'une tranche verticale ?

Une tranche verticale traverse **toutes les couches** pour livrer **une
partie fonctionnelle vérifiable**. Elle inclut :

- Le morceau de schéma nécessaire (table, colonne, policy)
- L'action serveur nécessaire
- L'UI minimale nécessaire
- Le test manuel end-to-end

**Elle exclut** : les autres tranches (qui viendront après).

### Exemple de découpage vertical

**Feature** : "Relance des employés qui n'ont pas voté"

❌ **Découpage role-based (refusé) :**
- T1 — Schéma : table `relances`, policies RH + salarié
- T2 — Serveur : Server Action RH créer relance
- T3 — Serveur : Server Action salarié marquer reçue
- T4 — Client : UI RH
- T5 — Client : UI salarié
- T6 — Cron

✅ **Découpage feature-specific (attendu) :**
- **T1 — Le RH peut relancer UN employé (flow minimal complet)**
  - Schéma : table `relances` + policy `rh_gere_ses_relances`
  - Serveur : `actionCreerRelance(employeId)`
  - Client : bouton "Relancer" sur UN employé dans `/rh/`
  - Test : le RH clique, la ligne est créée en DB, visible dans `/rh/`
  - Review : `database-reviewer` sur `relances` + `security-reviewer` sur `actionCreerRelance`

- **T2 — Le salarié voit sa relance**
  - Schéma : policy `salarie_lit_sa_relance`
  - Serveur : aucune nouvelle action (lecture via RLS)
  - Client : badge "Relancé" sur `/p/[token]`
  - Test : le salarié ouvre son lien, le badge apparaît
  - Review : `database-reviewer` sur `salarie_lit_sa_relance`

- **T3 — Le RH peut relancer en masse**
  - Serveur : `actionCreerRelancesEnMasse()` (batch)
  - Client : bouton "Relancer les N employés"
  - Test : le RH clique, N lignes sont créées
  - Review : `security-reviewer` sur `actionCreerRelancesEnMasse`

- **T4 — Le salarié marque la relance comme reçue**
  - Schéma : colonne `recue_at` sur `relances` + policy UPDATE
  - Serveur : `actionMarquerRecue()`
  - Client : bouton "OK" sur le badge
  - Test : le salarié clique, la colonne se met à jour
  - Review : `database-reviewer` sur `salarie_modifie_sa_relance`

- **T5 (hors scope MVP) — Cron envoi automatique quotidien**
  - À planifier dans un sprint séparé

**Pourquoi c'est meilleur** : T1 est livrable en prod **dès la fin de T1**.
Le RH peut relancer un employé manuellement, ce qui a déjà de la valeur.
T2 ajoute la visibilité côté salarié. T3 ajoute le confort. T4 ferme la
boucle. Si le projet s'arrête après T2, la fonctionnalité est **partielle
mais utile**, pas "à moitié implémentée".

### Taille d'une tranche

- **Cible** : 2h à 6h de travail (plus qu'une tâche role-based, car la
  tranche couvre plusieurs couches).
- **Maximum** : 1 jour. Au-delà, re-découper.
- **Minimum** : un flow utilisateur vérifiable.

### Dépendances entre tranches

- **Séquentielles** : T2 dépend de T1 (le salarié ne peut pas voir une
  relance qui n'existe pas). À ordonner.
- **Parallélisables** : T3 et T4 peuvent être faites en parallèle après T1.
  À signaler dans le plan.
- **Indépendantes** : rare dans une feature, mais possible.

## Portes de sortie : critère end-to-end

Une porte de sortie de tranche n'est pas "le code est écrit" ni "la policy
est créée". C'est un **critère vérifiable par un humain en prod ou en dev**.

❌ "T1 — table relances créée. Porte : la table existe."
✅ "T1 — le RH peut relancer UN employé. Porte : login RH → clic
'Relancer' sur Moussa → `SELECT * FROM relances` montre 1 ligne avec
`employe_id = moussa`, `company_id = la bonne` → l'UI affiche 'Relancé'."

❌ "T2 — policy salarié écrite. Porte : la policy existe."
✅ "T2 — le salarié voit son badge. Porte : ouvrir `/p/[token-de-moussa]`
→ badge 'Relancé' visible → ouvrir `/p/[token-de-aminata]` (non relancée)
→ aucun badge."

## Exemple de plan feature-specific complet

**Demande** : "Relance des employés qui n'ont pas voté."

```markdown
# Plan — Relance des employés qui n'ont pas voté

## Scope strict
**Dans la feature** :
- Table `relances` (nouvelle)
- Policies `rh_gere_ses_relances`, `salarie_lit_sa_relance`,
  `salarie_modifie_sa_relance`
- Server Actions `actionCreerRelance`, `actionCreerRelancesEnMasse`,
  `actionMarquerRecue`
- UI RH : bouton "Relancer" (unitaire + masse)
- UI salarié : badge "Relancé" + bouton "OK"

**Hors feature (sprints séparés)** :
- Cron d'envoi automatique
- Notification WhatsApp / SMS
- Historique des relances dans `/rh/historique`
- Statistiques (taux de réponse)

**Critère "done" global** : un RH peut relancer les employés qui n'ont pas
voté à 11h, et ces employés voient un badge sur leur lien de vote.

## Zones à risque
- 🔴 Nouvelle table `relances` = nouvelle surface RLS
- 🟠 Action en masse = risque d'écrire pour la mauvaise company
- 🟡 Badge côté salarié = potentielle fuite d'info entre employés

## Tranches verticales

### Tranche 1 — Le RH relance UN employé
**Après cette tranche** : le RH peut relancer un employé manuellement.
**Fichiers** : `supabase/schema.sql`, `src/types/database.ts`,
`src/app/rh/actions.ts`, `src/app/rh/rh-dashboard-client.tsx`
**Scope des reviews** :
- `database-reviewer` : sur la table `relances` et la policy
  `rh_gere_ses_relances` UNIQUEMENT
- `security-reviewer` : sur `actionCreerRelance` UNIQUEMENT
**Porte de sortie** : login RH → clic "Relancer" sur Moussa → ligne dans
`relances` avec le bon `company_id` → UI affiche "Relancé"
**Tests manuels** :
- [ ] RH relance Moussa → succès
- [ ] RH ne peut pas relancer un employé d'une autre company (tester avec 2)
- [ ] Double-clic → `ON CONFLICT` absorbe, pas de doublon

### Tranche 2 — Le salarié voit sa relance
**Après cette tranche** : Moussa voit un badge "Relancé" sur son lien.
**Fichiers** : `supabase/schema.sql`, `src/app/p/[token]/page.tsx`
**Scope des reviews** :
- `database-reviewer` : sur `salarie_lit_sa_relance` UNIQUEMENT
**Porte de sortie** : `/p/[token-moussa]` → badge visible →
`/p/[token-aminata]` (non relancée) → pas de badge
**Tests manuels** :
- [ ] Moussa (relancé) voit le badge
- [ ] Aminata (non relancée) ne voit rien
- [ ] Moussa ne voit pas les relances d'Aminata (RLS)

### Tranche 3 — Le RH relance en masse
**Après cette tranche** : le RH clique "Relancer les N employés" d'un coup.
**Fichiers** : `src/app/rh/actions.ts`, `src/app/rh/rh-dashboard-client.tsx`
**Scope des reviews** :
- `security-reviewer` : sur `actionCreerRelancesEnMasse` UNIQUEMENT
- `database-reviewer` : si nouvelle fonction RPC, sur cette fonction
**Porte de sortie** : RH clique "Relancer les 5 non-votants" → 5 lignes
créées, 0 doublon, toutes avec le bon `company_id`
**Tests manuels** :
- [ ] 5 non-votants → 5 relances
- [ ] 0 non-votant → bouton désactivé
- [ ] Employé déjà relancé → pas de doublon (ON CONFLICT)

### Tranche 4 — Le salarié marque "reçue"
**Après cette tranche** : Moussa clique "OK", le RH voit qu'il a vu.
**Fichiers** : `supabase/schema.sql`, `src/app/p/[token]/page.tsx` (la Server Action
est déclarée dans la page, il n'y a pas de `actions.ts`), `src/app/p/[token]/vote-client.tsx`
**Scope des reviews** :
- `database-reviewer` : sur `salarie_modifie_sa_relance` UNIQUEMENT
- `security-reviewer` : sur `actionMarquerRecue` UNIQUEMENT
**Porte de sortie** : Moussa clique "OK" → `recue_at` rempli → le RH voit
"reçue" dans son dashboard
**Tests manuels** :
- [ ] Moussa clique OK → `recue_at` non NULL
- [ ] Moussa ne peut pas marquer la relance d'Aminata (RLS)

## Ordre et dépendances
- T1 avant T2 (le salarié ne peut pas voir une relance inexistante)
- T1 avant T3 (la masse dépend de l'unitaire)
- T2 avant T4 (on ne marque pas reçue une relance qu'on ne voit pas)
- T3 et T4 parallélisables après T2

## Ce que le plan NE fait PAS
- Cron (T5, sprint séparé)
- Notification WhatsApp/SMS (sprint séparé)
- Historique détaillé (sprint séparé)
- Export CSV (sprint séparé)

## Escalade
Aucune. Le scope est clair, les décisions sont techniques.
```

## Anti-patterns feature-specific

| Anti-pattern | Correction |
|---|---|
| Tranche "schéma" seule | Inclure l'action + l'UI minimale pour rendre la tranche livrable |
| Review "sur le schéma" | Review "sur la table `relances`" |
| Review "sur le front" | Review "sur le composant `RelanceBouton`" |
| Critère "le code est écrit" | Critère "le flow X fait Y en prod" |
| Pas de scope strict | Toujours commencer par scope / hors scope |
| Tranche qui casse un flow existant sans le dire | Signaler "cette tranche touche le flow login resto" |

## Checklist finale avant de rendre un plan

- [ ] Scope strict écrit (dans / hors feature)
- [ ] Critère "done" global en 1 phrase vérifiable
- [ ] Tranches **verticales**, pas par couche
- [ ] Chaque tranche a un critère de sortie **end-to-end**
- [ ] Chaque review a un **scope explicite nommé**
- [ ] Dépendances et parallélisations signalées
- [ ] "Hors feature" explicite
- [ ] Aucune tranche "schéma seule" ou "UI seule"

## Le cycle de livraison (non négociable)

1 tranche = 1 agent dev = 1 rapport = N reviews = 1 merge. Puis on recommence.