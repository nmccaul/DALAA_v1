import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runs on any Node server (PM2 + Apache on a BYU box) as well as Vercel — D-007.
  output: "standalone",
  // Uploads go through a server action; room for a 4 MB file (MAX_UPLOAD_BYTES) plus the form.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
