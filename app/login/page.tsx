import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
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
  if (session) redirect("/modules");

  const params = await searchParams;
  const redirectTo =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/modules";

  const demoMode = isDemoMode && process.env.DISABLE_DEMO_LOGIN !== "true";
  const demoAccounts: DemoAccount[] = demoMode
    ? DEMO_USERS.map(({ email, password, name, role }) => ({ email, password, name, role }))
    : [];

  return (
    <main className="min-h-screen bg-canvas">
      <div className="grid min-h-screen lg:grid-cols-[1.02fr_0.98fr]">
        <BrandPanel />

        <div className="flex flex-col">
          <div className="flex items-center justify-between px-6 pt-6 lg:hidden">
            <Logo compact />
          </div>

          <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
            <div className="w-full max-w-[384px]">
              {params.reason === "expired" && (
                <p className="mb-5 rounded-md border border-[#ecd9b6] bg-warning-soft px-3 py-2.5 text-[12px] text-[#7b5c1d]">
                  Your session expired. Please sign in again.
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
