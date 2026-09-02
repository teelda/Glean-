import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mammoth and pdf-parse are CommonJS and must not be bundled into the
  // route handler; keeping them external lets `import` work normally.
  serverExternalPackages: ["mammoth", "pdf-parse"],

  // The end-to-end suite runs two dev servers at once — one with Supabase
  // credentials to exercise the auth gate, one without — and a single .next
  // directory cannot serve both: they overwrite each other's build output and
  // the app dies with ENOENT on its own page chunk. Each server gets its own.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {})
};

export default nextConfig;
