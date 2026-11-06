import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La preview Claude (port 3124) et les builds de vérification utilisent leur propre dossier :
  // sinon ils écrasent le .next du `npm run dev` lancé à la main (erreurs ENOENT _document.js, cache webpack)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  experimental: {
    // Import Excel des employés via Server Action (fichiers jusqu'à 5 Mo)
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
