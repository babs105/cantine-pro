---
name: regles-security-reviewer
description: >
  Règles de revue sécurité front et serveur pour Cantine Pro (hors SQL).
  Charger ce skill dès qu'on audite un cookie de session, la protection d'une
  route, une Server Action, un JWT, une route API, un header HTTP, une
  redirection, ou qu'on vérifie qu'aucun secret ne fuit dans le bundle client.
  Contient les checklists S1-S15, les commandes grep et les patterns Next.js + Supabase.
---

# Règles de revue sécurité — Cantine Pro

## Contexte de sécurité

Deux mécanismes distincts, à ne pas confondre :

1. **Les cookies de session** portent l'identité longue durée. Ils contiennent
   un id et une expiration signés en HMAC-SHA256 (`sign()` de
   `src/lib/rh-session.ts`, secret `RH_SESSION_SECRET`). Ils ne contiennent
   **pas** de JWT.

   | Cookie | Fichier | Contenu | Durée | Flags |
   |---|---|---|---|---|
   | `cantine_pro_rh` | `src/lib/rh-session.ts` | `companyId.exp.signature` | 30 j | HttpOnly, Secure en prod, SameSite=lax, path `/` |
   | `cantine_pro_resto` | `src/lib/resto-session.ts` | `compteId.exp.signature` (signé avec le préfixe `resto.`) | 30 j | idem |
   | `cantine_pro_admin` | `src/lib/admin-session.ts` | `superadmin.exp.signature` | 12 h | HttpOnly, Secure en prod, SameSite=strict, path `/admin` |

2. **Le JWT Supabase** est signé en ES256 par `signerJetonSupabase()`
   (`src/lib/supabase/jeton.ts`, module `crypto` de Node, clé
   `SUPABASE_JWT_PRIVATE_KEY` au format JWK). Il dure 5 min, est re-signé à
   chaque requête et **ne quitte jamais le serveur** : il sert seulement
   d'en-tête `Authorization` vers Supabase.

Les identifiants des pages publiques sont dans l'URL et ré-échangés à chaque
requête par une fonction SQL `SECURITY DEFINER` : token salarié (`/p/[token]`),
token restaurant (`/resto/[token]`).

**Il n'y a pas de `src/middleware.ts`.** Chaque page et chaque Server Action
vérifie elle-même sa session (`getRhCompanyId()`, `getRestoCompteId()`,
`isAdmin()`) ou ré-échange son token. C'est donc dans chaque fichier que S3
se vérifie.

**Périmètre** : code TypeScript, cookies, headers, protection des routes,
bundle client, Server Actions.
**Hors périmètre** : policies RLS, SECURITY DEFINER, migrations SQL →
escalader vers `database-reviewer`.

**Fichiers critiques :**

| Fichier | Pourquoi |
|---|---|
| `src/lib/supabase/jeton.ts` | Signature JWT ES256, clé privée, durée |
| `src/lib/rh-session.ts`, `resto-session.ts`, `admin-session.ts` | Cookies de session, HMAC, hachage des codes |
| `src/lib/supabase/admin.ts` | Seul fichier qui lit la clé service_role |
| `src/lib/supabase/server.ts` | Client anon + JWT, fonctions d'échange |
| `src/app/**/actions.ts` et actions inline (`src/app/p/[token]/page.tsx`) | Points d'entrée appelables depuis le navigateur |
| `src/app/api/**`, `src/app/rh/export/route.ts`, `src/app/rh/facture/route.ts` | Routes HTTP, chacune doit se protéger seule |

---

## 🔴 Critiques (S1-S8)

### S1 — Aucun secret dans le bundle client

Tout ce qui n'est pas préfixé `NEXT_PUBLIC_` ne doit **jamais** apparaître
dans `.next/static/`. Les modules sensibles importent `"server-only"` : un
import depuis un composant client casse le build, ce qui est voulu.

```bash
grep -rln '"use client"' src/ | xargs grep -ln "lib/supabase/jeton\|lib/supabase/admin\|lib/supabase/server\|-session\""
# Aucun résultat attendu
grep -rL '"server-only"' src/lib/supabase/jeton.ts src/lib/supabase/admin.ts src/lib/supabase/server.ts src/lib/*-session.ts
# Aucun résultat attendu
```

