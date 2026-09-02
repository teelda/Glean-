import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mammoth and pdf-parse are CommonJS and must not be bundled into the
  // route handler; keeping them external lets `import` work normally.
  serverExternalPackages: ["mammoth", "pdf-parse"]
};

export default nextConfig;
