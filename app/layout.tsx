import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/config";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — IT Management`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ["IT management", "task management", "patching", "renewals", "tickets"],
  openGraph: {
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f7fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
