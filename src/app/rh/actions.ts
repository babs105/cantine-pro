"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Ajout d'un nouvel employé
 */
export async function addEmployeAction(
  companyId: string,
  nom: string,
  telephone?: string
): Promise<{ success: boolean; message?: string; employe?: any }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured) {
    const mockToken = "token-" + Math.random().toString(36).substring(2, 10);
    return {
      success: true,
      employe: {
        id: "mock-" + Date.now(),
        nom,
        telephone: telephone || null,
        token: mockToken,
        is_active: true,
      },
    };
  }

  try {
    const supabase = await createClient();
    const token = Math.random().toString(36).substring(2, 12);

    const { data, error } = await (supabase.from("employes") as any)
      .insert({
        company_id: companyId,
        nom,
        telephone: telephone || null,
        token,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/rh");
    return { success: true, employe: data };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Import en masse d'employés (CSV)
 */
export async function importEmployesCSVAction(
  companyId: string,
  rows: Array<{ nom: string; telephone?: string }>
): Promise<{ success: boolean; message?: string; count?: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured) {
    return { success: true, count: rows.length };
  }

  try {
    const supabase = await createClient();
    const employesToInsert = rows.map((r) => ({
      company_id: companyId,
      nom: r.nom,
      telephone: r.telephone || null,
      token: Math.random().toString(36).substring(2, 12),
      is_active: true,
    }));

    const { error } = await (supabase.from("employes") as any).insert(employesToInsert);

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/rh");
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Ajout ou modification d'un plat au menu du jour
 */
export async function addMenuPlatAction(
  companyId: string,
  titre: string,
  prixUnitaire: number,
  description?: string,
  date?: string
): Promise<{ success: boolean; message?: string; plat?: any }> {
  const targetDate = date || new Date().toISOString().split("T")[0];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured) {
    return {
      success: true,
      plat: {
        id: "plat-mock-" + Date.now(),
        titre,
        description: description || null,
        prix_unitaire: prixUnitaire,
        is_available: true,
        date: targetDate,
      },
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.from("menus_du_jour") as any)
      .insert({
        company_id: companyId,
        titre,
        description: description || null,
        prix_unitaire: prixUnitaire,
        is_available: true,
        date: targetDate,
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    revalidatePath("/rh");
    return { success: true, plat: data };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Basculer la disponibilité d'un plat (rupture de stock)
 */
export async function togglePlatDisponibiliteAction(
  platId: string,
  isAvailable: boolean
): Promise<{ success: boolean }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseConfigured =
    supabaseUrl &&
    supabaseUrl !== "https://votre-projet.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isSupabaseConfigured) {
    return { success: true };
  }

  try {
    const supabase = await createClient();
    await (supabase.from("menus_du_jour") as any)
      .update({ is_available: isAvailable })
      .eq("id", platId);

    revalidatePath("/rh");
    return { success: true };
  } catch {
    return { success: false };
  }
}
