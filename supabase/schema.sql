-- ==============================================================================
-- CANTINE PRO — SCHÉMA SUPABASE (Sprint Fast-Track 10 Jours)
-- Version: 1.10 — auth RH, restaurants partenaires, clôtures, inscription & abonnements,
--                 comptes restaurant, limite des tentatives, durcissement RLS (audit v1.9),
--                 secrets hors de portée des rôles non RH (v1.10)
-- ==============================================================================

-- Extension pour la génération automatique de tokens aléatoires sécurisés si besoin
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- v1.9 : migrations de données exécutées une seule fois.
-- Ce script est relancé en entier : un UPDATE / INSERT de données nu se rejoue à chaque relance
-- (restaurant fantôme, heure limite remise à 11h10, menus réattribués...). Chaque migration de
-- données est donc enveloppée dans un bloc DO qui consulte cette table, puis s'y inscrit.
-- Créée en tête de fichier car les blocs concernés sont plus bas.
-- Première création sur une base existante (production, déjà en v1.8) : les migrations de données
-- historiques sont marquées comme faites SANS être rejouées. Sur une base neuve (companies absente),
-- rien n'est marqué : elles s'exécutent une fois, sur des tables vides.
DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NULL THEN
        CREATE TABLE public.schema_migrations (
            nom TEXT PRIMARY KEY,
            applique_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        IF to_regclass('public.companies') IS NOT NULL THEN
            INSERT INTO public.schema_migrations (nom) VALUES
                ('v1.2-heure-limite-11h10'),
                ('v1.2-traiteur-vers-restaurant'),
                ('v1.7-acces-demo');
        END IF;
    END IF;
END $$;
-- Table technique : aucun rôle applicatif n'y accède (RLS activée en section 8, aucune politique)
REVOKE ALL ON public.schema_migrations FROM PUBLIC, anon, authenticated;

-- 1. TABLE DES ENTREPRISES PILOTES
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    heure_limite_vote TIME NOT NULL DEFAULT '11:10:00', -- Fin des votes = envoi aux restaurants
    -- v1.10 (T15) : heure_livraison_souhaitee, traiteur_nom et traiteur_telephone (ancien traiteur unique,
    -- repris par la table restaurants en v1.2) ne sont plus créées ; supprimées dans le bloc final.
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABLE DES EMPLOYÉS
CREATE TABLE IF NOT EXISTS public.employes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    telephone TEXT,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'), -- Lien magique: /p/[token]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employes_token ON public.employes(token);
CREATE INDEX IF NOT EXISTS idx_employes_company ON public.employes(company_id);

-- 3. TABLE DES MENUS DU JOUR
CREATE TABLE IF NOT EXISTS public.menus_du_jour (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    titre TEXT NOT NULL,           -- Ex: Thiéboudienne Rouge Penda Mbaye, Yassa Poulet
    description TEXT,
    prix_unitaire INTEGER NOT NULL DEFAULT 1500, -- en Francs CFA (XOF)
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_menus_company_date ON public.menus_du_jour(company_id, date);

-- 4. TABLE DES COMMANDES DU JOUR
CREATE TABLE IF NOT EXISTS public.commandes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
    plat_id UUID REFERENCES public.menus_du_jour(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    statut TEXT NOT NULL CHECK (statut IN ('choisi', 'absent', 'ne_mange_pas')),
    remarque TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Règle clé : 1 seul choix par employé et par date
    CONSTRAINT unique_vote_employe_jour UNIQUE (employe_id, date)
);

CREATE INDEX IF NOT EXISTS idx_commandes_company_date ON public.commandes(company_id, date);
CREATE INDEX IF NOT EXISTS idx_commandes_employe ON public.commandes(employe_id);

-- 5. VUE D'AGRÉGATION EN TEMPS RÉEL (POUR DASHBOARD RH & TRAITEUR)
CREATE OR REPLACE VIEW public.vue_recapitulatif_traiteur AS
SELECT 
    c.id AS company_id,
    c.nom AS company_nom,
    cmd.date,
    m.id AS plat_id,
    COALESCE(m.titre, 'Non spécifié') AS plat_titre,
    COUNT(cmd.id) AS quantite
FROM public.commandes cmd
JOIN public.companies c ON cmd.company_id = c.id
JOIN public.menus_du_jour m ON cmd.plat_id = m.id
WHERE cmd.statut = 'choisi'
GROUP BY c.id, c.nom, cmd.date, m.id, m.titre;

-- 6. ACCÈS RH, PASSERELLE TRAITEUR & CLÔTURES 11H05 (v1.1)
-- Ré-exécutable sur une base existante : les colonnes sont ajoutées si absentes.
-- v1.10 : les colonnes rh_code_hash (hash du code RH, désormais dans acces_rh) et traiteur_token (ancien
-- lien traiteur, remplacé par restaurants.token depuis la v1.2) ne sont plus créées ici ; code_acces non
-- plus (CREATE TABLE ci-dessus). Sinon chaque relance les recréerait, lisibles par les rôles salarié,
-- restaurant et portail. Elles sont supprimées dans le bloc final (v1.10 T4).

ALTER TABLE public.employes
    ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'Général'; -- Ventilation paie par service

ALTER TABLE public.commandes
    ADD COLUMN IF NOT EXISTS modifie_par_rh BOOLEAN NOT NULL DEFAULT false; -- Saisie manuelle du RH

CREATE TABLE IF NOT EXISTS public.clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    recap JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ plat_titre, quantite, prix_unitaire }]
    total_repas INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    envoi_statut TEXT NOT NULL DEFAULT 'en_attente'
        CHECK (envoi_statut IN ('en_attente', 'envoye', 'echec', 'manuel')),
    envoi_erreur TEXT,
    envoye_at TIMESTAMPTZ,
    confirme_at TIMESTAMPTZ, -- Clic "Confirmer" du traiteur
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_cloture_company_jour UNIQUE (company_id, date)
);

-- 7. RESTAURANTS PARTENAIRES (v1.2) : plusieurs restaurants par entreprise
-- Chaque plat du menu appartient à un restaurant ; à la clôture, chaque restaurant
-- reçoit le récapitulatif de ses propres plats et le confirme via /resto/[token].
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS heure_ouverture_vote TIME NOT NULL DEFAULT '08:00:00';

-- Les votes ferment à 11h10, heure de l'envoi aux restaurants (ancien défaut : 11h00)
ALTER TABLE public.companies ALTER COLUMN heure_limite_vote SET DEFAULT '11:10:00';
-- Exécuté une seule fois (v1.9, voir schema_migrations) : sinon une entreprise qui choisit 11h00
-- serait remise à 11h10 à chaque relance
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'v1.2-heure-limite-11h10') THEN
        UPDATE public.companies SET heure_limite_vote = '11:10:00' WHERE heure_limite_vote = '11:00:00';
        INSERT INTO public.schema_migrations (nom) VALUES ('v1.2-heure-limite-11h10');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    telephone_whatsapp TEXT, -- Format E.164 ex: +221770000000
    heure_livraison TIME DEFAULT '12:30:00',
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'), -- Lien: /resto/[token]
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restaurants_company ON public.restaurants(company_id);

ALTER TABLE public.menus_du_jour
    ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL;

ALTER TABLE public.clotures
    ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- Migration : l'ancien traiteur unique devient le premier restaurant de l'entreprise.
-- Son token est repris : les liens /resto/... déjà envoyés continuent de fonctionner.
-- Exécuté une seule fois (v1.9, voir schema_migrations) : sinon chaque relance créait un restaurant
-- fantôme pour toute entreprise sans restaurant et réattribuait les menus d'un restaurant supprimé
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'v1.2-traiteur-vers-restaurant') THEN
        -- v1.10 : plus aucune reprise des anciennes colonnes traiteur_* et heure_livraison_souhaitee de
        -- companies (supprimées en T4 et T15) ; heure_livraison prend la valeur par défaut de restaurants.
        -- Ce bloc ne s'exécute que sur une base neuve, où il n'y a aucune entreprise.
        INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, token)
        SELECT c.id,
               'Restaurant partenaire',
               NULL,
               encode(gen_random_bytes(12), 'hex')
        FROM public.companies c
        WHERE NOT EXISTS (SELECT 1 FROM public.restaurants r WHERE r.company_id = c.id);

        UPDATE public.menus_du_jour m
        SET restaurant_id = (
            SELECT r.id FROM public.restaurants r WHERE r.company_id = m.company_id ORDER BY r.created_at LIMIT 1
        )
        WHERE m.restaurant_id IS NULL;

        UPDATE public.clotures cl
        SET restaurant_id = (
            SELECT r.id FROM public.restaurants r WHERE r.company_id = cl.company_id ORDER BY r.created_at LIMIT 1
        )
        WHERE cl.restaurant_id IS NULL;

        INSERT INTO public.schema_migrations (nom) VALUES ('v1.2-traiteur-vers-restaurant');
    END IF;
END $$;

