"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, todayDakar } from "@/lib/config";

/**
 * Validation 1-clic du traiteur : marque la clôture du jour comme confirmée
 */
export async function confirmerPreparationAction(
  token: string
): Promise<{ success: boolean; message?: string; confirmeAt?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: true, confirmeAt: new Date().toISOString() };
  }

  const supabase = await createClient();
  const { data: resto } = await supabase
    .from("restaurants")
    .select("id")
    .eq("token", token)
    .maybeSingle();

  if (!resto) {
    return { success: false, message: "Lien restaurant invalide." };
  }

  const confirmeAt = new Date().toISOString();
  const { data, error } = await (supabase.from("clotures") as any)
    .update({ confirme_at: confirmeAt })
    .eq("restaurant_id", (resto as any).id)
    .eq("date", todayDakar())
    .select("id");

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data || data.length === 0) {
    return { success: false, message: "La commande du jour n'est pas encore clôturée (11h10)." };
  }

  revalidatePath(`/resto/${token}`);
  return { success: true, confirmeAt };
}
