import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The sandbox preview serves the app from *.e2b.app over HTTPS.
  allowedDevOrigins: ["*.e2b.app", "localhost:3000", "127.0.0.1:3000"],
  /**
   * Old bookmarks for ticket configuration, which now lives inside Tickets.
   *
   * These are config redirects rather than stub pages so the browser receives a
   * real 307 instead of an empty document that redirects itself.
   */
  async redirects() {
    return [
      { source: "/modules/masters/slas", destination: "/modules/tickets/masters/service-targets", permanent: false },
      { source: "/modules/masters/ticket-triggers", destination: "/modules/tickets/masters/triggers", permanent: false },
      { source: "/modules/masters/ticket-macros", destination: "/modules/tickets/masters/macros", permanent: false },
      { source: "/modules/masters/text-modules", destination: "/modules/tickets/masters/text-modules", permanent: false },
      { source: "/modules/masters/text-modules/:id", destination: "/modules/tickets/masters/text-modules/:id", permanent: false },
      { source: "/modules/masters/kb", destination: "/modules/tickets/masters/kb-categories", permanent: false },
      { source: "/modules/masters/ticket-email", destination: "/modules/tickets/settings/email", permanent: false },
    ];
  },
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
