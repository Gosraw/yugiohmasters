import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // scripts/devstack/dev.mjs builds into its own folder so a local
  // test-database session never mixes with the normal .next cache.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
