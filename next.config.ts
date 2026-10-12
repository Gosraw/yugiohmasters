import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // scripts/devstack/dev.mjs builds into its own folder so a local
  // test-database session never mixes with the normal .next cache.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The devstack machine is short on disk; Turbopack's persistent
  // dev cache grows past 1 GB, so skip it there.
  ...(process.env.NEXT_DIST_DIR
    ? {
        experimental: {
          turbopackFileSystemCacheForDev: false,
        },
      }
    : {}),
};

export default nextConfig;
