export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          nom: string;
          slug: string;
          code_acces: string;
          heure_limite_vote: string; // e.g. "11:00:00"
          heure_livraison_souhaitee: string | null;
          traiteur_nom: string | null;
          traiteur_telephone: string | null;
          trial_ends_at: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          nom: string;
          slug: string;
          code_acces?: string;
          heure_limite_vote?: string;
          heure_livraison_souhaitee?: string | null;
          traiteur_nom?: string | null;
          traiteur_telephone?: string | null;
          trial_ends_at?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          nom?: string;
          slug?: string;
          code_acces?: string;
          heure_limite_vote?: string;
          heure_livraison_souhaitee?: string | null;
          traiteur_nom?: string | null;
          traiteur_telephone?: string | null;
          trial_ends_at?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      employes: {
        Row: {
          id: string;
          company_id: string;
          nom: string;
          telephone: string | null;
          token: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          nom: string;
          telephone?: string | null;
          token?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          nom?: string;
          telephone?: string | null;
          token?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      menus_du_jour: {
        Row: {
          id: string;
          company_id: string;
          date: string; // YYYY-MM-DD
          titre: string;
          description: string | null;
          prix_unitaire: number;
          is_available: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          date?: string;
          titre: string;
          description?: string | null;
          prix_unitaire?: number;
          is_available?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          date?: string;
          titre?: string;
          description?: string | null;
          prix_unitaire?: number;
          is_available?: boolean;
          created_at?: string;
        };
      };
      commandes: {
        Row: {
          id: string;
          company_id: string;
          employe_id: string;
          plat_id: string | null;
          date: string;
          statut: "choisi" | "absent" | "ne_mange_pas";
          remarque: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          employe_id: string;
          plat_id?: string | null;
          date?: string;
          statut: "choisi" | "absent" | "ne_mange_pas";
          remarque?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          employe_id?: string;
          plat_id?: string | null;
          date?: string;
          statut?: "choisi" | "absent" | "ne_mange_pas";
          remarque?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      vue_recapitulatif_traiteur: {
        Row: {
          company_id: string;
          company_nom: string;
          date: string;
          plat_id: string;
          plat_titre: string;
          quantite: number;
        };
      };
    };
  };
}
