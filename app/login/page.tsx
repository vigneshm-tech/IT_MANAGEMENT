import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AmbientBackground } from "@/components/ambient-background";
import { Wordmark } from "@/components/brand";
import { BrandPanel } from "@/components/login/brand-panel";
import { LoginForm } from "@/components/login/login-form";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config";
import { DEMO_USERS, type DemoAccount } from "@/lib/demo-users";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  if (session) redirect("/modules/dashboard");

  const params = await searchParams;
  const redirectTo =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/modules/dashboard";

  const demoMode = isDemoMode && process.env.DISABLE_DEMO_LOGIN !== "true";
  const demoAccounts: DemoAccount[] = demoMode
    ? DEMO_USERS.map(({ email, password, name, role }) => ({ email, password, name, role }))
    : [];

  return (
    <main className="relative min-h-screen">
      <AmbientBackground variant="login" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
          <Wordmark compact />
          <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-brand-soft">
            RBAC
          </span>
        </div>

        <div className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
          <BrandPanel />

          <div className="flex flex-col items-center justify-center gap-6 px-5 py-10 sm:px-8">
            <div className="w-full max-w-[460px]">
              <LoginForm
                demoAccounts={demoAccounts}
                demoMode={demoMode}
                redirectTo={redirectTo}
              />

              {params.reason === "expired" && (
                <p className="mt-4 text-center text-[12px] text-warning">
                  Your session expired. Please sign in again.
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted">
                <span>© {new Date().getFullYear()} TaskTornado</span>
                <span className="h-1 w-1 rounded-full bg-line" aria-hidden />
                <span>Need help? Contact your IT Manager</span>
                <span className="h-1 w-1 rounded-full bg-line" aria-hidden />
                <span>v0.1 · Login &amp; RBAC milestone</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
