import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

// Exposes Cloudflare bindings (e.g. D1) to `next dev` via getCloudflareContext().
initOpenNextCloudflareForDev();

export default nextConfig;
