# Index de schema.sql

> **Fichier généré automatiquement.** Ne pas éditer à la main.
> Régénérer : `bash scripts/schema-index.sh`

**Total : 3127 lignes.**

## Tables

- `acces_rh` — L509
- `blocages_connexion` — L528
- `clotures` — L131
- `commandes` — L86
- `companies` — L45
- `comptes_restaurant` — L298
- `employes` — L58
- `menus_du_jour` — L72
- `paiements` — L262
- `plats_restaurant` — L280
- `restaurants` — L165
- `tentatives_connexion` — L362

## Vues

- `vue_recapitulatif_traiteur` — L104

## Fonctions

- `acces_partenariat_compte` — L1575
- `bloquer_ajout_rh_restaurant_avec_compte` — L2762
- `bloquer_plat_sans_restaurant` — L3022
- `bloquer_restaurant_sans_compte` — L2805
- `changer_code_compte_restaurant` — L2358 **(active)** · remplace L1474
- `changer_code_rh` — L2325 **(active)** · remplace L1250
- `cloture_confirmee` — L1757
- `cloture_existe` — L2501
- `code_correspond` — L2151
- `commandes_plat_supprime` — L2987
- `controler_tentatives` — L378
- `desactiver_plats_restaurant_supprime` — L3094
- `desactiver_restaurant_sans_compte` — L2826
- `echanger_acces_compte_restaurant` — L2630 **(active)** · remplace L812, L1994, L2282
- `echanger_acces_rh` — L2574 **(active)** · remplace L617, L974, L1214, L1952, L2227
- `echanger_jeton_restaurant` — L962 **(active)** · remplace L656
- `echanger_jeton_salarie` — L953 **(active)** · remplace L648
- `echanger_slug_portail` — L664
- `effacer_tentatives` — L418
- `entreprise_visible` — L2061
- `hacher_code_bcrypt` — L2167
- `horodater_changement_code_compte` — L1610
- `horodater_changement_code_rh` — L1596
- `ip_pour_cle` — L1943
- `jours_travail_restaurants` — L2745
- `jwt_company_id` — L606
- `jwt_compte_id` — L796
- `jwt_employe_id` — L609
- `jwt_restaurant_id` — L612
- `jwt_role_app` — L603
- `limiter_inscription` — L2092
- `noter_echec_connexion` — L389
- `noter_echec_plafonne` — L2438 **(active)** · remplace L1914
- `passer_commande` — L2862 **(active)** · remplace L1639
- `portail_inscrire_salarie` — L1310
- `portail_lister_salaries` — L1290
- `proteger_cloture_restaurant` — L1013
- `proteger_colonnes_companies` — L1069
- `proteger_compte_restaurant` — L918
- `proteger_fiche_compte_restaurant` — L1514 **(active)** · remplace L1050
- `purger_traces_connexion` — L2555
- `rattacher_compte_restaurant` — L1401 **(active)** · remplace L840, L1113
- `relier_lien_restaurant` — L891
- `restaurant_du_plat` — L1772
- `restaurants_ouverts_salarie` — L3069
- `restaurants_visibles_salarie` — L1353
- `session_compte_valide` — L1561
- `session_rh_valide` — L1547
- `synchroniser_compte_restaurant` — L875
- `tentative_connexion_admin` — L2028
- `verifier_jour_travail_restaurant` — L2704
- `verrouiller_cloture_confirmee` — L1783
- `verrouiller_commande_facturee` — L1806
- `verrouiller_plat_facture` — L2513 **(active)** · remplace L1852
- `verrouiller_suppression_salarie` — L1879

## Policies

- `compte_lit_sa_fiche` — L800
- `compte_lit_ses_partenariats` — L807
- `compte_modifie_sa_fiche` — L803
- `restaurant_confirme_ses_clotures` — L1043 **(active)** · remplace L773
- `restaurant_gere_sa_carte` — L784
- `restaurant_lit_les_commandes` — L1098 **(active)** · remplace L761
- `restaurant_lit_sa_fiche` — L715
- `restaurant_lit_ses_clotures` — L770
- `restaurant_lit_ses_menus` — L1108
- `restaurant_modifie_ses_menus` — L733
- `restaurant_publie_ses_menus` — L729
- `restaurant_retire_ses_menus` — L739
- `rh_gere_les_clotures` — L766
- `rh_gere_les_commandes` — L745
- `rh_gere_ses_menus` — L720
- `rh_gere_ses_restaurants` — L707
- `rh_gere_ses_salaries` — L692
- `rh_lit_les_cartes` — L790
- `rh_lit_ses_paiements` — L779
- `rh_lit_son_entreprise` — L2426 **(active)** · remplace L683, L1093, L1392
- `rh_modifie_son_entreprise` — L686
- `salarie_et_restaurant_lisent_les_menus` — L724
- `salarie_lit_les_menus` — L1105
- `salarie_lit_sa_commande` — L749
- `salarie_lit_sa_fiche` — L696
- `salarie_modifie_sa_commande` — L756
- `salarie_passe_sa_commande` — L752

