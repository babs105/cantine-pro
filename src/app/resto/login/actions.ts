"use server";

import { redirect } from "next/navigation";
import { echangerAccesCompteRestaurant, TropDeTentativesError } from "@/lib/supabase/server";
import { createRestoSession, destroyRestoSession } from "@/lib/resto-session";
import { normaliserTelephone } from "@/lib/telephone";

export async function loginRestoAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const telephone = normaliserTelephone(String(formData.get("telephone") || ""));
  const code = String(formData.get("code") || "");

  if (!telephone || !code) {
    return { error: "Renseignez votre numéro WhatsApp et votre code d'accès." };
  }

  // 5 échecs en 15 minutes depuis une même IP bloquent cette IP ; 30 toutes IP confondues, le numéro
  // (echanger_acces_compte_restaurant, v1.10 T13)
  let compteId: string | null;
  try {
    compteId = await echangerAccesCompteRestaurant(telephone, code);
  } catch (err) {
    if (err instanceof TropDeTentativesError) return { error: err.message };
    throw err;
  }
  if (!compteId) {
    return { error: "Numéro ou code d'accès incorrect." };
  }

  await createRestoSession(compteId);
  redirect("/resto");
}

export async function logoutRestoAction(): Promise<void> {
  await destroyRestoSession();
  redirect("/resto/login");
}
