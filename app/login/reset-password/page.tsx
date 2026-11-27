import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ResetPasswordForm } from "@/components/login/reset-password-form";
import { isSupabaseConfigured } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  let email: string | null = null;

  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      email = user?.email ?? null;
    } catch (error) {
      console.error("[auth] reset page could not read the recovery session", error);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="px-6 pt-6">
        <Link href="/login" aria-label="TaskTornado — back to sign in">
          <Wordmark height={22} priority />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[384px]">
          {email ? (
            <ResetPasswordForm email={email} />
          ) : (
            <div>
              <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-navy">
                This link has expired
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-body">
                Reset links are single use and last one hour.
              </p>
              <Link
                href="/login/forgot-password"
                className="mt-6 inline-flex items-center justify-center rounded-md bg-gold px-4 py-2.5 text-[13px] font-semibold text-navy transition hover:brightness-[0.97]"
              >
                Request a new link
              </Link>
              <p className="mt-4">
                <Link href="/login" className="text-[12.5px] font-medium text-navy hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="px-6 pb-6 text-center text-[11px] text-muted">
        © {new Date().getFullYear()} TaskTornado · IT Management
      </footer>
    </main>
  );
}
