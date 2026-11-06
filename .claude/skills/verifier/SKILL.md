---
name: verifier
description: Vérifier un changement dans Cantine Pro avant de le considérer comme terminé ou de le pousser - types, build et contrôle visuel dans la preview.
---

# Vérifier un changement

1. **Types** : `npx tsc --noEmit`. Corriger toute erreur avant de continuer.
2. **Règles du projet** sur le diff (`git diff`) :
   - chaque requête Supabase d'une action RH passe par `createClientRh(companyId)` et est filtrée par `company_id` ; `createAdminClient()` n'apparaît que dans `/admin`, le cron, le diagnostic et les inscriptions (entreprise et restaurant) ;
   - toute nouvelle page, action ou route privée vérifie sa session en tête (il n'y a pas de middleware) ;
   - toute nouvelle table ou tout nouvel accès d'un rôle a sa politique RLS dans `supabase/schema.sql` ;
   - pas de `new Date()` brut pour une date métier (utiliser `todayDakar()`) ;
   - textes d'interface en français, vocabulaire « commande » / « Espace RH » / « restaurant » ;
   - si `supabase/schema.sql` a changé : `src/types/database.ts` est à jour et l'utilisateur est prévenu de relancer le schéma.
3. **Interface** (si un écran a changé) : démarrer la preview `cantine-pro` (port 3124), qui lit la **vraie base**
   Supabase. Ouvrir l'écran concerné, vérifier la console et l'affichage, aussi en largeur mobile (375 px), puis faire
   une capture d'écran. Ne pas créer, modifier ni envoyer de données réelles (commandes, clôtures, salariés) sans
   l'accord de l'utilisateur. L'Espace RH demande une connexion : c'est à l'utilisateur de se connecter.
4. **Avant un push** : `NEXT_DIST_DIR=.next-build npm run build` doit réussir. Toujours ce dossier séparé :
   ne jamais écrire dans le `.next` du `npm run dev` de l'utilisateur (la preview utilise `.next-preview`).

Rapporter ce qui a été vérifié et ce qui ne l'a pas été (par exemple : écran derrière la connexion RH non ouvert).
