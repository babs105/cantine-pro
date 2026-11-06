# WORKFLOW — Cantine Pro

## Le cycle de livraison (non négociable)

**1 tranche = 1 agent dev = 1 rapport = N reviews = 1 merge. Puis on recommence.**

```
┌─────────────────────────────────────────────────────────────┐
│  HUMAIN                                                     │
│  @agent-architect planifie <feature>                        │
└────────────────────────┬────────────────────────────────────┘
                         ↓
              Plan avec tranches T1, T2, T3…
              (verticales, chacune livrable end-to-end)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  HUMAIN                                                     │
│  Valide le plan : scope strict, tranches verticales,        │
│  reviews nommées ("sur la table commandes", pas "sur le     │
│  schéma"). Si mauvais → relance architect.                  │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  HUMAIN                                                     │
│  Copie UNIQUEMENT le texte de T1 depuis le plan.            │
│  @agent-dev-<feature> implémente T1                         │
│  (ne pas donner T2, T3… au dev)                             │
└────────────────────────┬────────────────────────────────────┘
                         ↓
              Rapport dev :
              - fichiers modifiés
              - code produit
              - reviews à déclencher (avec scope nommé)
              - tests manuels
              - hors scope identifié
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  HUMAIN                                                     │
│  @agent-database-reviewer sur <scope nommé de T1>           │
│  @agent-security-reviewer sur <scope nommé de T1>           │
└────────────────────────┬────────────────────────────────────┘
                         ↓
              Verdicts : BLOQUANT | À CORRIGER | APPROUVÉ
                         ↓
              Si BLOQUANT → retour dev (même tranche, pas T2)
              Si APPROUVÉ → ↓
┌─────────────────────────────────────────────────────────────┐
│  HUMAIN                                                     │
│  npx tsc --noEmit (le hook le fait déjà)                    │
│  Tests manuels de la tranche                                │
│  Preview cantine-pro (port 3124)                            │
│  Merge                                                      │
└────────────────────────┬────────────────────────────────────┘
                         ↓
                   Recommence à T2
```

## Règles

### Sur le plan
- L'architect **ne déclenche rien**. Il écrit un plan. C'est l'humain qui
  déclenche chaque étape.
- Chaque tranche est **verticale** : un peu de schéma, un peu de serveur,
  un peu d'UI, pour livrer un flow utilisateur complet. Pas de "T1 schéma",
  "T2 serveur", "T3 UI".
- Chaque review a un **scope nommé** : "sur la table `commandes`", "sur
  l'action `submitVoteAction`". Jamais "sur le schéma" ou "sur le front".

### Sur le dev
- Le dev reçoit **une seule tranche** à la fois. Le texte exact copié depuis
  le plan.
- Le dev **ne touche jamais** `supabase/schema.sql` (il propose l'`ALTER`,
  l'humain l'applique via `/migration-schema`).
- Le dev **ne touche jamais** `src/types/database.ts` à la main (il signale
  qu'il faut le mettre à jour, l'humain le fait).
- Le dev **ne déclenche pas** les reviews lui-même. Il les liste dans son
  rapport. C'est l'humain qui les invoque.

### Sur les reviews
- `database-reviewer` est **obligatoire** si la tranche touche :
  `schema.sql`, une policy RLS, une fonction `SECURITY DEFINER`, une vue,
  un trigger, ou une Server Action qui appelle `.rpc()` / `.from()` sur
  une table sensible.
- `security-reviewer` est **obligatoire** si la tranche touche :
  `jeton.ts`, `server.ts`, une session (`rh-session.ts`,
  `resto-session.ts`, `admin-session.ts`), `admin.ts`, une route `api/**`,
  une page de login ou d'inscription, ou un nouveau flow d'auth. Il n'y a
  pas de `middleware.ts` : chaque fichier vérifie sa propre session.
- Un verdict `BLOQUANT` renvoie au dev sur la même tranche. On ne passe
  pas à T2.

