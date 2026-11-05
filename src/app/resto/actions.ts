"use server";

import { revalidatePath } from "next/cache";
import { echangerJetonRestaurant } from "@/lib/supabase/server";
import { todayDakar } from "@/lib/config";

/**
 * Validation 1-clic du traiteur : marque la clôture du jour comme confirmée
 */
export async function confirmerPreparationAction(
  token: string
): Promise<{ success: boolean; message?: string; confirmeAt?: string }> {
  const acces = await echangerJetonRestaurant(token);
  if (!acces) {
    return { success: false, message: "Lien restaurant invalide." };
  }

  const confirmeAt = new Date().toISOString();
  const { data, error } = await (acces.supabase.from("clotures") as any)
    .update({ confirme_at: confirmeAt, confirme_par: "restaurant" })
    .eq("restaurant_id", acces.restaurantId)
    .eq("date", todayDakar())
    .select("id");

  if (error) {
    return { success: false, message: error.message };
  }
  if (!data || data.length === 0) {
    return { success: false, message: "La commande du jour n'est pas encore clôturée par l'entreprise." };
  }

  revalidatePath(`/resto/${token}`);
  return { success: true, confirmeAt };
}
