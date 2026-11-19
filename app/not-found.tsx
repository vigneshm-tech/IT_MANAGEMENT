import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <div className="px-6 pt-6">
        <Wordmark compact />
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="max-w-md text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
            404
          </p>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-navy">
            This page spun away
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            The page you asked for doesn’t exist or has moved.
          </p>
          <Link href="/modules/dashboard" className={buttonClass({ className: "mt-6" })}>
            Back to overview
          </Link>
        </div>
      </div>
    </main>
  );
}
