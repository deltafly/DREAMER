import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: false,  // FIXED: catch TS errors at build time
  },
  reactStrictMode: true,  // FIXED: detect side-effects in dev
};

export default nextConfig;