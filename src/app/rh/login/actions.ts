"use server";

import { redirect } from "next/navigation";
import { echangerAccesRh } from "@/lib/supabase/server";
import { createRhSession, destroyRhSession } from "@/lib/rh-session";

export async function loginRhAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "");

  if (!slug || !code) {
    return { error: "Renseignez l'identifiant (ou l'e-mail) et le code d'accès." };
  }

  // Identifiant entreprise (slug) ou e-mail du responsable saisi à l'inscription, vérifiés par echanger_acces_rh
  const companyId = await echangerAccesRh(slug, code);
  if (!companyId) {
    return { error: "Identifiant ou code d'accès incorrect." };
  }

  await createRhSession(companyId);
  redirect("/rh");
}

export async function logoutRhAction(): Promise<void> {
  await destroyRhSession();
  redirect("/rh/login");
}
