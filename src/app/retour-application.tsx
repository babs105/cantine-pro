"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Application installée avant le manifeste par salarié (start_url « / ») :
 * on rouvre directement la page de commande mémorisée dans le téléphone.
 */
export function RetourApplication() {
  const router = useRouter();
  useEffect(() => {
    const installee =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (!installee) return;
    try {
      const token = localStorage.getItem("cantine_pro_saved_token");
      if (token) router.replace(`/p/${encodeURIComponent(token)}`);
    } catch {
      // stockage indisponible : on reste sur l'accueil
    }
  }, [router]);
  return null;
}