### S2 — Cookie : `HttpOnly`, `Secure`, `SameSite`

```ts
// ✅ modèle de src/lib/rh-session.ts
cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
});
```

**SameSite** : `lax` pour RH et restaurant (liens ouverts depuis WhatsApp),
`strict` pour l'admin. `none` interdit. Un nouveau cookie de session doit
avoir un **préfixe de signature propre** (comme `resto.`) pour qu'une
signature d'un autre cookie ne soit pas réutilisable.

### S3 — Chaque route privée vérifie sa session elle-même

Pas de middleware : vérifier dans **chaque** fichier touché.

| Espace | Vérification attendue en tête de page / action / route |
|---|---|
| `/rh/**` (pages, actions, `export`, `facture`) | `getRhCompanyId()` → sinon redirection `/rh/login` ou `SESSION_EXPIREE` |
| `/resto` (compte) | `getRestoCompteId()` / `createClientCompteSession()`, puis `accesPartenariatCompte(restaurantId)` pour agir sur une entreprise |
| `/resto/[token]` | `echangerJetonRestaurant(token)` |
| `/admin/**` | `isAdmin()` dans la page **et** dans chaque action |
| `/p/[token]` | `echangerJetonSalarie(token)` dans la page **et** dans l'action |
| `/api/cron/cloture` | `Authorization: Bearer CRON_SECRET`, refus si absent en production |

**Routes publiques assumées** : `/`, `/inscription`, `/resto/inscription`,
`/rh/login`, `/resto/login`, `/admin/login`, `/api/diagnostic` (expose l'état
de la configuration sans valeur : finding connu, à signaler).

```bash
# Server Actions RH sans vérification de session
grep -n "export async function" src/app/rh/actions.ts src/app/rh/rapports-actions.ts | wc -l
grep -n "getRhCompanyId()\|await contexte()\|createClientRhSession()" src/app/rh/actions.ts src/app/rh/rapports-actions.ts | wc -l
# Actions admin sans isAdmin
grep -n "export async function\|isAdmin()" src/app/admin/actions.ts
```

### S4 — Clé de signature JWT serveur uniquement

```bash
grep -rn "NEXT_PUBLIC_[A-Z_]*\(SECRET\|KEY\|PRIVATE\)" src/ 2>/dev/null
# Seuls NEXT_PUBLIC_SUPABASE_ANON_KEY et NEXT_PUBLIC_SUPABASE_URL sont autorisés
```

- `SUPABASE_JWT_PRIVATE_KEY` n'est lue que dans `jeton.ts`.
- Le JWT n'est jamais renvoyé au client (pas dans une prop, un cookie, une
  réponse d'action).
- `exp` reste à 5 min (`DUREE_JETON_SECONDES`).

### S5 — Client admin limité aux appelants autorisés

```bash
grep -rln "createAdminClient" src/
# Autorisé UNIQUEMENT dans :
#   - src/lib/supabase/admin.ts (définition)
#   - src/app/admin/** (SuperAdmin)
#   - src/app/api/cron/** (cron clôture)
#   - src/app/api/diagnostic/** (diagnostic)
#   - src/app/inscription/** (inscription entreprise)
#   - src/app/resto/inscription/** (inscription restaurant)
# Tout autre match = critique.
grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/
# Attendu : admin.ts, api/diagnostic (présence seulement), et rh-session.ts
# (secours de RH_SESSION_SECRET : finding connu, à signaler).
```

### S6 — Pas de secret dans les URLs

```ts
// ❌
redirect(`/rh?session=${valeurCookie}`);
// ✅
await createRhSession(companyId);
redirect("/rh");
```

**Exception** : `/p/[token]` et `/resto/[token]` portent leur
identifiant dans l'URL par conception (liens WhatsApp). Le token doit rester
aléatoire (`generateToken()`, 8 octets minimum) et révocable (`is_active`).

### S7 — Server Actions : validation des entrées

Une Server Action est un point d'entrée HTTP : ses paramètres viennent du
navigateur, quel que soit le type TypeScript. Le projet valide **à la main**
(pas de Zod, non installé) :
- `trim()` et longueur maximale sur les textes ;
- téléphone via `normaliserTelephone()` (`src/lib/telephone.ts`) ;
- valeurs d'énumération contrôlées contre une liste (`statut`, `plan`, ...) ;
- dates via `isDateValide()` ;
- **jamais** de `company_id`, `employe_id` ou `restaurant_id` d'appartenance
  reçu en paramètre : ils viennent de la session ou de l'échange de token.

