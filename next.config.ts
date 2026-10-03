import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runs on any Node server (PM2 + Apache on a BYU box) as well as Vercel — D-007.
  output: "standalone",
};

export default nextConfig;
