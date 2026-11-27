import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { ForgotPasswordForm } from "@/components/login/forgot-password-form";
import { isDemoMode } from "@/lib/config";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="px-6 pt-6">
        <Link href="/login" aria-label="TaskTornado — back to sign in">
          <Wordmark height={22} priority />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[384px]">
          <ForgotPasswordForm demoMode={isDemoMode} />
        </div>
      </div>

      <footer className="px-6 pb-6 text-center text-[11px] text-muted">
        © {new Date().getFullYear()} TaskTornado · IT Management
      </footer>
    </main>
  );
}