```ts
// ✅ modèle RH
const companyId = await getRhCompanyId();
if (!companyId) return { success: false, message: SESSION_EXPIREE };
const nom = String(champs.nom || "").trim().slice(0, 120);
if (!nom) return { success: false, message: "Le nom est obligatoire." };
```

### S8 — Pas de redirection ouverte

```ts
// ❌
redirect(searchParams.get("next") ?? "/");
// ✅
const next = searchParams.get("next") ?? "/";
redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
```

---

## 🟠 Hautes (S9-S12)

### S9 — Headers de sécurité

À définir dans `next.config.ts` (`headers()`) : `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
(important : les URLs contiennent des tokens), `Permissions-Policy`, et une CSP
compatible avec `https://*.supabase.co`. HSTS : Vercel l'active en production.

### S10 — Limite de tentatives sur les connexions

`/admin/login`, `/rh/login`, `/resto/login` n'ont **aucune** limite
aujourd'hui (finding connu). Les codes font 6 (restaurant) ou 8 (RH)
caractères minimum et sont hachés en SHA-256 sans sel (`hashRhCode`). Toute
modification de ces actions doit être l'occasion de le signaler.

En production serverless, un `Map` en mémoire ne suffit pas (chaque instance a
le sien) : compteur en base (table dédiée) ou Upstash / Vercel KV.

### S11 — Durées

- JWT Supabase : 5 min (`DUREE_JETON_SECONDES`), re-signé à chaque requête.
- Cookies RH et restaurant : 30 jours ; admin : 12 h.
- Tout allongement est une décision à escalader.

### S12 — Logs sans secrets

```bash
grep -rn "console\.\(log\|error\).*\(token\|code\|jeton\|cookie\)" src/
```

Ne jamais renvoyer `error.message` de Supabase brut au client : message
français générique (sauf messages `RAISE EXCEPTION` écrits pour l'utilisateur).

---

## 🟡 Moyennes (S13-S15)

- **S13** — Erreurs : message générique côté client, détail côté serveur.
- **S14** — CSRF : Next.js 15 vérifie `Origin`/`Host` sur les Server Actions ;
  les routes `GET` ne doivent rien modifier.
- **S15** — `npm audit` avant chaque déploiement.

---

## 🛠️ Commandes de diagnostic rapide

```bash
# 1. Fuites dans le bundle (après NEXT_DIST_DIR=.next-build npm run build)
grep -r "SERVICE_ROLE\|JWT_PRIVATE\|RH_SESSION_SECRET" .next-build/static/ 2>/dev/null

# 2. Client admin hors des appelants autorisés
grep -rln "createAdminClient" src/

# 3. NEXT_PUBLIC_ suspects
grep -rn "NEXT_PUBLIC_[A-Z_]*\(SECRET\|SERVICE\|PRIVATE\)" src/

# 4. Cookies posés sans httpOnly
grep -rn "\.set(" src/lib/*-session.ts | grep -v httpOnly

# 5. Redirections construites depuis une entrée
grep -rn "redirect(.*\(searchParams\|formData\|next\)" src/

# 6. Modules serveur importés côté client
grep -rln '"use client"' src/ | xargs grep -ln "lib/supabase/\(jeton\|admin\|server\)"

# 7. Logs de secrets
grep -rn "console\.\(log\|error\).*\(token\|code\|jeton\)" src/
```

---

## 🎯 Cas de test d'auto-évaluation

Sur le code actuel, l'agent doit relever **au moins** :

1. ✅ Aucun `src/middleware.ts` : protection vérifiée fichier par fichier (S3)
2. ✅ Aucune limite de tentatives sur les trois connexions (S10)
3. ✅ `RH_SESSION_SECRET` se rabat sur la clé service_role (S5)
4. ✅ `/api/diagnostic` public (S3)
5. ✅ Cookies de session avec `httpOnly: true` (S2, point positif)
6. ✅ `jeton.ts`, `admin.ts`, `server.ts` importent `"server-only"` (S1, point positif)

S'il rate l'un de ces 6, renforcer la section correspondante.
