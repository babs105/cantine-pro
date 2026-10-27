import { NextResponse } from "next/server";

interface Contexte {
  params: Promise<{ token: string }>;
}

/**
 * Manifeste propre à chaque salarié : l'icône ajoutée à l'écran d'accueil rouvre directement
 * sa page de commande (/p/[token]), sans lien à retrouver ni connexion.
 */
export async function GET(_request: Request, { params }: Contexte) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(token)) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  return NextResponse.json(
    {
      name: "Cantine Pro",
      short_name: "Cantine Pro",
      description: "Choisissez votre repas d'entreprise en 2 clics",
      id: `/p/${token}`,
      start_url: `/p/${token}`,
      scope: "/p/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#f97316",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } }
  );
}
