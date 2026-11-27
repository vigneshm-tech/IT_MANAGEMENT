import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function AccessDenied({ moduleTitle }: { moduleTitle: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef2f8] text-navy-soft">
        <Lock className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden />
      </span>
      <h1 className="mt-4 text-[19px] font-semibold text-navy">
        You don’t have access to {moduleTitle}
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
        Ask your manager or IT if you need access.
      </p>
      <Link href="/modules" className={buttonClass({ className: "mt-6" })}>
        Back to modules
      </Link>
    </div>
  );
}
