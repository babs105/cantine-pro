---
name: nouvelle-action
description: Ajouter une Server Action à Cantine Pro (Espace RH, page salarié, restaurant ou admin) et la brancher sur l'interface. À utiliser dès qu'un nouveau bouton ou formulaire doit lire ou modifier des données Supabase.
---

# Ajouter une Server Action

Argument attendu : ce que l'action doit faire (ex. « archiver un restaurant »).

## 1. Choisir le fichier

| Espace | Fichier |
|---|---|
| RH : salariés, menus, restaurants, clôture, relances | `src/app/rh/actions.ts` |
| RH : historique, statistiques, paramètres | `src/app/rh/rapports-actions.ts` |
| Restaurant | `src/app/resto/[token]/actions.ts` |
| Portail entreprise | `src/app/c/[slug]/actions.ts` |
| SuperAdmin | `src/app/admin/actions.ts` (vérifier `isAdmin()`) |

Lire d'abord une action voisine du même fichier et copier son style (noms en français, suffixe `Action`).

## 2. Écrire l'action (modèle RH)

```ts
export async function archiverRestaurantAction(
  restaurantId: string
): Promise<{ success: boolean; message?: string }> {
  const companyId = await getRhCompanyId();
  if (!companyId) return { success: false, message: SESSION_EXPIREE };

  const supabase = createClientRh(companyId); // JWT court : la RLS limite à l'entreprise
  const { error } = await (supabase.from("restaurants") as any)
    .update({ is_active: false })
    .eq("id", restaurantId)
    .eq("company_id", companyId); // obligatoire : isole l'entreprise

  revalidatePath("/rh");
  if (error) return { success: false, message: "Impossible d'archiver le restaurant." };
  return { success: true };
}
```

Points à vérifier :
- Le bon client est utilisé : `createClientRh(companyId)` côté RH, le client renvoyé par `echangerJetonSalarie` / `echangerJetonRestaurant` / `echangerSlugPortail` côté pages publiques, `createAdminClient()` uniquement dans `/admin`.
- Le filtre `company_id` (ou `employeId` / `restaurantId`) est présent sur **chaque** requête, en plus de la RLS.
- Si l'action touche une table ou un rôle qui n'a pas encore de politique RLS : l'ajouter dans `supabase/schema.sql` (section 9), sinon la requête ne renverra rien.
- Les entrées utilisateur sont nettoyées (`trim`, longueur max, téléphone via `normaliserTelephone`).
- Si l'action touche aux commandes ou à la clôture : respecter le verrouillage après confirmation du restaurant (voir `modifierCommandeRhAction`) et le blocage d'abonnement (`etatAbonnement`).
- Dates via `todayDakar()`, jamais `new Date()` brut.

## 3. Brancher l'interface

Dans le composant client (souvent `src/app/rh/rh-dashboard-client.tsx` ou un `*-panel.tsx`) :
- importer l'action ;
- mettre à jour l'état local d'abord (optimiste), puis `startTransition(async () => { const res = await ...; if (!res.success) setActionError(res.message ...) })` ;
- désactiver le bouton avec `isPending`.

## 4. Vérifier

Lancer le skill `/verifier`.