-- Une clôture par restaurant et par jour (au lieu d'une par entreprise)
ALTER TABLE public.clotures DROP CONSTRAINT IF EXISTS unique_cloture_company_jour;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_cloture_restaurant_jour') THEN
        ALTER TABLE public.clotures
            ADD CONSTRAINT unique_cloture_restaurant_jour UNIQUE (restaurant_id, date);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clotures_company_date ON public.clotures(company_id, date);

-- Qui a confirmé la commande : le restaurant (clic sur son lien) ou le RH (après accord par téléphone)
ALTER TABLE public.clotures
    ADD COLUMN IF NOT EXISTS confirme_par TEXT CHECK (confirme_par IN ('restaurant', 'rh'));
UPDATE public.clotures SET confirme_par = 'restaurant' WHERE confirme_at IS NOT NULL AND confirme_par IS NULL;

-- 7 bis. INSCRIPTION EN LIBRE-SERVICE & ABONNEMENTS (v1.3)
-- Les entreprises déjà présentes passent en « active » sans date de fin (pilotes gratuits) ;
-- les nouvelles inscriptions démarrent en « trial » (14 jours via trial_ends_at).
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS responsable_nom TEXT,
    ADD COLUMN IF NOT EXISTS email_contact TEXT,
    ADD COLUMN IF NOT EXISTS telephone_contact TEXT,
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'pro',
    ADD COLUMN IF NOT EXISTS statut_abonnement TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS abonnement_fin DATE; -- Payé jusqu'au (NULL = sans échéance)

ALTER TABLE public.companies ALTER COLUMN statut_abonnement SET DEFAULT 'trial';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_plan_check') THEN
        ALTER TABLE public.companies
            ADD CONSTRAINT companies_plan_check CHECK (plan IN ('starter', 'pro', 'business'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_statut_abonnement_check') THEN
        ALTER TABLE public.companies
            ADD CONSTRAINT companies_statut_abonnement_check
            CHECK (statut_abonnement IN ('trial', 'active', 'suspended', 'cancelled'));
    END IF;
END $$;

-- Paiements reçus (Wave direct pendant le pilote, saisis depuis la console /admin)
CREATE TABLE IF NOT EXISTS public.paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    montant INTEGER NOT NULL, -- FCFA
    mode TEXT NOT NULL DEFAULT 'wave',
    reference TEXT,
    periode_fin DATE NOT NULL, -- L'abonnement est payé jusqu'à cette date
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paiements_company ON public.paiements(company_id);

-- Jours de service de l'entreprise (1 = lundi … 7 = dimanche) : grille des menus, duplication, commandes
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS jours_travail SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}';

-- v1.4 : carte des restaurants. Chaque restaurant saisit ses plats depuis son lien /resto/[token] ;
-- le RH les sélectionne pour composer le menu du jour (copie dans menus_du_jour).
CREATE TABLE IF NOT EXISTS public.plats_restaurant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    titre TEXT NOT NULL,
    description TEXT,
    prix_unitaire INTEGER NOT NULL DEFAULT 1500, -- FCFA
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plats_restaurant_company ON public.plats_restaurant(company_id);
CREATE INDEX IF NOT EXISTS idx_plats_restaurant_restaurant ON public.plats_restaurant(restaurant_id);

-- v1.5 : comptes restaurant multi-entreprises. Un restaurant s'inscrit (/resto/inscription), se connecte
-- (/resto/login, téléphone + code) et sert plusieurs entreprises. Chaque ligne de public.restaurants
-- reste le partenariat avec UNE entreprise (heure de livraison, carte, clôtures) et pointe vers son compte.
-- Le RH relie un compte à son entreprise avec le code partenaire que le restaurant lui communique.
CREATE TABLE IF NOT EXISTS public.comptes_restaurant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    telephone_whatsapp TEXT UNIQUE NOT NULL, -- Format E.164, sert aussi d'identifiant de connexion
    ville TEXT,
    code_hash TEXT NOT NULL, -- bcrypt du sha256 du code d'accès (v1.10 T19)
    code_partenaire TEXT UNIQUE NOT NULL DEFAULT upper(encode(gen_random_bytes(4), 'hex')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS compte_id UUID REFERENCES public.comptes_restaurant(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_restaurants_compte ON public.restaurants(compte_id);

-- Un compte n'est relié qu'une fois à une même entreprise
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_company_compte
    ON public.restaurants(company_id, compte_id) WHERE compte_id IS NOT NULL;

-- v1.6 : le restaurant publie lui-même ses menus de la semaine dans ceux de l'entreprise.
-- ajoute_par indique l'origine du plat (affichée au RH, qui garde la main pour le retirer).
ALTER TABLE public.menus_du_jour
    ADD COLUMN IF NOT EXISTS ajoute_par TEXT NOT NULL DEFAULT 'rh';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menus_du_jour_ajoute_par_check') THEN
        ALTER TABLE public.menus_du_jour
            ADD CONSTRAINT menus_du_jour_ajoute_par_check CHECK (ajoute_par IN ('rh', 'restaurant'));
    END IF;
END $$;

-- v1.7 : suppression des accès de démonstration (code RH et liens salariés publiés dans le dépôt).
-- Les liens token-demo-* sont désactivés et remplacés par un token aléatoire ; le code RH de démo
-- n'est retiré que s'il n'a jamais été changé (une entreprise qui l'a changé garde le sien).
-- Exécuté une seule fois (v1.9, voir schema_migrations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'v1.7-acces-demo') THEN
        UPDATE public.employes
        SET token = encode(gen_random_bytes(8), 'hex'), is_active = false
        WHERE token LIKE 'token-demo-%';

        -- v1.10 : la colonne n'existe plus sur une base neuve (le code RH est dans acces_rh)
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'rh_code_hash') THEN
            EXECUTE $q$
                UPDATE public.companies
                SET rh_code_hash = NULL
                WHERE slug = 'pilote-thies'
                  AND rh_code_hash = encode(digest('pilote-thies-2026', 'sha256'), 'hex')
            $q$;
        END IF;

        INSERT INTO public.schema_migrations (nom) VALUES ('v1.7-acces-demo');
    END IF;
END $$;

-- v1.8 : limite des tentatives de connexion (Espace RH, compte restaurant, SuperAdmin).
-- Le compteur est en base et non dans Next.js : la clé anon est publique et echanger_acces_* peut être
-- appelée directement sur Supabase. Après 5 échecs en 15 minutes sur un même identifiant, celui-ci est
-- bloqué 15 minutes. Pas de company_id : la table est indexée par identifiant de connexion, sans politique
-- (seules les fonctions SECURITY DEFINER ci-dessous et la clé service_role y accèdent).
CREATE TABLE IF NOT EXISTS public.tentatives_connexion (
    cle TEXT PRIMARY KEY, -- 'rh:<slug ou e-mail>', 'resto:<téléphone>' ou 'admin'
    echecs INTEGER NOT NULL DEFAULT 0,
    premier_echec_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    bloque_jusqu_a TIMESTAMPTZ
);

-- Le ménage filtre sur premier_echec_at à chaque échec
CREATE INDEX IF NOT EXISTS idx_tentatives_connexion_premier_echec
    ON public.tentatives_connexion (premier_echec_at);

-- Supabase accorde par défaut tous les droits sur une nouvelle table à anon et authenticated :
-- la RLS sans politique les bloque déjà, ce REVOKE protège aussi d'une RLS désactivée par erreur
REVOKE ALL ON public.tentatives_connexion FROM PUBLIC, anon, authenticated;

-- Lève une erreur CP429 si l'identifiant est bloqué
CREATE OR REPLACE FUNCTION public.controler_tentatives(p_cle TEXT)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.tentatives_connexion WHERE cle = p_cle AND bloque_jusqu_a > now()) THEN
        RAISE EXCEPTION 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' USING ERRCODE = 'CP429';
    END IF;
END;
$$;

-- Compte un échec ; le compteur repart à zéro si le premier échec date de plus de 15 minutes
CREATE OR REPLACE FUNCTION public.noter_echec_connexion(p_cle TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- Ménage : les identifiants inventés par un attaquant ne s'accumulent pas.
    -- Borné à 100 lignes (index sur premier_echec_at) et sans attendre les lignes verrouillées ailleurs.
    DELETE FROM public.tentatives_connexion
    WHERE cle IN (
        SELECT cle FROM public.tentatives_connexion
        WHERE premier_echec_at < now() - interval '1 day'
          AND (bloque_jusqu_a IS NULL OR bloque_jusqu_a < now())
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    );

    INSERT INTO public.tentatives_connexion AS t (cle, echecs, premier_echec_at)
    VALUES (p_cle, 1, now())
    ON CONFLICT (cle) DO UPDATE SET
        echecs = CASE WHEN t.premier_echec_at < now() - interval '15 minutes' THEN 1 ELSE t.echecs + 1 END,
        bloque_jusqu_a = CASE WHEN t.premier_echec_at < now() - interval '15 minutes' THEN NULL ELSE t.bloque_jusqu_a END,
        premier_echec_at = CASE WHEN t.premier_echec_at < now() - interval '15 minutes' THEN now() ELSE t.premier_echec_at END;

    UPDATE public.tentatives_connexion
    SET bloque_jusqu_a = now() + interval '15 minutes'
    WHERE cle = p_cle AND echecs >= 5;
END;
$$;

-- Connexion réussie : l'identifiant repart de zéro
CREATE OR REPLACE FUNCTION public.effacer_tentatives(p_cle TEXT)
RETURNS VOID
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM public.tentatives_connexion WHERE cle = p_cle
$$;

-- Supabase accorde par défaut EXECUTE à anon et authenticated : le retirer explicitement.
-- Les echanger_acces_* (SECURITY DEFINER) les appellent avec les droits du propriétaire.
REVOKE EXECUTE ON FUNCTION public.controler_tentatives(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.noter_echec_connexion(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.effacer_tentatives(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.controler_tentatives(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.noter_echec_connexion(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.effacer_tentatives(TEXT) TO service_role;

-- v1.9 : durcissement après l'audit de la base (partie structure).
-- Les fonctions, triggers et politiques de la v1.9 sont en fin de fichier : placés ici, ils seraient
-- écrasés à chaque relance par les CREATE OR REPLACE / CREATE POLICY de la section 9.

-- E-mail de connexion RH unique, sans tenir compte de la casse (index créé seulement sans doublon)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.companies WHERE email_contact IS NOT NULL
               GROUP BY lower(email_contact) HAVING count(*) > 1) THEN
        RAISE WARNING 'Doublons dans companies.email_contact : index UNIQUE non créé, dédoublonner puis relancer.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_email_contact
            ON public.companies (lower(email_contact)) WHERE email_contact IS NOT NULL;
    END IF;
END $$;

-- Historique de facturation conservé : plus de suppression en cascade des clôtures et paiements
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass AS tbl, c.confrelid::regclass AS cible, c.conname, a.attname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.confdeltype <> 'r'
          AND ((c.conrelid = 'public.clotures'::regclass
                AND c.confrelid IN ('public.restaurants'::regclass, 'public.companies'::regclass))
            OR (c.conrelid = 'public.paiements'::regclass AND c.confrelid = 'public.companies'::regclass))
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE RESTRICT',
                       r.tbl, r.conname, r.attname, r.cible);
    END LOOP;
END $$;

-- Code partenaire des nouveaux comptes : 48 bits au lieu de 32 (les codes existants restent valides)
ALTER TABLE public.comptes_restaurant
    ALTER COLUMN code_partenaire SET DEFAULT upper(encode(gen_random_bytes(6), 'hex'));

-- Invariants (NOT VALID : les lignes existantes ne sont pas contrôlées, les nouvelles écritures oui)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commandes_choisi_a_un_plat') THEN
        ALTER TABLE public.commandes ADD CONSTRAINT commandes_choisi_a_un_plat
            CHECK (statut <> 'choisi' OR plat_id IS NOT NULL) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clotures_confirme_par_renseigne') THEN
        ALTER TABLE public.clotures ADD CONSTRAINT clotures_confirme_par_renseigne
            CHECK (confirme_at IS NULL OR confirme_par IS NOT NULL) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clotures_total_repas_positif') THEN
        ALTER TABLE public.clotures ADD CONSTRAINT clotures_total_repas_positif
            CHECK (total_repas >= 0) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paiements_montant_positif') THEN
        ALTER TABLE public.paiements ADD CONSTRAINT paiements_montant_positif
            CHECK (montant > 0) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menus_prix_positif') THEN
        ALTER TABLE public.menus_du_jour ADD CONSTRAINT menus_prix_positif
            CHECK (prix_unitaire >= 0) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plats_restaurant_prix_positif') THEN
        ALTER TABLE public.plats_restaurant ADD CONSTRAINT plats_restaurant_prix_positif
            CHECK (prix_unitaire >= 0) NOT VALID;
    END IF;
END $$;

-- Index des clés étrangères filtrées par la RLS et par les suppressions de plats
CREATE INDEX IF NOT EXISTS idx_commandes_plat ON public.commandes(plat_id);
CREATE INDEX IF NOT EXISTS idx_menus_restaurant ON public.menus_du_jour(restaurant_id, date);

-- v1.10 (T1, étape A) : le hash du code RH quitte companies, lisible par les rôles salarié, restaurant
-- et portail (et qui vaut le code : echanger_acces_rh accepte le hash). Table sans aucune politique :
-- seules les fonctions SECURITY DEFINER (echanger_acces_rh, changer_code_rh) et le service_role la lisent.
-- Étape B : companies.rh_code_hash est supprimée en fin de fichier, après recopie (bloc final v1.10).
CREATE TABLE IF NOT EXISTS public.acces_rh (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, -- bcrypt du sha256 du code d'accès RH (v1.10 T19)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON public.acces_rh FROM PUBLIC, anon, authenticated;
-- La copie des hash existants est faite dans le bloc final, juste après la création du trigger de
-- synchronisation : aucune écriture de l'ancien code ne peut ainsi passer entre la copie et le trigger.

-- v1.10 (T7) : date du dernier changement du code d'un compte restaurant. Renseignée par
-- changer_code_compte_restaurant (bloc final) ; servira à révoquer les sessions ouvertes avant (T8).
ALTER TABLE public.comptes_restaurant
    ADD COLUMN IF NOT EXISTS code_change_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 8. SÉCURITÉ : RLS ACTIVÉE SUR TOUTES LES TABLES
-- Les politiques (section 9) n'ouvrent l'accès qu'aux requêtes portant un JWT signé par le serveur
-- Next.js. La clé anon seule ne lit aucune table (tokens employés inclus).
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus_du_jour ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clotures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plats_restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptes_restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tentatives_connexion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acces_rh ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.vue_recapitulatif_traiteur SET (security_invoker = true);

-- 9. POLITIQUES RLS : PATTERN HYBRIDE « TOKEN URL -> JWT COURT »
-- 1) Le serveur échange l'identifiant reçu (code RH, token salarié, token restaurant, slug du portail)
--    via une fonction SECURITY DEFINER ci-dessous, appelée avec la clé anon.
-- 2) Il signe un JWT ES256 de quelques minutes (clé privée importée dans Supabase > JWT Keys) contenant :
--    role = authenticated, role_app (rh | salarie | restaurant | portail), company_id,
--    et employe_id ou restaurant_id selon le cas.
-- 3) Les politiques ci-dessous filtrent chaque table sur ces claims.
-- La console SuperAdmin, le cron et l'inscription d'une entreprise gardent la clé service_role
-- (accès multi-entreprises par nature) : elle contourne la RLS.

-- Lecture des claims du JWT de la requête
CREATE OR REPLACE FUNCTION public.jwt_role_app() RETURNS TEXT
LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role_app' $$;

CREATE OR REPLACE FUNCTION public.jwt_company_id() RETURNS UUID
LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() ->> 'company_id', '')::uuid $$;

CREATE OR REPLACE FUNCTION public.jwt_employe_id() RETURNS UUID
LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() ->> 'employe_id', '')::uuid $$;

CREATE OR REPLACE FUNCTION public.jwt_restaurant_id() RETURNS UUID
LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() ->> 'restaurant_id', '')::uuid $$;

