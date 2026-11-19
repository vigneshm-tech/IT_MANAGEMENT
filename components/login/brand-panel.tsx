import Image from "next/image";
import { LetterMark } from "@/components/brand";

export function BrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-navy lg:block">
      <Image
        src="/brand/login-panel.jpg"
        alt=""
        aria-hidden
        fill
        priority
        sizes="(min-width: 1024px) 51vw, 0px"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-navy/55" aria-hidden />

      <div className="relative flex h-full flex-col justify-between px-12 py-12 xl:px-16">
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center">
            <LetterMark tone="light" decorative className="h-[88px] w-[88px]" />
            <p className="mt-7 text-[30px] font-semibold leading-none tracking-[-0.025em] text-white">
              TaskTornado
            </p>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.32em] text-gold">
              IT Management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-white/40">
          <span>© {new Date().getFullYear()} TaskTornado</span>
        </div>
      </div>
    </section>
  );
}
