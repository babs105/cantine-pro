-- ==============================================================================
-- CANTINE PRO — SCHÉMA SUPABASE (Sprint Fast-Track 10 Jours)
-- Version: 1.3 — auth RH, restaurants partenaires, clôtures, inscription & abonnements
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

-- Base créée avant la v1.1 : l'entreprise de démo existe déjà mais n'a pas de code RH
UPDATE public.companies
SET rh_code_hash = encode(digest('pilote-thies-2026', 'sha256'), 'hex')
WHERE slug = 'pilote-thies' AND rh_code_hash IS NULL;

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

-- 8. SÉCURITÉ : RLS ACTIVÉE SANS POLITIQUE
-- Toutes les lectures/écritures passent par le serveur Next.js (clé service_role).
-- La clé anon publique ne donne donc accès à aucune donnée (tokens employés inclus).
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus_du_jour ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clotures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.vue_recapitulatif_traiteur SET (security_invoker = true);

-- 9. JEU DE DONNÉES DE TEST / DÉMARRAGE (ENTREPRISES PILOTES THIÈS)
DO $$
DECLARE
    v_comp_id UUID;
    v_resto1_id UUID;
    v_resto2_id UUID;
BEGIN
    -- Insertion d'une entreprise pilote test si aucune n'existe
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE slug = 'pilote-thies') THEN
        -- Code RH de démo : pilote-thies-2026 (à changer avant le go-live)
        INSERT INTO public.companies (nom, slug, heure_ouverture_vote, heure_limite_vote, rh_code_hash)
        VALUES ('Pilote Thiès Innovation', 'pilote-thies', '08:00:00', '11:10:00', encode(digest('pilote-thies-2026', 'sha256'), 'hex'))
        RETURNING id INTO v_comp_id;

        -- Restaurants partenaires
        INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, heure_livraison)
        VALUES (v_comp_id, 'Chez Fatou Traiteur Thiès', '+221770000000', '12:30:00')
        RETURNING id INTO v_resto1_id;

        INSERT INTO public.restaurants (company_id, nom, telephone_whatsapp, heure_livraison)
        VALUES (v_comp_id, 'Restaurant Le Teranga', '+221770000001', '12:45:00')
        RETURNING id INTO v_resto2_id;

        -- Employés de démonstration
        INSERT INTO public.employes (company_id, nom, telephone, token)
        VALUES 
            (v_comp_id, 'Moussa Ndiaye', '+221771112233', 'token-demo-moussa'),
            (v_comp_id, 'Aminata Sow', '+221772223344', 'token-demo-aminata'),
            (v_comp_id, 'Cheikh Diop', '+221773334455', 'token-demo-cheikh');

        -- Plats du jour du Sénégal
        INSERT INTO public.menus_du_jour (company_id, restaurant_id, date, titre, description, prix_unitaire)
        VALUES
            (v_comp_id, v_resto1_id, CURRENT_DATE, 'Thiéboudienne Rouge Penda Mbaye', 'Riz au poisson avec légumes locaux et beignets de niébé', 1500),
            (v_comp_id, v_resto1_id, CURRENT_DATE, 'Yassa Poulet au Feu de Bois', 'Poulet mariné au citron et oignons caramélisés avec riz blanc', 1500),
            (v_comp_id, v_resto2_id, CURRENT_DATE, 'Soupou Kandia (Sauce Gombo)', 'Riz blanc avec sauce gombo, poisson fumé et fruits de mer', 1700);
    END IF;
END $$;
