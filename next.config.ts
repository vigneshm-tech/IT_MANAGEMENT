import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The sandbox preview serves the app from *.e2b.app over HTTPS.
  allowedDevOrigins: ["*.e2b.app", "localhost:3000", "127.0.0.1:3000"],
  experimental: {
    /**
     * Keep a visited module in the client router cache for half a minute.
     *
     * Server components are dynamic (they read the session cookie), and Next's
     * default for dynamic pages is a zero-second cache — so every switch, and
     * every Back, re-ran the whole page: database queries plus, on Servers,
     * Patching and Tickets, the external API. Thirty seconds makes moving
     * between modules feel instant while a Refresh (or an action's
     * revalidatePath) still brings fresh data.
     */
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
