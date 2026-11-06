-- ==============================================================================
-- CANTINE PRO — SCHÉMA SUPABASE (Sprint Fast-Track 10 Jours)
-- Version: 1.9 — auth RH, restaurants partenaires, clôtures, inscription & abonnements,
--                comptes restaurant, limite des tentatives, durcissement RLS (audit v1.9)
-- ==============================================================================

-- Extension pour la génération automatique de tokens aléatoires sécurisés si besoin
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABLE DES ENTREPRISES PILOTES
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    code_acces TEXT UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex'), -- Lien global optionnel
    heure_limite_vote TIME NOT NULL DEFAULT '11:10:00', -- Fin des votes = envoi aux restaurants
    heure_livraison_souhaitee TIME DEFAULT '12:30:00',
    traiteur_nom TEXT,
    traiteur_telephone TEXT, -- Format E.164 ex: +221770000000
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
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS rh_code_hash TEXT, -- sha256 hex du code d'accès RH
    ADD COLUMN IF NOT EXISTS traiteur_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'); -- Lien: /resto/[token]

UPDATE public.companies
SET traiteur_token = encode(gen_random_bytes(12), 'hex')
WHERE traiteur_token IS NULL;

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
UPDATE public.companies SET heure_limite_vote = '11:10:00' WHERE heure_limite_vote = '11:00:00';

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
INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, heure_livraison, token)
SELECT c.id,
       COALESCE(c.traiteur_nom, 'Restaurant partenaire'),
       c.traiteur_telephone,
       COALESCE(c.heure_livraison_souhaitee, '12:30:00'),
       COALESCE(c.traiteur_token, encode(gen_random_bytes(12), 'hex'))
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
    code_hash TEXT NOT NULL, -- sha256 hex du code d'accès
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
UPDATE public.employes
SET token = encode(gen_random_bytes(8), 'hex'), is_active = false
WHERE token LIKE 'token-demo-%';

UPDATE public.companies
SET rh_code_hash = NULL
WHERE slug = 'pilote-thies'
  AND rh_code_hash = encode(digest('pilote-thies-2026', 'sha256'), 'hex');

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
DROP POLICY IF EXISTS portail_lit_les_salaries ON public.employes;
CREATE POLICY portail_lit_les_salaries ON public.employes FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'portail' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS portail_inscrit_un_salarie ON public.employes;
CREATE POLICY portail_inscrit_un_salarie ON public.employes FOR INSERT TO authenticated
    WITH CHECK (public.jwt_role_app() = 'portail' AND company_id = public.jwt_company_id());

-- restaurants
DROP POLICY IF EXISTS rh_gere_ses_restaurants ON public.restaurants;
CREATE POLICY rh_gere_ses_restaurants ON public.restaurants FOR ALL TO authenticated
    USING (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id())
    WITH CHECK (public.jwt_role_app() = 'rh' AND company_id = public.jwt_company_id());
DROP POLICY IF EXISTS salarie_lit_les_restaurants ON public.restaurants;
CREATE POLICY salarie_lit_les_restaurants ON public.restaurants FOR SELECT TO authenticated
    USING (public.jwt_role_app() = 'salarie' AND company_id = public.jwt_company_id());
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

-- 2. Clôtures : le restaurant ne peut que confirmer (aucune autre colonne, pas de retour en arrière)
CREATE OR REPLACE FUNCTION public.proteger_cloture_restaurant()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF public.jwt_role_app() = 'restaurant' THEN
        IF NEW.company_id IS DISTINCT FROM OLD.company_id
           OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
           OR NEW.date IS DISTINCT FROM OLD.date
           OR NEW.recap IS DISTINCT FROM OLD.recap
           OR NEW.total_repas IS DISTINCT FROM OLD.total_repas
           OR NEW.message IS DISTINCT FROM OLD.message
           OR NEW.envoi_statut IS DISTINCT FROM OLD.envoi_statut
           OR NEW.envoi_erreur IS DISTINCT FROM OLD.envoi_erreur
           OR NEW.envoye_at IS DISTINCT FROM OLD.envoye_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Un restaurant ne peut que confirmer sa commande.';
        END IF;
        IF OLD.confirme_at IS NOT NULL THEN
            NEW.confirme_at := OLD.confirme_at;
            NEW.confirme_par := OLD.confirme_par;
        ELSIF NEW.confirme_at IS NOT NULL THEN
            NEW.confirme_par := 'restaurant';
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
            OR NEW.traiteur_token IS DISTINCT FROM OLD.traiteur_token
            OR NEW.code_acces IS DISTINCT FROM OLD.code_acces
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