-- Fonctions d'échange (seul accès possible avec la clé anon, ne renvoient que des identifiants)
-- v1.8 : plpgsql pour compter les échecs (5 en 15 min → identifiant bloqué 15 min, erreur CP429)
CREATE OR REPLACE FUNCTION public.echanger_acces_rh(p_identifiant TEXT, p_code_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cle TEXT := 'rh:' || left(lower(trim(coalesce(p_identifiant, ''))), 100);
    v_id UUID;
BEGIN
    -- Une tentative à la fois par identifiant (verrou libéré au commit) : une rafale de requêtes
    -- parallèles ne peut pas passer le contrôle avant que les échecs précédents soient comptés
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    SELECT c.id INTO v_id
    FROM public.companies c
    WHERE CASE WHEN position('@' IN p_identifiant) > 0
               THEN c.email_contact = p_identifiant
               ELSE c.slug = p_identifiant END
      AND c.is_active
      AND c.rh_code_hash IS NOT NULL
      AND lower(c.rh_code_hash) = lower(p_code_hash)
    LIMIT 1;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_connexion(v_cle);
    ELSE
        PERFORM public.effacer_tentatives(v_cle);
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.echanger_jeton_salarie(p_token TEXT)
RETURNS TABLE (employe_id UUID, company_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.id, e.company_id FROM public.employes e
    WHERE e.token = p_token AND e.is_active
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.echanger_jeton_restaurant(p_token TEXT)
RETURNS TABLE (restaurant_id UUID, company_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, r.company_id FROM public.restaurants r
    WHERE r.token = p_token
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.echanger_slug_portail(p_slug TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.id FROM public.companies c
    WHERE c.slug = p_slug AND c.is_active
    LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.echanger_jeton_salarie(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.echanger_jeton_restaurant(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.echanger_slug_portail(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.echanger_jeton_salarie(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.echanger_jeton_restaurant(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.echanger_slug_portail(TEXT) TO anon, authenticated, service_role;

-- companies
DROP POLICY IF EXISTS rh_lit_son_entreprise ON public.companies;
CREATE POLICY rh_lit_son_entreprise ON public.companies FOR SELECT TO authenticated
    USING (id = public.jwt_company_id());
DROP POLICY IF EXISTS rh_modifie_son_entreprise ON public.companies;
CREATE POLICY rh_modifie_son_entreprise ON public.companies FOR UPDATE TO authenticated
    USING (public.jwt_role_app() = 'rh' AND id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND id = public.jwt_company_id());

-- employes
DROP POLICY IF EXISTS rh_gere_ses_salaries ON public.employes;
CREATE POLICY rh_gere_ses_salaries ON public.employes FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS salarie_lit_sa_fiche ON public.employes;
CREATE POLICY salarie_lit_sa_fiche ON public.employes FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'salarie' AND id = public.jwt_employe_id());
-- v1.10 (T2, étape B) : le portail n'a plus aucun accès direct à employes (il lisait toutes les colonnes,
-- dont le token de chaque salarié, et pouvait choisir token / is_active / service à l'insertion).
-- Il passe par portail_lister_salaries et portail_inscrire_salarie (bloc final). Exception validée à la
-- règle « ne pas modifier les blocs existants » : sinon chaque relance recréerait ces politiques.
DROP POLICY IF EXISTS portail_lit_les_salaries ON public.employes;
DROP POLICY IF EXISTS portail_inscrit_un_salarie ON public.employes;

-- restaurants
DROP POLICY IF EXISTS rh_gere_ses_restaurants ON public.restaurants;
CREATE POLICY rh_gere_ses_restaurants ON public.restaurants FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());
-- v1.10 (T3, étape B) : le salarié n'a plus aucun accès direct à restaurants (token /resto/..., WhatsApp,
-- compte_id). Il passe par restaurants_visibles_salarie (bloc final). Exception validée à la règle
-- « ne pas modifier les blocs existants » : sinon chaque relance recréerait cette politique.
DROP POLICY IF EXISTS salarie_lit_les_restaurants ON public.restaurants;
DROP POLICY IF EXISTS restaurant_lit_sa_fiche ON public.restaurants;
CREATE POLICY restaurant_lit_sa_fiche ON public.restaurants FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND id = public.jwt_restaurant_id());

-- menus_du_jour
DROP POLICY IF EXISTS rh_gere_ses_menus ON public.menus_du_jour;
CREATE POLICY rh_gere_ses_menus ON public.menus_du_jour FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS salarie_et_restaurant_lisent_les_menus ON public.menus_du_jour;
CREATE POLICY salarie_et_restaurant_lisent_les_menus ON public.menus_du_jour FOR SELECT TO authenticated
    USING (public.jwt_role_app() IN ('salarie', 'restaurant') AND company_id = public.jwt_company_id());

-- menus_du_jour (v1.6) : le restaurant publie, modifie et retire ses propres plats dans les menus de l'entreprise
DROP POLICY IF EXISTS restaurant_publie_ses_menus ON public.menus_du_jour;
CREATE POLICY restaurant_publie_ses_menus ON public.menus_du_jour FOR INSERT TO authenticated
    WITH CHECK (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
                AND company_id = public.jwt_company_id() AND ajoute_par = 'restaurant');
DROP POLICY IF EXISTS restaurant_modifie_ses_menus ON public.menus_du_jour;
CREATE POLICY restaurant_modifie_ses_menus ON public.menus_du_jour FOR UPDATE TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
           AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
                AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS restaurant_retire_ses_menus ON public.menus_du_jour;
CREATE POLICY restaurant_retire_ses_menus ON public.menus_du_jour FOR DELETE TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
           AND company_id = public.jwt_company_id());

-- commandes
DROP POLICY IF EXISTS rh_gere_les_commandes ON public.commandes;
CREATE POLICY rh_gere_les_commandes ON public.commandes FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS salarie_lit_sa_commande ON public.commandes;
CREATE POLICY salarie_lit_sa_commande ON public.commandes FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'salarie' AND employe_id = public.jwt_employe_id());
DROP POLICY IF EXISTS salarie_passe_sa_commande ON public.commandes;
CREATE POLICY salarie_passe_sa_commande ON public.commandes FOR INSERT TO authenticated
    WITH CHECK (public.jwt_role_app() = 'salarie' AND employe_id = public.jwt_employe_id()
                AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS salarie_modifie_sa_commande ON public.commandes;
CREATE POLICY salarie_modifie_sa_commande ON public.commandes FOR UPDATE TO authenticated
    USING (public.jwt_role_app() = 'salarie' AND employe_id = public.jwt_employe_id())
    WITH CHECK (public.jwt_role_app() = 'salarie' AND employe_id = public.jwt_employe_id()
                AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS restaurant_lit_les_commandes ON public.commandes;
CREATE POLICY restaurant_lit_les_commandes ON public.commandes FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND company_id = public.jwt_company_id());

-- clotures
DROP POLICY IF EXISTS rh_gere_les_clotures ON public.clotures;
CREATE POLICY rh_gere_les_clotures ON public.clotures FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS restaurant_lit_ses_clotures ON public.clotures;
CREATE POLICY restaurant_lit_ses_clotures ON public.clotures FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id());
DROP POLICY IF EXISTS restaurant_confirme_ses_clotures ON public.clotures;
CREATE POLICY restaurant_confirme_ses_clotures ON public.clotures FOR UPDATE TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id())
    WITH CHECK (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id());

-- paiements (écriture réservée à la console SuperAdmin, clé service_role)
DROP POLICY IF EXISTS rh_lit_ses_paiements ON public.paiements;
CREATE POLICY rh_lit_ses_paiements ON public.paiements FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());

-- plats_restaurant (carte) : le restaurant gère la sienne, le RH la consulte pour composer ses menus
DROP POLICY IF EXISTS restaurant_gere_sa_carte ON public.plats_restaurant;
CREATE POLICY restaurant_gere_sa_carte ON public.plats_restaurant FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
           AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
                AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS rh_lit_les_cartes ON public.plats_restaurant;
CREATE POLICY rh_lit_les_cartes ON public.plats_restaurant FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());

-- comptes_restaurant (v1.5) : claim role_app = 'compte_restaurant' + compte_id.
-- Le compte liste ses partenariats ; pour agir sur une entreprise, le serveur signe ensuite un JWT
-- role_app = 'restaurant' limité à ce partenariat (politiques « restaurant » ci-dessus).
CREATE OR REPLACE FUNCTION public.jwt_compte_id() RETURNS UUID
LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() ->> 'compte_id', '')::uuid $$;

DROP POLICY IF EXISTS compte_lit_sa_fiche ON public.comptes_restaurant;
CREATE POLICY compte_lit_sa_fiche ON public.comptes_restaurant FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'compte_restaurant' AND id = public.jwt_compte_id());
DROP POLICY IF EXISTS compte_modifie_sa_fiche ON public.comptes_restaurant;
CREATE POLICY compte_modifie_sa_fiche ON public.comptes_restaurant FOR UPDATE TO authenticated
    USING (public.jwt_role_app() = 'compte_restaurant' AND id = public.jwt_compte_id())
    WITH CHECK (public.jwt_role_app() = 'compte_restaurant' AND id = public.jwt_compte_id());
DROP POLICY IF EXISTS compte_lit_ses_partenariats ON public.restaurants;
CREATE POLICY compte_lit_ses_partenariats ON public.restaurants FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'compte_restaurant' AND compte_id = public.jwt_compte_id());

