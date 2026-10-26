-- ==============================================================================
-- CANTINE PRO — SCHÉMA SUPABASE (Sprint Fast-Track 10 Jours)
-- Version: 1.0 (Pilote Thiès)
-- ==============================================================================

-- Extension pour la génération automatique de tokens aléatoires sécurisés si besoin
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABLE DES ENTREPRISES PILOTES
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    code_acces TEXT UNIQUE DEFAULT encode(gen_random_bytes(4), 'hex'), -- Lien global optionnel
    heure_limite_vote TIME NOT NULL DEFAULT '11:00:00',
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

-- 6. JEU DE DONNÉES DE TEST / DÉMARRAGE (ENTREPRISES PILOTES THIÈS)
DO $$
DECLARE
    v_comp_id UUID;
    v_emp1_id UUID;
    v_emp2_id UUID;
    v_plat1_id UUID;
    v_plat2_id UUID;
BEGIN
    -- Insertion d'une entreprise pilote test si aucune n'existe
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE slug = 'pilote-thies') THEN
        INSERT INTO public.companies (nom, slug, heure_limite_vote, traiteur_nom, traiteur_telephone)
        VALUES ('Pilote Thiès Innovation', 'pilote-thies', '11:00:00', 'Chez Fatou Traiteur Thiès', '+221770000000')
        RETURNING id INTO v_comp_id;

        -- Employés de démonstration
        INSERT INTO public.employes (company_id, nom, telephone, token)
        VALUES 
            (v_comp_id, 'Moussa Ndiaye', '+221771112233', 'token-demo-moussa'),
            (v_comp_id, 'Aminata Sow', '+221772223344', 'token-demo-aminata'),
            (v_comp_id, 'Cheikh Diop', '+221773334455', 'token-demo-cheikh');

        -- Plats du jour du Sénégal
        INSERT INTO public.menus_du_jour (company_id, date, titre, description, prix_unitaire)
        VALUES
            (v_comp_id, CURRENT_DATE, 'Thiéboudienne Rouge Penda Mbaye', 'Riz au poisson avec légumes locaux et beignets de niébé', 1500),
            (v_comp_id, CURRENT_DATE, 'Yassa Poulet au Feu de Bois', 'Poulet mariné au citron et oignons caramélisés avec riz blanc', 1500),
            (v_comp_id, CURRENT_DATE, 'Soupou Kandia (Sauce Gombo)', 'Riz blanc avec sauce gombo, poisson fumé et fruits de mer', 1700);
    END IF;
END $$;
