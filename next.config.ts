import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  // mammoth and pdf-parse are CommonJS and must not be bundled into the
  // route handler; keeping them external lets `import` work normally.
  serverExternalPackages: ["mammoth", "pdf-parse"],

  // The end-to-end suite runs two dev servers at once — one with Supabase
  // credentials to exercise the auth gate, one without — and a single .next
  // directory cannot serve both: they overwrite each other's build output and
  // the app dies with ENOENT on its own page chunk. Each server gets its own.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; ${scriptPolicy}; connect-src 'self' https://*.supabase.co wss://*.supabase.co` }
    ] }];
  }
};

export default nextConfig;