-- Connexion d'un compte restaurant : téléphone + empreinte du code -> id du compte
-- v1.8 : plpgsql pour compter les échecs (5 en 15 min → numéro bloqué 15 min, erreur CP429)
CREATE OR REPLACE FUNCTION public.echanger_acces_compte_restaurant(p_telephone TEXT, p_code_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cle TEXT := 'resto:' || left(trim(coalesce(p_telephone, '')), 50);
    v_id UUID;
BEGIN
    -- Une tentative à la fois par numéro (voir echanger_acces_rh)
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    SELECT c.id INTO v_id FROM public.comptes_restaurant c
    WHERE c.telephone_whatsapp = p_telephone
      AND c.is_active
      AND lower(c.code_hash) = lower(p_code_hash)
    LIMIT 1;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_connexion(v_cle);
    ELSE
        PERFORM public.effacer_tentatives(v_cle);
    END IF;
    RETURN v_id;
END;
$$;

-- Le RH relie un compte restaurant à son entreprise grâce au code partenaire.
-- Si le partenariat existe déjà, il est simplement réactivé.
CREATE OR REPLACE FUNCTION public.rattacher_compte_restaurant(p_code TEXT, p_heure_livraison TIME)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compte public.comptes_restaurant%ROWTYPE;
    v_company UUID := public.jwt_company_id();
    v_id UUID;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'rh' OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;

    SELECT * INTO v_compte FROM public.comptes_restaurant
    WHERE code_partenaire = upper(trim(p_code)) AND is_active;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('cantine.rattachement', 'on', true);

    SELECT id INTO v_id FROM public.restaurants WHERE company_id = v_company AND compte_id = v_compte.id;
    IF v_id IS NOT NULL THEN
        UPDATE public.restaurants SET is_active = true WHERE id = v_id;
        RETURN v_id;
    END IF;

    INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, heure_livraison, compte_id)
    VALUES (v_company, v_compte.nom, v_compte.telephone_whatsapp, COALESCE(p_heure_livraison, '12:30:00'), v_compte.id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Après modification du profil, le nom et le WhatsApp du compte sont recopiés sur ses partenariats
-- (c'est ce numéro qui reçoit le récapitulatif de chaque entreprise).
CREATE OR REPLACE FUNCTION public.synchroniser_compte_restaurant()
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'compte_restaurant' THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    PERFORM set_config('cantine.rattachement', 'on', true);
    UPDATE public.restaurants r
    SET nom = c.nom, telephone_whatsapp = c.telephone_whatsapp
    FROM public.comptes_restaurant c
    WHERE c.id = public.jwt_compte_id() AND r.compte_id = c.id;
END;
$$;

-- Un compte connecté reprend un lien /resto/[token] reçu d'une entreprise avant d'avoir son compte
CREATE OR REPLACE FUNCTION public.relier_lien_restaurant(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compte UUID := public.jwt_compte_id();
    v_ligne public.restaurants%ROWTYPE;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'compte_restaurant' OR v_compte IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    SELECT * INTO v_ligne FROM public.restaurants WHERE token = p_token;
    IF NOT FOUND OR (v_ligne.compte_id IS NOT NULL AND v_ligne.compte_id <> v_compte) THEN
        RETURN NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM public.restaurants
               WHERE company_id = v_ligne.company_id AND compte_id = v_compte AND id <> v_ligne.id) THEN
        RAISE EXCEPTION 'Cette entreprise est déjà reliée à votre compte.';
    END IF;
    UPDATE public.restaurants r
    SET compte_id = v_compte, nom = c.nom, telephone_whatsapp = c.telephone_whatsapp
    FROM public.comptes_restaurant c
    WHERE c.id = v_compte AND r.id = v_ligne.id;
    RETURN v_ligne.id;
END;
$$;

-- Le RH ne peut pas renseigner compte_id lui-même : uniquement via rattacher_compte_restaurant
CREATE OR REPLACE FUNCTION public.proteger_compte_restaurant()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF public.jwt_role_app() = 'rh' AND current_setting('cantine.rattachement', true) IS DISTINCT FROM 'on' THEN
        IF (TG_OP = 'INSERT' AND NEW.compte_id IS NOT NULL)
           OR (TG_OP = 'UPDATE' AND NEW.compte_id IS DISTINCT FROM OLD.compte_id) THEN
            RAISE EXCEPTION 'Le compte restaurant se relie avec son code partenaire.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_compte_restaurant ON public.restaurants;
CREATE TRIGGER trg_proteger_compte_restaurant
    BEFORE INSERT OR UPDATE ON public.restaurants
    FOR EACH ROW EXECUTE FUNCTION public.proteger_compte_restaurant();

REVOKE EXECUTE ON FUNCTION public.echanger_acces_compte_restaurant(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rattacher_compte_restaurant(TEXT, TIME) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.synchroniser_compte_restaurant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_compte_restaurant(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rattacher_compte_restaurant(TEXT, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION public.synchroniser_compte_restaurant() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.relier_lien_restaurant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relier_lien_restaurant(TEXT) TO authenticated;

-- ==============================================================================
-- v1.9 : durcissement après l'audit de la base (fonctions, triggers, politiques).
-- Bloc volontairement en fin de fichier : il remplace des objets de la section 9 et doit donc
-- s'exécuter après eux à chaque relance. Garder ce bloc (et les suivants) en dernier.
-- ==============================================================================

-- 1. Échanges de jetons : entreprise, partenariat et compte restaurant doivent être actifs
CREATE OR REPLACE FUNCTION public.echanger_jeton_salarie(p_token TEXT)
RETURNS TABLE (employe_id UUID, company_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.id, e.company_id FROM public.employes e
    JOIN public.companies c ON c.id = e.company_id
    WHERE e.token = p_token AND e.is_active AND c.is_active
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.echanger_jeton_restaurant(p_token TEXT)
RETURNS TABLE (restaurant_id UUID, company_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, r.company_id FROM public.restaurants r
    JOIN public.companies c ON c.id = r.company_id
    LEFT JOIN public.comptes_restaurant cr ON cr.id = r.compte_id
    WHERE r.token = p_token AND r.is_active AND c.is_active
      AND (r.compte_id IS NULL OR cr.is_active)
    LIMIT 1
$$;

-- Connexion RH : e-mail comparé sans tenir compte de la casse (index unique lower(email_contact))
CREATE OR REPLACE FUNCTION public.echanger_acces_rh(p_identifiant TEXT, p_code_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ident TEXT := lower(trim(coalesce(p_identifiant, '')));
    v_cle TEXT := 'rh:' || left(v_ident, 100);
    v_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    SELECT c.id INTO v_id
    FROM public.companies c
    WHERE CASE WHEN position('@' IN v_ident) > 0
               THEN lower(c.email_contact) = v_ident
               ELSE c.slug = v_ident END
      AND c.is_active
      AND c.rh_code_hash IS NOT NULL
      AND lower(c.rh_code_hash) = lower(p_code_hash)
    LIMIT 1;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_connexion(v_cle);
    ELSE
        PERFORM public.effacer_tentatives(v_cle);
    END IF;
    RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.echanger_jeton_salarie(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.echanger_jeton_restaurant(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_jeton_salarie(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.echanger_jeton_restaurant(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT) TO anon, authenticated, service_role;

-- 2. Clôtures : le restaurant ne peut que confirmer (aucune autre colonne, pas de retour en arrière).
-- Liste blanche : toute colonne autre que confirme_at / confirme_par est figée, y compris les futures.
CREATE OR REPLACE FUNCTION public.proteger_cloture_restaurant()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() = 'restaurant' THEN
        IF (to_jsonb(NEW) - 'confirme_at' - 'confirme_par')
           IS DISTINCT FROM (to_jsonb(OLD) - 'confirme_at' - 'confirme_par') THEN
            RAISE EXCEPTION 'Un restaurant ne peut que confirmer sa commande.';
        END IF;
        IF OLD.confirme_at IS NOT NULL THEN
            -- Déjà confirmée : ni annulation ni réécriture
            NEW.confirme_at := OLD.confirme_at;
            NEW.confirme_par := OLD.confirme_par;
        ELSIF NEW.confirme_at IS NOT NULL THEN
            -- Confirmation : l'heure est celle du serveur, pas celle envoyée par le client
            NEW.confirme_at := now();
            NEW.confirme_par := 'restaurant';
        ELSE
            -- Pas de confirmation : confirme_par ne bouge pas
            NEW.confirme_par := OLD.confirme_par;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_cloture_restaurant ON public.clotures;
CREATE TRIGGER trg_proteger_cloture_restaurant
    BEFORE UPDATE ON public.clotures
    FOR EACH ROW EXECUTE FUNCTION public.proteger_cloture_restaurant();

DROP POLICY IF EXISTS restaurant_confirme_ses_clotures ON public.clotures;
CREATE POLICY restaurant_confirme_ses_clotures ON public.clotures FOR UPDATE TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
           AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'restaurant' AND restaurant_id = public.jwt_restaurant_id()
                AND company_id = public.jwt_company_id());

-- 3. Compte restaurant : is_active et code partenaire réservés au SuperAdmin
CREATE OR REPLACE FUNCTION public.proteger_fiche_compte_restaurant()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() = 'compte_restaurant'
       AND (NEW.id IS DISTINCT FROM OLD.id
            OR NEW.code_partenaire IS DISTINCT FROM OLD.code_partenaire
            OR NEW.is_active IS DISTINCT FROM OLD.is_active
            OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'Colonne réservée à la console SuperAdmin.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_fiche_compte_restaurant ON public.comptes_restaurant;
CREATE TRIGGER trg_proteger_fiche_compte_restaurant
    BEFORE UPDATE ON public.comptes_restaurant
    FOR EACH ROW EXECUTE FUNCTION public.proteger_fiche_compte_restaurant();

-- 4. Entreprise : abonnement, activation et slug réservés au SuperAdmin (service_role, sans role_app)
CREATE OR REPLACE FUNCTION public.proteger_colonnes_companies()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() IS NOT NULL
       AND (NEW.id IS DISTINCT FROM OLD.id
            OR NEW.slug IS DISTINCT FROM OLD.slug
            OR NEW.plan IS DISTINCT FROM OLD.plan
            OR NEW.statut_abonnement IS DISTINCT FROM OLD.statut_abonnement
            OR NEW.abonnement_fin IS DISTINCT FROM OLD.abonnement_fin
            OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
            OR NEW.is_active IS DISTINCT FROM OLD.is_active
            OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'Colonne réservée à la console SuperAdmin.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_colonnes_companies ON public.companies;
CREATE TRIGGER trg_proteger_colonnes_companies
    BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.proteger_colonnes_companies();

-- Lecture de la fiche entreprise limitée aux rôles qui en ont besoin (avant : tout JWT portant company_id)
DROP POLICY IF EXISTS rh_lit_son_entreprise ON public.companies;
CREATE POLICY rh_lit_son_entreprise ON public.companies FOR SELECT TO authenticated
    USING (public.jwt_role_app() IN ('rh', 'salarie', 'restaurant', 'portail') AND id = public.jwt_company_id());

-- 5. Un restaurant ne lit que les commandes de ses plats et ses propres menus
DROP POLICY IF EXISTS restaurant_lit_les_commandes ON public.commandes;
CREATE POLICY restaurant_lit_les_commandes ON public.commandes FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND company_id = public.jwt_company_id()
           AND plat_id IN (SELECT m.id FROM public.menus_du_jour m
                           WHERE m.restaurant_id = public.jwt_restaurant_id()));

DROP POLICY IF EXISTS salarie_et_restaurant_lisent_les_menus ON public.menus_du_jour;
DROP POLICY IF EXISTS salarie_lit_les_menus ON public.menus_du_jour;
CREATE POLICY salarie_lit_les_menus ON public.menus_du_jour FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'salarie' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS restaurant_lit_ses_menus ON public.menus_du_jour;
CREATE POLICY restaurant_lit_ses_menus ON public.menus_du_jour FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'restaurant' AND company_id = public.jwt_company_id()
           AND restaurant_id = public.jwt_restaurant_id());

-- 6. Rattachement par code partenaire : limite de tentatives par entreprise (5 échecs → 15 min)
CREATE OR REPLACE FUNCTION public.rattacher_compte_restaurant(p_code TEXT, p_heure_livraison TIME)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compte public.comptes_restaurant%ROWTYPE;
    v_company UUID := public.jwt_company_id();
    v_cle TEXT;
    v_id UUID;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'rh' OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    v_cle := 'partenaire:' || v_company::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    SELECT * INTO v_compte FROM public.comptes_restaurant
    WHERE code_partenaire = upper(trim(p_code)) AND is_active;
    IF NOT FOUND THEN
        PERFORM public.noter_echec_connexion(v_cle);
        RETURN NULL;
    END IF;
    PERFORM public.effacer_tentatives(v_cle);

    PERFORM set_config('cantine.rattachement', 'on', true);

    SELECT id INTO v_id FROM public.restaurants WHERE company_id = v_company AND compte_id = v_compte.id;
    IF v_id IS NOT NULL THEN
        UPDATE public.restaurants SET is_active = true WHERE id = v_id;
        RETURN v_id;
    END IF;

    INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, heure_livraison, compte_id)
    VALUES (v_company, v_compte.nom, v_compte.telephone_whatsapp, COALESCE(p_heure_livraison, '12:30:00'), v_compte.id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- 7. Droits : Supabase accorde EXECUTE et les tables à anon par défaut, REVOKE FROM PUBLIC ne suffit pas
REVOKE EXECUTE ON FUNCTION public.rattacher_compte_restaurant(TEXT, TIME) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.synchroniser_compte_restaurant() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.relier_lien_restaurant(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rattacher_compte_restaurant(TEXT, TIME) TO authenticated;
-- anon ne lit aucune table (seules les fonctions echanger_* lui sont ouvertes) ; la RLS reste le filet
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- ==============================================================================
-- v1.10 (T1) : code d'accès RH lu dans acces_rh, plus jamais dans companies.
-- Bloc final : remplace echanger_acces_rh (définie plus haut). Garder en dernier.
-- Étape B : la synchronisation transitoire et companies.rh_code_hash sont supprimées.
-- À n'appliquer qu'une fois le code de l'étape A déployé (l'ancien code écrit encore la colonne).
-- ==============================================================================

-- Synchronisation transitoire de l'étape A : plus utile, le code déployé n'écrit plus la colonne
DROP TRIGGER IF EXISTS trg_synchroniser_acces_rh ON public.companies;
DROP FUNCTION IF EXISTS public.synchroniser_acces_rh();

-- Copie unique des hash existants. Déjà faite sur une base passée par l'étape A ; sur une base neuve,
-- la colonne n'existe pas et la migration est simplement marquée.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'v1.10-acces-rh-copie') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'rh_code_hash') THEN
            EXECUTE $q$
                INSERT INTO public.acces_rh (company_id, code_hash)
                SELECT id, lower(rh_code_hash) FROM public.companies WHERE rh_code_hash IS NOT NULL
                ON CONFLICT (company_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, updated_at = now()
            $q$;
        END IF;
        INSERT INTO public.schema_migrations (nom) VALUES ('v1.10-acces-rh-copie');
    END IF;
END $$;

-- Garde-fou : la suppression est irréversible, elle est refusée si un hash n'a pas été recopié
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'rh_code_hash') THEN
        EXECUTE $q$
            DO $verif$
            BEGIN
                IF EXISTS (SELECT 1 FROM public.companies c
                           WHERE c.rh_code_hash IS NOT NULL
                             AND NOT EXISTS (SELECT 1 FROM public.acces_rh a WHERE a.company_id = c.id)) THEN
                    RAISE EXCEPTION 'Copie vers acces_rh incomplète : companies.rh_code_hash non supprimée';
                END IF;
            END $verif$
        $q$;
    END IF;
END $$;

-- Le hash quitte définitivement companies (irréversible : la copie ci-dessus a lieu avant)
ALTER TABLE public.companies DROP COLUMN IF EXISTS rh_code_hash;

-- Format du hash : la contrainte sha256 d'origine est remplacée par acces_rh_code_hash_bcrypt (v1.10 T19,
-- bloc final). Elle n'est plus recréée ici : sa recréation à chaque relance verrouillait acces_rh.

-- Connexion RH : même contrôle qu'en v1.9 (limite de tentatives, e-mail sans casse), hash lu dans acces_rh
CREATE OR REPLACE FUNCTION public.echanger_acces_rh(p_identifiant TEXT, p_code_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ident TEXT := lower(trim(coalesce(p_identifiant, '')));
    v_cle TEXT := 'rh:' || left(v_ident, 100);
    v_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    SELECT c.id INTO v_id
    FROM public.companies c
    JOIN public.acces_rh a ON a.company_id = c.id
    WHERE CASE WHEN position('@' IN v_ident) > 0
               THEN lower(c.email_contact) = v_ident
               ELSE c.slug = v_ident END
      AND c.is_active
      -- Un hash historique vide ou mal formé n'ouvre jamais l'accès (contrainte NOT VALID sur l'existant)
      AND a.code_hash ~ '^[0-9a-f]{64}$'
      AND a.code_hash = lower(coalesce(p_code_hash, ''))
    LIMIT 1;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_connexion(v_cle);
    ELSE
        PERFORM public.effacer_tentatives(v_cle);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT) TO anon, authenticated, service_role;

-- Changement du code RH : vérifie l'ancien code sans que le RH lise jamais le hash.
-- Limite : 5 mauvais anciens codes en 15 min bloquent le changement 15 min (erreur CP429).
CREATE OR REPLACE FUNCTION public.changer_code_rh(p_ancien_hash TEXT, p_nouveau_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_company UUID := public.jwt_company_id();
    v_cle TEXT;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'rh' OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF p_nouveau_hash IS NULL OR p_nouveau_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Nouveau code invalide';
    END IF;

    v_cle := 'changecode:' || v_company::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    IF NOT EXISTS (SELECT 1 FROM public.acces_rh
                   WHERE company_id = v_company AND code_hash = lower(coalesce(p_ancien_hash, ''))) THEN
        PERFORM public.noter_echec_connexion(v_cle);
        RETURN false;
    END IF;
    PERFORM public.effacer_tentatives(v_cle);

    UPDATE public.acces_rh SET code_hash = p_nouveau_hash, updated_at = now() WHERE company_id = v_company;
    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.changer_code_rh(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.changer_code_rh(TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- v1.10 (T2) : le portail /c/[slug] ne lit plus et n'écrit plus la table employes en direct.
-- Deux fonctions à colonnes fixes : la liste (sans token) et l'auto-inscription (qui ne renvoie que la
-- fiche créée). Étape B : les politiques portail_lit_les_salaries et portail_inscrit_un_salarie sont
-- supprimées (section 9). Bloc final : garder en dernier.
-- ==============================================================================

-- Liste du portail : nom et service des salariés actifs, jamais le token
CREATE OR REPLACE FUNCTION public.portail_lister_salaries()
RETURNS TABLE (id UUID, nom TEXT, service TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'portail' OR public.jwt_company_id() IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    RETURN QUERY
        SELECT e.id, e.nom, e.service
        FROM public.employes e
        WHERE e.company_id = public.jwt_company_id() AND e.is_active
        ORDER BY e.nom;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.portail_lister_salaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_lister_salaries() TO authenticated;

-- Auto-inscription : le portail ne choisit ni le token, ni is_active, ni le service. Le plafond de l'offre
-- (p_max, calculé par le serveur depuis PLANS) est contrôlé ici sous verrou : deux inscriptions
-- simultanées ne peuvent pas le dépasser. Plafond atteint : erreur CP409.
CREATE OR REPLACE FUNCTION public.portail_inscrire_salarie(p_nom TEXT, p_telephone TEXT, p_max INT)
RETURNS TABLE (id UUID, nom TEXT, token TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_company UUID := public.jwt_company_id();
    -- Blancs (espaces, tabulations, retours) réduits à un espace, puis rognés aux deux bouts après la coupe à 80
    v_nom TEXT := trim(left(trim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g')), 80));
    v_tel TEXT := nullif(left(trim(coalesce(p_telephone, '')), 20), '');
    v_id UUID;
    v_token TEXT;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'portail' OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF length(v_nom) < 2 THEN
        RAISE EXCEPTION 'Nom invalide';
    END IF;
    IF p_max IS NULL OR p_max < 1 OR p_max > 10000 THEN
        RAISE EXCEPTION 'Plafond invalide';
    END IF;

    -- Une inscription à la fois par entreprise : le comptage et l'insertion ne peuvent pas se croiser
    PERFORM pg_advisory_xact_lock(hashtextextended('portail-inscription:' || v_company::text, 0));
    IF (SELECT count(*) FROM public.employes e WHERE e.company_id = v_company AND e.is_active) >= p_max THEN
        RAISE EXCEPTION 'Nombre maximum de salariés atteint' USING ERRCODE = 'CP409';
    END IF;

    INSERT INTO public.employes (company_id, nom, telephone, is_active)
    VALUES (v_company, v_nom, v_tel, true)
    RETURNING employes.id, employes.token INTO v_id, v_token;

    RETURN QUERY SELECT v_id, v_nom, v_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.portail_inscrire_salarie(TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_inscrire_salarie(TEXT, TEXT, INT) TO authenticated;

-- ==============================================================================
-- v1.10 (T3) : le salarié ne lit plus la table restaurants en direct (salarie_lit_les_restaurants
-- lui donnait toutes les colonnes, dont le token /resto/... et le WhatsApp de chaque restaurant).
-- Fonction à colonnes fixes : nom et état actif, pour afficher le restaurant de chaque plat.
-- Étape B : la politique salarie_lit_les_restaurants est supprimée (section 9). Bloc final : garder en dernier.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.restaurants_visibles_salarie()
RETURNS TABLE (id UUID, nom TEXT, is_active BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'salarie' OR public.jwt_company_id() IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    RETURN QUERY
        SELECT r.id, r.nom, r.is_active
        FROM public.restaurants r
        WHERE r.company_id = public.jwt_company_id();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.restaurants_visibles_salarie() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurants_visibles_salarie() TO authenticated;

-- ==============================================================================
-- v1.10 (T4) : suppression des colonnes mortes companies.traiteur_token et companies.code_acces.
-- Plus aucun code ne les lit ni ne les écrit, mais elles restaient lisibles par les rôles salarié,
-- restaurant et portail ; traiteur_token est en plus la copie du lien /resto/... du premier restaurant
-- migré en v1.2. proteger_colonnes_companies ne les cite plus (bloc v1.9 plus haut) : la suppression
-- vient après dans le fichier. Irréversible. Bloc final : garder en dernier.
-- ==============================================================================
ALTER TABLE public.companies
    DROP COLUMN IF EXISTS traiteur_token,
    DROP COLUMN IF EXISTS code_acces;

-- ==============================================================================
-- v1.10 (T5) : suppression du portail entreprise /c/[slug]. Son auto-inscription anonyme n'avait aucun
-- quota (audit base, H-2) : n'importe qui connaissant le slug pouvait créer des salariés facturés.
-- Les salariés sont désormais ajoutés uniquement par le RH (saisie ou import) et commandent depuis
-- leur lien personnel /p/[token]. Les fonctions créées plus haut sont supprimées ici, à chaque relance,
-- et le rôle portail perd la lecture de la fiche entreprise. Bloc final : garder en dernier.
-- ==============================================================================
DROP FUNCTION IF EXISTS public.portail_inscrire_salarie(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.portail_lister_salaries();
DROP FUNCTION IF EXISTS public.echanger_slug_portail(TEXT);

DROP POLICY IF EXISTS rh_lit_son_entreprise ON public.companies;
CREATE POLICY rh_lit_son_entreprise ON public.companies FOR SELECT TO authenticated
    USING (public.jwt_role_app() IN ('rh', 'salarie', 'restaurant') AND id = public.jwt_company_id());

-- ==============================================================================
-- v1.10 (T6) : le compteur d'essais du code partenaire ne repart plus à zéro après un succès (audit base, C-1).
-- Avant, n'importe qui pouvait créer son propre compte restaurant et intercaler son code valide entre
-- 4 essais ratés : essais illimités sur les codes des autres comptes. Remplace rattacher_compte_restaurant
-- (section 9, point 6), identique à une ligne près. Bloc final : garder en dernier.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rattacher_compte_restaurant(p_code TEXT, p_heure_livraison TIME)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compte public.comptes_restaurant%ROWTYPE;
    v_company UUID := public.jwt_company_id();
    v_cle TEXT;
    v_id UUID;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'rh' OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    v_cle := 'partenaire:' || v_company::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    SELECT * INTO v_compte FROM public.comptes_restaurant
    WHERE code_partenaire = upper(trim(p_code)) AND is_active;
    IF NOT FOUND THEN
        PERFORM public.noter_echec_connexion(v_cle);
        RETURN NULL;
    END IF;
    -- Pas d'effacer_tentatives : un succès (par exemple avec son propre code partenaire) ne remet
    -- pas le compteur à zéro ; la fenêtre de 15 min expire d'elle-même.

    PERFORM set_config('cantine.rattachement', 'on', true);

    SELECT id INTO v_id FROM public.restaurants WHERE company_id = v_company AND compte_id = v_compte.id;
    IF v_id IS NOT NULL THEN
        UPDATE public.restaurants SET is_active = true WHERE id = v_id;
        RETURN v_id;
    END IF;

    INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, heure_livraison, compte_id)
    VALUES (v_company, v_compte.nom, v_compte.telephone_whatsapp, COALESCE(p_heure_livraison, '12:30:00'), v_compte.id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rattacher_compte_restaurant(TEXT, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rattacher_compte_restaurant(TEXT, TIME) TO authenticated;

-- ==============================================================================
-- v1.10 (T6, suite) : régénération des codes partenaires courts (audit base, C-1). Les comptes créés
-- avant la v1.9 ont un code de 8 caractères (4 octets), devinable par essais ; les nouveaux en ont 12
-- (6 octets, valeur par défaut plus haut). Une seule fois, gardé par schema_migrations : les anciens codes
-- de 8 caractères cessent de fonctionner, prévenir les restaurants concernés. Bloc final : garder en dernier.
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'v1.10-codes-partenaires-12') THEN
        UPDATE public.comptes_restaurant
        SET code_partenaire = upper(encode(gen_random_bytes(6), 'hex'))
        WHERE length(code_partenaire) < 12;
        INSERT INTO public.schema_migrations (nom) VALUES ('v1.10-codes-partenaires-12');
    END IF;
END $$;

-- ==============================================================================
-- v1.10 (T7) : le compte restaurant ne lit ni n'écrit plus code_hash (audit base, C-2). Avant, ses
-- politiques compte_lit_sa_fiche / compte_modifie_sa_fiche couvraient toutes les colonnes : un cookie
-- volé permettait de lire le hash (qui vaut le code) ou de l'écraser sans connaître l'ancien code, et
-- la vérification de l'ancien code se faisait en Node sans limite d'essais.
-- 1) Changement de code par une fonction, sur le modèle de changer_code_rh : 5 mauvais anciens codes
--    en 15 min bloquent le changement 15 min (erreur CP429).
-- 2) Droits par colonne pour authenticated (seul le rôle compte_restaurant a des politiques sur cette
--    table) : lecture sans code_hash ni code_change_at, écriture limitée au profil.
-- 3) Filet si un futur GRANT rouvrait ces colonnes : proteger_fiche_compte_restaurant refuse aussi
--    code_hash et code_change_at, mais seulement quand current_user = 'authenticated'. Dans la fonction
--    SECURITY DEFINER, current_user est son propriétaire : le changement légitime passe, alors que
--    jwt_role_app() y vaut toujours 'compte_restaurant'.
-- Bloc final : garder en dernier.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.changer_code_compte_restaurant(p_ancien_hash TEXT, p_nouveau_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compte UUID := public.jwt_compte_id();
    v_cle TEXT;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'compte_restaurant' OR v_compte IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF p_nouveau_hash IS NULL OR p_nouveau_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Nouveau code invalide';
    END IF;

    v_cle := 'changecode-resto:' || v_compte::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    IF NOT EXISTS (SELECT 1 FROM public.comptes_restaurant
                   WHERE id = v_compte AND is_active
                     AND lower(code_hash) = lower(coalesce(p_ancien_hash, ''))) THEN
        PERFORM public.noter_echec_connexion(v_cle);
        RETURN false;
    END IF;
    PERFORM public.effacer_tentatives(v_cle);

    UPDATE public.comptes_restaurant
    SET code_hash = p_nouveau_hash, code_change_at = now()
    WHERE id = v_compte;
    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.changer_code_compte_restaurant(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.changer_code_compte_restaurant(TEXT, TEXT) TO authenticated;

REVOKE SELECT, UPDATE ON public.comptes_restaurant FROM authenticated;
GRANT SELECT (id, nom, telephone_whatsapp, ville, code_partenaire, is_active, created_at)
    ON public.comptes_restaurant TO authenticated;
GRANT UPDATE (nom, telephone_whatsapp, ville) ON public.comptes_restaurant TO authenticated;

CREATE OR REPLACE FUNCTION public.proteger_fiche_compte_restaurant()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() = 'compte_restaurant'
       AND (NEW.id IS DISTINCT FROM OLD.id
            OR NEW.code_partenaire IS DISTINCT FROM OLD.code_partenaire
            OR NEW.is_active IS DISTINCT FROM OLD.is_active
            OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'Colonne réservée à la console SuperAdmin.';
    END IF;
    IF current_user = 'authenticated'
       AND (NEW.code_hash IS DISTINCT FROM OLD.code_hash
            OR NEW.code_change_at IS DISTINCT FROM OLD.code_change_at) THEN
        RAISE EXCEPTION 'Le code d''accès se change avec changer_code_compte_restaurant.';
    END IF;
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- v1.10 (T8) : une session RH ou compte restaurant est révoquée dès que l'accès l'est (audit base, C-3).
-- Le cookie (30 jours) porte son heure d'émission ; le serveur Next.js vérifie à chaque requête que
-- l'entreprise ou le compte est toujours actif et que le code n'a pas changé depuis. Les deux premières
-- fonctions sont appelées sans JWT (clé anon, comme les echanger_*) : elles ne renvoient qu'un booléen
-- pour un identifiant UUID déjà signé par le serveur. Tolérance de 30 s sur l'heure d'émission : les
-- horloges de Vercel et de Postgres peuvent différer, et le cookie réémis juste après un changement de
-- code ne doit pas être refusé. Ajout pur (fonctions et triggers d'horodatage) : à appliquer AVANT de
-- déployer le code qui les appelle.
-- Bloc final : garder en dernier.
-- ==============================================================================

-- Session RH : entreprise active, code RH inchangé depuis l'émission (acces_rh.updated_at, mis à jour
-- par changer_code_rh)
CREATE OR REPLACE FUNCTION public.session_rh_valide(p_company_id UUID, p_emis_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.companies c
        JOIN public.acces_rh a ON a.company_id = c.id
        WHERE c.id = p_company_id AND c.is_active
          AND a.updated_at <= p_emis_at + interval '30 seconds'
    )
$$;
REVOKE EXECUTE ON FUNCTION public.session_rh_valide(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_rh_valide(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- Session compte restaurant : compte actif, code inchangé depuis l'émission (code_change_at, T7)
CREATE OR REPLACE FUNCTION public.session_compte_valide(p_compte_id UUID, p_emis_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.comptes_restaurant cr
        WHERE cr.id = p_compte_id AND cr.is_active
          AND cr.code_change_at <= p_emis_at + interval '30 seconds'
    )
$$;
REVOKE EXECUTE ON FUNCTION public.session_compte_valide(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_compte_valide(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- Accès d'un compte à un partenariat : mêmes contrôles que echanger_jeton_restaurant (partenariat,
-- entreprise et compte actifs). Appelée avec le JWT compte_restaurant.
CREATE OR REPLACE FUNCTION public.acces_partenariat_compte(p_restaurant_id UUID)
RETURNS TABLE (restaurant_id UUID, company_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'compte_restaurant' OR public.jwt_compte_id() IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    RETURN QUERY
        SELECT r.id, r.company_id
        FROM public.restaurants r
        JOIN public.companies c ON c.id = r.company_id
        JOIN public.comptes_restaurant cr ON cr.id = r.compte_id
        WHERE r.id = p_restaurant_id AND r.compte_id = public.jwt_compte_id()
          AND r.is_active AND c.is_active AND cr.is_active;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acces_partenariat_compte(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acces_partenariat_compte(UUID) TO authenticated;

-- Un code changé hors des fonctions prévues (par exemple à la main dans l'éditeur SQL) met aussi à jour
-- la date de changement : les sessions ouvertes avant sont révoquées dans tous les cas.
CREATE OR REPLACE FUNCTION public.horodater_changement_code_rh()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.code_hash IS DISTINCT FROM OLD.code_hash THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_horodater_changement_code_rh ON public.acces_rh;
CREATE TRIGGER trg_horodater_changement_code_rh
    BEFORE UPDATE ON public.acces_rh
    FOR EACH ROW EXECUTE FUNCTION public.horodater_changement_code_rh();

CREATE OR REPLACE FUNCTION public.horodater_changement_code_compte()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.code_hash IS DISTINCT FROM OLD.code_hash THEN
        NEW.code_change_at := now();
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_horodater_changement_code_compte ON public.comptes_restaurant;
CREATE TRIGGER trg_horodater_changement_code_compte
    BEFORE UPDATE ON public.comptes_restaurant
    FOR EACH ROW EXECUTE FUNCTION public.horodater_changement_code_compte();

-- ==============================================================================
-- v1.10 (T10, étape A) : la commande du salarié passe par une seule fonction qui vérifie tout en base
-- (audit base, H-2). Avant, les politiques salarie_passe_sa_commande / salarie_modifie_sa_commande
-- laissaient écrire n'importe quelle date, n'importe quel plat et modifie_par_rh : seules les vérifications
-- de submitVoteAction (Node) protégeaient l'heure limite, le menu du jour et le restaurant actif.
-- Contrôles : salarié et entreprise actifs, jour de travail, heures d'ouverture et limite (Africa/Dakar,
-- mêmes bornes que isApresHeureLimite : fermé à partir de l'heure limite incluse), plat du menu du jour de
-- l'entreprise, disponible et d'un restaurant actif, journée du restaurant non clôturée, commande non
-- corrigée par le RH (verrouillée pour le salarié).
-- Erreurs, au message lisible par le salarié : CP423 (commandes fermées), CP404 (plat indisponible),
-- CP403 (commande verrouillée). submitVoteAction affiche ces messages tels quels : n'y mettre que du
-- texte destiné au salarié, jamais de donnée interne.
-- Étape B (plus tard, après le déploiement du code) : suppression des politiques INSERT / UPDATE du salarié.
-- Bloc final : garder en dernier.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.passer_commande(p_statut TEXT, p_plat_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_employe UUID := public.jwt_employe_id();
    v_company UUID := public.jwt_company_id();
    v_jour DATE := (now() AT TIME ZONE 'Africa/Dakar')::date;
    v_heure TIME := (now() AT TIME ZONE 'Africa/Dakar')::time;
    v_ouverture TIME;
    v_limite TIME;
    v_jours SMALLINT[];
    v_existante public.commandes%ROWTYPE;
    v_resto_existant UUID;
    v_resto_nouveau UUID;
    v_enregistre TIMESTAMPTZ;
    v_lignes INTEGER;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'salarie' OR v_employe IS NULL OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF p_statut IS NULL OR p_statut NOT IN ('choisi', 'absent', 'ne_mange_pas') THEN
        RAISE EXCEPTION 'Statut invalide';
    END IF;

    SELECT c.heure_ouverture_vote, c.heure_limite_vote, c.jours_travail
      INTO v_ouverture, v_limite, v_jours
      FROM public.companies c
      JOIN public.employes e ON e.company_id = c.id
     WHERE c.id = v_company AND c.is_active AND e.id = v_employe AND e.is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;

    -- Jours de travail : seulement 1..7, et lundi → vendredi si rien de valide, comme normaliserJoursTravail
    v_jours := ARRAY(SELECT DISTINCT j FROM unnest(v_jours) AS j WHERE j BETWEEN 1 AND 7);
    IF coalesce(cardinality(v_jours), 0) = 0 THEN
        v_jours := '{1,2,3,4,5}';
    END IF;
    IF NOT (extract(isodow FROM v_jour)::smallint = ANY (v_jours)) THEN
        RAISE EXCEPTION 'Pas de service cantine aujourd''hui.' USING ERRCODE = 'CP423';
    END IF;
    IF v_heure < v_ouverture THEN
        RAISE EXCEPTION 'Les commandes ouvrent à %.', replace(to_char(v_ouverture, 'HH24:MI'), ':', 'h')
            USING ERRCODE = 'CP423';
    END IF;
    IF v_heure >= v_limite THEN
        RAISE EXCEPTION 'Les commandes sont clôturées depuis %.', replace(to_char(v_limite, 'HH24:MI'), ':', 'h')
            USING ERRCODE = 'CP423';
    END IF;

    -- Une commande à la fois par salarié et par jour : la vérification et l'écriture ne se croisent pas
    PERFORM pg_advisory_xact_lock(hashtextextended('commande:' || v_employe::text || ':' || v_jour::text, 0));

    -- FOR UPDATE : une correction du RH en cours attend la fin de cette transaction, et inversement
    SELECT * INTO v_existante FROM public.commandes WHERE employe_id = v_employe AND date = v_jour FOR UPDATE;
    IF FOUND THEN
        IF v_existante.modifie_par_rh THEN
            RAISE EXCEPTION 'Votre RH a saisi votre commande du jour : contactez-le pour la changer.'
                USING ERRCODE = 'CP403';
        END IF;
        IF v_existante.plat_id IS NOT NULL THEN
            SELECT m.restaurant_id INTO v_resto_existant FROM public.menus_du_jour m WHERE m.id = v_existante.plat_id;
        END IF;
    END IF;

    IF p_statut = 'choisi' THEN
        SELECT m.restaurant_id INTO v_resto_nouveau
          FROM public.menus_du_jour m
          LEFT JOIN public.restaurants r ON r.id = m.restaurant_id
         WHERE m.id = p_plat_id AND m.company_id = v_company AND m.date = v_jour AND m.is_available
           AND (m.restaurant_id IS NULL OR r.is_active);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ce plat n''est plus disponible, choisissez-en un autre.' USING ERRCODE = 'CP404';
        END IF;
    END IF;

    -- Le récapitulatif d'un restaurant déjà clôturé ne bouge plus : ni retirer, ni ajouter un repas
    IF EXISTS (SELECT 1 FROM public.clotures cl
               WHERE cl.company_id = v_company AND cl.date = v_jour
                 AND cl.restaurant_id IS NOT NULL
                 AND cl.restaurant_id IN (v_resto_existant, v_resto_nouveau)) THEN
        RAISE EXCEPTION 'La commande de ce restaurant est déjà envoyée : contactez votre RH.'
            USING ERRCODE = 'CP403';
    END IF;

    -- Heure réelle d'écriture (now() serait l'heure de début de transaction, avant l'attente des verrous)
    v_enregistre := clock_timestamp();
    INSERT INTO public.commandes (company_id, employe_id, plat_id, date, statut, modifie_par_rh, updated_at)
    VALUES (v_company, v_employe, CASE WHEN p_statut = 'choisi' THEN p_plat_id END, v_jour, p_statut, false, v_enregistre)
    ON CONFLICT (employe_id, date) DO UPDATE
        SET plat_id = EXCLUDED.plat_id,
            statut = EXCLUDED.statut,
            updated_at = EXCLUDED.updated_at
        WHERE public.commandes.modifie_par_rh = false;
    -- Aucune ligne écrite : le RH a créé une commande verrouillée entre la lecture et l'insertion
    GET DIAGNOSTICS v_lignes = ROW_COUNT;
    IF v_lignes = 0 THEN
        RAISE EXCEPTION 'Votre RH a saisi votre commande du jour : contactez-le pour la changer.'
            USING ERRCODE = 'CP403';
    END IF;
    RETURN v_enregistre;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.passer_commande(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.passer_commande(TEXT, UUID) TO authenticated;

-- ==============================================================================
-- v1.10 (T11) : une clôture confirmée fige ce qui sera facturé (audit base, H-1). La facture se calcule
-- depuis commandes et menus_du_jour.prix_unitaire : avant, le RH (politiques FOR ALL) ou le restaurant
-- pouvaient modifier après coup une clôture confirmée, ses commandes ou le prix des plats, et changer
-- ainsi une facture passée. Seul le code de l'Espace RH l'empêchait, et seulement pour le jour même.
-- Quatre triggers, limités aux clients JWT (current_user = 'authenticated') : le cron et la console
-- SuperAdmin (service_role) gardent la main pour corriger, et passer_commande (SECURITY DEFINER) refuse
-- déjà toute commande dès qu'une clôture existe. Erreur CP412, au message lisible par le RH.
-- Bloc final : garder en dernier.
-- ==============================================================================

-- Vrai si le restaurant a confirmé sa clôture pour cette entreprise et ce jour
CREATE OR REPLACE FUNCTION public.cloture_confirmee(p_company_id UUID, p_date DATE, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    -- Seulement pour l'entreprise de l'appelant : la fonction ne sert pas d'oracle sur les autres
    SELECT p_restaurant_id IS NOT NULL AND p_company_id = public.jwt_company_id() AND EXISTS (
        SELECT 1 FROM public.clotures cl
        WHERE cl.company_id = p_company_id AND cl.date = p_date
          AND cl.restaurant_id = p_restaurant_id AND cl.confirme_at IS NOT NULL
    )
$$;
-- Appelée par les triggers ci-dessous avec le rôle du client JWT : authenticated doit pouvoir l'exécuter
REVOKE EXECUTE ON FUNCTION public.cloture_confirmee(UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cloture_confirmee(UUID, DATE, UUID) TO authenticated;

-- Restaurant d'un plat, lu sans la RLS : un plat invisible pour l'appelant ne doit pas faire sauter le contrôle
CREATE OR REPLACE FUNCTION public.restaurant_du_plat(p_plat_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT m.restaurant_id FROM public.menus_du_jour m
    WHERE m.id = p_plat_id AND m.company_id = public.jwt_company_id()
$$;
REVOKE EXECUTE ON FUNCTION public.restaurant_du_plat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_du_plat(UUID) TO authenticated;

-- 1. Clôture confirmée : ni suppression, ni modification, sauf le suivi d'envoi WhatsApp.
--    Liste blanche : toute colonne ajoutée plus tard à clotures est figée après confirmation par défaut.
CREATE OR REPLACE FUNCTION public.verrouiller_cloture_confirmee()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user = 'authenticated' AND OLD.confirme_at IS NOT NULL THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Cette journée est confirmée par le restaurant : elle ne peut plus être supprimée.'
                USING ERRCODE = 'CP412';
        END IF;
        IF (to_jsonb(NEW) - 'envoi_statut' - 'envoi_erreur' - 'envoye_at')
           IS DISTINCT FROM (to_jsonb(OLD) - 'envoi_statut' - 'envoi_erreur' - 'envoye_at') THEN
            RAISE EXCEPTION 'Cette journée est confirmée par le restaurant : elle ne peut plus être modifiée.'
                USING ERRCODE = 'CP412';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_verrouiller_cloture_confirmee ON public.clotures;
CREATE TRIGGER trg_verrouiller_cloture_confirmee
    BEFORE UPDATE OR DELETE ON public.clotures
    FOR EACH ROW EXECUTE FUNCTION public.verrouiller_cloture_confirmee();

-- 2. Commandes : un jour passé ne se modifie plus, ni une commande d'un restaurant confirmé
CREATE OR REPLACE FUNCTION public.verrouiller_commande_facturee()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
    v_aujourdhui DATE := (now() AT TIME ZONE 'Africa/Dakar')::date;
    v_resto UUID;
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.date < v_aujourdhui THEN
            RAISE EXCEPTION 'Les commandes des jours passés ne se modifient plus.' USING ERRCODE = 'CP412';
        END IF;
        IF OLD.plat_id IS NOT NULL THEN
            v_resto := public.restaurant_du_plat(OLD.plat_id);
            IF public.cloture_confirmee(OLD.company_id, OLD.date, v_resto) THEN
                RAISE EXCEPTION 'Ce restaurant a confirmé la commande du jour : elle ne peut plus être modifiée.'
                    USING ERRCODE = 'CP412';
            END IF;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.date < v_aujourdhui THEN
            RAISE EXCEPTION 'Les commandes des jours passés ne se modifient plus.' USING ERRCODE = 'CP412';
        END IF;
        IF NEW.plat_id IS NOT NULL THEN
            v_resto := public.restaurant_du_plat(NEW.plat_id);
            IF public.cloture_confirmee(NEW.company_id, NEW.date, v_resto) THEN
                RAISE EXCEPTION 'Ce restaurant a confirmé la commande du jour : elle ne peut plus être modifiée.'
                    USING ERRCODE = 'CP412';
            END IF;
        END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_verrouiller_commande_facturee ON public.commandes;
CREATE TRIGGER trg_verrouiller_commande_facturee
    BEFORE INSERT OR UPDATE OR DELETE ON public.commandes
    FOR EACH ROW EXECUTE FUNCTION public.verrouiller_commande_facturee();

-- 3. Plats : le prix, le titre, le restaurant et la date d'un plat d'une journée confirmée ne bougent
--    plus, et le plat ne se supprime plus (la disponibilité reste modifiable : elle n'est pas facturée)
CREATE OR REPLACE FUNCTION public.verrouiller_plat_facture()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user = 'authenticated'
       AND (public.cloture_confirmee(OLD.company_id, OLD.date, OLD.restaurant_id)
            -- La destination compte aussi : un plat déplacé vers un restaurant déjà confirmé
            -- ferait entrer ses repas dans une facture figée
            OR (TG_OP = 'UPDATE' AND public.cloture_confirmee(NEW.company_id, NEW.date, NEW.restaurant_id)))
       AND (TG_OP = 'DELETE'
            OR NEW.prix_unitaire IS DISTINCT FROM OLD.prix_unitaire
            OR NEW.titre IS DISTINCT FROM OLD.titre
            OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
            OR NEW.date IS DISTINCT FROM OLD.date
            OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
        RAISE EXCEPTION 'Ce restaurant a confirmé la commande du jour : ce plat ne peut plus être modifié.'
            USING ERRCODE = 'CP412';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_verrouiller_plat_facture ON public.menus_du_jour;
CREATE TRIGGER trg_verrouiller_plat_facture
    BEFORE UPDATE OR DELETE ON public.menus_du_jour
    FOR EACH ROW EXECUTE FUNCTION public.verrouiller_plat_facture();

-- 4. Salarié : la suppression effacerait ses commandes en cascade (la cascade s'exécute avec le rôle du
--    propriétaire de la table et échappe au trigger des commandes). Un salarié qui a commandé se désactive.
CREATE OR REPLACE FUNCTION public.verrouiller_suppression_salarie()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF current_user = 'authenticated'
       AND EXISTS (SELECT 1 FROM public.commandes c WHERE c.employe_id = OLD.id) THEN
        RAISE EXCEPTION 'Ce collaborateur a des commandes : désactivez-le plutôt que de le supprimer.'
            USING ERRCODE = 'CP412';
    END IF;
    RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_verrouiller_suppression_salarie ON public.employes;
CREATE TRIGGER trg_verrouiller_suppression_salarie
    BEFORE DELETE ON public.employes
    FOR EACH ROW EXECUTE FUNCTION public.verrouiller_suppression_salarie();

-- ==============================================================================
-- v1.10 (T13) : le blocage de connexion ne permet plus de verrouiller le compte d'un autre (audit base,
-- H-5). Avant, 5 échecs sur un identifiant (slug RH, e-mail, téléphone restaurant, console SuperAdmin)
-- le bloquaient 15 min pour tout le monde : il suffisait de connaître un slug public pour empêcher une
-- entreprise de se connecter.
-- Deux compteurs par identifiant :
--   <type>ip:<ip>|<identifiant> : 5 échecs en 15 min bloquent cette IP sur cet identifiant ;
--   <identifiant>      : 30 échecs en 15 min, toutes IP confondues, le bloquent (brute force réparti).
-- Une connexion réussie efface le compteur de son IP seulement. L'IP n'est crue que si l'appel porte le JWT
-- court « connexion » signé par le serveur Next.js : un appelant direct (clé anon) ne peut pas la falsifier.
-- Étape B (après le déploiement du code qui signe ce JWT) : remplacer les deux GRANT de ce bloc par
-- « TO authenticated, service_role » (un REVOKE placé plus haut serait annulé à chaque relance). Ne pas
-- retirer authenticated : le JWT « connexion » est signé avec role = authenticated.
-- Les échanges gagnent un paramètre p_ip (DEFAULT NULL : l'ancien code à 2 arguments continue de marcher) ;
-- l'ancienne signature est supprimée pour éviter toute ambiguïté d'appel.
-- Bloc final : garder en dernier.
-- ==============================================================================

-- Comme noter_echec_connexion, avec un plafond choisi (noter_echec_connexion reste à 5 pour ses appelants)
CREATE OR REPLACE FUNCTION public.noter_echec_plafonne(p_cle TEXT, p_max INT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    DELETE FROM public.tentatives_connexion
    WHERE cle IN (
        SELECT cle FROM public.tentatives_connexion
        WHERE premier_echec_at < now() - interval '1 day'
          AND (bloque_jusqu_a IS NULL OR bloque_jusqu_a < now())
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    );

    INSERT INTO public.tentatives_connexion AS t (cle, echecs, premier_echec_at)
    VALUES (p_cle, 1, now())
    ON CONFLICT (cle) DO UPDATE SET
        echecs = CASE WHEN t.premier_echec_at < now() - interval '15 minutes' THEN 1 ELSE t.echecs + 1 END,
        bloque_jusqu_a = CASE WHEN t.premier_echec_at < now() - interval '15 minutes' THEN NULL ELSE t.bloque_jusqu_a END,
        premier_echec_at = CASE WHEN t.premier_echec_at < now() - interval '15 minutes' THEN now() ELSE t.premier_echec_at END;

    UPDATE public.tentatives_connexion
    SET bloque_jusqu_a = now() + interval '15 minutes'
    WHERE cle = p_cle AND echecs >= greatest(coalesce(p_max, 5), 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.noter_echec_plafonne(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.noter_echec_plafonne(TEXT, INT) TO service_role;

-- IP lisible pour une clé : chiffres, lettres hexadécimales, points et deux-points ; sinon « inconnue »
CREATE OR REPLACE FUNCTION public.ip_pour_cle(p_ip TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT CASE WHEN p_ip ~ '^[0-9A-Fa-f:.]{2,45}$' THEN lower(p_ip) ELSE 'inconnue' END
$$;
REVOKE EXECUTE ON FUNCTION public.ip_pour_cle(TEXT) FROM PUBLIC, anon, authenticated;

-- Connexion RH
DROP FUNCTION IF EXISTS public.echanger_acces_rh(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.echanger_acces_rh(p_identifiant TEXT, p_code_hash TEXT, p_ip TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ident TEXT := lower(trim(coalesce(p_identifiant, '')));
    v_cle TEXT := 'rh:' || left(v_ident, 100);
    -- L'IP en tête : elle ne peut pas contenir « | », alors que l'identifiant est saisi librement
    -- L'IP n'est crue que si l'appel vient du serveur Next.js (JWT « connexion ») ; un appel direct avec
    -- la clé anon tombe dans le compteur partagé « inconnue », à 5 échecs
    v_cle_ip TEXT := 'rhip:' || public.ip_pour_cle(CASE WHEN public.jwt_role_app() = 'connexion' THEN p_ip END)
                     || '|' || left(v_ident, 100);
    v_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);
    PERFORM public.controler_tentatives(v_cle_ip);

    SELECT c.id INTO v_id
    FROM public.companies c
    JOIN public.acces_rh a ON a.company_id = c.id
    WHERE CASE WHEN position('@' IN v_ident) > 0
               THEN lower(c.email_contact) = v_ident
               ELSE c.slug = v_ident END
      AND c.is_active
      AND a.code_hash ~ '^[0-9a-f]{64}$'
      AND a.code_hash = lower(coalesce(p_code_hash, ''))
    LIMIT 1;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_plafonne(v_cle_ip, 5);
        PERFORM public.noter_echec_plafonne(v_cle, 30);
    ELSE
        PERFORM public.effacer_tentatives(v_cle_ip);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Connexion d'un compte restaurant
DROP FUNCTION IF EXISTS public.echanger_acces_compte_restaurant(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.echanger_acces_compte_restaurant(p_telephone TEXT, p_code_hash TEXT, p_ip TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cle TEXT := 'resto:' || left(trim(coalesce(p_telephone, '')), 50);
    v_cle_ip TEXT := 'restoip:' || public.ip_pour_cle(CASE WHEN public.jwt_role_app() = 'connexion' THEN p_ip END)
                     || '|' || left(trim(coalesce(p_telephone, '')), 50);
    v_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);
    PERFORM public.controler_tentatives(v_cle_ip);

    SELECT c.id INTO v_id FROM public.comptes_restaurant c
    WHERE c.telephone_whatsapp = p_telephone
      AND c.is_active
      AND lower(c.code_hash) = lower(p_code_hash)
    LIMIT 1;

    IF v_id IS NULL THEN
        PERFORM public.noter_echec_plafonne(v_cle_ip, 5);
        PERFORM public.noter_echec_plafonne(v_cle, 30);
    ELSE
        PERFORM public.effacer_tentatives(v_cle_ip);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.echanger_acces_compte_restaurant(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_compte_restaurant(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Console SuperAdmin : le code est vérifié par Next.js (SUPERADMIN_CODE), mais le contrôle et le comptage
-- se font ici en une seule transaction sous verrou : une rafale de requêtes parallèles ne peut plus passer
-- le contrôle avant qu'aucun échec ne soit compté. Réservée au service_role (l'IP vient du serveur).
CREATE OR REPLACE FUNCTION public.tentative_connexion_admin(p_code_correct BOOLEAN, p_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cle TEXT := 'admin';
    v_cle_ip TEXT := 'adminip:' || public.ip_pour_cle(p_ip);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);
    PERFORM public.controler_tentatives(v_cle_ip);
    IF p_code_correct IS NOT TRUE THEN
        PERFORM public.noter_echec_plafonne(v_cle_ip, 5);
        PERFORM public.noter_echec_plafonne(v_cle, 30);
        RETURN false;
    END IF;
    PERFORM public.effacer_tentatives(v_cle_ip);
    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tentative_connexion_admin(BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tentative_connexion_admin(BOOLEAN, TEXT) TO service_role;

-- ==============================================================================
-- v1.10 (T14, étape A) : le salarié et le restaurant ne lisent plus toute la fiche entreprise (audit
-- base, H-3). La politique rh_lit_son_entreprise leur donnait toutes les colonnes de companies (e-mail et
-- téléphone du responsable, offre, abonnement, colonnes mortes traiteur_*) alors que leurs pages
-- n'utilisent que le nom, les heures de commande et les jours de travail.
-- Fonction à colonnes fixes, limitée à l'entreprise du JWT ; pour un autre rôle elle ne renvoie rien.
-- Étape B (après le déploiement du code qui l'appelle, et vérification en production des pages salarié et
-- restaurant) : redéfinir rh_lit_son_entreprise avec jwt_role_app() = 'rh', en fin de fichier (elle est
-- redéfinie plusieurs fois plus haut). Ensuite, ne plus revenir à un ancien build sans revenir sur la politique.
-- Bloc final : garder en dernier.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.entreprise_visible()
RETURNS TABLE (nom TEXT, heure_ouverture_vote TIME, heure_limite_vote TIME, jours_travail SMALLINT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.nom, c.heure_ouverture_vote, c.heure_limite_vote, c.jours_travail
    FROM public.companies c
    WHERE c.id = public.jwt_company_id()
      AND public.jwt_role_app() IN ('salarie', 'restaurant')
$$;
REVOKE EXECUTE ON FUNCTION public.entreprise_visible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entreprise_visible() TO authenticated;

-- ==============================================================================
-- v1.10 (T15) : suppression des colonnes mortes companies.traiteur_nom, traiteur_telephone et
-- heure_livraison_souhaitee (ancien traiteur unique, repris par la table restaurants en v1.2). Plus aucun
-- code ne les lit ni ne les écrit, et aucune fonction, politique, vue ou trigger ne les cite ; le CREATE
-- TABLE et la migration v1.2 plus haut ne les utilisent plus. Irréversible. Bloc final : garder en dernier.
-- ==============================================================================
ALTER TABLE public.companies
    DROP COLUMN IF EXISTS traiteur_nom,
    DROP COLUMN IF EXISTS traiteur_telephone,
    DROP COLUMN IF EXISTS heure_livraison_souhaitee;

-- ==============================================================================
-- v1.10 (T16) : limite de débit sur les inscriptions en libre-service (audit base, moyenne). /inscription
-- (entreprise) et /resto/inscription (restaurant) créaient des comptes sans limite, protégées seulement par
-- un champ piège : multiplicateur pour les attaques par code (une entreprise ou un compte de plus par essai)
-- et énumération des e-mails et numéros déjà inscrits.
-- Chaque tentative arrivée au serveur compte, réussie ou non : 5 en 15 min depuis une même IP bloquent
-- les inscriptions de ce type pour cette IP 15 min (erreur CP429). Appelée par les Server Actions
-- d'inscription en service_role ; l'IP vient des en-têtes posés par Vercel. Bloc final : garder en dernier.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.limiter_inscription(p_type TEXT, p_ip TEXT)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cle TEXT;
BEGIN
    IF p_type IS NULL OR p_type NOT IN ('entreprise', 'restaurant') THEN
        RAISE EXCEPTION 'Type d''inscription invalide';
    END IF;
    v_cle := 'inscription-' || p_type || ':' || public.ip_pour_cle(p_ip);
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);
    PERFORM public.noter_echec_plafonne(v_cle, 5);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.limiter_inscription(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limiter_inscription(TEXT, TEXT) TO service_role;

-- ==============================================================================
-- v1.10 (T18) : authenticated (tous les JWT signés par le serveur) ne garde que SELECT, INSERT, UPDATE et
-- DELETE sur les tables, filtrés par la RLS. Supabase lui accorde par défaut aussi TRUNCATE, REFERENCES et
-- TRIGGER : TRUNCATE vide une table sans passer par la RLS, REFERENCES et TRIGGER ne servent qu'à créer
-- des contraintes ou des triggers. Aucun code ne s'en sert (PostgREST n'expose pas TRUNCATE ; les clés
-- étrangères se vérifient sans REFERENCES). anon n'a déjà plus aucun droit sur les tables (section 9).
-- Depuis PostgreSQL 17, MAINTAIN (VACUUM, REINDEX, LOCK TABLE dans tous les modes) est retiré aussi.
-- Les droits par défaut couvrent les tables créées plus tard par le rôle qui lance ce script (postgres dans
-- l'éditeur SQL) ; une table créée par supabase_admin ne l'est pas, mais la première ligne la rattrape à chaque relance.
-- Bloc final : garder en dernier.
-- ==============================================================================
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
DO $$
BEGIN
    -- Le mot-clé MAINTAIN n'existe qu'à partir de PostgreSQL 17
    IF current_setting('server_version_num')::int >= 170000 THEN
        EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM authenticated';
    END IF;
END $$;

-- ==============================================================================
-- v1.10 (T19) : les codes d'accès RH et restaurant sont stockés en bcrypt salé (audit base, moyenne).
-- Avant, acces_rh.code_hash et comptes_restaurant.code_hash gardaient le sha256 non salé du code, envoyé
-- tel quel par le serveur à la connexion : quiconque lisait ces colonnes (sauvegarde, tableau de bord
-- Supabase) se connectait sans casser le hash, et un code court se retrouvait hors ligne en quelques secondes.
-- Le serveur Next.js ne change pas : il envoie toujours le sha256 du code ; la base le stocke en bcrypt.
-- 1) code_correspond compare une empreinte reçue à une valeur stockée en bcrypt. Sans valeur stockée
--    (identifiant inconnu), elle calcule un bcrypt leurre : même temps de réponse, pas d'oracle d'existence.
-- 2) Un trigger convertit en bcrypt tout sha256 écrit dans ces colonnes (inscriptions, changements de code,
--    saisie manuelle) : aucun appelant n'a à connaître bcrypt.
-- 3) Migration unique des codes existants, triggers d'horodatage (T8) coupés : personne n'est déconnecté.
-- 4) Contraintes : bcrypt seulement.
-- 5) Les quatre fonctions de connexion et de changement de code comparent avec code_correspond.
-- pgcrypto est dans le schéma extensions sur Supabase (public ailleurs) : d'où search_path = extensions, public.
-- 6) Les connexions lisent la ligne par l'identifiant puis comparent une seule fois (un seul bcrypt par
--    tentative), et un compteur par IP tous identifiants confondus (50 / 15 min) borne le balayage d'identifiants.
-- Bloc final : garder en dernier.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.code_correspond(p_stocke TEXT, p_fourni TEXT)
RETURNS BOOLEAN
LANGUAGE sql VOLATILE COST 10000 SET search_path = extensions, public AS $$
    SELECT CASE
        -- L'empreinte reçue est toujours un sha256 hexadécimal (hashRhCode côté serveur)
        WHEN p_fourni IS NULL OR p_fourni !~ '^[0-9a-fA-F]{64}$' THEN false
        -- Identifiant inconnu : bcrypt leurre, même coût qu'un vrai contrôle, résultat toujours faux
        WHEN p_stocke IS NULL THEN crypt(lower(p_fourni), gen_salt('bf', 10)) IS NULL
        WHEN p_stocke ~ '^\$2[aby]\$[0-9]{2}\$.{53}$' THEN crypt(lower(p_fourni), p_stocke) = p_stocke
        -- Plus de branche sha256 : une valeur stockée non bcrypt ne vaut jamais un code
        ELSE false
    END
$$;
REVOKE EXECUTE ON FUNCTION public.code_correspond(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Tout sha256 écrit dans code_hash devient un bcrypt (coût 10)
CREATE OR REPLACE FUNCTION public.hacher_code_bcrypt()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = extensions, public AS $$
BEGIN
    IF NEW.code_hash ~ '^[0-9a-fA-F]{64}$' THEN
        NEW.code_hash := crypt(lower(NEW.code_hash), gen_salt('bf', 10));
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_hacher_code_bcrypt ON public.acces_rh;
CREATE TRIGGER trg_hacher_code_bcrypt
    BEFORE INSERT OR UPDATE OF code_hash ON public.acces_rh
    FOR EACH ROW EXECUTE FUNCTION public.hacher_code_bcrypt();
DROP TRIGGER IF EXISTS trg_hacher_code_bcrypt ON public.comptes_restaurant;
CREATE TRIGGER trg_hacher_code_bcrypt
    BEFORE INSERT OR UPDATE OF code_hash ON public.comptes_restaurant
    FOR EACH ROW EXECUTE FUNCTION public.hacher_code_bcrypt();

-- Migration unique des codes existants. Les triggers d'horodatage sont coupés le temps de la conversion :
-- le code ne change pas, les sessions ouvertes (T8) restent valides.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE nom = 'v1.10-codes-bcrypt') THEN
        -- is_local : vaut jusqu'à la fin de la transaction (tout le script) ; la suite qualifie tout en public.
        PERFORM set_config('search_path', 'extensions, public', true);
        ALTER TABLE public.acces_rh DISABLE TRIGGER trg_horodater_changement_code_rh;
        UPDATE public.acces_rh SET code_hash = crypt(lower(code_hash), gen_salt('bf', 10))
        WHERE code_hash ~ '^[0-9a-fA-F]{64}$';
        ALTER TABLE public.acces_rh ENABLE TRIGGER trg_horodater_changement_code_rh;

        ALTER TABLE public.comptes_restaurant DISABLE TRIGGER trg_horodater_changement_code_compte;
        UPDATE public.comptes_restaurant SET code_hash = crypt(lower(code_hash), gen_salt('bf', 10))
        WHERE code_hash ~ '^[0-9a-fA-F]{64}$';
        ALTER TABLE public.comptes_restaurant ENABLE TRIGGER trg_horodater_changement_code_compte;

        INSERT INTO public.schema_migrations (nom) VALUES ('v1.10-codes-bcrypt');
    END IF;
END $$;

-- Format stocké : bcrypt seulement (le trigger convertit tout sha256 avant ce contrôle)
ALTER TABLE public.acces_rh DROP CONSTRAINT IF EXISTS acces_rh_code_hash_sha256;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acces_rh_code_hash_bcrypt') THEN
        ALTER TABLE public.acces_rh
            ADD CONSTRAINT acces_rh_code_hash_bcrypt CHECK (code_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comptes_restaurant_code_hash_bcrypt') THEN
        ALTER TABLE public.comptes_restaurant
            ADD CONSTRAINT comptes_restaurant_code_hash_bcrypt CHECK (code_hash ~ '^\$2[aby]\$[0-9]{2}\$.{53}$');
    END IF;
END $$;

-- Connexion RH (version T13, comparaison par code_correspond)
CREATE OR REPLACE FUNCTION public.echanger_acces_rh(p_identifiant TEXT, p_code_hash TEXT, p_ip TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ident TEXT := lower(trim(coalesce(p_identifiant, '')));
    v_cle TEXT := 'rh:' || left(v_ident, 100);
    -- L'IP en tête : elle ne peut pas contenir « | », alors que l'identifiant est saisi librement
    -- L'IP n'est crue que si l'appel vient du serveur Next.js (JWT « connexion ») ; un appel direct avec
    -- la clé anon tombe dans le compteur partagé « inconnue », à 5 échecs
    v_ip TEXT := public.ip_pour_cle(CASE WHEN public.jwt_role_app() = 'connexion' THEN p_ip END);
    v_cle_ip TEXT := 'rhip:' || v_ip || '|' || left(v_ident, 100);
    -- T19 : compteur par IP tous identifiants confondus (50 échecs / 15 min : NAT partagé des opérateurs
    -- mobiles), il borne le balayage d'e-mails ; seulement pour une IP
    -- crue : la clé partagée « inconnue » bloquerait tous les appels anon d'un coup
    v_cle_glob TEXT := CASE WHEN v_ip <> 'inconnue' THEN 'rhipglob:' || v_ip END;
    v_id UUID;
    v_stocke TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);
    PERFORM public.controler_tentatives(v_cle_ip);
    IF v_cle_glob IS NOT NULL THEN
        PERFORM public.controler_tentatives(v_cle_glob);
    END IF;

    -- T19 : la ligne d'abord, la comparaison ensuite : un seul bcrypt par tentative
    SELECT c.id, a.code_hash INTO v_id, v_stocke
    FROM public.companies c
    JOIN public.acces_rh a ON a.company_id = c.id
    WHERE CASE WHEN position('@' IN v_ident) > 0
               THEN lower(c.email_contact) = v_ident
               ELSE c.slug = v_ident END
      AND c.is_active
    LIMIT 1;
    -- Identifiant inconnu (v_stocke NULL) : bcrypt leurre, même temps de réponse
    IF NOT public.code_correspond(v_stocke, p_code_hash) THEN
        v_id := NULL;
    END IF;

    IF v_id IS NULL THEN
        IF v_cle_glob IS NOT NULL THEN
            PERFORM public.noter_echec_plafonne(v_cle_glob, 50);
        END IF;
        PERFORM public.noter_echec_plafonne(v_cle_ip, 5);
        PERFORM public.noter_echec_plafonne(v_cle, 30);
    ELSE
        PERFORM public.effacer_tentatives(v_cle_ip);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_rh(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Connexion d'un compte restaurant (version T13, comparaison par code_correspond)
CREATE OR REPLACE FUNCTION public.echanger_acces_compte_restaurant(p_telephone TEXT, p_code_hash TEXT, p_ip TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cle TEXT := 'resto:' || left(trim(coalesce(p_telephone, '')), 50);
    v_ip TEXT := public.ip_pour_cle(CASE WHEN public.jwt_role_app() = 'connexion' THEN p_ip END);
    v_cle_ip TEXT := 'restoip:' || v_ip || '|' || left(trim(coalesce(p_telephone, '')), 50);
    -- T19 : compteur par IP tous téléphones confondus, seulement pour une IP crue (voir echanger_acces_rh)
    v_cle_glob TEXT := CASE WHEN v_ip <> 'inconnue' THEN 'restoipglob:' || v_ip END;
    v_id UUID;
    v_stocke TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);
    PERFORM public.controler_tentatives(v_cle_ip);
    IF v_cle_glob IS NOT NULL THEN
        PERFORM public.controler_tentatives(v_cle_glob);
    END IF;

    SELECT c.id, c.code_hash INTO v_id, v_stocke FROM public.comptes_restaurant c
    WHERE c.telephone_whatsapp = p_telephone
      AND c.is_active
    LIMIT 1;
    IF NOT public.code_correspond(v_stocke, p_code_hash) THEN
        v_id := NULL;
    END IF;

    IF v_id IS NULL THEN
        IF v_cle_glob IS NOT NULL THEN
            PERFORM public.noter_echec_plafonne(v_cle_glob, 50);
        END IF;
        PERFORM public.noter_echec_plafonne(v_cle_ip, 5);
        PERFORM public.noter_echec_plafonne(v_cle, 30);
    ELSE
        PERFORM public.effacer_tentatives(v_cle_ip);
    END IF;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.echanger_acces_compte_restaurant(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.echanger_acces_compte_restaurant(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- Changement du code RH (version T1, comparaison par code_correspond ; le trigger stocke le nouveau en bcrypt)
CREATE OR REPLACE FUNCTION public.changer_code_rh(p_ancien_hash TEXT, p_nouveau_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_company UUID := public.jwt_company_id();
    v_cle TEXT;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'rh' OR v_company IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF p_nouveau_hash IS NULL OR p_nouveau_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Nouveau code invalide';
    END IF;

    v_cle := 'changecode:' || v_company::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    IF NOT EXISTS (SELECT 1 FROM public.acces_rh
                   WHERE company_id = v_company AND public.code_correspond(code_hash, p_ancien_hash)) THEN
        PERFORM public.noter_echec_connexion(v_cle);
        RETURN false;
    END IF;
    PERFORM public.effacer_tentatives(v_cle);

    UPDATE public.acces_rh SET code_hash = p_nouveau_hash, updated_at = now() WHERE company_id = v_company;
    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.changer_code_rh(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.changer_code_rh(TEXT, TEXT) TO authenticated;

-- Changement du code d'un compte restaurant (version T7, idem)
CREATE OR REPLACE FUNCTION public.changer_code_compte_restaurant(p_ancien_hash TEXT, p_nouveau_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_compte UUID := public.jwt_compte_id();
    v_cle TEXT;
BEGIN
    IF public.jwt_role_app() IS DISTINCT FROM 'compte_restaurant' OR v_compte IS NULL THEN
        RAISE EXCEPTION 'Accès refusé';
    END IF;
    IF p_nouveau_hash IS NULL OR p_nouveau_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Nouveau code invalide';
    END IF;

    v_cle := 'changecode-resto:' || v_compte::text;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_cle, 0));
    PERFORM public.controler_tentatives(v_cle);

    IF NOT EXISTS (SELECT 1 FROM public.comptes_restaurant
                   WHERE id = v_compte AND is_active
                     AND public.code_correspond(code_hash, p_ancien_hash)) THEN
        PERFORM public.noter_echec_connexion(v_cle);
        RETURN false;
    END IF;
    PERFORM public.effacer_tentatives(v_cle);

    UPDATE public.comptes_restaurant
    SET code_hash = p_nouveau_hash, code_change_at = now()
    WHERE id = v_compte;
    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.changer_code_compte_restaurant(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.changer_code_compte_restaurant(TEXT, TEXT) TO authenticated;


-- ==============================================================================
-- v1.10 (T20) : les nouveaux tokens salarié font 128 bits (16 octets) au lieu de 64.
-- Seul le défaut change : les tokens existants ne sont pas régénérés, sinon tous les liens /p/[token]
-- déjà envoyés par WhatsApp cesseraient de marcher. Le serveur génère aussi 16 octets (generateToken).
-- Bloc final : garder en dernier.
-- ==============================================================================
ALTER TABLE public.employes ALTER COLUMN token SET DEFAULT encode(gen_random_bytes(16), 'hex');