### Sur le merge
- Jamais de merge sans les reviews du scope nommé.
- Jamais de merge sans `npx tsc --noEmit` (le hook le fait, mais vérifier).
- Jamais de push sur `main` sans accord explicite (règle du `CLAUDE.md`).
- Pas de tests automatisés dans le projet (règle du `CLAUDE.md`) : les
  tests sont manuels, listés dans le rapport du dev.

## Agents permanents vs agents jetables

### Permanents (compétence transversale)
| Agent | Rôle |
|---|---|
| `architect` | Planifie, découpe en tranches, nomme les scopes de review |
| `database-reviewer` | Audite la couche SQL (RLS, SECURITY DEFINER, migrations) |
| `security-reviewer` | Audite la couche Next.js (cookies, JWT, contrôle de session par route, Server Actions) |

Ces trois agents **ne changent pas** au fil des features. Ils sont stables.

### Jetables (une feature, puis archivés)
| Agent | Feature |
|---|---|
| `dev-commande-salarie` | Flow `/p/[token]` (commande, changement d'avis, statuts) |
| `dev-clotures` | Clôtures, récap, envoi WhatsApp (à créer) |
| `dev-comptes-resto` | Comptes multi-entreprises, rattachement (à créer) |
| `dev-menu-du-jour` | Menus RH + restaurant (à créer) |
| etc. | |

Un agent dev est créé pour une feature, utilisé le temps des tranches, puis
archivé quand la feature est stable. Le prochain agent dev le remplace.

**Ne pas créer 10 agents dev d'un coup.** Un seul à la fois, tester le
cycle complet (plan → dev → reviews → merge), puis passer au suivant.

## Alignement avec `CLAUDE.md`

Le `WORKFLOW.md` ne remplace pas `CLAUDE.md`. Il le complète :

- `CLAUDE.md` = **constitution** : stack, règles de code, vocabulaire,
  Git, comment vérifier un changement. Lu par tous les agents.
- `WORKFLOW.md` = **processus** : qui déclenche quoi, dans quel ordre.
  Lu par l'humain et par `architect`.

En cas de conflit, `CLAUDE.md` gagne. Si le `WORKFLOW.md` contredit
`CLAUDE.md`, corriger le `WORKFLOW.md`.

## Les 5 pièges à éviter

1. **Donner le plan entier au dev.** Il code tout d'un coup, tu perds le
   contrôle, tu ne sais plus quelle tranche a cassé quoi.
2. **Passer à T2 sans avoir mergé T1.** Les dépendances entre tranches
   (T2 lit souvent ce que T1 a écrit) deviennent floues.
3. **Merger sans les reviews.** Surtout sur `commandes`, `clotures`,
   `comptes_restaurant`. Une policy `USING(true)` non vue = fuite en prod.
4. **Review générique.** "database-reviewer, regarde le schéma" → il va
   tout relire, rater des choses, et tu vas payer 10× le contexte.
   Toujours un scope nommé.
5. **Laisser le dev déclencher les reviews.** Si le dev appelle
   `database-reviewer` lui-même, tu ne vois pas le rapport intermédiaire,
   tu ne peux pas arbitrer, et tu perds la main.

## Checklist avant de lancer un dev

- [ ] Le plan de l'architect est validé (scope strict, tranches verticales,
      scopes de review nommés)
- [ ] Je copie **une seule tranche** (T1) dans le prompt du dev
- [ ] Je précise : "Ne touche à rien d'autre. Ne traite pas T2 ni T3."
- [ ] Le dev a bien chargé son skill (`regles-dev-<feature>`)
- [ ] Le dev a lu `CLAUDE.md` et `WORKFLOW.md`

## Checklist avant de merger

- [ ] `npx tsc --noEmit` passe (le hook le fait en fin de tour)
- [ ] `database-reviewer` a rendu APPROUVÉ sur son scope nommé
- [ ] `security-reviewer` a rendu APPROUVÉ sur son scope nommé
- [ ] Tests manuels listés dans le rapport du dev : tous passent
- [ ] Preview `cantine-pro` (port 3124) vérifiée si l'UI change
- [ ] Aucune donnée réelle modifiée sans accord de l'utilisateur
- [ ] Commit au format `type: description en français`