## Triggers

- `trg_bloquer_ajout_rh_restaurant_avec_compte` — L2788
- `trg_bloquer_plat_sans_restaurant` — L3035
- `trg_bloquer_restaurant_sans_compte` — L2820
- `trg_commandes_plat_supprime` — L3015
- `trg_desactiver_plats_restaurant_supprime` — L3125
- `trg_desactiver_restaurant_sans_compte` — L2839
- `trg_hacher_code_bcrypt` — L2181 **(active)** · remplace L2177
- `trg_horodater_changement_code_compte` — L1620
- `trg_horodater_changement_code_rh` — L1606
- `trg_proteger_cloture_restaurant` — L1038
- `trg_proteger_colonnes_companies` — L1087
- `trg_proteger_compte_restaurant` — L933
- `trg_proteger_fiche_compte_restaurant` — L1064
- `trg_verifier_jour_travail_restaurant` — L2739
- `trg_verrouiller_cloture_confirmee` — L1801
- `trg_verrouiller_commande_facturee` — L1846
- `trg_verrouiller_plat_facture` — L1873
- `trg_verrouiller_suppression_salarie` — L1891

## Index nommés

- `idx_employes_token` — L68
- `idx_employes_company` — L69
- `idx_menus_company_date` — L83
- `idx_commandes_company_date` — L100
- `idx_commandes_employe` — L101
- `idx_restaurants_company` — L176
- `idx_clotures_company_date` — L228
- `idx_paiements_company` — L272
- `idx_plats_restaurant_company` — L291
- `idx_plats_restaurant_restaurant` — L292
- `idx_restaurants_compte` — L312
- `idx_restaurants_company_compte` — L315
- `idx_tentatives_connexion_premier_echec` — L370
- `idx_companies_email_contact` — L444
- `idx_commandes_plat` — L502
- `idx_menus_restaurant` — L503
- `idx_blocages_connexion_bloque_at` — L534

## Contraintes CHECK

- `companies_plan_check` — L252
- `menus_du_jour_ajoute_par_check` — L327
- `acces_rh_code_hash_bcrypt` — L2218
- `comptes_restaurant_code_hash_bcrypt` — L2222

## Blocs de migration (v1.x)

