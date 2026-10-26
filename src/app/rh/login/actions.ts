"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createRhSession, destroyRhSession, verifyRhCode } from "@/lib/rh-session";

export async function loginRhAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) {
    redirect("/rh");
  }

  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "");

  if (!slug || !code) {
    return { error: "Renseignez l'identifiant entreprise et le code d'accès." };
  }

  const supabase = await createClient();
  const { data: rawComp } = await supabase
    .from("companies")
    .select("id, rh_code_hash, is_active")
    .eq("slug", slug)
    .maybeSingle();

  const comp: any = rawComp;

  if (!comp || !comp.is_active || !verifyRhCode(code, comp.rh_code_hash)) {
    return { error: "Identifiant ou code d'accès incorrect." };
  }

  await createRhSession(comp.id);
  redirect("/rh");
}

export async function logoutRhAction(): Promise<void> {
  await destroyRhSession();
  redirect("/rh/login");
}
