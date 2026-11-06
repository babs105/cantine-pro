"use server";

import { redirect } from "next/navigation";
import { echangerAccesRh, TropDeTentativesError } from "@/lib/supabase/server";
import { createRhSession, destroyRhSession } from "@/lib/rh-session";

export async function loginRhAction(_prevState: { error?: string } | undefined,formData: FormData): Promise<{ error?: string }> {
  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "");

  if (!slug || !code) {
    return { error: "Renseignez l'identifiant (ou l'e-mail) et le code d'accès." };
  }

  // Identifiant entreprise (slug) ou e-mail du responsable saisi à l'inscription, vérifiés par echanger_acces_rh
  // (5 échecs en 15 minutes bloquent l'identifiant 15 minutes)
  let companyId: string | null;
  try {
    companyId = await echangerAccesRh(slug, code);
  } catch (err) {
    if (err instanceof TropDeTentativesError) return { error: err.message };
    throw err;
  }
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
