import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { BrandPanel } from "@/components/login/brand-panel";
import { LoginForm } from "@/components/login/login-form";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { ROLE_BY_ID } from "@/lib/roles";
import { DEMO_USERS, type DemoAccount } from "@/lib/demo-users";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) redirect("/modules");

  const params = await searchParams;
  const redirectTo =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/modules";

  const demoMode = isDemoMode && process.env.DISABLE_DEMO_LOGIN !== "true";
  const demoAccounts: DemoAccount[] = demoMode
    ? DEMO_USERS.filter((user) => !ROLE_BY_ID[user.role]?.hidden).map(
        ({ email, password, name, role }) => ({ email, password, name, role }),
      )
    : [];

  return (
    <main className="min-h-screen bg-canvas">
      <div className="grid min-h-screen lg:grid-cols-[1.02fr_0.98fr]">
        <BrandPanel />

        <div className="flex flex-col">
          <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
            <Wordmark height={22} />
          </div>

          <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
            <div className="w-full max-w-[384px]">
              {params.reason === "expired" && (
                <p className="mb-5 rounded-md border border-[#ecd9b6] bg-warning-soft px-3 py-2.5 text-[12px] text-[#7b5c1d]">
                  Your session expired. Please sign in again.
                </p>
              )}
              {params.reason === "password-reset" && (
                <p className="mb-5 rounded-md border border-[#cfe6d9] bg-success-soft px-3 py-2.5 text-[12px] text-success">
                  Password updated. Sign in with your new password.
                </p>
              )}
              {params.reason === "suspended" && (
                <p className="mb-5 rounded-md border border-[#eccfcd] bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
                  This account is suspended. Contact IT to restore access.
                </p>
              )}
              {params.reason === "link" && (
                <p className="mb-5 rounded-md border border-[#ecd9b6] bg-warning-soft px-3 py-2.5 text-[12px] text-[#7b5c1d]">
                  That link is invalid or has expired.{" "}
                  <Link href="/login/forgot-password" className="font-medium underline">
                    Request a new one
                  </Link>
                  .
                </p>
              )}
              <LoginForm demoAccounts={demoAccounts} redirectTo={redirectTo} />
            </div>
          </div>

          <div className="px-6 pb-6 text-center text-[11px] text-muted lg:hidden">
            © {new Date().getFullYear()} TaskTornado · IT Management
          </div>
        </div>
      </div>
    </main>
  );
}
