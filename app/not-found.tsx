import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { AmbientBackground } from "@/components/ambient-background";
import { Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <AmbientBackground />
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="glass mt-8 rounded-3xl p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand-soft">
            <Compass className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-[24px] font-semibold tracking-tight text-ink">
            This page spun away
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            The page you asked for doesn’t exist, or it moved during the rollout.
          </p>
          <Link
            href="/modules/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-[#5b8cff] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:brightness-110"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to the workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
