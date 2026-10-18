import type { NextConfig } from "next";

// Rewrites are resolved at build time, so Docker passes BACKEND_URL as a build arg.
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  rewrites: async () => [{ source: "/api/:path*", destination: `${backend}/api/:path*` }],
};

export default nextConfig;