- L8 : v1.12 : la relance prend des verrous exclusifs sur toutes les tables et les garde jusqu'à la fin du script.
- L18 : v1.9 : migrations de données exécutées une seule fois.
- L120 : v1.10 : les colonnes rh_code_hash (hash du code RH, désormais dans acces_rh) et traiteur_token (ancien
- L278 : v1.4 : carte des restaurants. Chaque restaurant saisit ses plats depuis son lien /resto/[token] ;
- L294 : v1.5 : comptes restaurant multi-entreprises. Un restaurant s'inscrit (/resto/inscription), se connecte
- L318 : v1.6 : le restaurant publie lui-même ses menus de la semaine dans ceux de l'entreprise.
- L331 : v1.7 : suppression des accès de démonstration (code RH et liens salariés publiés dans le dépôt).
- L357 : v1.8 : limite des tentatives de connexion (Espace RH, compte restaurant, SuperAdmin).
- L433 : v1.9 : durcissement après l'audit de la base (partie structure).
- L505 : v1.10 (T1, étape A) : le hash du code RH quitte companies, lisible par les rôles salarié, restaurant
- L518 : v1.10 (T7) : date du dernier changement du code d'un compte restaurant. Renseignée par
- L523 : v1.11 : trace des blocages par IP tous identifiants confondus (clés rhipglob: et restoipglob:, plafond
- L539 : v1.12 : bornes sur les textes et les prix écrits par le restaurant et le RH (le serveur coupe déjà à
- L560 : v1.13 : jours de travail du restaurant (1 = lundi … 7 = dimanche), réglés par le compte pour toutes ses
- L616 : v1.8 : plpgsql pour compter les échecs (5 en 15 min → identifiant bloqué 15 min, erreur CP429)
- L698 : v1.10 (T2, étape B) : le portail n'a plus aucun accès direct à employes (il lisait toutes les colonnes,
- L710 : v1.10 (T3, étape B) : le salarié n'a plus aucun accès direct à restaurants (token /resto/..., WhatsApp,
- L811 : v1.8 : plpgsql pour compter les échecs (5 en 15 min → numéro bloqué 15 min, erreur CP429)
- L947 : v1.9 : durcissement après l'audit de la base (fonctions, triggers, politiques).
- L1162 : v1.10 (T1) : code d'accès RH lu dans acces_rh, plus jamais dans companies.
- L1283 : v1.10 (T2) : le portail /c/[slug] ne lit plus et n'écrit plus la table employes en direct.
- L1348 : v1.10 (T3) : le salarié ne lit plus la table restaurants en direct (salarie_lit_les_restaurants
- L1370 : v1.10 (T4) : suppression des colonnes mortes companies.traiteur_token et companies.code_acces.
- L1381 : v1.10 (T5) : suppression du portail entreprise /c/[slug]. Son auto-inscription anonyme n'avait aucun
- L1396 : v1.10 (T6) : le compteur d'essais du code partenaire ne repart plus à zéro après un succès (audit base, C-1).
- L1444 : v1.10 (T6, suite) : régénération des codes partenaires courts (audit base, C-1). Les comptes créés
- L1460 : v1.10 (T7) : le compte restaurant ne lit ni n'écrit plus code_hash (audit base, C-2). Avant, ses
- L1534 : v1.10 (T8) : une session RH ou compte restaurant est révoquée dès que l'accès l'est (audit base, C-3).
- L1625 : v1.10 (T10, étape A) : la commande du salarié passe par une seule fonction qui vérifie tout en base
- L1746 : v1.10 (T11) : une clôture confirmée fige ce qui sera facturé (audit base, H-1). La facture se calcule
- L1896 : v1.10 (T13) : le blocage de connexion ne permet plus de verrouiller le compte d'un autre (audit base,
- L2051 : v1.10 (T14, étape A) : le salarié et le restaurant ne lisent plus toute la fiche entreprise (audit
- L2073 : v1.10 (T15) : suppression des colonnes mortes companies.traiteur_nom, traiteur_telephone et
- L2084 : v1.10 (T16) : limite de débit sur les inscriptions en libre-service (audit base, moyenne). /inscription
- L2111 : v1.10 (T18) : authenticated (tous les JWT signés par le serveur) ne garde que SELECT, INSERT, UPDATE et
- L2133 : v1.10 (T19) : les codes d'accès RH et restaurant sont stockés en bcrypt salé (audit base, moyenne).
- L2210 : v1.12 : NOT VALID, comme les autres invariants. Sur une base reconstruite qui garderait un hash historique
- L2395 : v1.10 (T20) : les nouveaux tokens salarié font 128 bits (16 octets) au lieu de 64.
- L2403 : v1.10 (étape B) : retrait des accès que le code déployé n'utilise plus. Appliqué après le passage de la
- L2404 : v1.10 sur main (2026-11-07) et la vérification en production. À partir de cette relance, ne plus revenir
- L2431 : v1.11 : noter_echec_plafonne garde une trace de chaque blocage par IP tous identifiants confondus
- L2485 : v1.12 : durcissement issu de l'audit de la base du 2026-11-07.
- L2692 : v1.13 : jours de travail du restaurant (colonne comptes_restaurant.jours_travail, créée avant la section 8)
- L2758 : v1.14 : le RH n'ajoute plus de plats au menu pour un restaurant qui a un compte (il publie lui-même
- L2792 : v1.14 (suite) : fin des restaurants sans compte et du lien /resto/[token].
- L2851 : v1.15 : passer_commande durcie (audit base du 2026-11-08). Remplace la définition plus haut, qui reste

## Notes pour l'agent

- Les blocs v1.x sont en fin de fichier et **remplacent** les
  définitions antérieures. La ligne active est la **dernière**
  occurrence.
- Les patterns `DROP ... IF EXISTS ; CREATE ...` sont idempotents :
  l'objet est **actif** après le CREATE.
- **Attention** : une policy droppée **sans** `CREATE` après n'est
  plus active. Exemple dans ce schéma : `salarie_et_restaurant_lisent_les_menus`
  (L724) a été droppée par v1.9 et remplacée par `salarie_lit_les_menus`
  + `restaurant_lit_ses_menus`. Ne pas l'auditer.
- Quand tu lis une fonction ou une policy, **lis la version active**
  (la ligne avec `(active)` ou la seule ligne).
