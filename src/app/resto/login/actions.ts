"use server";

import { redirect } from "next/navigation";
import { echangerAccesCompteRestaurant } from "@/lib/supabase/server";
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

  const compteId = await echangerAccesCompteRestaurant(telephone, code);
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
