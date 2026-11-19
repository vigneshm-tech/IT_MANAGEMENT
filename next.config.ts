import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The sandbox preview serves the app from *.e2b.app over HTTPS.
  allowedDevOrigins: ["*.e2b.app", "localhost:3000", "127.0.0.1:3000"],
};

export default nextConfig;
