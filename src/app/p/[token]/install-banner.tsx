"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const CLE_MASQUEE = "cantine_pro_install_masquee";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Invite à « Ajouter à l'écran d'accueil » : bouton d'installation sur Android (Chrome),
 * mode d'emploi sur iPhone (Safari : Partager → Sur l'écran d'accueil).
 * Masquée une fois l'application installée ou si le salarié la ferme.
 */
export function InstallBanner() {
  const [evenement, setEvenement] = useState<BeforeInstallPromptEvent | null>(null);
  const [iphone, setIphone] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const installee =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    let masquee = false;
    try {
      masquee = localStorage.getItem(CLE_MASQUEE) === "1";
    } catch {
      masquee = false;
    }
    if (installee || masquee) return;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIphone(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvenement(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const masquer = () => {
    setVisible(false);
    try {
      localStorage.setItem(CLE_MASQUEE, "1");
    } catch {
      // sans stockage, la bannière réapparaîtra à la prochaine visite
    }
  };

  const installer = async () => {
    if (!evenement) return;
    await evenement.prompt();
    const { outcome } = await evenement.userChoice;
    if (outcome === "accepted") setVisible(false);
    setEvenement(null);
  };

  if (!visible) return null;

  return (
    <div className="mt-6 p-4 bg-neutral-900 text-white rounded-2xl text-xs flex items-start gap-3 shadow-lg">
      <div className="flex-1 space-y-2">
        <p className="font-bold">Ajoutez Cantine Pro à votre écran d&apos;accueil</p>
        {iphone ? (
          <p className="text-neutral-300 flex flex-wrap items-center gap-1">
            Touchez <Share className="w-3.5 h-3.5 inline" /> <strong>Partager</strong>, puis{" "}
            <strong>« Sur l&apos;écran d&apos;accueil »</strong>. Vous commanderez ensuite en 1 clic, sans lien.
          </p>
        ) : (
          <>
            <p className="text-neutral-300">Commandez ensuite en 1 clic, comme une application, sans chercher le lien.</p>
            <button
              type="button"
              onClick={installer}
              className="px-3 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl font-bold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Installer
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={masquer} aria-label="Fermer" className="text-neutral-400 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
