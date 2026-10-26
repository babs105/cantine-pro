import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Import Excel des employés via Server Action (fichiers jusqu'à 5 Mo)
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
