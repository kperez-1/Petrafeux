import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // NEXT_PUBLIC_* in wrangler vars is too late for the client bundle — inline at build.
  env: {
    NEXT_PUBLIC_CRM_REMOTE:
      process.env.NEXT_PUBLIC_CRM_REMOTE ??
      (process.env.NODE_ENV === "production" ? "true" : ""),
  },
};

// Exposes Cloudflare bindings (e.g. D1) to `next dev` via getCloudflareContext().
initOpenNextCloudflareForDev();

export default nextConfig;
